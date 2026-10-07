import type { CompetitionLine, Id, World } from '../../model/domain';
import type { FinalizedFixture } from './finalize';

/**
 * Current-season statistics by competition and club (Phase 1.3), derived from finalized
 * fixtures. League awards read a league's own lines, so cup goals and goals for clubs in other
 * leagues never decide them, and a player keeps what they earned in a league after leaving it.
 * Only the current season is kept; history keeps awards, records and career match records.
 */
export const STATISTICS_VERSION = 1;

/** Start an empty season of statistics; called for new worlds and at each rollover. */
export function startSeasonStatistics(world: World): void {
  world.seasonStats = { version: STATISTICS_VERSION, season: world.date.season, competitions: {} };
}
/** Whether this season's statistics are complete: kept since the season's first fixture. */
export function hasSeasonStatistics(world: World): boolean {
  return world.seasonStats?.season === world.date.season;
}
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Add a finalized fixture's participants to their competition and club lines. */
export function recordFixtureStatistics(world: World, final: FinalizedFixture): void {
  const fixture = world.fixtures[final.fixtureId]!;
  const stats = world.seasonStats;
  if (!stats || stats.season !== fixture.date.season) return;
  const competition = (stats.competitions[fixture.competitionId] ??= {});
  for (const participant of final.participants) {
    const home = participant.teamId === fixture.homeId;
    const conceded = final.score[home ? 1 : 0];
    const club = (competition[participant.teamId] ??= {});
    const line = (club[participant.playerId] ??= [0, 0, 0, 0, 0, 0]);
    line[0]++;
    line[1] += participant.minutes + participant.extraTimeMinutes;
    line[2] += participant.goals;
    line[3] += participant.assists;
    if (conceded === 0) line[4]++;
    line[5] = round2(line[5] + participant.rating);
  }
}

export interface StatTotals {
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  ratingTotal: number;
}
const empty = (): StatTotals => ({
  apps: 0,
  minutes: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  ratingTotal: 0,
});
function add(totals: StatTotals, line: CompetitionLine): void {
  totals.apps += line[0];
  totals.minutes += line[1];
  totals.goals += line[2];
  totals.assists += line[3];
  totals.cleanSheets += line[4];
  totals.ratingTotal = round2(totals.ratingTotal + line[5]);
}
/** Every player's totals in one competition, all their clubs in it combined. */
export function competitionTotals(world: World, competitionId: Id): Map<Id, StatTotals> {
  const totals = new Map<Id, StatTotals>();
  for (const club of Object.values(world.seasonStats?.competitions[competitionId] ?? {}))
    for (const [playerId, line] of Object.entries(club)) {
      const entry = totals.get(playerId) ?? empty();
      add(entry, line);
      totals.set(playerId, entry);
    }
  return totals;
}
/** Every player's totals across all club competitions this season. */
export function allCompetitionTotals(world: World): Map<Id, StatTotals> {
  const totals = new Map<Id, StatTotals>();
  for (const competition of Object.values(world.seasonStats?.competitions ?? {}))
    for (const club of Object.values(competition))
      for (const [playerId, line] of Object.entries(club)) {
        const entry = totals.get(playerId) ?? empty();
        add(entry, line);
        totals.set(playerId, entry);
      }
  return totals;
}
/** Whether a player made a competitive appearance for a club in a competition this season. */
export function appearedFor(world: World, competitionId: Id, clubId: Id, playerId: Id): boolean {
  return (world.seasonStats?.competitions[competitionId]?.[clubId]?.[playerId]?.[0] ?? 0) > 0;
}
