import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import {
  CheckpointFailed,
  runWorldJob,
  type JobRequest,
  type JobRuntime,
  type WorldOperations,
} from '../src/workers/run';
import { createWorldHost } from '../src/workers/hostCore';
import type { HostRequest, HostResponse } from '../src/workers/protocol';
import { decodeWorldBytes } from '../src/workers/worldCodec';

const initial = (): World =>
  ({
    id: 'world:test',
    seed: 'test',
    date: { season: 2026, week: 1, day: 1 },
    phase: 'active',
    clubs: {},
    leagues: {},
    players: {},
  }) as unknown as World;
const step = (world: World) => ({ world, pendingFixtureId: null });
/** In place, as the worker's real operations: the week moves on, and so on. */
const operations: WorldOperations = {
  generate: () => initial(),
  week: (world: World) => {
    world.phase = world.date.week === 3 ? 'complete' : 'active';
    world.date = { ...world.date, week: world.date.week + 1 };
    return step(world);
  },
  commit: () => {
    throw new Error('Not used');
  },
  tournament: (world: World, simulateCareer: boolean) => ({
    world,
    pendingFixtureId: simulateCareer ? null : 'tournament:2028:group:0:1:01',
  }),
  createCareer: (world: World) => world,
  nextSeason: (world: World): World => ({
    ...world,
    date: { ...world.date, season: world.date.season + 1, week: 1 },
    phase: 'active',
  }),
};
const runtime = (overrides: Partial<JobRuntime> = {}): JobRuntime & { weeks: number[] } => {
  const weeks: number[] = [];
  return {
    weeks,
    progress: () => {},
    checkpoint: async (world) => {
      weeks.push(world.date.week);
    },
    cancelled: () => false,
    yieldControl: async () => {},
    ...overrides,
  };
};
const job = (type: JobRequest['type'], extra: object = {}) =>
  ({ requestId: type, type, ...extra }) as JobRequest;

describe('world job runner', () => {
  it('stops Continue on deadline day, after at least one week, but never a season simulation', async () => {
    const run = async (type: 'simulate-to-match' | 'simulate-season') => {
      const r = runtime();
      await runWorldJob(job(type, { autoPlay: false }), initial(), r, {
        ...operations,
        // A decision falls due in week 1 (where Continue starts) and in week 2.
        continueStops: (world) => world.date.week <= 2,
      });
      return r.weeks.length;
    };
    // Week 1 always plays; Continue then stops in week 2 for the decision.
    expect(await run('simulate-to-match')).toBe(1);
    expect(await run('simulate-season')).toBe(3);
  });
  it('stops Continue when a new decision arrives, but not for one already waiting', async () => {
    const r = runtime();
    await runWorldJob(job('simulate-to-match'), initial(), r, {
      ...operations,
      // An offer waits from the start; a press question arrives in week 3.
      pending: (world) => (world.date.week >= 3 ? ['offer:a', 'press:b'] : ['offer:a']),
      continueStops: (world, before) =>
        (world.date.week >= 3 ? ['offer:a', 'press:b'] : ['offer:a']).some((id) => !before.has(id)),
    });
    expect(r.weeks).toHaveLength(2);
  });
  it('plays the tournament on to the career player’s match, or through it, checkpointing it', async () => {
    const run = async (simulateCareer: boolean) => {
      const r = runtime();
      const outcome = await runWorldJob(
        job('tournament', { simulateCareer }),
        initial(),
        r,
        operations,
      );
      expect(r.weeks).toHaveLength(1);
      return outcome;
    };
    expect(await run(false)).toMatchObject({
      kind: 'done',
      changed: true,
      pendingFixtureId: 'tournament:2028:group:0:1:01',
    });
    expect(await run(true)).toMatchObject({ kind: 'done', pendingFixtureId: null });
  });
  it('continues through the national postseason calendar instead of stopping at legacy week 34', async () => {
    const national = {
      ...initial(),
      format: 'national-v1',
      date: { season: 2026, week: 46, day: 1 },
      season: { end: { week: 60 } },
    } as unknown as World;
    const r = runtime();
    const progress: number[] = [];
    const outcome = await runWorldJob(
      job('simulate-season', { autoPlay: false }),
      national,
      { ...r, progress: (p) => progress.push(p.totalWeeks) },
      {
        ...operations,
        week: (world) => {
          world.phase = world.date.week === 60 ? 'complete' : 'active';
          world.date = { ...world.date, week: world.date.week + 1 };
          return step(world);
        },
      },
    );
    expect(progress[0]).toBe(15);
    expect(r.weeks).toHaveLength(15);
    expect(outcome).toMatchObject({
      kind: 'done',
      completedWeeks: 15,
      world: { phase: 'complete', date: { week: 61 } },
    });
  });
  it('waits on each checkpoint before simulating another week', async () => {
    let release: (() => void) | undefined;
    const r = runtime();
    const promise = runWorldJob(
      job('simulate-season', { autoPlay: false }),
      initial(),
      {
        ...r,
        checkpoint: (world) => {
          r.weeks.push(world.date.week);
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      },
      operations,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.weeks).toEqual([2]);
    release!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.weeks).toEqual([2, 3]);
    release!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release!();
    expect(await promise).toMatchObject({ kind: 'done', completedWeeks: 3 });
  });
  it('cancels at a checkpoint without consuming the next week', async () => {
    let cancel = false;
    const r = runtime();
    const outcome = await runWorldJob(
      job('simulate-season', { autoPlay: false }),
      initial(),
      {
        ...r,
        cancelled: () => cancel,
        checkpoint: async () => {
          cancel = true;
        },
      },
      operations,
    );
    expect(outcome).toMatchObject({
      kind: 'cancelled',
      completedWeeks: 1,
      world: { date: { week: 2 } },
    });
  });
  it('stops, keeping the simulated weeks, when storage refuses a checkpoint', async () => {
    const r = runtime();
    const outcome = await runWorldJob(
      job('simulate-season', { autoPlay: false }),
      initial(),
      {
        ...r,
        checkpoint: async (world) => {
          if (world.date.week === 3) throw new CheckpointFailed();
        },
      },
      operations,
    );
    expect(outcome).toMatchObject({ kind: 'stopped', completedWeeks: 2 });
  });
  it('reports a failure instead of rejecting an unhandled worker promise', async () => {
    const outcome = await runWorldJob(job('generate', { seed: 'seed' }), null, runtime(), {
      ...operations,
      generate: () => {
        throw new Error('bad');
      },
    });
    expect(outcome).toEqual({ kind: 'error' });
  });
  it('does not advance another week if cancellation arrives during the yield', async () => {
    let cancelled = false,
      yields = 0;
    const outcome = await runWorldJob(
      job('simulate-season', { autoPlay: false }),
      initial(),
      runtime({
        cancelled: () => cancelled,
        yieldControl: async () => {
          if (++yields === 2) cancelled = true;
        },
      }),
      operations,
    );
    expect(outcome).toMatchObject({ kind: 'cancelled', completedWeeks: 1 });
  });
});

/** A world worker in this process, its messages cloned as postMessage would. */
function host(options: { maxUncommitted?: number; ops?: WorldOperations } = {}) {
  const responses: HostResponse[] = [];
  let notify: (() => void) | null = null;
  const receive = createWorldHost(
    (response) => {
      responses.push(structuredClone(response));
      notify?.();
    },
    options.ops ?? operations,
    { maxUncommitted: options.maxUncommitted ?? 2, yieldControl: async () => {} },
  );
  const send = (message: HostRequest) => receive(structuredClone(message));
  const until = async (match: (response: HostResponse) => boolean): Promise<HostResponse> => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const found = responses.find(match);
      if (found) return found;
      await new Promise<void>((resolve) => {
        notify = resolve;
        setTimeout(resolve, 5);
      });
    }
    throw new Error('No such response');
  };
  return { responses, send, until };
}
const resultOf = (response: HostResponse) => response as Extract<HostResponse, { type: 'result' }>;

describe('the long-lived world worker', () => {
  it('keeps its world between jobs, applies patches, and refuses a stale token', async () => {
    const { send, until, responses } = host();
    send({ type: 'sync', token: 1, world: initial() });
    send({
      type: 'patch',
      from: 1,
      token: 2,
      patches: [{ op: 'set', path: ['seed'], value: 'patched' }],
    });
    send({ type: 'patch', from: 1, token: 3, patches: [] });
    expect(responses.map((response) => response.type)).toEqual(['synced', 'synced', 'sync-failed']);
    send({
      type: 'job',
      requestId: 'a',
      job: { type: 'simulate-week' },
      token: 1,
      resultToken: 4,
      checkpoints: false,
    });
    expect(await until((r) => r.type === 'error')).toMatchObject({ code: 'stale' });
    send({
      type: 'job',
      requestId: 'b',
      job: { type: 'simulate-week' },
      token: 2,
      resultToken: 5,
      checkpoints: false,
    });
    const result = resultOf(await until((r) => r.type === 'result'));
    expect(result.world?.token).toBe(5);
    expect(decodeWorldBytes(result.world!.bytes)).toMatchObject({
      seed: 'patched',
      date: { week: 2 },
    });
    // The next job runs on the worker's own copy, with no world sent.
    send({
      type: 'job',
      requestId: 'c',
      job: { type: 'simulate-week' },
      token: 5,
      resultToken: 6,
      checkpoints: false,
    });
    const next = resultOf(await until((r) => r.type === 'result' && r.requestId === 'c'));
    expect(decodeWorldBytes(next.world!.bytes)).toMatchObject({ date: { week: 3 } });
  });
  it('runs at most the bounded number of checkpoints ahead of storage', async () => {
    const { send, until, responses } = host({ maxUncommitted: 2 });
    send({ type: 'sync', token: 1, world: initial() });
    send({
      type: 'job',
      requestId: 's',
      job: { type: 'simulate-season', autoPlay: false },
      token: 1,
      resultToken: 2,
      checkpoints: true,
    });
    await until((r) => r.type === 'checkpoint' && r.checkpoint === 2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Two uncommitted: the third week waits.
    expect(responses.filter((r) => r.type === 'checkpoint')).toHaveLength(2);
    send({ type: 'committed', requestId: 's', checkpoint: 1 });
    await until((r) => r.type === 'checkpoint' && r.checkpoint === 3);
    send({ type: 'committed', requestId: 's', checkpoint: 3 });
    const result = resultOf(await until((r) => r.type === 'result'));
    expect(result).toMatchObject({
      end: 'done',
      checkpoints: 3,
      checkpointed: true,
      phase: 'complete',
    });
    // The published world is the last checkpoint's bytes.
    const last = responses.findLast((r) => r.type === 'checkpoint') as Extract<
      HostResponse,
      { type: 'checkpoint' }
    >;
    expect(Buffer.from(result.world!.bytes).equals(Buffer.from(last.bytes))).toBe(true);
    expect(last.summary).toMatchObject({ worldId: 'world:test', week: 4 });
  });
  it('stops at a refused checkpoint and publishes the weeks it simulated', async () => {
    const { send, until } = host({ maxUncommitted: 1 });
    send({ type: 'sync', token: 1, world: initial() });
    send({
      type: 'job',
      requestId: 'f',
      job: { type: 'simulate-season', autoPlay: false },
      token: 1,
      resultToken: 2,
      checkpoints: true,
    });
    await until((r) => r.type === 'checkpoint');
    send({ type: 'commit-failed', requestId: 'f', checkpoint: 1 });
    const result = resultOf(await until((r) => r.type === 'result'));
    expect(result).toMatchObject({ end: 'stopped', checkpoints: 1, completedWeeks: 1 });
    expect(decodeWorldBytes(result.world!.bytes)).toMatchObject({ date: { week: 2 } });
  });
  it('stops a cancelled season after the week in hand, with that week checkpointed', async () => {
    const { send, until } = host({ maxUncommitted: 1 });
    send({ type: 'sync', token: 1, world: initial() });
    send({
      type: 'job',
      requestId: 'c',
      job: { type: 'simulate-season', autoPlay: false },
      token: 1,
      resultToken: 2,
      checkpoints: true,
    });
    await until((r) => r.type === 'checkpoint');
    send({ type: 'cancel', requestId: 'c' });
    send({ type: 'committed', requestId: 'c', checkpoint: 1 });
    const result = resultOf(await until((r) => r.type === 'result'));
    expect(result).toMatchObject({ end: 'cancelled', checkpoints: 1, checkpointed: true });
    expect(decodeWorldBytes(result.world!.bytes)).toMatchObject({ date: { week: 2 } });
  });
  it('drops a world a failed job may have half-changed', async () => {
    const { send, until } = host({
      ops: {
        ...operations,
        week: (world) => {
          world.date = { ...world.date, week: 99 };
          throw new Error('engine bug');
        },
      },
    });
    send({ type: 'sync', token: 1, world: initial() });
    send({
      type: 'job',
      requestId: 'x',
      job: { type: 'simulate-week' },
      token: 1,
      resultToken: 2,
      checkpoints: false,
    });
    expect(await until((r) => r.type === 'error')).toMatchObject({ code: 'simulation' });
    send({ type: 'encode', requestId: 'e', token: 1 });
    expect(await until((r) => r.type === 'error' && r.requestId === 'e')).toMatchObject({
      code: 'stale',
    });
  });
  it('encodes its world for a whole save as the exact JSON', async () => {
    const { send, until } = host();
    const world = initial();
    send({ type: 'sync', token: 7, world });
    send({ type: 'encode', requestId: 'e', token: 7 });
    const encoded = (await until((r) => r.type === 'encoded')) as Extract<
      HostResponse,
      { type: 'encoded' }
    >;
    expect(new TextDecoder().decode(encoded.bytes)).toBe(JSON.stringify(world));
  });
});
