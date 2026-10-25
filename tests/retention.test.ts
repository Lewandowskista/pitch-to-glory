/**
 * Retention (docs/RELEASE-1.0-PLAN.md step 3.6): old seasons compact to their titles, the archive
 * keeps everyone the world names plus the best Hall of Fame records, pruned players' scores keep
 * every rank exact, and untrained goalkeeping is derived instead of stored. The 200-season growth
 * check is tests/retention.slow.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SeasonSummary, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { KEEPER_KEYS, untrainedValue } from '../src/engine/ageing';
import {
  compactKeeping,
  isDerivableKeeping,
  keeperAttributesOf,
  ownKeeperAttributes,
} from '../src/engine/keeping';
import { startNextSeason } from '../src/engine/world/simulate';
import {
  applyRetention,
  compactHistory,
  mergePrunedScores,
  pruneArchive,
  referencedArchiveIds,
} from '../src/engine/world/retention';
import {
  hallOfFameBelow,
  hallOfFameStanding,
  hallOfFameTable,
  legacyNeighbour,
  liveHallOfFame,
  liveHallOfFameRank,
  retireCareer,
} from '../src/engine/career/honours/retirement';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalCareerSeason } from './support/world';

const clone = <T>(value: T): T => structuredClone(value);
const SCORES = [0, 1, 3, 8, 20, 50, 120, 300, 1000, 5000];

let rolled: World;
beforeAll(async () => {
  // A national career world one season in, rolled into its second: a few hundred archived players.
  rolled = startNextSeason(await nationalCareerSeason(), { inPlace: true });
}, 120000);

/** Archived ids of the lowest scorers, which pruning drops unless something names them. */
function lowest(world: World, count: number): string[] {
  return Object.values(world.archive!.players)
    .sort((a, b) => (a.hallOfFame ?? 0) - (b.hallOfFame ?? 0) || (a.id < b.id ? -1 : 1))
    .slice(0, count)
    .map((record) => record.id);
}

describe('history', () => {
  /** Earlier seasons for the world, as copies of its one finished season. */
  function withEarlierSeasons(world: World, count: number): World {
    const last = world.history.at(-1)!;
    const earlier: SeasonSummary[] = [];
    for (let back = count; back >= 1; back--) {
      const season = last.season - back;
      const copy = clone(last);
      copy.season = season;
      // Phase and tie ids carry their season.
      for (const entry of Object.values(copy.divisionChampions ?? {}))
        entry.competitionId = entry.competitionId.replace(`:${last.season}:`, `:${season}:`);
      earlier.push(copy);
    }
    world.history = [...earlier, ...world.history];
    return world;
  }

  it('keeps the last seasons in full and every older season as its titles', () => {
    const kept = CONFIG.world.retention.historySeasons;
    const world = withEarlierSeasons(clone(rolled), kept + 3);
    const before = clone(world.history);
    expect(compactHistory(world)).toBe(4);
    expect(world.history).toHaveLength(before.length);
    for (const [index, summary] of world.history.entries()) {
      const original = before[index]!;
      expect(summary.season).toBe(original.season);
      expect(summary.champions).toEqual(original.champions);
      expect(summary.cupWinners).toEqual(original.cupWinners);
      expect(summary.divisionChampions).toEqual(original.divisionChampions);
      if (index < 4) {
        expect(summary).toMatchObject({ compact: true, tables: {}, movements: [] });
        expect(summary.phases).toBeUndefined();
        expect(summary.ties).toBeUndefined();
      } else expect(summary).toEqual(original);
    }
    // Idempotent.
    expect(compactHistory(world)).toBe(0);
  });

  it('validates compacted seasons, and only as titles', () => {
    const world = withEarlierSeasons(clone(rolled), 3);
    // Only the real season can be kept in full (the copies' play-offs name another season).
    compactHistory(world, 1);
    expect(() => validateWorld(clone(world))).not.toThrow();
    const tampered = clone(world);
    tampered.history[0]!.tables = clone(rolled.history.at(-1)!.tables);
    expect(() => validateWorld(tampered)).toThrow();
    const missing = clone(world);
    delete missing.history[1]!.champions[Object.keys(missing.history[1]!.champions)[0]!];
    expect(() => validateWorld(missing)).toThrow();
  }, 60000);
});

describe('archive', () => {
  it('ranks every score exactly after pruning, for the career, a legacy and anyone', () => {
    const full = clone(rolled);
    const pruned = clone(rolled);
    const archived = Object.keys(full.archive!.players).length;
    expect(archived).toBeGreaterThan(200);
    const dropped = pruneArchive(pruned, 50);
    expect(dropped).toBeGreaterThan(archived / 2);
    expect(Object.keys(pruned.archive!.players).length).toBe(archived - dropped);
    expect(pruned.archive!.pruned!.reduce((sum, [, count]) => sum + count, 0)).toBe(dropped);
    const careerId = full.career!.playerId;
    for (const score of SCORES)
      for (const exclude of [careerId, 'nobody']) {
        const a = hallOfFameStanding(full, score, exclude);
        const b = hallOfFameStanding(pruned, score, exclude);
        expect({ rank: b.rank, of: b.of }).toEqual({ rank: a.rank, of: a.of });
        // The next name to pass is always a named player above the score.
        if (b.next) {
          expect(b.next.score).toBeGreaterThan(score);
          expect(b.next.name).not.toBe(b.next.id);
        }
        // The named player just below holds the rank the full table gives their score.
        const below = hallOfFameBelow(pruned, score, exclude);
        if (below) expect(below.rank).toBe(hallOfFameStanding(full, below.score, exclude).rank + 1);
      }
    const live = liveHallOfFame(full);
    expect(liveHallOfFame(pruned)).toMatchObject({
      score: live.score,
      rank: live.rank,
      of: live.of,
    });
    expect(liveHallOfFameRank(pruned)).toEqual(liveHallOfFame(pruned));
    // A career retiring after pruning keeps the rank it would have had.
    const legacyFull = retireCareer(full);
    const legacyPruned = retireCareer(pruned);
    expect(legacyPruned.hallOfFame).toEqual(legacyFull.hallOfFame);
    expect(legacyNeighbour(pruned, legacyPruned)?.rank).toBe(
      legacyNeighbour(full, legacyFull)?.rank,
    );
    // Named entries only: the pruned are in the ranks, not in the table.
    expect(hallOfFameTable(pruned).length + dropped).toBe(hallOfFameTable(full).length);
  });

  it('keeps every archived player something in the world names', () => {
    const world = clone(rolled);
    const [mentee, teammate, manager, winner, renamed, fact, rival] = lowest(world, 7) as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const legacy = retireCareer(clone(world));
    world.legacies.push({ ...legacy, teammateIds: [teammate], menteeIds: [mentee] });
    Object.values(world.managers)[0]!.formerPlayerId = manager;
    world.awards.push({
      id: 'award:test',
      kind: 'golden-boot',
      season: world.date.season - 1,
      month: null,
      competitionId: null,
      winnerIds: [winner],
      shortlist: [],
      value: 30,
    });
    world.edits = {
      clubs: {},
      leagues: {},
      players: { [renamed]: { name: 'Renamed', original: 'Original' } },
    };
    world.career!.facts = [
      ...(world.career!.facts ?? []),
      { kind: 'mentored', season: world.date.season, week: 1, playerId: fact },
    ];
    world.rivalries = [{ ...world.rivalries[0]!, rivalPlayerId: rival }];
    const named = referencedArchiveIds(world);
    for (const id of [mentee, teammate, manager, winner, renamed, fact, rival])
      expect(named.has(id), id).toBe(true);
    pruneArchive(world, 10);
    for (const id of [mentee, teammate, manager, winner, renamed, fact, rival])
      expect(world.archive!.players[id], id).toBeDefined();
    // The archive's top career scorer stays: the career-goals record is measured against him.
    const top = Object.values(rolled.archive!.players).reduce((best, record) =>
      record.stats.goals > best.stats.goals ||
      (record.stats.goals === best.stats.goals && record.id < best.id)
        ? record
        : best,
    );
    expect(world.archive!.players[top.id]).toBeDefined();
  });

  it('waits for the shared Hall of Fame record before pruning', () => {
    const world = clone(rolled);
    delete world.achievements;
    expect(pruneArchive(world, 10)).toBe(0);
  });

  it('merges pruned scores in ascending order and validates them', () => {
    expect(
      mergePrunedScores(
        [
          [0, 4],
          [7, 1],
        ],
        [3, 0, 7, 12],
      ),
    ).toEqual([
      [0, 5],
      [3, 1],
      [7, 2],
      [12, 1],
    ]);
    const world = clone(rolled);
    expect(pruneArchive(world, 50)).toBeGreaterThan(0);
    expect(() => validateWorld(clone(world))).not.toThrow();
    const descending = clone(world);
    descending.archive!.pruned = [...descending.archive!.pruned!].reverse();
    expect(() => validateWorld(descending)).toThrow();
  }, 60000);
});

describe('goalkeeping', () => {
  it('stores goalkeepers’ goalkeeping and derives everyone else’s', () => {
    for (const player of Object.values(rolled.players)) {
      if (player.primaryPosition === 'GK') expect(player.keeperAttributes, player.id).toBeDefined();
      else if (player.id !== rolled.career!.playerId)
        expect(player.keeperAttributes, player.id).toBeUndefined();
    }
    const outfielder = Object.values(rolled.players).find((p) => p.primaryPosition === 'ST')!;
    expect(keeperAttributesOf(outfielder)).toEqual(
      Object.fromEntries(KEEPER_KEYS.map((key) => [key, untrainedValue(outfielder, key)])),
    );
  });

  it('drops stored goalkeeping only when it reads back the same', () => {
    const player = clone(Object.values(rolled.players).find((p) => p.primaryPosition === 'CB')!);
    ownKeeperAttributes(player);
    expect(isDerivableKeeping(player)).toBe(true);
    const changed = clone(player);
    changed.keeperAttributes!.reflexes += 1;
    expect(compactKeeping(changed)).toBe(false);
    expect(compactKeeping(player)).toBe(true);
    expect(player.keeperAttributes).toBeUndefined();
    const keeper = clone(Object.values(rolled.players).find((p) => p.primaryPosition === 'GK')!);
    expect(compactKeeping(keeper)).toBe(false);
    const without = clone(rolled);
    delete Object.values(without.players).find((p) => p.primaryPosition === 'GK')!.keeperAttributes;
    expect(() => validateWorld(without)).toThrow();
  }, 60000);
});

describe('applying retention', () => {
  it('is deterministic and idempotent, and old saves get it when they load', () => {
    const world = clone(rolled);
    // As a save from before 1.0: every player's goalkeeping stored.
    for (const player of Object.values(world.players)) ownKeeperAttributes(player);
    const a = clone(world);
    const b = clone(world);
    const first = applyRetention(a);
    expect(first.keeping).toBeGreaterThan(1000);
    applyRetention(b);
    expect(JSON.stringify(a) === JSON.stringify(b)).toBe(true);
    expect(applyRetention(a)).toEqual({ seasons: 0, pruned: 0, keeping: 0 });
    const save = createSave(1, 'Older', {
      kind: 'world',
      world,
      gallery: { seed: 'retention', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    const loaded = parseSave(JSON.stringify({ ...save, schemaVersion: 22 }));
    if (loaded.payload.kind !== 'world') throw new Error('Expected a world');
    expect(JSON.stringify(loaded.payload.world) === JSON.stringify(a)).toBe(true);
  }, 120000);
});
