import type { SaveRecovery } from './schema';

/**
 * Salvage load (release 1.0 step 4.4, finding S3). When a slot fails strict validation, the
 * persistence worker tries again without one optional part of the world at a time, then
 * without all of them, and loads the first version that passes every check, saying what was
 * set aside. Only parts the game already runs without are ever dropped:
 *
 * - `feed`: the social feed (`World.media`: press, interviews, posts), which refills each week;
 * - `statistics`: this season's competition statistics (`World.seasonStats`); awards and the
 *   Hall of Fame use the earlier rules until the next season starts them again;
 * - `history`: the career's weekly morale and form history and its growth by season
 *   (`career.social.history`, `career.growth`), shown as charts.
 *
 * The match in progress and the latest small changes (patches) were already dropped on their
 * own when they fail (`match-discarded`, `changes-discarded`). Core data (the career, players,
 * clubs, competitions, fixtures and results) is never dropped: a save whose core fails stays
 * unreadable, with its recovery copy and backups.
 */
export type SalvagePart = 'feed' | 'statistics' | 'history';
export const SALVAGE_PARTS: readonly SalvagePart[] = ['feed', 'statistics', 'history'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Remove one part from an unvalidated save envelope's world, in place. False when the part is
 * absent or already empty, so dropping it cannot change the outcome.
 */
export function dropPart(envelope: unknown, part: SalvagePart): boolean {
  if (!isRecord(envelope) || !isRecord(envelope.payload)) return false;
  const world = envelope.payload.world;
  if (!isRecord(world)) return false;
  if (part === 'feed') {
    if (Array.isArray(world.media) && world.media.length === 0) return false;
    world.media = [];
    return true;
  }
  if (part === 'statistics') {
    if (world.seasonStats === undefined) return false;
    delete world.seasonStats;
    return true;
  }
  const career = world.career;
  if (!isRecord(career)) return false;
  const social = career.social;
  const history = isRecord(social) && !(Array.isArray(social.history) && !social.history.length);
  if (!history && career.growth === undefined) return false;
  if (history) (social as Record<string, unknown>).history = [];
  delete career.growth;
  return true;
}

/** The notice for what a salvage load set aside: one part by name, or several together. */
export function salvageNotice(parts: readonly SalvagePart[]): SaveRecovery {
  return parts.length === 1 ? (`salvaged-${parts[0]!}` as const) : 'salvaged';
}
