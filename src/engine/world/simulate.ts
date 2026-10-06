import type {
  BackgroundResult,
  Club,
  Fixture,
  Player,
  SeasonSummary,
  World,
} from '../../model/domain';
import { CONFIG } from '../config';
import { createRng, restoreRng, type Rng } from '../rng';
import { developWeek, recalibratePotential } from '../ageing';
import { generateManager } from './generate';
import { addCupRound, createLeagueFixtures, emptyStanding, sortStandings } from './schedule';
import { advanceNationalPyramid } from './pyramid';
import { resolvePostseasonTie } from './postseason';
import { getSeasonWeeks } from './calendar';
import { rankStandings } from './ranking';
import { resetNationalSeason } from './movement';
import { recordEvent as event } from './events';
import { expectedGoals, selectStartingPlayers, teamStrength } from '../strength';
import { careerWeek, refreshMentor } from '../career/training';
import { pendingCareerFixture } from '../career/fixtures';
import {
  archiveAndPrune,
  fillSquads,
  isActiveClub,
  refreshDressingRoom,
  refreshReturningClub,
  seasonalSquadReview,
} from './lifecycle';

const copyWorld = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const BACKGROUND = CONFIG.world.background;
const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
const money = (value: number): number => Math.max(0, Math.round(value));

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
/** The background XI: available squad members, best by ability within each line. */
function startingPlayers(world: World, club: Club): Player[] {
  return selectStartingPlayers(club.playerIds.map((id) => world.players[id]!));
}
function scoreGoals(
  players: Player[],
  teamId: string,
  count: number,
  rng: Rng,
): BackgroundResult['goals'] {
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
    scorer.stats.goals++;
    if (rng.next() < BACKGROUND.assistedGoalChance)
      rng.pick(
        players.filter((player) => player.id !== scorer.id && player.primaryPosition !== 'GK'),
      ).stats.assists++;
    return { playerId: scorer.id, teamId, minute: rng.int(1, 90) };
  });
}
/** A fixture played interactively, committed through the same resolver as background games. */
export interface PlayedFixture {
  /** Regulation score, home first. Extra time and penalties are added here if required. */
  score: [number, number];
  /** Regulation goals; a missing assist is assigned the way background goals are. */
  goals: { playerId: string; teamId: string; minute: number; assistId?: string }[];
  /** Minutes played by everyone who appeared, per side. */
  minutes: { home: Record<string, number>; away: Record<string, number> };
  /** Interactive ratings (the career player); others use the background rating. */
  ratings: Record<string, number>;
}
/** Record a played fixture's result exactly once, through the shared resolver. */
export function commitPlayedFixture(world: World, fixtureId: string, played: PlayedFixture): void {
  const fixture = world.fixtures[fixtureId];
  if (!fixture || world.results[fixtureId]) throw new Error('Fixture already resolved');
  resolveFixture(world, fixture, played);
  // Settle what the result decides immediately (tie aggregates, a cup final's winner), so the
  // committed world is consistent before the rest of the week is simulated.
  const tie = fixture.tieId ? world.pyramid?.ties[fixture.tieId] : undefined;
  if (tie) resolvePostseasonTie(world, tie);
  if (world.competitions[fixture.competitionId]) advanceCups(world);
  const league = world.leagues[fixture.competitionId];
  if (league)
    league.standings =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
}
function resolveFixture(world: World, fixture: Fixture, played?: PlayedFixture): void {
  const rng = createRng(`${world.seed}:result:${fixture.id}`);
  const home = world.clubs[fixture.homeId]!;
  const away = world.clubs[fixture.awayId]!;
  const appeared = (side: Record<string, number>) =>
    Object.keys(side).map((id) => world.players[id]!);
  const homePlayers = played ? appeared(played.minutes.home) : startingPlayers(world, home);
  const awayPlayers = played ? appeared(played.minutes.away) : startingPlayers(world, away);
  // Shared with the interactive match engine so played and simulated fixtures agree.
  const homeStrength = teamStrength(home.reputation, homePlayers);
  const awayStrength = teamStrength(away.reputation, awayPlayers);
  const difference = (homeStrength - awayStrength) * CONFIG.world.strengthScale;
  const [homeGoals, awayGoals] = expectedGoals(
    homeStrength,
    awayStrength,
    Boolean(fixture.neutral),
  );
  const score: [number, number] = played
    ? [...played.score]
    : [poisson(rng, homeGoals), poisson(rng, awayGoals)];
  const regulation: [number, number] = [...score];
  let winnerId = score[0] === score[1] ? null : score[0] > score[1] ? home.id : away.id;
  let penalties: [number, number] | null = null;
  let extraTime: [number, number] | undefined;
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
      } else winnerId = score[0] === score[1] ? null : score[0] > score[1] ? home.id : away.id;
    }
  }
  if (!winnerId && world.competitions[fixture.competitionId]?.format === 'knockout') {
    const homeWins = rng.next() < BACKGROUND.penaltyWinnerChance;
    const loserScore = rng.int(...BACKGROUND.penaltyLoserGoals);
    penalties = homeWins ? [loserScore + 1, loserScore] : [loserScore, loserScore + 1];
    winnerId = homeWins ? home.id : away.id;
  }
  const goals = (
    played
      ? [
          ...played.goals.map((goal) => {
            const side = goal.teamId === home.id ? homePlayers : awayPlayers;
            world.players[goal.playerId]!.stats.goals++;
            const assister =
              goal.assistId ??
              (rng.next() < BACKGROUND.assistedGoalChance
                ? rng.pick(side.filter((p) => p.id !== goal.playerId && p.primaryPosition !== 'GK'))
                    .id
                : undefined);
            if (assister) world.players[assister]!.stats.assists++;
            return { playerId: goal.playerId, teamId: goal.teamId, minute: goal.minute };
          }),
          // Extra-time goals after an interactive 90 minutes use the background scorers.
          ...scoreGoals(homePlayers, home.id, score[0] - regulation[0], rng).map((goal) => ({
            ...goal,
            minute: 90 + Math.ceil(goal.minute / 3),
          })),
          ...scoreGoals(awayPlayers, away.id, score[1] - regulation[1], rng).map((goal) => ({
            ...goal,
            minute: 90 + Math.ceil(goal.minute / 3),
          })),
        ]
      : [
          ...scoreGoals(homePlayers, home.id, score[0], rng),
          ...scoreGoals(awayPlayers, away.id, score[1], rng),
        ]
  ).sort((a, b) => a.minute - b.minute);
  world.results[fixture.id] = {
    fixtureId: fixture.id,
    score,
    winnerId,
    penalties,
    goals,
    ...(extraTime ? { extraTime } : {}),
  };
  for (const [players, ownGoals, oppositionGoals, minutes] of [
    [homePlayers, score[0], score[1], played?.minutes.home],
    [awayPlayers, score[1], score[0], played?.minutes.away],
  ] as const) {
    for (const player of players) {
      const played90 = minutes ? minutes[player.id]! : 90;
      player.stats.appearances++;
      player.stats.minutes += played90 + (extraTime && played90 >= 90 ? 30 : 0);
      if (oppositionGoals === 0) player.stats.cleanSheets++;
      const scored = goals.filter((goal) => goal.playerId === player.id).length;
      const interactive = played?.ratings[player.id];
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
            scored * BACKGROUND.ratingGoal +
            rng.next() * BACKGROUND.ratingVariation,
        ),
      );
      const rating = interactive ?? background;
      player.stats.ratingTotal = Math.round((player.stats.ratingTotal + rating) * 100) / 100;
      player.form = clampPercent(
        player.form * BACKGROUND.formRetention + rating * 10 * BACKGROUND.formRatingWeight,
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
        player.fatigue + (BACKGROUND.matchFatigue * Math.max(played90, 1)) / 90,
      );
    }
  }
  const league = fixture.phaseId
    ? world.pyramid!.phases[fixture.phaseId]
    : world.leagues[fixture.competitionId];
  if (league) {
    const homeRow = league.standings.find((row) => row.clubId === home.id)!;
    const awayRow = league.standings.find((row) => row.clubId === away.id)!;
    for (const [row, goalsFor, goalsAgainst] of [
      [homeRow, score[0], score[1]],
      [awayRow, score[1], score[0]],
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

function developPlayers(world: World, rng: Rng): void {
  const seasonWeeks = getSeasonWeeks(world);
  const careerId = world.career?.playerId;
  for (const player of Object.values(world.players)) {
    if (player.retired) continue;
    // Squads of clubs below the simulated frontier are dormant until readmitted.
    if (player.clubId && !isActiveClub(world, world.clubs[player.clubId]!)) continue;
    // The career player grows through XP and training; their ageing runs in the career week.
    if (player.id !== careerId)
      developWeek(player, world.date.season - player.birthSeason, seasonWeeks, rng);
    player.fatigue = clampPercent(player.fatigue - BACKGROUND.weeklyRecovery);
    player.fitness = clampPercent(100 - player.fatigue * BACKGROUND.fitnessFatigueWeight);
  }
}
/**
 * Worlds generated before development version 2 treated potential as a ceiling well above
 * eventual ability, which made the world drift upward. Re-estimate it once from current
 * ability and age, so these worlds follow the same equilibrium as new ones.
 */
function recalibrateDevelopment(world: World): void {
  if (world.developmentVersion === 2) return;
  for (const player of Object.values(world.players))
    if (!player.retired && player.id !== world.career?.playerId)
      player.potential = recalibratePotential(player, world.date.season - player.birthSeason);
  world.developmentVersion = 2;
}
function updateFinances(world: World): void {
  for (const club of Object.values(world.clubs)) {
    if (!isActiveClub(world, club)) continue;
    const wages = club.playerIds.reduce(
      (sum, id) => sum + world.contracts[world.players[id]!.contractId!]!.weeklyWage,
      0,
    );
    club.finances.balance = money(
      club.finances.balance + club.finances.weeklyIncome - club.finances.weeklyCosts - wages,
    );
    club.finances.wageBudget = money(Math.max(club.finances.wageBudget, wages));
    club.finances.transferBudget = money(
      Math.min(
        club.finances.transferBudget,
        club.finances.balance * BACKGROUND.transferBudgetBalanceShare,
      ),
    );
  }
}
function exchangeTransfers(world: World, rng: Rng): void {
  for (const country of Object.values(world.countries)) {
    const clubs = country.leagueIds
      .flatMap((id) => world.leagues[id]!.clubIds)
      .map((id) => world.clubs[id]!);
    const careerId = world.career?.playerId;
    const a = rng.pick(clubs);
    // Exchanges happen between clubs of a similar level, never top flight and sixth tier.
    const tier = world.leagues[a.leagueId]!.tier;
    const b = rng.pick(
      clubs.filter(
        (club) => club.id !== a.id && Math.abs(world.leagues[club.leagueId]!.tier - tier) <= 1,
      ),
    );
    // The career player only moves through their own decisions (milestone 5).
    const movable = (club: Club) => club.playerIds.filter((id) => id !== careerId);
    const positionsOf = (club: Club) =>
      new Set(movable(club).map((id) => world.players[id]!.primaryPosition));
    const shared = [...positionsOf(a)].filter(
      (position) => position !== 'GK' && positionsOf(b).has(position),
    );
    if (!shared.length) continue;
    const position = rng.pick(
      (['CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'] as const).filter((p) =>
        shared.includes(p),
      ),
    );
    const playerA = rng.pick(
      movable(a)
        .map((id) => world.players[id]!)
        .filter((player) => player.primaryPosition === position),
    );
    const playerB = rng.pick(
      movable(b)
        .map((id) => world.players[id]!)
        .filter((player) => player.primaryPosition === position),
    );
    const move = (player: Player, old: Club, destination: Club) => {
      player.clubId = destination.id;
      const contract = world.contracts[player.contractId!]!;
      contract.clubId = destination.id;
      contract.start = { ...world.date };
      contract.end = {
        season: world.date.season + BACKGROUND.transferContractYears,
        week: getSeasonWeeks(world),
        day: 7,
      };
      old.playerIds = old.playerIds.filter((id) => id !== player.id);
      destination.playerIds.push(player.id);
      event(world, 'transfer', [player.id, old.id, destination.id], {
        name: player.name,
        old: old.name,
        new: destination.name,
        fee: 0,
      });
    };
    move(playerA, a, b);
    move(playerB, b, a);
    refreshDressingRoom(world, a);
    refreshDressingRoom(world, b);
  }
}
function managerChanges(world: World, rng: Rng): void {
  for (const league of Object.values(world.leagues)) {
    const table =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
    const bottom = table.at(-1)!;
    if (
      bottom.played === 0 ||
      bottom.points / bottom.played > BACKGROUND.managerPointsThreshold ||
      rng.next() > BACKGROUND.managerDismissalChance
    )
      continue;
    const club = world.clubs[bottom.clubId]!;
    const old = world.managers[club.managerId]!;
    const id = `manager:${club.id}:${world.date.season}:${world.date.week}`;
    const manager = generateManager(
      id,
      rng,
      world.format === 'national-v1' ? Number(club.countryId.split(':')[1]) : undefined,
    );
    world.managers[id] = manager;
    club.managerId = id;
    event(world, 'manager-change', [club.id, old.id, id], {
      name: club.name,
      old: old.name,
      new: manager.name,
    });
  }
}
function advanceCups(world: World): void {
  for (const cup of Object.values(world.competitions)) {
    if (cup.winnerId) continue;
    const stage = cup.stages.at(-1)!;
    if (!stage.fixtureIds.every((id) => world.results[id])) continue;
    const winners = [
      ...(stage.byeClubIds ?? []),
      ...stage.fixtureIds.map((id) => world.results[id]!.winnerId!),
    ];
    if (winners.length === 1) {
      cup.winnerId = winners[0]!;
      event(world, 'trophy', [cup.winnerId, cup.id], {
        name: world.clubs[cup.winnerId]!.name,
        competition: cup.name,
      });
    } else addCupRound(world, cup, winners);
  }
}
function archiveSeason(world: World): void {
  if (
    world.format === 'national-v1' &&
    (world.pyramid!.stage !== 'resolved' ||
      Object.values(world.competitions).some((competition) => !competition.winnerId))
  )
    throw new Error('A national season cannot finish before all competitions and movement resolve');
  const summary: SeasonSummary = {
    season: world.date.season,
    tables: {},
    champions: {},
    cupWinners: {},
    movements: [],
  };
  for (const league of Object.values(world.leagues)) {
    const table =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings)
        : sortStandings(league.standings);
    summary.tables[league.id] = table.map((row) => ({ ...row }));
    summary.champions[league.id] = table[0]!.clubId;
    event(world, 'trophy', [table[0]!.clubId, league.id], {
      name: world.clubs[table[0]!.clubId]!.name,
      competition: league.name,
    });
    const country = world.countries[league.countryId]!;
    if (world.format !== 'national-v1' && league.promotionPlaces)
      for (const row of table.slice(0, league.promotionPlaces))
        summary.movements.push({
          clubId: row.clubId,
          fromLeagueId: league.id,
          toLeagueId: country.leagueIds[league.tier - 2]!,
        });
    if (world.format !== 'national-v1' && league.relegationPlaces)
      for (const row of table.slice(-league.relegationPlaces))
        summary.movements.push({
          clubId: row.clubId,
          fromLeagueId: league.id,
          toLeagueId: country.leagueIds[league.tier]!,
        });
  }
  if (world.format === 'national-v1') {
    summary.movements = world.pyramid!.movements.map((movement) => ({ ...movement }));
    summary.phases = JSON.parse(JSON.stringify(world.pyramid!.phases)) as typeof summary.phases;
    summary.ties = JSON.parse(JSON.stringify(world.pyramid!.ties)) as typeof summary.ties;
  }
  for (const cup of Object.values(world.competitions))
    if (cup.winnerId) summary.cupWinners[cup.id] = cup.winnerId;
  world.history.push(summary);
  world.phase = 'complete';
}

export interface SimulationOptions {
  /**
   * Mutate the given world instead of copying it. Only for callers that own the object
   * and have finished serializing any earlier checkpoint of it, such as the world worker;
   * the deep copy was two thirds of each simulated week's cost.
   */
  inPlace?: boolean;
  /**
   * Allow the background resolver to play the career player's pending fixture. Only for
   * callers that have deliberately chosen to skip it; the normal path plays it interactively
   * (or with the auto-play policy) and commits it before the week is simulated.
   */
  allowCareerFixture?: boolean;
}
/** Thrown when a week would simulate a career fixture that has not been played. */
export class CareerMatchPendingError extends Error {
  constructor(public readonly fixtureId: string) {
    super('The career player has a match to play this week');
    this.name = 'CareerMatchPendingError';
  }
}
/**
 * If the career player's club dropped below the simulated frontier, the player joins a club
 * in the lowest simulated division of the same country (same region where possible), so the
 * career always has fixtures. Transfers proper arrive in milestone 5.
 */
function keepCareerInSimulatedLeagues(world: World): void {
  const player = world.players[world.career!.playerId]!;
  const current = player.clubId ? world.clubs[player.clubId] : undefined;
  if (!current || world.leagues[current.leagueId]) return;
  const country = world.countries[current.countryId]!;
  const bottom = Math.max(...country.leagueIds.map((id) => world.leagues[id]!.tier));
  // Runs after movements are applied, so read each club's new league, not stale memberships.
  const candidates = Object.values(world.clubs)
    .filter(
      (club) =>
        club.countryId === current.countryId &&
        world.leagues[club.leagueId]?.tier === bottom &&
        !club.identity?.reserveParentId,
    )
    .sort(
      (a, b) =>
        Number(b.identity?.region === current.identity?.region) -
          Number(a.identity?.region === current.identity?.region) ||
        a.playerIds.length - b.playerIds.length ||
        (a.id < b.id ? -1 : 1),
    );
  const destination = candidates[0];
  if (!destination) return;
  const contract = world.contracts[player.contractId!]!;
  current.playerIds = current.playerIds.filter((id) => id !== player.id);
  destination.playerIds.push(player.id);
  player.clubId = destination.id;
  contract.clubId = destination.id;
  refreshDressingRoom(world, current);
  refreshDressingRoom(world, destination);
  event(world, 'transfer', [player.id, current.id, destination.id], {
    name: player.name,
    old: current.name,
    new: destination.name,
    fee: 0,
  });
}
export function simulateWeek(input: World, options: SimulationOptions = {}): World {
  if (input.phase === 'complete') return input;
  const pending = options.allowCareerFixture ? null : pendingCareerFixture(input);
  if (pending) throw new CareerMatchPendingError(pending.id);
  const world = options.inPlace ? input : copyWorld(input);
  const rng = restoreRng(world.rng);
  recalibrateDevelopment(world);
  const fixtures = Object.values(world.fixtures)
    .filter(
      (fixture) =>
        fixture.date.season === world.date.season &&
        fixture.date.week === world.date.week &&
        !world.results[fixture.id],
    )
    .sort((a, b) => a.date.day - b.date.day || (a.id < b.id ? -1 : 1));
  for (const fixture of fixtures) resolveFixture(world, fixture);
  for (const league of Object.values(world.leagues))
    league.standings =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
  advanceCups(world);
  if (world.format === 'national-v1') advanceNationalPyramid(world);
  developPlayers(world, rng);
  if (world.career) careerWeek(world);
  if ((CONFIG.world.transferWeeks as readonly number[]).includes(world.date.week)) {
    exchangeTransfers(world, rng);
    fillSquads(world, rng);
  }
  if ((CONFIG.world.managerWeeks as readonly number[]).includes(world.date.week))
    managerChanges(world, rng);
  if (world.date.week === CONFIG.world.intakeWeek) seasonalSquadReview(world, rng);
  updateFinances(world);
  if (world.date.week === getSeasonWeeks(world)) archiveSeason(world);
  world.date.week++;
  world.rng = rng.snapshot();
  return world;
}
export function startNextSeason(input: World, options: SimulationOptions = {}): World {
  if (input.phase !== 'complete')
    throw new Error('The current season must finish before starting another');
  const world = options.inPlace ? input : copyWorld(input);
  const summary = world.history.at(-1)!;
  archiveAndPrune(world, world.date.season);
  for (const movement of summary.movements)
    world.clubs[movement.clubId]!.leagueId = movement.toLeagueId;
  world.date = { season: world.date.season + 1, week: 1, day: 1 };
  for (const movement of summary.movements)
    if (movement.fromLeagueId.startsWith('feeder:') && world.leagues[movement.toLeagueId])
      refreshReturningClub(world, world.clubs[movement.clubId]!);
  if (world.career) {
    keepCareerInSimulatedLeagues(world);
    refreshMentor(world);
  }
  world.phase = 'active';
  world.fixtures = {};
  world.results = {};
  world.matches = {};
  world.season = {
    year: world.date.season,
    start: { ...world.date },
    end: { season: world.date.season, week: getSeasonWeeks(world), day: 7 },
    competitionIds: [...Object.keys(world.leagues), ...Object.keys(world.competitions)],
    awardIds: [],
  };
  for (const league of Object.values(world.leagues)) {
    league.clubIds = Object.values(world.clubs)
      .filter((club) => club.leagueId === league.id)
      .map((club) => club.id)
      .sort();
    league.standings = league.clubIds.map(emptyStanding);
    const fixtures = createLeagueFixtures(
      league.clubIds,
      league.id,
      world.date.season,
      world.format === 'national-v1' ? { cycles: 2 } : undefined,
    );
    league.fixtureIds = fixtures.map((fixture) => fixture.id);
    for (const fixture of fixtures) world.fixtures[fixture.id] = fixture;
  }
  for (const cup of Object.values(world.competitions)) {
    cup.season = world.date.season;
    cup.stages = [];
    cup.winnerId = null;
    const country = cup.countryId
      ? world.countries[cup.countryId]!
      : Object.values(world.countries).find((country) => country.domesticCupId === cup.id)!;
    addCupRound(
      world,
      cup,
      country.leagueIds
        .filter((id) => !cup.divisionId || world.leagues[id]!.divisionId === cup.divisionId)
        .flatMap((id) => world.leagues[id]!.clubIds),
    );
  }
  if (world.format === 'national-v1') resetNationalSeason(world);
  return world;
}
