import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import type { WorkerResponse } from '../src/workers/protocol';

const initial = { date: { season: 2026, week: 1, day: 1 }, phase: 'active' } as World;
const step = (world: World) => ({ world, pendingFixtureId: null });
const operations = {
  generate: () => initial,
  week: (world: World) =>
    step({
      ...world,
      date: { ...world.date, week: world.date.week + 1 },
      phase: world.date.week === 3 ? 'complete' : 'active',
    }),
  commit: () => {
    throw new Error('Not used');
  },
  createCareer: (world: World) => world,
  nextSeason: (world: World): World => ({
    ...world,
    date: { ...world.date, season: world.date.season + 1, week: 1 },
    phase: 'active',
  }),
};
describe('worker job protocol', () => {
  it('stops Continue on deadline day, after at least one week, but never a season simulation', async () => {
    const { runWorldJob } = await import('../src/workers/run');
    const run = async (type: 'simulate-to-match' | 'simulate-season') => {
      const events: WorkerResponse[] = [];
      await runWorldJob(
        type === 'simulate-to-match'
          ? { requestId: 'deadline', type, world: initial }
          : { requestId: 'deadline', type, world: initial, autoPlay: false },
        {
          emit: (event) => events.push(event),
          checkpoint: async () => {},
          cancelled: () => false,
          yieldControl: async () => {},
        },
        // A decision falls due in week 1 (where Continue starts) and in week 2.
        { ...operations, decisionDue: (world) => world.date.week <= 2 },
      );
      return events.filter((event) => event.type === 'checkpoint').length;
    };
    // Week 1 always plays; Continue then stops in week 2 for the decision.
    expect(await run('simulate-to-match')).toBe(1);
    expect(await run('simulate-season')).toBe(3);
  });
  it('continues through the national postseason calendar instead of stopping at legacy week 34', async () => {
    const { runWorldJob } = await import('../src/workers/run');
    const events: WorkerResponse[] = [];
    const national = {
      ...initial,
      format: 'national-v1',
      date: { ...initial.date, week: 46 },
      season: { end: { week: 60 } },
    } as World;
    await runWorldJob(
      { requestId: 'national-calendar', type: 'simulate-season', world: national, autoPlay: false },
      {
        emit: (event) => events.push(event),
        checkpoint: async () => {},
        cancelled: () => false,
        yieldControl: async () => {},
      },
      {
        ...operations,
        week: (world) =>
          step({
            ...world,
            date: { ...world.date, week: world.date.week + 1 },
            phase: world.date.week === 60 ? 'complete' : 'active',
          }),
      },
    );
    expect(events[0]).toMatchObject({ type: 'progress', totalWeeks: 15 });
    expect(events.filter((event) => event.type === 'checkpoint')).toHaveLength(15);
    expect(events.at(-2)).toMatchObject({
      type: 'checkpoint',
      world: { phase: 'complete', date: { week: 61 } },
    });
    expect(events.at(-1)).toMatchObject({ type: 'complete', phase: 'complete' });
  });
  it('does not simulate another week until the previous checkpoint is acknowledged', async () => {
    const { runWorldJob } = await import('../src/workers/run');
    const events: WorkerResponse[] = [];
    let acknowledge: (() => void) | undefined;
    const promise = runWorldJob(
      { requestId: 'one', type: 'simulate-season', world: initial, autoPlay: false },
      {
        emit: (response) => events.push(response),
        cancelled: () => false,
        checkpoint: () =>
          new Promise<void>((resolve) => {
            acknowledge = resolve;
          }),
        yieldControl: () => Promise.resolve(),
      },
      operations,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.filter((event) => event.type === 'checkpoint')).toHaveLength(1);
    expect(events.some((event) => event.type === 'complete')).toBe(false);
    acknowledge!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.filter((event) => event.type === 'checkpoint')).toHaveLength(2);
    acknowledge!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    acknowledge!();
    await promise;
    expect(events.at(-1)).toMatchObject({ type: 'complete', phase: 'complete' });
  });
  it('cancels at a checkpoint without consuming the next week', async () => {
    const { runWorldJob } = await import('../src/workers/run');
    const events: WorkerResponse[] = [];
    let cancel = false;
    await runWorldJob(
      { requestId: 'cancel', type: 'simulate-season', world: initial, autoPlay: false },
      {
        emit: (response) => events.push(response),
        cancelled: () => cancel,
        checkpoint: async () => {
          cancel = true;
        },
        yieldControl: () => Promise.resolve(),
      },
      operations,
    );
    expect(events.at(-1)).toMatchObject({ type: 'cancelled', world: { date: { week: 2 } } });
    expect(events.filter((event) => event.type === 'checkpoint')).toHaveLength(1);
  });
  it('reports a failure instead of rejecting an unhandled worker promise', async () => {
    const { runWorldJob } = await import('../src/workers/run');
    const events: WorkerResponse[] = [];
    await runWorldJob(
      { requestId: 'error', type: 'generate', seed: 'seed' },
      {
        emit: (response) => events.push(response),
        cancelled: () => false,
        checkpoint: async () => {},
        yieldControl: () => Promise.resolve(),
      },
      {
        ...operations,
        generate: () => {
          throw new Error('bad');
        },
      },
    );
    expect(events.at(-1)).toEqual({ requestId: 'error', type: 'error', code: 'simulation' });
  });
  it('does not advance another week if cancellation arrives during the yield', async () => {
    const { runWorldJob } = await import('../src/workers/run');
    const events: WorkerResponse[] = [];
    let cancelled = false,
      yields = 0;
    await runWorldJob(
      { requestId: 'yield-cancel', type: 'simulate-season', world: initial, autoPlay: false },
      {
        emit: (response) => events.push(response),
        checkpoint: async () => {},
        cancelled: () => cancelled,
        yieldControl: async () => {
          if (++yields === 2) cancelled = true;
        },
      },
      operations,
    );
    expect(events.filter((event) => event.type === 'checkpoint')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'cancelled', world: { date: { week: 2 } } });
  });
});
