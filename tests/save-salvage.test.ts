import { afterEach, describe, expect, it } from 'vitest';
import { SaveDatabase, SaveRepository } from '../src/persistence/repository';
import { LocalSaveRepository } from '../src/persistence/localRepository';
import { createSave, DEFAULT_SETTINGS, type AppSave } from '../src/persistence/schema';
import { BackupScheduler, SlotBackups, type BackupInfo } from '../src/persistence/backups';
import { dropPart, salvageNotice } from '../src/persistence/salvage';
import { encodeWorld, decodeWorldBytes } from '../src/workers/worldCodec';
import { executePersistenceRequest } from '../src/workers/persistence.worker';
import type { World } from '../src/model/domain';
import { nationalCareer } from './support/world';

const databases: SaveDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
let shared: string | null = null;
const careerWorld = (): World => {
  shared ??= JSON.stringify(nationalCareer());
  return JSON.parse(shared) as World;
};
function setup() {
  const db = new SaveDatabase(`salvage-${Date.now()}-${databases.length}`);
  databases.push(db);
  const scheduler = new BackupScheduler(new SlotBackups(db, async () => null));
  return {
    db,
    repo: new LocalSaveRepository(db, undefined, { backups: scheduler }),
    plain: new SaveRepository(db),
    scheduler,
  };
}
const save = (world: World): AppSave =>
  createSave(1, 'Salvaged career', {
    kind: 'world',
    world,
    gallery: { seed: 'salvage', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
/** Store a valid career, then change its stored world as damage or a validator regression would. */
async function stored(db: SaveDatabase, repo: SaveRepository, damage: (world: World) => void) {
  await repo.write(save(careerWorld()), null);
  const world = decodeWorldBytes((await db.worlds.get(1))!.bytes!) as World;
  damage(world);
  const bytes = encodeWorld(world).bytes;
  await db.worlds.put({ slot: 1, bytes });
  return Buffer.from(bytes);
}
const breakFeed = (world: World) => {
  world.media = [{ id: 'not a feed item' } as unknown as World['media'][number]];
};
const breakStatistics = (world: World) => {
  (world.seasonStats as unknown as { version: number }).version = 99;
};
const breakHistory = (world: World) => {
  world.career!.social.history = [{ season: 'never' } as unknown as never];
};

describe('salvage load (step 4.4)', () => {
  for (const [part, damage, check] of [
    ['feed', breakFeed, (world: World) => expect(world.media).toEqual([])],
    ['statistics', breakStatistics, (world: World) => expect(world.seasonStats).toBeUndefined()],
    [
      'history',
      breakHistory,
      (world: World) => {
        expect(world.career!.social.history).toEqual([]);
        expect(world.career!.growth).toBeUndefined();
      },
    ],
  ] as const)
    it(`loads without a damaged ${part}, says so and leaves the stored records as they were`, async () => {
      const { db, repo, plain, scheduler } = setup();
      const before = await stored(db, plain, damage);
      const loaded = await repo.load(1);
      expect(loaded).toMatchObject({
        recovery: `salvaged-${part}`,
        stored: { pristine: false, patches: 0, salvaged: [part] },
      });
      if (loaded!.payload.kind !== 'world') throw new Error('expected a world');
      check(loaded!.payload.world);
      // The core is whole.
      const world = careerWorld();
      expect(Object.keys(loaded!.payload.world.players)).toHaveLength(
        Object.keys(world.players).length,
      );
      expect(loaded!.payload.world.career!.playerId).toBe(world.career!.playerId);
      // Nothing stored changed; the original is kept as the salvage backup as well.
      expect(before.equals(Buffer.from((await db.worlds.get(1))!.bytes!))).toBe(true);
      await scheduler.idle();
      const backup = (await db.backups.get('1:salvage')) as BackupInfo;
      expect(backup).toMatchObject({ kind: 'salvage', revision: 1 });
      expect(await db.backups.get('1:day')).toBeUndefined();
      // The next whole write (the player continues) replaces the damaged records.
      const { recovery: _recovery, stored: _stored, ...clean } = loaded!;
      void [_recovery, _stored];
      await plain.write(clean, 1);
      expect(await plain.read(1)).not.toHaveProperty('recovery');
    });

  it('sets aside only the parts that fail, the fewest first', async () => {
    const { db, repo, plain } = setup();
    await stored(db, plain, (world) => {
      breakFeed(world);
      breakStatistics(world);
    });
    const loaded = await repo.load(1);
    expect(loaded).toMatchObject({
      recovery: 'salvaged',
      stored: { salvaged: ['feed', 'statistics'] },
    });
    if (loaded!.payload.kind !== 'world') throw new Error('expected a world');
    // The history was fine and stays.
    expect(loaded!.payload.world.career!.social.history).toEqual(
      careerWorld().career!.social.history,
    );
  });

  it('never salvages by dropping core data', async () => {
    const { db, repo, plain } = setup();
    await stored(db, plain, (world) => {
      breakFeed(world);
      const [id] = Object.keys(world.players);
      (world.players[id!] as unknown as { name: number }).name = 7;
    });
    await expect(repo.load(1)).rejects.toMatchObject({ code: 'invalid' });
    await stored(db, plain, (world) => {
      delete (world as Partial<World>).competitions;
    }).catch(() => {});
    await expect(repo.load(1)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('salvages with the stored patches applied, and without them when they fail too', async () => {
    const { db, repo, plain } = setup();
    await stored(db, plain, breakStatistics);
    const meta = (await db.saves.get(1))!;
    // A valid UI change stored as a patch (step 3.4): the coverage of the feed.
    const patch = { op: 'set' as const, path: ['career', 'social', 'coverage'], value: 3 };
    await db.saves.put({ ...meta, worldPatches: [patch], worldPatchBytes: 60 } as typeof meta);
    let loaded = await repo.load(1);
    expect(loaded).toMatchObject({ recovery: 'salvaged-statistics' });
    if (loaded!.payload.kind !== 'world') throw new Error('expected a world');
    expect(loaded!.payload.world.career!.social.coverage).toBe(3);
    // A patch that no longer applies: salvaged without the latest changes, with the general notice.
    await db.saves.put({
      ...meta,
      worldPatches: [{ op: 'set' as const, path: ['nowhere', 'deep', 'below'], value: 1 }],
      worldPatchBytes: 60,
    } as typeof meta);
    loaded = await repo.load(1);
    expect(loaded).toMatchObject({ recovery: 'salvaged', stored: { salvaged: ['statistics'] } });
  });

  it('keeps the match-session and patch recoveries as they were', async () => {
    const { db, repo, plain } = setup();
    await plain.write(save(careerWorld()), null);
    const meta = (await db.saves.get(1))!;
    await db.saves.put({
      ...meta,
      worldPatches: [{ op: 'set' as const, path: ['nowhere', 'deep', 'below'], value: 1 }],
      worldPatchBytes: 60,
    } as typeof meta);
    expect(await repo.load(1)).toMatchObject({ recovery: 'changes-discarded' });
    await db.saves.put(meta);
    await db.matches.put({ slot: 1, session: { setup: { bogus: true } } as never });
    expect(await repo.load(1)).toMatchObject({ recovery: 'match-discarded' });
  });

  it('answers a salvaged load through the worker', async () => {
    const { db, plain } = setup();
    await stored(db, plain, breakFeed);
    const response = await executePersistenceRequest(
      { operation: 'read', slot: 1, database: db.name, requestId: 'salvage-1' },
      () => db,
    );
    expect(response).toMatchObject({ ok: true, value: { recovery: 'salvaged-feed' } });
  });

  it('drops only parts that are there', () => {
    const envelope = { payload: { world: { media: [], career: { social: { history: [] } } } } };
    expect(dropPart(envelope, 'feed')).toBe(false);
    expect(dropPart(envelope, 'statistics')).toBe(false);
    expect(dropPart(envelope, 'history')).toBe(false);
    expect(dropPart({ payload: { world: { seasonStats: {} } } }, 'statistics')).toBe(true);
    expect(dropPart(null, 'feed')).toBe(false);
    expect(salvageNotice(['history'])).toBe('salvaged-history');
    expect(salvageNotice(['feed', 'history'])).toBe('salvaged');
  });
});
