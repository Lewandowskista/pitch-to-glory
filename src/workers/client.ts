import { getSeasonWeeks } from '../engine/world/calendar';
import { useAppStore, type WorldJob } from '../store';
import { autosave, errorCode } from '../persistence/session';
import { slotLocks } from '../persistence/runtime';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { createChunkReceiver, sendChunked } from './transport';

let worker: Worker | null = null;
let settling: Promise<void> = Promise.resolve();
let startup: Promise<void> = Promise.resolve();
let cancelled = false;
let sequence = 0;
export async function startWorldJob(type: WorldJob['type'], seed?: string): Promise<void> {
  const state = useAppStore.getState();
  if (state.matchSession && state.matchSession.state.match.status !== 'finished') {
    state.worldFeedback(null, 'match-active');
    return;
  }
  if (state.worldJob || (type !== 'generate' && !state.world)) return;
  const totalWeeks =
    type === 'simulate-season' ? getSeasonWeeks(state.world!) - state.world!.date.week + 1 : 1;
  state.worldFeedback(null);
  state.setWorldJob({ type, completedWeeks: 0, totalWeeks, cancelling: false });
  cancelled = false;
  const requestId = `job-${++sequence}`;
  try {
    startup = autosave.flush();
    await startup;
    if (cancelled) return;
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
            finish(data.phase === 'complete' ? 'finished' : 'advanced');
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
            } else if (type === 'next-season') {
              current.setWorld(data.world);
              await autosave.afterWeek();
            }
            finish(
              type === 'generate'
                ? 'generated'
                : type === 'next-season'
                  ? 'newSeason'
                  : data.world.phase === 'complete'
                    ? 'finished'
                    : 'advanced',
            );
          } else if (data.type === 'cancelled') finish('cancelled');
          else finish(null, data.code);
        })
        .catch((error) => finish(null, errorCode(error)));
    });
    const request: WorkerRequest =
      type === 'generate'
        ? { requestId, type, seed: seed?.trim() || 'pitch-to-glory' }
        : { requestId, type, world: useAppStore.getState().world! };
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
