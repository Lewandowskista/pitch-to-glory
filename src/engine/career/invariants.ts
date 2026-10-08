/**
 * Accounting and reference invariants for a career world (Phase 4.1). Pure checks that return
 * every violation found, used by the endurance harness at each checkpoint and by the
 * invariant tests. They assert what the systems promise each other, beyond what save
 * validation can see in one record at a time.
 */
import type { World } from '../../model/domain';
import { allCompetitionTotals } from '../world/statistics';
import { hallOfFameRank } from './honours/retirement';

export interface InvariantOptions {
  /** History entries before the season that has just completed (checked when complete). */
  historyBefore?: number;
}

export function careerInvariants(world: World, options: InvariantOptions = {}): string[] {
  const problems: string[] = [];
  const fail = (message: string) => problems.push(message);
  const career = world.career;

  if (career) {
    // A fixture is committed once: one career record per fixture, and every record of a
    // fixture still in the calendar has its result.
    const seen = new Set<string>();
    for (const match of career.matches) {
      if (seen.has(match.fixtureId)) fail(`fixture ${match.fixtureId} recorded twice`);
      seen.add(match.fixtureId);
      if (world.fixtures[match.fixtureId] && !world.results[match.fixtureId])
        fail(`career match ${match.fixtureId} has no result`);
    }
    // Money never goes below zero.
    const cash = career.market.finances.cash;
    if (!Number.isFinite(cash) || cash < 0) fail(`career cash is ${cash}`);
    // The season's competition statistics agree with the career's match records.
    if (world.seasonStats?.season === world.date.season) {
      const line = allCompetitionTotals(world).get(career.playerId);
      const season = career.matches.filter((match) => match.season === world.date.season);
      const goals = season.reduce((sum, match) => sum + match.goals, 0);
      const assists = season.reduce((sum, match) => sum + match.assists, 0);
      const apps = season.filter((match) => match.minutes > 0).length;
      if ((line?.goals ?? 0) !== goals)
        fail(`season goals: statistics ${line?.goals ?? 0}, career records ${goals}`);
      if ((line?.assists ?? 0) !== assists)
        fail(`season assists: statistics ${line?.assists ?? 0}, career records ${assists}`);
      if ((line?.apps ?? 0) !== apps)
        fail(`season appearances: statistics ${line?.apps ?? 0}, career records ${apps}`);
    }
  }

  // A completed season has resolved every fixture and added exactly one history entry.
  if (world.phase === 'complete') {
    const open = Object.values(world.fixtures).filter(
      (fixture) => fixture.date.season === world.date.season && !world.results[fixture.id],
    );
    if (open.length) fail(`${open.length} fixtures left unresolved in a completed season`);
    if (options.historyBefore !== undefined && world.history.length !== options.historyBefore + 1)
      fail(`history grew from ${options.historyBefore} to ${world.history.length}`);
    if (world.history.at(-1)?.season !== world.date.season)
      fail(`the last history entry is not season ${world.date.season}`);
  }

  // Trophies are awarded once per competition and season.
  const trophyIds = new Set<string>();
  for (const trophy of world.trophies) {
    if (trophyIds.has(trophy.id)) fail(`trophy ${trophy.id} recorded twice`);
    trophyIds.add(trophy.id);
    if (new Set(trophy.playerIds).size !== trophy.playerIds.length)
      fail(`trophy ${trophy.id} lists a player twice`);
  }

  // References survive pruning: Chronicle entries, Moments and legacies point at records
  // that still exist.
  const momentIds = new Set(world.moments.map((moment) => moment.id));
  for (const entry of world.chronicle) {
    if (entry.momentId && !momentIds.has(entry.momentId))
      fail(`chronicle ${entry.id} points at missing moment ${entry.momentId}`);
    if (!world.players[entry.playerId]) fail(`chronicle ${entry.id} has no player`);
  }
  const awardIds = new Set(world.awards.map((award) => award.id));
  for (const legacy of world.legacies) {
    if (!world.players[legacy.playerId]) fail(`legacy ${legacy.id} has no player`);
    for (const id of legacy.trophyIds)
      if (!trophyIds.has(id)) fail(`legacy ${legacy.id} points at missing trophy ${id}`);
    for (const id of legacy.awardIds)
      if (!awardIds.has(id)) fail(`legacy ${legacy.id} points at missing award ${id}`);
  }

  // The Hall of Fame orders legacies by their saved scores, one place per person.
  const ranked = world.legacies.map((legacy) => ({
    id: legacy.id,
    score: legacy.hallOfFame.score,
    rank: hallOfFameRank(world, legacy.hallOfFame.score, legacy.playerId).rank,
  }));
  for (const a of ranked)
    for (const b of ranked)
      if (a.score > b.score && a.rank > b.rank)
        fail(`legacy ${a.id} (score ${a.score}) ranks below ${b.id} (score ${b.score})`);
  return problems;
}
