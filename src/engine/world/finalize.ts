import type { BackgroundResult, Fixture, Id, Player, World } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng, type Rng } from '../rng';
import { expectedGoals, selectStartingPlayers, teamStrength } from '../strength';
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
function scoreGoals(players: Player[], teamId: Id, count: number, rng: Rng): FixtureGoal[] {
  const weights = players.map((player) =>
    player.primaryPosition === 'GK'
      ? BACKGROUND.scorerWeights.GK
      : player.primaryPosition === 'ST'
        ? BACKGROUND.scorerWeights.ST
        : ['LW', 'RW', 'AM'].includes(player.primaryPosition)
          ? BACKGROUND.scorerWeights.winger
          : ['CM', 'DM'].includes(player.primaryPosition)
            ? BACKGROUND.scorerWeights.midfield
            : BACKGROUND.scorerWeights.defender,
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
      if (pool.length) assistId = rng.pick(pool).id;
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
  const starters = (clubId: Id) =>
    selectStartingPlayers(
      world.clubs[clubId]!.playerIds.filter((id) => id !== benched).map((id) => world.players[id]!),
    );
  const homePlayers = played ? appeared(played.minutes.home) : starters(home.id);
  const awayPlayers = played ? appeared(played.minutes.away) : starters(away.id);
  // Shared with the interactive match engine so played and simulated fixtures agree.
  const homeStrength = teamStrength(home.reputation, homePlayers);
  const awayStrength = teamStrength(away.reputation, awayPlayers);
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
}
const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
