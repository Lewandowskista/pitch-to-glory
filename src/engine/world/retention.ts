/**
 * Retention (release plan step 3.6): what a long world keeps, so a save stops growing by a
 * megabyte a season while nothing the player can see they earned is lost.
 *
 * - **History.** The last `historySeasons` season summaries keep full tables, movements and
 *   play-offs. Older seasons keep their champions, division champions and cup winners
 *   (`SeasonSummary.compact`): every title any screen, trophy or record names.
 * - **Archive.** Archived players stay by name while anything in the world still names them
 *   (legacies, mentees, records, awards, managers, the career and its stories, edits, rivals…),
 *   plus the `archiveTop` best Hall of Fame records. The rest leave the archive and their scores
 *   join `WorldArchive.pruned`, so every rank among all players ever stays exact. Pruning waits
 *   for the shared Hall of Fame record (`world.achievements`), which scores archived players.
 * - **Goalkeeping.** An outfield player's untrained goalkeeping is derived from the id and not
 *   stored (`engine/keeping.ts`).
 *
 * Applied at every season start and once to older saves when they load (schema 23).
 * Deterministic (no random draws) and idempotent. Pure apart from the world it is given.
 */
import type { ArchivedPlayer, SeasonSummary, World } from '../../model/domain';
import { CONFIG } from '../config';
import { compactKeeping } from '../keeping';
import { usesAchievements } from '../career/honours/achievements';

const R = CONFIG.world.retention;

export interface RetentionReport {
  /** Season summaries compacted. */
  seasons: number;
  /** Archived players whose records were dropped (their scores kept). */
  pruned: number;
  /** Players whose derivable goalkeeping was dropped. */
  keeping: number;
}

/** What a compacted season keeps: the titles, never the tables. */
export function compactSummary(summary: SeasonSummary): SeasonSummary {
  if (summary.compact) return summary;
  return {
    season: summary.season,
    tables: {},
    champions: { ...summary.champions },
    cupWinners: { ...summary.cupWinners },
    movements: [],
    ...(summary.divisionChampions
      ? { divisionChampions: structuredClone(summary.divisionChampions) }
      : {}),
    compact: true,
  };
}

/** Compact every season but the last `historySeasons`. Returns how many were compacted. */
export function compactHistory(world: World, kept: number = R.historySeasons): number {
  let compacted = 0;
  const end = world.history.length - kept;
  for (let index = 0; index < end; index++) {
    const summary = world.history[index]!;
    if (summary.compact) continue;
    world.history[index] = compactSummary(summary);
    compacted++;
  }
  return compacted;
}

/**
 * World parts that name no archived player, or only for a moment: the live graph's own maps,
 * the archive itself, and season events (a two-season window of news that names people by
 * their stored names).
 */
const UNREFERENCING = new Set<string>([
  'archive',
  'players',
  'contracts',
  'clubs',
  'leagues',
  'countries',
  'competitions',
  'fixtures',
  'results',
  'matches',
  'history',
  'pyramid',
  'events',
  'rng',
  'date',
  'season',
]);

/**
 * Archived players something in the world still names: every key and string value anywhere
 * else in the world (legacies with their children, teammates and mentees, records, awards and
 * their shortlists, managers who played, the career's facts and stories, rivals, trophies,
 * edits, season statistics, discipline, national squads…), so a new kind of reference is kept
 * without a list to update. Also the archive's top career scorer, whom the career-goals record
 * is measured against.
 */
export function referencedArchiveIds(world: World): Set<string> {
  const archive = world.archive?.players ?? {};
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (Object.hasOwn(archive, value)) found.add(value);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(archive, key)) found.add(key);
      visit(entry);
    }
  };
  for (const [key, value] of Object.entries(world)) if (!UNREFERENCING.has(key)) visit(value);
  let top: ArchivedPlayer | null = null;
  for (const record of Object.values(archive))
    if (
      !top ||
      record.stats.goals > top.stats.goals ||
      (record.stats.goals === top.stats.goals && record.id < top.id)
    )
      top = record;
  if (top) found.add(top.id);
  return found;
}

/** An archived player's place in the Hall of Fame table (`hallOfFameScores`). */
const scoreOf = (record: ArchivedPlayer) => Math.round(record.hallOfFame ?? 0);

/** Add scores to the pruned `[score, players]` pairs, kept in ascending score order. */
export function mergePrunedScores(
  pairs: readonly [number, number][],
  scores: readonly number[],
): [number, number][] {
  const counts = new Map<number, number>(pairs.map(([score, count]) => [score, count]));
  for (const score of scores) counts.set(score, (counts.get(score) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0] - b[0]);
}

/**
 * Keep the archived players something names and the `top` best Hall of Fame records (by score,
 * then id); drop the rest, keeping their scores. Only in a world on the shared Hall of Fame
 * record: before it, archived players are scored from their numbers, which pruning would lose.
 * Returns how many were pruned.
 */
export function pruneArchive(world: World, top: number = R.archiveTop): number {
  const archive = world.archive;
  if (!archive || !usesAchievements(world)) return 0;
  const records = Object.values(archive.players);
  if (records.length <= top) return 0;
  const referenced = referencedArchiveIds(world);
  const candidates = records
    .filter((record) => !referenced.has(record.id))
    .sort((a, b) => scoreOf(b) - scoreOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const dropped = candidates.slice(top);
  if (!dropped.length) return 0;
  for (const record of dropped) delete archive.players[record.id];
  archive.pruned = mergePrunedScores(archive.pruned ?? [], dropped.map(scoreOf));
  return dropped.length;
}

/** Drop every player's derivable goalkeeping. Returns how many were dropped. */
export function compactPlayers(world: World): number {
  let dropped = 0;
  for (const player of Object.values(world.players)) if (compactKeeping(player)) dropped++;
  return dropped;
}

/** Apply every retention rule (see the module comment). */
export function applyRetention(world: World): RetentionReport {
  return {
    seasons: compactHistory(world),
    pruned: pruneArchive(world),
    keeping: compactPlayers(world),
  };
}
