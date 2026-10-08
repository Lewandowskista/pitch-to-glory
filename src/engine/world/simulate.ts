import type { Club, League, Player, SeasonSummary, World } from '../../model/domain';
import { coachingRollover } from '../career/coaching';
import { CONFIG } from '../config';
import { restoreRng, type Rng } from '../rng';
import { developWeek, recalibratePotential } from '../ageing';
import { generateManager } from './generate';
import { aiTransferWindow } from './transfers';
import { addCupRound, createLeagueFixtures, emptyStanding, sortStandings } from './schedule';
import { advanceNationalPyramid } from './pyramid';
import { resolvePostseasonTie } from './postseason';
import { getSeasonWeeks } from './calendar';
import { rankStandings } from './ranking';
import { resetNationalSeason } from './movement';
import { advanceContinental, isContinental, startContinental } from './continental';
import { recordEvent as event } from './events';
import { startSeasonStatistics } from './statistics';
import { decidedTitles, QUALIFYING_DIVISIONS } from './titles';
import {
  applyFinalizedFixture,
  finalizeFixture,
  type FinalizedFixture,
  type PlayedFixture,
} from './finalize';
import { careerWeek, refreshMentor } from '../career/training';
import { pendingCareerFixture } from '../career/fixtures';
import { benchedCareerFixtures, marketRollover, marketWeek } from '../career/market/week';
import { postMessage, recordMove } from '../career/market/records';
import { socialRollover, socialWeek } from '../career/social/week';
import { lifestyleRollover, lifestyleWeek } from '../career/lifestyle/week';
import {
  honoursRollover,
  honoursSeasonEnd,
  honoursWeek,
  recordCareerTrophies,
  startAwardSeason,
} from '../career/honours/week';
import { chronicle } from '../career/honours/chronicle';
import { formerTeammates } from '../career/honours/retirement';
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

export type { PlayedFixture } from './finalize';
/**
 * Record a played fixture's result exactly once, through the shared resolver, and return the
 * finalized outcome the career record is derived from.
 */
export function commitPlayedFixture(
  world: World,
  fixtureId: string,
  played: PlayedFixture,
): FinalizedFixture {
  const fixture = world.fixtures[fixtureId];
  if (!fixture || world.results[fixtureId]) throw new Error('Fixture already resolved');
  const final = finalizeFixture(world, fixture, played);
  applyFinalizedFixture(world, final);
  // Settle what the result decides immediately (tie aggregates, a cup final's winner), so the
  // committed world is consistent before the rest of the week is simulated.
  const tie = fixture.tieId ? world.pyramid?.ties[fixture.tieId] : undefined;
  if (tie) resolvePostseasonTie(world, tie);
  if (world.competitions[fixture.competitionId]) {
    advanceCups(world);
    advanceContinental(world);
  }
  const league = world.leagues[fixture.competitionId];
  if (league)
    league.standings =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
  return final;
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
    // An AI injury runs its weeks down; the career player's is handled in the career week.
    if (player.id !== careerId && player.injuryWeeks !== undefined) {
      player.injuryWeeks--;
      if (player.injuryWeeks <= 0) {
        player.injuryId = null;
        delete player.injuryWeeks;
      }
    }
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
  // A loaned player's wage is split: the loan club pays its share, the parent the rest.
  const loanShare = new Map(world.loans.map((loan) => [loan.playerId, loan.wageShare]));
  const parentShare = new Map<string, number>();
  for (const loan of world.loans) {
    const wage = world.contracts[world.players[loan.playerId]!.contractId!]!.weeklyWage;
    parentShare.set(
      loan.parentClubId,
      (parentShare.get(loan.parentClubId) ?? 0) + wage * (1 - loan.wageShare),
    );
  }
  for (const club of Object.values(world.clubs)) {
    if (!isActiveClub(world, club)) continue;
    const wages =
      club.playerIds.reduce(
        (sum, id) =>
          sum +
          world.contracts[world.players[id]!.contractId!]!.weeklyWage * (loanShare.get(id) ?? 1),
        0,
      ) + (parentShare.get(club.id) ?? 0);
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
    const rivalIds = new Set(world.rivalries.map((rivalry) => rivalry.rivalPlayerId));
    const a = rng.pick(clubs);
    // Exchanges happen between clubs of a similar level, never top flight and sixth tier.
    const tier = world.leagues[a.leagueId]!.tier;
    const b = rng.pick(
      clubs.filter(
        (club) => club.id !== a.id && Math.abs(world.leagues[club.leagueId]!.tier - tier) <= 1,
      ),
    );
    // The career player only moves through their own decisions (milestone 5).
    const movable = (club: Club) =>
      club.playerIds.filter((id) => id !== careerId && !rivalIds.has(id));
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
/** Points a game a club's standing in its league expects, by reputation rank. */
function expectedPointsPerGame(world: World, league: League, clubId: string): number {
  const [low, high] = BACKGROUND.sacking.expectedPointsRange;
  const ranked = [...league.clubIds].sort(
    (a, b) => world.clubs[b]!.reputation - world.clubs[a]!.reputation || (a < b ? -1 : 1),
  );
  const rank = ranked.indexOf(clubId);
  return ranked.length > 1 ? high - ((high - low) * rank) / (ranked.length - 1) : (low + high) / 2;
}
/**
 * Sackings, every week from the configured one: a manager whose points a game trail what the
 * club's standing expects goes with probability hazard × shortfall, after a grace period.
 */
function managerChanges(world: World, rng: Rng): void {
  const S = BACKGROUND.sacking;
  if (world.date.week < S.fromWeek || world.date.week > getSeasonWeeks(world) - 2) return;
  for (const league of Object.values(world.leagues)) {
    const table =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
    for (const row of table) {
      if (row.played < 5) continue;
      const club = world.clubs[row.clubId]!;
      if (!isActiveClub(world, club)) continue;
      const old = world.managers[club.managerId]!;
      if (old.appointed) {
        const weeksInPost =
          (world.date.season - old.appointed.season) * getSeasonWeeks(world) +
          (world.date.week - old.appointed.week);
        if (weeksInPost < S.cooldownWeeks) continue;
      }
      const shortfall = expectedPointsPerGame(world, league, club.id) - row.points / row.played;
      if (shortfall <= 0 || rng.next() >= S.hazard * shortfall) continue;
      const id = `manager:${club.id}:${world.date.season}:${world.date.week}`;
      const manager = generateManager(
        id,
        rng,
        world.format === 'national-v1' ? Number(club.countryId.split(':')[1]) : undefined,
      );
      manager.appointed = { ...world.date };
      // A retired teammate of a past career may return as a manager (AGENTS.md §9.2).
      const former = formerTeammates(world);
      if (former.length && rng.next() < CONFIG.career.honours.formerTeammateManager) {
        const person = former[0]!;
        manager.name = person.name;
        manager.avatar = { ...person.avatar };
        manager.formerPlayerId = person.id;
        manager.age = Math.max(35, world.date.season - person.birthSeason);
      }
      world.managers[id] = manager;
      club.managerId = id;
      event(world, 'manager-change', [club.id, old.id, id], {
        name: club.name,
        old: old.name,
        new: manager.name,
      });
    }
  }
}
/** The reputation band of a tier: generation's floor and ceiling. */
export function reputationBand(tier: number): [number, number] {
  const G = CONFIG.world.generation;
  return [
    Math.max(5, G.reputationFloor - tier * G.reputationTierStep),
    Math.max(15, G.reputationCeiling - tier * G.reputationTierStep),
  ];
}
/**
 * Reputation moves with results at each season's end: toward the middle of the band of the
 * tier the club will play in, and with its finish in the league, within a maximum change and
 * a margin around the band. Continental winners gain. Finances follow the new standing.
 */
function updateReputations(world: World, summary: SeasonSummary): void {
  // Worlds from before the national pyramid keep their fixed reputations.
  if (world.format !== 'national-v1') return;
  const R = BACKGROUND.reputation;
  const G = CONFIG.world.generation;
  const destination = new Map(summary.movements.map((m) => [m.clubId, m.toLeagueId]));
  const champions = new Set<string>();
  const shields = new Set<string>();
  for (const cup of Object.values(world.competitions)) {
    if (!cup.winnerId) continue;
    if (cup.kind === 'champions') champions.add(cup.winnerId);
    if (cup.kind === 'continental') shields.add(cup.winnerId);
  }
  for (const league of Object.values(world.leagues)) {
    const table = summary.tables[league.id] ?? [];
    const size = table.length;
    table.forEach((row, index) => {
      const club = world.clubs[row.clubId];
      if (!club) return;
      const next = world.leagues[destination.get(club.id) ?? club.leagueId];
      const tier = next?.tier ?? league.tier;
      const [floor, ceiling] = reputationBand(tier);
      // Inside its tier's band a club moves by its finish alone, so a run of titles builds a
      // dynasty and a run of poor seasons erodes one; outside the band it is pulled back in.
      const pull =
        club.reputation < floor
          ? floor - club.reputation
          : club.reputation > ceiling
            ? ceiling - club.reputation
            : 0;
      const finish = size > 1 ? (size / 2 - (index + 1)) / (size / 2) : 0;
      let delta = R.seasonStep * pull + R.rankStep * finish;
      delta = Math.max(-R.maximumChange, Math.min(R.maximumChange, delta));
      if (champions.has(club.id)) delta += R.championsWinner;
      else if (shields.has(club.id)) delta += R.shieldWinner;
      // A club already within the band's margin stays within it; one arriving from outside
      // closes the distance by at most the maximum change a season.
      const low = floor - R.bandMargin;
      const high = ceiling + R.bandMargin;
      const inside = club.reputation >= low && club.reputation <= high;
      let reputation = Math.round(Math.min(99, club.reputation + delta));
      if (inside) reputation = Math.max(low, Math.min(high, reputation));
      club.reputation = Math.max(1, reputation);
      club.finances.weeklyIncome = money(
        Math.max(G.incomeFloor, club.reputation * club.reputation * G.incomeFactor),
      );
      club.finances.weeklyCosts = money(club.reputation * club.reputation * G.costsFactor);
      // A new season's transfer budget, from standing, not from what was left unspent.
      club.finances.transferBudget = money(club.reputation * club.reputation * G.transferFactor);
      club.finances.wageBudget = money(
        Math.max(club.finances.wageBudget, club.reputation * club.reputation * G.wageBudgetFactor),
      );
    });
  }
}
/** The weeks of AI transfer activity and the academy intake for this world's season length. */
export function lifecycleWeeks(world: World): { transfer: number[]; intake: number } {
  if (world.format !== 'national-v1')
    return { transfer: [...CONFIG.world.transferWeeks], intake: CONFIG.world.intakeWeek };
  const weeks = getSeasonWeeks(world);
  const F = CONFIG.world.lifecycleFractions;
  return {
    transfer: F.transfer.map((fraction) => Math.max(1, Math.round(fraction * weeks))),
    intake: Math.round(F.intake * weeks),
  };
}
function advanceCups(world: World): void {
  for (const cup of Object.values(world.competitions)) {
    // Continental cups have groups before their knockouts; advanceContinental runs them.
    if (cup.winnerId || isContinental(cup)) continue;
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
    // A qualifying group's winner is not a champion; its division's title is archived below.
    if (!(league.divisionId && QUALIFYING_DIVISIONS[league.divisionId]))
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
    for (const title of decidedTitles(world)) {
      if (!title.divisionId) continue;
      (summary.divisionChampions ??= {})[title.divisionId] = {
        competitionId: title.competitionId,
        clubId: title.clubId,
      };
      event(world, 'trophy', [title.clubId, title.competitionId], {
        name: world.clubs[title.clubId]!.name,
        competition: title.name,
      });
    }
  }
  for (const cup of Object.values(world.competitions))
    if (cup.winnerId) summary.cupWinners[cup.id] = cup.winnerId;
  updateReputations(world, summary);
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
  recordMove(world, {
    kind: 'relocation',
    fromClubId: current.id,
    toClubId: destination.id,
    fee: 0,
    weeklyWage: contract.weeklyWage,
  });
  postMessage(world, 'relocated', { old: current.name, club: destination.name });
  chronicle(
    world,
    'move',
    { kind: 'relocation', club: destination.name, fee: 0 },
    { clubId: destination.id },
  );
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
  // Fixtures the career player is fit for but was not picked for (or not yet registered).
  const benched = benchedCareerFixtures(world);
  const benchedIds = new Set(benched.map((fixture) => fixture.id));
  for (const fixture of fixtures)
    applyFinalizedFixture(
      world,
      finalizeFixture(
        world,
        fixture,
        undefined,
        benchedIds.has(fixture.id) ? world.career!.playerId : undefined,
      ),
    );
  for (const league of Object.values(world.leagues))
    league.standings =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
  advanceCups(world);
  advanceContinental(world);
  if (world.format === 'national-v1') advanceNationalPyramid(world);
  // Trophies are earned when each title is decided, before anyone moves this week.
  if (world.career) recordCareerTrophies(world);
  developPlayers(world, rng);
  if (world.career) {
    careerWeek(world);
    marketWeek(world, benched);
    socialWeek(world);
    lifestyleWeek(world);
    honoursWeek(world);
  }
  const lifecycle = lifecycleWeeks(world);
  if (lifecycle.transfer.includes(world.date.week)) {
    // National worlds run a market; worlds from before the pyramid keep their exchanges.
    if (world.format === 'national-v1') aiTransferWindow(world, rng);
    else exchangeTransfers(world, rng);
    fillSquads(world, rng);
  }
  managerChanges(world, rng);
  if (world.date.week === lifecycle.intake) seasonalSquadReview(world, rng);
  updateFinances(world);
  if (world.date.week === getSeasonWeeks(world)) {
    archiveSeason(world);
    if (world.career) honoursSeasonEnd(world);
  }
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
  // Worlds saved before formation-aware selection adopt it with the new season, so no
  // season changes selection rules part-way.
  world.selectionVersion = CONFIG.selection.version;
  for (const movement of summary.movements)
    if (movement.fromLeagueId.startsWith('feeder:') && world.leagues[movement.toLeagueId])
      refreshReturningClub(world, world.clubs[movement.clubId]!);
  if (world.career) {
    marketRollover(world);
    coachingRollover(world);
    lifestyleRollover(world);
    keepCareerInSimulatedLeagues(world);
    refreshMentor(world);
    socialRollover(world);
    // Last: a summer tournament, and retirement at the forced age.
    honoursRollover(world);
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
    if (isContinental(cup)) continue;
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
  if (world.format === 'national-v1') {
    resetNationalSeason(world);
    // Last season's tables decide this season's continental places. Worlds saved before
    // milestone 8 gain their continental cups here, at their next season.
    startContinental(world, true);
  }
  // A new season of competition statistics: worlds saved before Phase 1.3 start here.
  startSeasonStatistics(world);
  // Award baselines once this season's league memberships are set.
  if (world.career) startAwardSeason(world);
  return world;
}
