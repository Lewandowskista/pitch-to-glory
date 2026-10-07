import { getSeasonWeeks } from '../engine/world/calendar';
import { useAppStore, type WorldJob } from '../store';
import { errorCode } from '../persistence/errors';
import { loadedPersistence, persistence } from '../persistence/lazy';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { Id } from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import type { CareerDraft } from '../engine/career/create';
import { createChunkReceiver, sendChunked } from './transport';

let worker: Worker | null = null;
let settling: Promise<void> = Promise.resolve();
let startup: Promise<void> = Promise.resolve();
let cancelled = false;
let sequence = 0;
export interface WorldJobOptions {
  seed?: string;
  /** Season simulation in a career world: play the career player's fixtures automatically. */
  autoPlay?: boolean;
  session?: MatchSession;
  career?: { seed: string; draft: CareerDraft; clubId: Id };
}
export async function startWorldJob(
  type: WorldJob['type'],
  options: WorldJobOptions = {},
): Promise<void> {
  const state = useAppStore.getState();
  if (
    type !== 'commit-match' &&
    state.matchSession &&
    state.matchSession.state.match.status !== 'finished'
  ) {
    state.worldFeedback(null, 'match-active');
    return;
  }
  if (state.worldJob || (type !== 'generate' && !state.world)) return;
  const totalWeeks =
    type === 'simulate-season' || type === 'simulate-to-match'
      ? getSeasonWeeks(state.world!) - state.world!.date.week + 1
      : 1;
  state.worldFeedback(null);
  state.setWorldJob({ type, completedWeeks: 0, totalWeeks, cancelling: false });
  cancelled = false;
  const requestId = `job-${++sequence}`;
  try {
    // Loading the save system is part of startup, assigned synchronously, so a cancellation
    // during the load waits for it like any other startup work.
    startup = persistence().then((p) => p.autosave.flush());
    await startup;
    if (cancelled) return;
    const { autosave, slotLocks } = loadedPersistence()!;
    const instance = new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' });
    worker = instance;
    const finish = (notice: Parameters<typeof state.worldFeedback>[0], error?: string) => {
      if (worker !== instance) return;
      instance.terminate();
      worker = null;
      useAppStore.getState().setWorldJob(null);
      useAppStore.getState().worldFeedback(notice, error);
    };
    instance.onerror = (event) => {
      event.preventDefault();
      finish(null, 'simulation');
    };
    instance.onmessageerror = () => finish(null, 'simulation');
    instance.onmessage = createChunkReceiver<WorkerResponse>((data) => {
      if (data.requestId !== requestId || cancelled || worker !== instance) return;
      settling = settling
        .then(async () => {
          if (cancelled || worker !== instance) return;
          const current = useAppStore.getState();
          if (data.type === 'progress') {
            current.setWorldJob({
              type,
              completedWeeks: data.completedWeeks,
              totalWeeks: data.totalWeeks,
              cancelling: false,
            });
          } else if (data.type === 'checkpoint') {
            current.setWorld(data.world);
            current.setWorldJob({
              type,
              completedWeeks: data.completedWeeks,
              totalWeeks: data.totalWeeks,
              cancelling: false,
            });
            await autosave.afterWeek();
            if (!cancelled && worker === instance)
              instance.postMessage({
                requestId,
                type: 'ack',
                completedWeeks: data.completedWeeks,
              } satisfies WorkerRequest);
          } else if (data.type === 'complete') {
            finish(
              data.pendingFixtureId
                ? 'matchday'
                : data.phase === 'complete'
                  ? 'finished'
                  : 'advanced',
            );
          } else if (data.type === 'result') {
            if (type === 'generate') {
              // A new world must never overwrite the previously loaded collection/world.
              await autosave.flush();
              if (cancelled) return;
              const previous = useAppStore.getState().activeSave?.slot;
              if (previous) await slotLocks.release(previous);
              if (cancelled || worker !== instance) {
                // The loaded session survived cancellation; restore exclusive ownership.
                if (previous && useAppStore.getState().activeSave?.slot === previous) {
                  try {
                    if (!(await slotLocks.acquire(previous)))
                      useAppStore.getState().setSaveStatus('error', 'locked');
                  } catch (error) {
                    useAppStore.getState().setSaveStatus('error', errorCode(error));
                  }
                }
                return;
              }
              useAppStore.getState().clearSession();
              useAppStore.getState().setWorld(data.world);
            } else if (type === 'next-season' || type === 'create-career') {
              current.setWorld(data.world);
              await autosave.afterWeek();
            } else if (type === 'commit-match') {
              // The committed world replaces the finished session, which is kept in memory
              // for its report so a saved world never sits beside a session it already holds.
              if (data.outcome && options.session)
                current.setCareerResult({ session: options.session, outcome: data.outcome });
              current.setWorld(data.world);
              await autosave.afterMatch();
            }
            finish(
              type === 'generate'
                ? 'generated'
                : type === 'next-season'
                  ? 'newSeason'
                  : type === 'create-career'
                    ? 'careerCreated'
                    : type === 'commit-match'
                      ? 'recorded'
                      : data.world.phase === 'complete'
                        ? 'finished'
                        : 'advanced',
            );
          } else if (data.type === 'cancelled') finish('cancelled');
          else finish(null, data.code);
        })
        .catch((error) => finish(null, errorCode(error)));
    });
    const world = useAppStore.getState().world!;
    const request: WorkerRequest =
      type === 'generate'
        ? { requestId, type, seed: options.seed?.trim() || 'pitch-to-glory' }
        : type === 'simulate-season'
          ? { requestId, type, world, autoPlay: Boolean(options.autoPlay) }
          : type === 'commit-match'
            ? { requestId, type, world, session: options.session! }
            : type === 'create-career'
              ? { requestId, type, world, ...options.career! }
              : { requestId, type, world };
    await sendChunked(instance, request, () => cancelled || worker !== instance);
  } catch (error) {
    worker?.terminate();
    worker = null;
    useAppStore.getState().setWorldJob(null);
    useAppStore.getState().worldFeedback(null, errorCode(error));
  }
}
export function cancelWorldJob(): void {
  if (!useAppStore.getState().worldJob) return;
  cancelled = true;
  worker?.terminate();
  worker = null;
  const job = useAppStore.getState().worldJob!;
  useAppStore.getState().setWorldJob({ ...job, cancelling: true });
  // Keep the job occupied until both startup and an in-flight checkpoint settle.
  // A new request cannot reset cancellation while the old startup is still awaiting storage.
  void Promise.all([startup, settling])
    .catch(() => {})
    .then(() => {
      useAppStore.getState().setWorldJob(null);
      useAppStore.getState().worldFeedback('cancelled');
    });
}
