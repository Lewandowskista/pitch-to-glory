/**
 * The career club's fixtures from the player's side, for development under rules 2: playing
 * time is minutes over the fixtures the player was available for, in a bounded recent period.
 * Benching lowers it; injuries, registration gaps and breaks without fixtures do not count
 * against the player. Pure apart from the career record it writes.
 */
import type { AvailabilityEntry, Fixture, World } from '../../model/domain';
import { CONFIG } from '../config';
import { getSeasonWeeks } from '../world/calendar';

const A = CONFIG.career.development.availability;

/**
 * Record this week's club fixtures, after they are resolved: played (with minutes, from the
 * match record), benched while fit, injured, or not yet registered. `benched` are the fixtures
 * the week's simulation left the player out of.
 */
export function recordAvailability(world: World, benched: readonly Fixture[]): void {
  const career = world.career;
  if (!career || (career.developmentRules ?? 0) < 2) return;
  const player = world.players[career.playerId]!;
  const clubId = player.clubId;
  if (!clubId) return;
  const { season, week } = world.date;
  const left = new Set(benched.map((fixture) => fixture.id));
  const registered =
    season > career.market.registeredFrom.season ||
    (season === career.market.registeredFrom.season && week >= career.market.registeredFrom.week);
  const entries = (career.availability ??= []);
  for (const fixture of Object.values(world.fixtures)) {
    if (fixture.date.season !== season || fixture.date.week !== week) continue;
    if (fixture.homeId !== clubId && fixture.awayId !== clubId) continue;
    if (entries.some((entry) => entry.fixtureId === fixture.id)) continue;
    const played = career.matches.findLast((match) => match.fixtureId === fixture.id);
    const status: AvailabilityEntry['status'] = played
      ? 'played'
      : !registered
        ? 'unregistered'
        : left.has(fixture.id)
          ? 'benched'
          : player.injuryId
            ? 'injured'
            : 'benched';
    entries.push({ season, week, fixtureId: fixture.id, status, minutes: played?.minutes ?? 0 });
  }
  if (entries.length > A.limit) entries.splice(0, entries.length - A.limit);
}

/**
 * Share of full minutes (0-1) over the most recent fixtures the player was available for,
 * within the last season's length of weeks. Without any, the neutral `fallback`.
 */
export function playingShare(world: World): number {
  const career = world.career!;
  const seasonWeeks = getSeasonWeeks(world);
  const now = world.date.season * seasonWeeks + world.date.week;
  const counted = (career.availability ?? [])
    .filter(
      (entry) =>
        (entry.status === 'played' || entry.status === 'benched') &&
        now - (entry.season * seasonWeeks + entry.week) <= seasonWeeks,
    )
    .slice(-A.fixtures);
  if (!counted.length) return A.fallback;
  const minutes = counted.reduce((sum, entry) => sum + Math.min(90, entry.minutes), 0);
  return Math.min(1, minutes / (counted.length * 90));
}

/**
 * Seed a career adopting rules 2 from its recent appearances: they were played, so they are
 * kept as played fixtures; earlier benching was never recorded and is not invented.
 */
export function seedAvailability(world: World): AvailabilityEntry[] {
  const career = world.career!;
  return career.matches.slice(-A.fixtures).map((match) => ({
    season: match.season,
    week: match.week,
    fixtureId: match.fixtureId,
    status: 'played' as const,
    minutes: match.minutes,
  }));
}
