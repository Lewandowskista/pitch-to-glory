/**
 * How 1.0 stores a world (docs/RELEASE-1.0-PLAN.md steps 3.1, 3.3–3.5, S9): whole writes as the
 * world worker's bytes, unparsed and unvalidated but under every ownership and revision check;
 * UI changes as patches beside them; match sessions as setup and commands; and a persistence
 * worker that always answers, or is restarted.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { World } from '../src/model/domain';
import { SaveDatabase } from '../src/persistence/repository';
import { LocalSaveRepository, type EncodedWorldSave } from '../src/persistence/localRepository';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { summarizeWorld } from '../src/persistence/summary';
import { executePersistenceRequest } from '../src/workers/persistence.worker';
import type { PersistenceOperation } from '../src/persistence/workerClient';
import { encodeWorld } from '../src/workers/worldCodec';
import { diffWorld } from '../src/workers/worldPatch';
import { applyMatchCommand, createMatchSession, createMatchSetup } from '../src/engine/match';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import { CONFIG } from '../src/engine/config';
import { nationalCareer } from './support/world';

let career: World;
beforeAll(() => {
  career = nationalCareer();
});
const databases: SaveDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup(owner = 'tab-a') {
  const db = new SaveDatabase(`world-storage-${Date.now()}-${databases.length}`);
  databases.push(db);
  let sequence = 0;
  const request = (operation: PersistenceOperation, as: string | undefined = owner) =>
    executePersistenceRequest(
      { ...operation, owner: as, database: db.name, requestId: `r${++sequence}` },
      () => db,
    );
  return { db, request, repository: new LocalSaveRepository(db) };
}
const encoded = (world: World, extra: Partial<EncodedWorldSave> = {}): EncodedWorldSave => ({
  slot: 1,
  name: 'Career',
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T11:00:00.000Z',
  gallery: { seed: 'g', generation: 0 },
  settings: DEFAULT_SETTINGS,
  worldId: world.id,
  summary: summarizeWorld(world),
  bytes: encodeWorld(world).bytes,
  matchSession: null,
  replace: false,
  ...extra,
});
const lease = (db: SaveDatabase, owner = 'tab-a') =>
  db.leases.put({ slot: 1, owner, expires: Date.now() + 60000 });

describe('whole-world writes from the world worker’s bytes (steps 3.1, 3.3)', () => {
  it('store the bytes unparsed, under ownership, revision and same-world checks', async () => {
    const { db, request, repository } = setup();
    const write = (value: EncodedWorldSave, expectedRevision: number | null, as?: string) =>
      request({ operation: 'write-world', value, expectedRevision }, as);
    // A checkpoint never starts a slot or replaces another world; saving to a slot may.
    expect(await write(encoded(career), null)).toMatchObject({ ok: false, code: 'locked' });
    await lease(db);
    expect(await write(encoded(career), null)).toMatchObject({ ok: false, code: 'invalid' });
    expect(await write(encoded(career, { replace: true }), null)).toMatchObject({
      ok: true,
      value: { revision: 1, payload: { kind: 'world' } },
    });
    expect(await write(encoded(career), 0)).toMatchObject({ ok: false, code: 'conflict' });
    expect(await write(encoded(career), 1, 'tab-b')).toMatchObject({ ok: false, code: 'locked' });
    const other = { ...career, id: 'world:other' };
    expect(await write(encoded(other), 1)).toMatchObject({ ok: false, code: 'invalid' });
    // Cheap guards on the bytes and summary: never a parse.
    expect(
      await write({ ...encoded(career), bytes: new TextEncoder().encode('[1]') }, 1),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect(
      await write({ ...encoded(career), summary: { ...summarizeWorld(career), worldId: 'x' } }, 1),
    ).toMatchObject({ ok: false, code: 'invalid' });
    const next = structuredClone(career);
    next.date.day = 3;
    expect(await write(encoded(next), 1)).toMatchObject({ ok: true, value: { revision: 2 } });
    // Created when the slot was first written; the bytes are what is stored.
    expect(await db.saves.get(1)).toMatchObject({ createdAt: '2026-10-25T10:00:00.000Z' });
    expect((await db.worlds.get(1))?.bytes).toBeInstanceOf(Uint8Array);
    const read = await repository.read(1);
    expect(JSON.stringify(read?.payload.kind === 'world' && read.payload.world)).toBe(
      JSON.stringify(next),
    );
  });
  it('store a world the validators would refuse, which the next load then refuses (3.1)', async () => {
    const { db, request, repository } = setup();
    await lease(db);
    const broken = { ...career, phase: 'broken' } as unknown as World;
    expect(
      await request({
        operation: 'write-world',
        value: encoded(broken, { replace: true }),
        expectedRevision: null,
      }),
    ).toMatchObject({ ok: true });
    await expect(repository.read(1)).rejects.toMatchObject({ code: 'invalid' });
    // The recovery export still has everything.
    const recovery = JSON.parse((await repository.exportRecovery(1)).json) as {
      payload: { world: { phase: string } };
    };
    expect(recovery.payload.world.phase).toBe('broken');
  });
});

describe('UI changes stored as patches (step 3.4)', () => {
  it('apply on load, are cleared by a whole write, and stay under their limits', async () => {
    const { db, request, repository } = setup();
    await lease(db);
    await request({
      operation: 'write-world',
      value: encoded(career, { replace: true }),
      expectedRevision: null,
    });
    const training = structuredClone(career.career!.training);
    training.sessions[0]!.intensity = 'high';
    const changed = { ...career, career: { ...career.career!, training } };
    const patches = diffWorld(career, changed)!;
    const without = {
      slot: 1 as const,
      worldId: career.id,
      updatedAt: new Date().toISOString(),
      gallery: { seed: 'g', generation: 0 },
      settings: DEFAULT_SETTINGS,
      matchSession: null,
    };
    expect(
      await request({
        operation: 'write-without-world',
        value: { ...without, worldPatches: patches, summary: summarizeWorld(changed) },
        expectedRevision: 1,
      }),
    ).toMatchObject({ ok: true, value: { revision: 2 } });
    const loaded = await repository.load(1);
    expect(loaded?.stored).toMatchObject({ pristine: true, patches: patches.length });
    expect(JSON.stringify(loaded?.payload.kind === 'world' && loaded.payload.world)).toBe(
      JSON.stringify(changed),
    );
    // Preferences alone keep the patches; a malformed patch is refused.
    expect(
      await request({
        operation: 'write-without-world',
        value: { ...without, settings: { ...DEFAULT_SETTINGS, reducedMotion: true } },
        expectedRevision: 2,
      }),
    ).toMatchObject({ ok: true });
    expect((await db.saves.get(1)) as { worldPatches?: unknown[] }).toMatchObject({
      worldPatches: patches,
    });
    expect(
      await request({
        operation: 'write-without-world',
        value: { ...without, worldPatches: [{ op: 'set', path: [] }] as never },
        expectedRevision: 3,
      }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    // Over the size limit: refused, so the tab writes the world whole instead.
    const huge = [
      { op: 'set' as const, path: ['seed'], value: 'x'.repeat(CONFIG.saves.maxPatchBytes) },
    ];
    expect(
      await request({
        operation: 'write-without-world',
        value: { ...without, worldPatches: huge },
        expectedRevision: 3,
      }),
    ).toMatchObject({ ok: false, code: 'large' });
    // A whole write clears them.
    expect(
      await request({ operation: 'write-world', value: encoded(changed), expectedRevision: 3 }),
    ).toMatchObject({ ok: true, value: { revision: 4 } });
    expect((await db.saves.get(1)) as { worldPatches?: unknown[] }).not.toHaveProperty(
      'worldPatches',
    );
  });
  it('that no longer apply are dropped on load, with a notice, never the save', async () => {
    const { db, request, repository } = setup();
    await lease(db);
    await request({
      operation: 'write-world',
      value: encoded(career, { replace: true }),
      expectedRevision: null,
    });
    const meta = (await db.saves.get(1))!;
    await db.saves.put({
      ...meta,
      worldPatches: [{ op: 'set', path: ['missing', 'deep'], value: 1 }],
      worldPatchBytes: 40,
    } as never);
    const loaded = await repository.load(1);
    expect(loaded?.recovery).toBe('changes-discarded');
    // The next world write must be whole, as the stored patches are still there.
    expect(loaded?.stored).toMatchObject({ pristine: false });
    expect(JSON.stringify(loaded?.payload.kind === 'world' && loaded.payload.world)).toBe(
      JSON.stringify(career),
    );
  });
  it('are only relative to a world stored as loaded: an older save is not pristine', async () => {
    const { db, repository } = setup();
    await new LocalSaveRepository(db).write(
      createSave(1, 'Career', {
        kind: 'world',
        world: career,
        gallery: { seed: 'g', generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
      null,
    );
    expect((await repository.load(1))?.stored).toMatchObject({ pristine: true });
    const meta = (await db.saves.get(1))!;
    await db.saves.put({ ...meta, schemaVersion: 22 } as never);
    expect((await repository.load(1))?.stored).toMatchObject({ pristine: false });
  });
});

describe('match sessions as setup and commands (step 3.5)', () => {
  it('resume identically from a session stored whole before 1.0', async () => {
    const world = generateWorld('world-storage-match', { format: 'legacy' });
    const [home, away] = Object.values(world.clubs);
    let session = createMatchSession(
      createMatchSetup(world, home!.id, away!.id, home!.playerIds[0]!, 'old-session'),
      { role: 'balanced', risk: 'balanced', mentality: 'balanced' },
    );
    session = applyMatchCommand(session, { type: 'kickoff' });
    for (let step = 0; step < 12; step++)
      session = applyMatchCommand(session, autoPlayCommand(session));
    const { db, repository } = setup();
    await repository.write(
      createSave(1, 'Old', {
        kind: 'world',
        world,
        gallery: { seed: 'g', generation: 0 },
        settings: DEFAULT_SETTINGS,
        matchSession: session,
      }),
      null,
    );
    // As 0.9 stored it: the whole session.
    await db.matches.put({ slot: 1, session });
    const old = await repository.read(1);
    expect(old?.payload.kind === 'world' && old.payload.matchSession).toEqual(session);
    expect(old?.recovery).toBeUndefined();
    // As 1.0 stores it: setup and commands only, about the size of the setup.
    await repository.write(old!, 1);
    const stored = (await db.matches.get(1))!.session;
    expect(stored).not.toHaveProperty('state');
    expect(JSON.stringify(stored).length).toBeLessThan(JSON.stringify(session).length);
    const resumed = await repository.read(1);
    expect(resumed?.payload.kind === 'world' && resumed.payload.matchSession).toEqual(session);
    // And it plays on exactly as the original would.
    const next = applyMatchCommand(session, autoPlayCommand(session));
    const replayed = applyMatchCommand(
      (resumed!.payload as { matchSession: typeof session }).matchSession,
      autoPlayCommand(session),
    );
    expect(replayed).toEqual(next);
  });
});

describe('persistence watchdog (S9)', () => {
  it('restarts an unanswering worker, failing its requests as in doubt, then starts afresh', async () => {
    vi.useFakeTimers();
    const instances: { terminated: boolean; posted: unknown[] }[] = [];
    class SilentWorker {
      onmessage = null;
      onerror = null;
      onmessageerror = null;
      terminated = false;
      posted: unknown[] = [];
      constructor() {
        instances.push(this);
      }
      postMessage(message: unknown) {
        this.posted.push(message);
      }
      terminate() {
        this.terminated = true;
      }
    }
    vi.stubGlobal('Worker', SilentWorker);
    vi.resetModules();
    const client = await import('../src/persistence/workerClient');
    const write = client.persistenceRequest('db', 'tab', {
      operation: 'remove',
      slot: 1,
      expectedRevision: 1,
    });
    const settled = write.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CONFIG.saves.requestTimeoutMs + 10);
    const error = await settled;
    expect(error).toBeInstanceOf(client.PersistenceInterrupted);
    expect(error).toMatchObject({ inDoubt: true, message: 'storage' });
    expect(instances[0]!.terminated).toBe(true);
    // A lease that goes unanswered times out sooner, and is never in doubt.
    const leaseRequest = client
      .persistenceRequest('db', 'tab', { operation: 'lease-release', slot: 1 })
      .catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(CONFIG.saves.leaseTimeoutMs + 10);
    expect(instances).toHaveLength(2);
    expect(await leaseRequest).toMatchObject({ inDoubt: false });
  });
});
