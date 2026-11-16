/**
 * The tab, its long-lived world worker and storage together (docs/RELEASE-1.0-PLAN.md steps
 * 3.2–3.4): the world worker runs in this process behind a stand-in Worker that clones every
 * message as postMessage does, and storage is the real repository on fake IndexedDB. Each test
 * checks the world on screen against storage and against an uninterrupted simulation, so a
 * lost or repeated week shows as a difference.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ name: `world-host-${Date.now()}` }));
vi.mock('../src/persistence/runtime', async () => {
  const { SaveDatabase, SaveRepository } = await import('../src/persistence/repository');
  const database = new SaveDatabase(storage.name);
  return {
    saves: new SaveRepository(database),
    slotLocks: {
      acquire: async () => true,
      release: async () => {},
      releaseAll: async () => {},
    },
    database,
  };
});
import type { World } from '../src/model/domain';
import { useAppStore } from '../src/store';
import { cancelWorldJob, startWorldJob } from '../src/workers/client';
import { persistence } from '../src/persistence/lazy';
import * as runtime from '../src/persistence/runtime';
import type { SaveDatabase, SaveRepository } from '../src/persistence/repository';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { createWorldHost } from '../src/workers/hostCore';
import { worldOperations } from '../src/workers/operations';
import { createChunkReceiver } from '../src/workers/transport';
import type { HostRequest, HostResponse } from '../src/workers/protocol';
import { PersistenceInterrupted } from '../src/persistence/workerClient';
import { nationalCareer } from './support/world';

const { saves, database } = runtime as unknown as {
  saves: SaveRepository;
  database: SaveDatabase;
};
const json = (value: unknown) => JSON.stringify(value);

/** A world worker in this process; `crashAfter` kills it once that checkpoint is delivered. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static crashAfter: number | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly received: HostRequest[] = [];
  dead = false;
  private readonly receive: (event: { data: unknown }) => void;
  constructor() {
    FakeWorker.instances.push(this);
    const host = createWorldHost(
      (response, transfer) => this.reply(response, transfer),
      worldOperations,
    );
    this.receive = createChunkReceiver<HostRequest>((message) => {
      this.received.push(message);
      host(message);
    });
  }
  postMessage(data: unknown, transfer: Transferable[] = []) {
    if (this.dead) return;
    const copy = structuredClone(data, { transfer });
    setTimeout(() => {
      if (!this.dead) this.receive({ data: copy });
    }, 0);
  }
  private reply(response: HostResponse, transfer: Transferable[] = []) {
    if (this.dead) return;
    const copy = structuredClone(response, { transfer }) as HostResponse;
    setTimeout(() => {
      if (this.dead) return;
      this.onmessage?.({ data: copy });
      if (copy.type === 'checkpoint' && copy.checkpoint === FakeWorker.crashAfter) {
        this.dead = true;
        this.onerror?.({ preventDefault() {} });
      }
    }, 0);
  }
  terminate() {
    this.dead = true;
  }
}

let initial: World;
beforeAll(async () => {
  initial = nationalCareer();
  await persistence();
}, 120000);
beforeEach(async () => {
  vi.stubGlobal('Worker', FakeWorker);
  FakeWorker.instances = [];
  FakeWorker.crashAfter = null;
  await Promise.all([database.saves.clear(), database.worlds.clear(), database.matches.clear()]);
  useAppStore.getState().clearSession();
  useAppStore.setState({
    world: null,
    worldJob: null,
    matchSession: null,
    worldNotice: null,
    worldError: null,
  });
  const save = createSave(1, 'Career', {
    kind: 'world',
    world: structuredClone(initial),
    gallery: { seed: 'host', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  await saves.write(save, null);
  const p = await persistence();
  await p.loadSlot(1);
});
afterEach(() => {
  cancelWorldJob();
  vi.unstubAllGlobals();
});

/** The world after `weeks` uninterrupted auto-played weeks from the start. */
function reference(weeks: number): World {
  let world = structuredClone(initial);
  for (let week = 0; week < weeks; week++) world = worldOperations.week(world, true).world;
  return world;
}
async function storedWorld(): Promise<World> {
  const save = await saves.read(1);
  if (save?.payload.kind !== 'world') throw new Error('Expected a world');
  return save.payload.world;
}
/** Start a season job and stop it (cancel) once `weeks` weeks are reported. */
async function seasonFor(weeks: number): Promise<void> {
  const running = startWorldJob('simulate-season', { autoPlay: true });
  await vi.waitFor(
    () =>
      expect(useAppStore.getState().worldJob?.completedWeeks ?? 0).toBeGreaterThanOrEqual(weeks),
    { timeout: 120000, interval: 5 },
  );
  cancelWorldJob();
  await running;
}
const weekOf = () => useAppStore.getState().world!.date.week;

describe('the world worker and its checkpoints', () => {
  it('ends a cancelled season on its committed world, saved, with every week once', async () => {
    const start = weekOf();
    await seasonFor(2);
    const state = useAppStore.getState();
    expect(state.worldJob).toBeNull();
    expect(state.worldNotice).toBe('cancelled');
    const weeks = weekOf() - start;
    expect(weeks).toBeGreaterThanOrEqual(2);
    expect(state.saveStatus).toBe('saved');
    expect(state.savedChange).toBe(state.change);
    expect(json(await storedWorld())).toBe(json(state.world));
    expect(json(state.world)).toBe(json(reference(weeks)));
    expect((await saves.list())[0]).toMatchObject({ revision: state.activeSave?.revision });
    // One worker for the save: the season sent the world once and got it back once.
    expect(FakeWorker.instances).toHaveLength(1);
  }, 300000);

  it('recovers from a worker crash mid-season at the last committed week, losing and repeating none', async () => {
    const start = weekOf();
    FakeWorker.crashAfter = 3;
    await startWorldJob('simulate-season', { autoPlay: true });
    let state = useAppStore.getState();
    expect(state.worldJob).toBeNull();
    expect(state.worldError).toBe('simulation');
    // The tab never received those weeks as a world: it loaded them from storage.
    expect(weekOf() - start).toBe(3);
    expect(json(state.world)).toBe(json(await storedWorld()));
    expect(json(state.world)).toBe(json(reference(3)));
    // A new worker takes the whole world and goes on from the committed week.
    FakeWorker.crashAfter = null;
    await seasonFor(2);
    state = useAppStore.getState();
    const weeks = weekOf() - start;
    expect(weeks).toBeGreaterThanOrEqual(5);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1]!.received[0]?.type).toBe('sync');
    expect(json(state.world)).toBe(json(await storedWorld()));
    expect(json(state.world)).toBe(json(reference(weeks)));
  }, 300000);

  it('stores a UI change as a patch, and sends the worker only that patch', async () => {
    await seasonFor(1);
    const worker = FakeWorker.instances[0]!;
    const before = useAppStore.getState().world!;
    const career = before.career!;
    const training = structuredClone(career.training);
    training.sessions[0]!.intensity = training.sessions[0]!.intensity === 'high' ? 'low' : 'high';
    const changed = { ...before, career: { ...career, training } };
    const bytes = (await database.worlds.get(1))!.bytes!;
    useAppStore.getState().setWorld(changed);
    const p = await persistence();
    await p.autosave.flush();
    expect(useAppStore.getState().saveStatus).toBe('saved');
    // The world itself was not rewritten: a patch sits beside it.
    expect(Buffer.from((await database.worlds.get(1))!.bytes!).equals(Buffer.from(bytes))).toBe(
      true,
    );
    const meta = (await database.saves.get(1)) as { worldPatches?: unknown[] };
    expect(meta.worldPatches?.length).toBeGreaterThan(0);
    expect(json(await storedWorld())).toBe(json(changed));
    // The next job sends the patch, not the world, and its checkpoint clears the patches.
    const sent = worker.received.length;
    await seasonFor(1);
    const synced = worker.received
      .slice(sent)
      .filter((m) => m.type === 'sync' || m.type === 'patch');
    expect(synced.map((m) => m.type)).toEqual(['patch']);
    expect(
      ((await database.saves.get(1)) as { worldPatches?: unknown[] }).worldPatches,
    ).toBeUndefined();
    expect(useAppStore.getState().world!.career!.training).toEqual(training);
    expect(json(await storedWorld())).toBe(json(useAppStore.getState().world));
  }, 300000);

  it('retires the worker when another save loads, and sends the new world whole', async () => {
    await seasonFor(1);
    const other = structuredClone(initial);
    await saves.write(
      createSave(2, 'Other', {
        kind: 'world',
        world: other,
        gallery: { seed: 'other', generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
      null,
    );
    const p = await persistence();
    await p.loadSlot(2);
    expect(FakeWorker.instances[0]!.dead).toBe(true);
    expect(useAppStore.getState().activeSave?.slot).toBe(2);
    await seasonFor(1);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1]!.received[0]?.type).toBe('sync');
    const slot2 = await saves.read(2);
    expect(json(slot2?.payload.kind === 'world' && slot2.payload.world)).toBe(
      json(useAppStore.getState().world),
    );
    // Slot 1 kept its own world, as its last job left it.
    const slot1 = await saves.read(1);
    expect(slot1?.payload.kind === 'world' && slot1.payload.world.seed).toBe(initial.seed);
  }, 300000);

  it('checks the stored revision after a lost reply instead of reporting a false conflict', async () => {
    await seasonFor(1);
    const before = useAppStore.getState().world!;
    const career = before.career!;
    // A write commits, but its reply is lost (the persistence worker crashed).
    const real = saves.writeWithoutWorldChange.bind(saves);
    const spy = vi
      .spyOn(saves, 'writeWithoutWorldChange')
      .mockImplementationOnce(async (...args) => {
        await real(...args);
        throw new PersistenceInterrupted(true);
      });
    useAppStore.getState().setWorld({ ...before, career: { ...career, levelXp: career.levelXp } });
    const p = await persistence();
    await expect(p.autosave.flush()).rejects.toThrow('storage');
    expect(useAppStore.getState().saveStatus).toBe('error');
    // The retry meets the committed write's revision, confirms it, and saves the whole world.
    await p.autosave.flush();
    expect(useAppStore.getState().saveStatus).toBe('saved');
    expect(useAppStore.getState().activeSave?.revision).toBe(
      ((await saves.list())[0] as { revision: number }).revision,
    );
    expect(json(await storedWorld())).toBe(json(useAppStore.getState().world));
    spy.mockRestore();
  }, 300000);
});
