import { continueStops, pendingDecisions } from '../engine/career/pending';
import { generateWorld } from '../engine/world/generate';
import { startNextSeason } from '../engine/world/simulate';
import { advanceCareerWeek } from '../engine/career/season';
import { commitCareerMatch } from '../engine/career/matches';
import { advanceTournament } from '../engine/career/honours/international';
import { commitTournamentMatch, commitWindowMatch } from '../engine/career/honours/nationalMatch';
import { createCareer } from '../engine/career/create';
import { runWorldJob } from './run';
import type { WorkerRequest } from './protocol';
import { createChunkReceiver, sendChunked } from './transport';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(response: unknown): void;
};
let current: string | null = null;
let cancelled = false;
let pending: { week: number; resolve(): void } | null = null;
scope.onmessage = createChunkReceiver<WorkerRequest>((data) => {
  if (data.type === 'ack') {
    if (data.requestId === current && data.completedWeeks === pending?.week) {
      const resolve = pending.resolve;
      pending = null;
      resolve();
    }
    return;
  }
  if (data.type === 'cancel') {
    if (data.requestId === current) {
      cancelled = true;
      pending?.resolve();
      pending = null;
    }
    return;
  }
  if (current) {
    scope.postMessage({ requestId: data.requestId, type: 'error', code: 'busy' });
    return;
  }
  current = data.requestId;
  cancelled = false;
  void runWorldJob(
    data,
    {
      emit: (response) => sendChunked(scope, response),
      cancelled: () => cancelled,
      checkpoint: (week) =>
        new Promise<void>((resolve) => {
          pending = { week, resolve };
        }),
      yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
    },
    {
      generate: generateWorld,
      // The worker owns its copy, and each checkpoint is fully posted before the next week.
      week: (world, autoPlay) => advanceCareerWeek(world, { inPlace: true, autoPlay }),
      nextSeason: (world) => startNextSeason(world, { inPlace: true }),
      // A tournament or window match (review phase 3; 0.9.0) is recorded in the international
      // state.
      commit: (world, session) => {
        const id = session.setup.fixture?.id;
        const international = world.international;
        return {
          world,
          outcome: international?.live?.fixtures.some((fixture) => fixture.id === id)
            ? commitTournamentMatch(world, session)
            : international?.window?.fixtures.some((fixture) => fixture.id === id)
              ? commitWindowMatch(world, session)
              : commitCareerMatch(world, session),
        };
      },
      tournament: (world, simulateCareer) => ({
        world,
        pendingFixtureId: advanceTournament(world, { simulateCareer }).pending?.id ?? null,
      }),
      createCareer: (world, seed, draft, clubId) => createCareer(world, draft, clubId, seed),
      pending: (world) => pendingDecisions(world).map((item) => item.id),
      continueStops,
    },
  ).finally(() => {
    current = null;
    pending = null;
  });
});
