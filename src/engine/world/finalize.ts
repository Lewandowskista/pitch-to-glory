import type { BackgroundResult, Fixture, Id, Player, World } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng, type Rng } from '../rng';
import {
  expectedGoals,
  managerStrengthBonus,
  playerAbility,
  strengthFromAbility,
  teamStrength,
} from '../strength';
import { lineupAbility } from '../selection/lineup';
import { clubLineup, clubStarters } from '../selection/world';
import { isKnockoutFixture } from './continental';
import { recordFixtureStatistics } from './statistics';

const BACKGROUND = CONFIG.world.background;
const RATING = CONFIG.match.rating;
/** Extra time is simulated as two 15-minute halves after the 90. */
export const EXTRA_TIME_MINUTES = 30;

/** A fixture played interactively, finalized through the same resolver as background games. */
export interface PlayedFixture {
  /** Regulation score, home first. Extra time and penalties are decided here if required. */
  score: [number, number];
  /**
   * Regulation goals. A goal without an assist is given a background assister on the pitch at
   * that minute, never the interactively played player, whose assists come from the session.
   */
  goals: { playerId: Id; teamId: Id; minute: number; assistId?: Id }[];
  /** Regulation minutes played by everyone who appeared, per side. */
  minutes: { home: Record<Id, number>; away: Record<Id, number> };
  /** Players on the pitch at the end of regulation: the only ones who play extra time. */
  onPitch: { home: Id[]; away: Id[] };
  /** The interactively played player and the rating the session gave them. */
  selected: { playerId: Id; rating: number };
}
export interface FixtureGoal {
  playerId: Id;
  teamId: Id;
  minute: number;
  assistId?: Id;
  extraTime: boolean;
}
/** One player's part in a finalized fixture. Totals include simulated extra time. */
export interface FixtureParticipant {
  playerId: Id;
  teamId: Id;
  /** Regulation minutes. */
  minutes: number;
  extraTimeMinutes: number;
  goals: number;
  assists: number;
  extraTimeGoals: number;
  extraTimeAssists: number;
  rating: number;
}
/**
 * The single authority for a fixture's outcome: the stored result, every player's statistics
 * and the career record are all derived from it, so each goal, assist and minute is credited
 * exactly once.
 */
export interface FinalizedFixture {
  fixtureId: Id;
  /** Final score after any extra time, home first; penalties are never goals. */
  score: [number, number];
  regulation: [number, number];
  extraTime: [number, number] | null;
  penalties: [number, number] | null;
  winnerId: Id | null;
  decided: 'regulation' | 'extra-time' | 'penalties';
  goals: FixtureGoal[];
  /** Home participants first, in selection order. */
  participants: FixtureParticipant[];
}

function poisson(rng: Rng, mean: number): number {
  const stop = Math.exp(-mean);
  let product = 1;
  let count = 0;
  do {
    product *= rng.next();
    count++;
  } while (product > stop && count <= CONFIG.world.maxGoals);
  return Math.min(CONFIG.world.maxGoals, count - 1);
}
/** Background scorers by position, each assisted with the configured chance. */
/** How far a player's attribute sits from the team's, as a weight multiplier. */
function aroundTeam(value: number, mean: number): number {
  return Math.max(
    BACKGROUND.abilityScorerFloor,
    1 + (value - mean) * BACKGROUND.abilityScorerSlope,
  );
}
function scoreGoals(players: Player[], teamId: Id, count: number, rng: Rng): FixtureGoal[] {
  // Position decides who is in scoring positions; finishing decides who takes the chances.
  const outfield = players.filter((player) => player.primaryPosition !== 'GK');
  const meanFinishing =
    outfield.reduce((sum, player) => sum + player.attributes.finishing, 0) /
    Math.max(1, outfield.length);
  const meanCreation =
    outfield.reduce(
      (sum, player) => sum + player.attributes.passing + player.attributes.vision,
      0,
    ) / Math.max(1, outfield.length);
  const weights = players.map(
    (player) =>
      (player.primaryPosition === 'GK'
        ? BACKGROUND.scorerWeights.GK
        : player.primaryPosition === 'ST'
          ? BACKGROUND.scorerWeights.ST
          : ['LW', 'RW', 'AM'].includes(player.primaryPosition)
            ? BACKGROUND.scorerWeights.winger
            : ['CM', 'DM'].includes(player.primaryPosition)
              ? BACKGROUND.scorerWeights.midfield
              : BACKGROUND.scorerWeights.defender) *
      aroundTeam(player.attributes.finishing, meanFinishing),
  );
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return Array.from({ length: count }, () => {
    let target = rng.next() * sum;
    let scorer = players[players.length - 1]!;
    for (let index = 0; index < players.length; index++) {
      target -= weights[index]!;
      if (target < 0) {
        scorer = players[index]!;
        break;
      }
    }
    let assistId: Id | undefined;
    if (rng.next() < BACKGROUND.assistedGoalChance) {
      const pool = players.filter((p) => p.id !== scorer.id && p.primaryPosition !== 'GK');
      if (pool.length) {
        // Creators: the better a teammate passes and sees, the likelier the assist.
        const creation = pool.map((p) =>
          aroundTeam(p.attributes.passing + p.attributes.vision, meanCreation),
        );
        let pick = rng.next() * creation.reduce((total, weight) => total + weight, 0);
        assistId = pool[pool.length - 1]!.id;
        for (let index = 0; index < pool.length; index++) {
          pick -= creation[index]!;
          if (pick < 0) {
            assistId = pool[index]!.id;
            break;
          }
        }
      }
    }
    // The minute is drawn after the assist, keeping simulated seasons' random sequence.
    const goal: FixtureGoal = {
      playerId: scorer.id,
      teamId,
      minute: rng.int(1, 90),
      extraTime: false,
    };
    if (assistId) goal.assistId = assistId;
    return goal;
  });
}
const finalWinner = (fixture: Fixture, score: [number, number]) =>
  score[0] === score[1] ? null : score[0] > score[1] ? fixture.homeId : fixture.awayId;

/**
 * Decide a fixture without changing the world: score, extra time, penalties, scorers,
 * assisters, minutes and ratings. Background fixtures pick the best available elevens; a
 * played fixture keeps its interactive regulation events and simulates only what follows.
 */
export function finalizeFixture(
  world: World,
  fixture: Fixture,
  played?: PlayedFixture,
  benched?: Id,
): FinalizedFixture {
  const rng = createRng(`${world.seed}:result:${fixture.id}`);
  const home = world.clubs[fixture.homeId]!;
  const away = world.clubs[fixture.awayId]!;
  const appeared = (side: Record<Id, number>) => Object.keys(side).map((id) => world.players[id]!);
  // The eleven each club fields; with formations, each starter is valued in their slot.
  const exclude = benched ? [benched] : [];
  // Background elevens rotate by fatigue and a fixture-seeded jitter, more in domestic cups.
  const rotation =
    world.competitions[fixture.competitionId]?.kind === 'domestic'
      ? BACKGROUND.rotation.cupJitter
      : BACKGROUND.rotation.jitter;
  const homeLineup = played
    ? null
    : clubLineup(world, home, { exclude, seed: `${fixture.id}:home`, rotation });
  const awayLineup = played
    ? null
    : clubLineup(world, away, { exclude, seed: `${fixture.id}:away`, rotation });
  const homePlayers = played
    ? appeared(played.minutes.home)
    : (homeLineup?.starterIds.map((id) => world.players[id]!) ??
      clubStarters(world, home, { exclude }));
  const awayPlayers = played
    ? appeared(played.minutes.away)
    : (awayLineup?.starterIds.map((id) => world.players[id]!) ??
      clubStarters(world, away, { exclude }));
  // Shared with the interactive match engine so played and simulated fixtures agree.
  const bonus = (club: typeof home) =>
    managerStrengthBonus(world.managers[club.managerId]?.ability ?? 60);
  const homeStrength =
    (homeLineup
      ? strengthFromAbility(home.reputation, lineupAbility(homeLineup, world.players))
      : teamStrength(home.reputation, homePlayers)) + bonus(home);
  const awayStrength =
    (awayLineup
      ? strengthFromAbility(away.reputation, lineupAbility(awayLineup, world.players))
      : teamStrength(away.reputation, awayPlayers)) + bonus(away);
  const difference = (homeStrength - awayStrength) * CONFIG.world.strengthScale;
  const [homeGoals, awayGoals] = expectedGoals(
    homeStrength,
    awayStrength,
    Boolean(fixture.neutral),
  );
  const regulation: [number, number] = played
    ? [...played.score]
    : [poisson(rng, homeGoals), poisson(rng, awayGoals)];
  const score: [number, number] = [...regulation];
  let winnerId = finalWinner(fixture, score);
  let penalties: [number, number] | null = null;
  let extraTime: [number, number] | null = null;
  const tie = fixture.tieId ? world.pyramid!.ties[fixture.tieId] : undefined;
  if (tie && fixture.id === tie.fixtureIds.at(-1)) {
    const aggregate: [number, number] = [0, 0];
    for (const id of tie.fixtureIds) {
      const previousFixture = world.fixtures[id]!;
      const resultScore = id === fixture.id ? score : world.results[id]?.score;
      if (!resultScore) throw new Error('A tie cannot resolve before its first leg');
      const homeIndex = tie.clubIds.indexOf(previousFixture.homeId) as 0 | 1;
      aggregate[homeIndex] += resultScore[0];
      aggregate[(1 - homeIndex) as 0 | 1] += resultScore[1];
    }
    if (aggregate[0] === aggregate[1] && tie.drawRule !== 'higher-rank') {
      if (tie.drawRule !== 'penalties') {
        extraTime = [
          poisson(
            rng,
            Math.max(BACKGROUND.minimumGoals, CONFIG.world.baseGoals / 3 + difference / 3),
          ),
          poisson(
            rng,
            Math.max(BACKGROUND.minimumGoals, CONFIG.world.baseGoals / 3 - difference / 3),
          ),
        ];
        score[0] += extraTime[0];
        score[1] += extraTime[1];
        const homeIndex = tie.clubIds.indexOf(home.id) as 0 | 1;
        aggregate[homeIndex] += extraTime[0];
        aggregate[(1 - homeIndex) as 0 | 1] += extraTime[1];
      }
      if (aggregate[0] === aggregate[1] && tie.drawRule !== 'higher-rank-after-extra-time') {
        const homeWins = rng.next() < BACKGROUND.penaltyWinnerChance;
        const loserScore = rng.int(...BACKGROUND.penaltyLoserGoals);
        penalties = homeWins ? [loserScore + 1, loserScore] : [loserScore, loserScore + 1];
        winnerId = homeWins ? home.id : away.id;
      } else winnerId = finalWinner(fixture, score);
    }
  }
  if (!winnerId && isKnockoutFixture(world, fixture)) {
    const homeWins = rng.next() < BACKGROUND.penaltyWinnerChance;
    const loserScore = rng.int(...BACKGROUND.penaltyLoserGoals);
    penalties = homeWins ? [loserScore + 1, loserScore] : [loserScore, loserScore + 1];
    winnerId = homeWins ? home.id : away.id;
  }

  // Minutes, and who is on the pitch for extra time.
  const minutes = new Map<Id, number>();
  const extra = new Set<Id>();
  for (const [players, side, onPitch] of [
    [homePlayers, played?.minutes.home, played?.onPitch.home],
    [awayPlayers, played?.minutes.away, played?.onPitch.away],
  ] as const) {
    for (const player of players) {
      minutes.set(player.id, side ? side[player.id]! : 90);
      if (extraTime && (!onPitch || onPitch.includes(player.id))) extra.add(player.id);
    }
  }
  /** On the pitch at a regulation minute: a substitute after coming on, a replaced player before. */
  const onAt = (id: Id, minute: number, onPitch: readonly Id[]) => {
    const played90 = minutes.get(id)!;
    return played90 >= 90 || (onPitch.includes(id) ? minute > 90 - played90 : minute <= played90);
  };
  const selectedId = played?.selected.playerId;
  const extraTimeGoals = (players: Player[], teamId: Id, count: number) =>
    scoreGoals(
      players.filter((player) => extra.has(player.id)),
      teamId,
      count,
      rng,
    ).map((goal) => ({
      ...goal,
      minute: 90 + Math.ceil((goal.minute * EXTRA_TIME_MINUTES) / 90),
      extraTime: true,
    }));
  const goals: FixtureGoal[] = (
    played
      ? [
          ...played.goals.map((goal): FixtureGoal => {
            const homeSide = goal.teamId === home.id;
            const onPitch = homeSide ? played.onPitch.home : played.onPitch.away;
            const entry: FixtureGoal = {
              playerId: goal.playerId,
              teamId: goal.teamId,
              minute: goal.minute,
              extraTime: false,
            };
            if (goal.assistId) entry.assistId = goal.assistId;
            else if (rng.next() < BACKGROUND.assistedGoalChance) {
              const pool = (homeSide ? homePlayers : awayPlayers).filter(
                (p) =>
                  p.id !== goal.playerId &&
                  p.id !== selectedId &&
                  p.primaryPosition !== 'GK' &&
                  onAt(p.id, goal.minute, onPitch),
              );
              if (pool.length) entry.assistId = rng.pick(pool).id;
            }
            return entry;
          }),
          ...extraTimeGoals(homePlayers, home.id, score[0] - regulation[0]),
          ...extraTimeGoals(awayPlayers, away.id, score[1] - regulation[1]),
        ]
      : // Background goals, extra time included, are drawn across the match as before.
        [
          ...scoreGoals(homePlayers, home.id, score[0], rng),
          ...scoreGoals(awayPlayers, away.id, score[1], rng),
        ]
  ).sort((a, b) => a.minute - b.minute);

  const participants: FixtureParticipant[] = [];
  const everyone = [...homePlayers, ...awayPlayers];
  const matchMean =
    everyone.reduce((sum, player) => sum + playerAbility(player), 0) / Math.max(1, everyone.length);
  for (const [players, teamId, ownGoals, oppositionGoals] of [
    [homePlayers, home.id, score[0], score[1]],
    [awayPlayers, away.id, score[1], score[0]],
  ] as const) {
    for (const player of players) {
      const own = goals.filter((goal) => goal.playerId === player.id);
      const assisted = goals.filter((goal) => goal.assistId === player.id);
      const background = Math.max(
        BACKGROUND.minimumRating,
        Math.min(
          BACKGROUND.maximumRating,
          BACKGROUND.ratingBase +
            (ownGoals > oppositionGoals
              ? BACKGROUND.ratingWin
              : ownGoals < oppositionGoals
                ? BACKGROUND.ratingLoss
                : 0) +
            own.length * BACKGROUND.ratingGoal +
            (playerAbility(player) - matchMean) * BACKGROUND.abilityRatingSlope +
            rng.next() * BACKGROUND.ratingVariation,
        ),
      );
      const extraTimeGoalCount = own.filter((goal) => goal.extraTime).length;
      const extraTimeAssistCount = assisted.filter((goal) => goal.extraTime).length;
      participants.push({
        playerId: player.id,
        teamId,
        minutes: minutes.get(player.id)!,
        extraTimeMinutes: extra.has(player.id) ? EXTRA_TIME_MINUTES : 0,
        goals: own.length,
        assists: assisted.length,
        extraTimeGoals: extraTimeGoalCount,
        extraTimeAssists: extraTimeAssistCount,
        rating:
          player.id === selectedId
            ? withExtraTime(played!.selected.rating, extraTimeGoalCount, extraTimeAssistCount)
            : background,
      });
    }
  }
  const credited = new Set(participants.map((participant) => participant.playerId));
  for (const goal of goals)
    if (!credited.has(goal.playerId) || (goal.assistId && !credited.has(goal.assistId)))
      throw new Error('A goal was credited to a player who did not play');
  return {
    fixtureId: fixture.id,
    score,
    regulation,
    extraTime,
    penalties,
    winnerId,
    decided: penalties ? 'penalties' : extraTime ? 'extra-time' : 'regulation',
    goals,
    participants,
  };
}
/**
 * The interactive rating plus simulated extra-time goals and assists at the engine's goal and
 * assist credit, rounded like the match report.
 */
export function withExtraTime(rating: number, goals: number, assists: number): number {
  if (!goals && !assists) return rating;
  const total = rating + goals * RATING.goal + assists * RATING.assist;
  return Math.round(Math.max(RATING.minimum, Math.min(RATING.maximum, total)) * 10) / 10;
}

/** Store a finalized fixture: its result, every participant's statistics and the table. */
export function applyFinalizedFixture(world: World, final: FinalizedFixture): void {
  const fixture = world.fixtures[final.fixtureId]!;
  const result: BackgroundResult = {
    fixtureId: final.fixtureId,
    score: final.score,
    winnerId: final.winnerId,
    penalties: final.penalties,
    goals: final.goals.map(({ playerId, teamId, minute }) => ({ playerId, teamId, minute })),
    ...(final.extraTime ? { extraTime: final.extraTime } : {}),
  };
  world.results[final.fixtureId] = result;
  for (const participant of final.participants) {
    const player = world.players[participant.playerId]!;
    const home = participant.teamId === fixture.homeId;
    const ownGoals = final.score[home ? 0 : 1];
    const oppositionGoals = final.score[home ? 1 : 0];
    player.stats.appearances++;
    player.stats.minutes += participant.minutes + participant.extraTimeMinutes;
    player.stats.goals += participant.goals;
    player.stats.assists += participant.assists;
    if (oppositionGoals === 0) player.stats.cleanSheets++;
    player.stats.ratingTotal =
      Math.round((player.stats.ratingTotal + participant.rating) * 100) / 100;
    player.form = clampPercent(
      player.form * BACKGROUND.formRetention +
        participant.rating * 10 * BACKGROUND.formRatingWeight,
    );
    player.morale = clampPercent(
      player.morale +
        (ownGoals > oppositionGoals
          ? BACKGROUND.moraleResultDelta
          : ownGoals < oppositionGoals
            ? -BACKGROUND.moraleResultDelta
            : 0),
    );
    player.fatigue = clampPercent(
      player.fatigue + (BACKGROUND.matchFatigue * Math.max(participant.minutes, 1)) / 90,
    );
  }
  recordFixtureStatistics(world, final);
  const league = fixture.phaseId
    ? world.pyramid!.phases[fixture.phaseId]
    : world.leagues[fixture.competitionId];
  if (league) {
    const homeRow = league.standings.find((row) => row.clubId === fixture.homeId)!;
    const awayRow = league.standings.find((row) => row.clubId === fixture.awayId)!;
    for (const [row, goalsFor, goalsAgainst] of [
      [homeRow, final.score[0], final.score[1]],
      [awayRow, final.score[1], final.score[0]],
    ] as const) {
      row.played++;
      row.goalsFor += goalsFor;
      row.goalsAgainst += goalsAgainst;
      if (goalsFor > goalsAgainst) {
        row.won++;
        row.points += 3;
      } else if (goalsFor < goalsAgainst) row.lost++;
      else {
        row.drawn++;
        row.points++;
      }
    }
  }
  injureParticipants(world, final);
  // Continental matches pay both clubs to play, so a cup run shows in the accounts.
  const competition = world.competitions[fixture.competitionId];
  if (competition && (competition.kind === 'champions' || competition.kind === 'continental')) {
    const rate = CONFIG.world.continental.prize[competition.kind];
    for (const id of [fixture.homeId, fixture.awayId]) {
      const club = world.clubs[id];
      if (club)
        club.finances.balance = Math.round(club.finances.balance + club.reputation ** 2 * rate);
    }
  }
}
/** How much of a match's injury chance a player carries: minutes over 90, extra time included. */
export function matchExposure(minutes: number): number {
  return Math.max(CONFIG.career.injuries.minuteFloor, minutes / 90);
}

/**
 * AI players get injured too (the career player's injuries are their own system): a chance
 * per match that grows with fatigue and injury proneness, for a spell drawn from the same
 * table as the career's. Injured players are unavailable until their weeks run out.
 */
function injureParticipants(world: World, final: FinalizedFixture): void {
  // Worlds from before the national pyramid keep their rules: no AI injuries.
  if (world.format !== 'national-v1') return;
  const I = CONFIG.career.injuries;
  const A = BACKGROUND.aiInjuries;
  const rng = createRng(`${world.seed}:injuries:${final.fixtureId}`);
  const careerId = world.career?.playerId;
  for (const participant of final.participants) {
    const player = world.players[participant.playerId];
    if (!player || player.id === careerId || player.injuryId || participant.minutes <= 0) continue;
    const chance =
      A.matchChance *
      matchExposure(participant.minutes + participant.extraTimeMinutes) *
      (0.5 + player.hidden.injuryProneness / 100) *
      (1 + player.fatigue / A.fatigueWeight);
    if (rng.next() >= chance) continue;
    // A club always keeps one fit keeper.
    if (player.primaryPosition === 'GK') {
      const club = player.clubId ? world.clubs[player.clubId] : undefined;
      const fitKeepers = club
        ? club.playerIds.filter((id) => {
            const other = world.players[id]!;
            return other.primaryPosition === 'GK' && !other.injuryId && !other.retired;
          }).length
        : 0;
      if (fitKeepers <= 1) continue;
    }
    let pick = rng.next() * I.types.reduce((sum, type) => sum + type.weight, 0);
    let type = I.types[I.types.length - 1]!;
    for (const candidate of I.types) {
      pick -= candidate.weight;
      if (pick < 0) {
        type = candidate;
        break;
      }
    }
    player.injuryId = `injury:${final.fixtureId}:${player.id}`;
    player.injuryWeeks = rng.int(type.weeks[0], type.weeks[1]);
  }
}
const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
