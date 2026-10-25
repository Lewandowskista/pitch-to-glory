import { getSeasonWeeks } from '../engine/world/calendar';
import { CONFIG } from '../engine/config';
import { useAppStore, type WorldJob } from '../store';
import { errorCode } from '../persistence/errors';
import { loadedPersistence, persistence } from '../persistence/lazy';
import type { Id, World } from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import type { CareerDraft } from '../engine/career/create';
import type { JobSpec } from './protocol';
import type { JobResult } from './host';
import { loadedHost, loadHost } from './hostRef';
import {
  trainingContext,
  trainingEditBlocked,
  type TrainingAdvance,
} from '../store/trainingDraftSlice';
import { confirmTrainingAbandonment } from '../store/trainingTransitions';

/** How long a cancelled job may take to stop before its worker is restarted. */
const CANCEL_TIMEOUT_MS = 30000;
let startup: Promise<void> = Promise.resolve();
let cancelled = false;
let current: { requestId: string | null } | null = null;
export interface WorldJobOptions {
  seed?: string;
  /** Season simulation in a career world: play the career player's fixtures automatically. */
  autoPlay?: boolean;
  session?: MatchSession;
  /** A tournament job: simulate the career player's waiting match too. */
  simulateCareer?: boolean;
  career?: { seed: string; draft: CareerDraft; clubId: Id };
}
function specFor(type: WorldJob['type'], options: WorldJobOptions): JobSpec {
  switch (type) {
    case 'generate':
      return { type, seed: options.seed?.trim() || 'pitch-to-glory' };
    case 'simulate-season':
      return { type, autoPlay: Boolean(options.autoPlay) };
    case 'commit-match':
      return { type, session: options.session! };
    case 'create-career':
      return { type, ...options.career! };
    case 'tournament':
      return { type, simulateCareer: Boolean(options.simulateCareer) };
    default:
      return { type };
  }
}
function noticeFor(type: WorldJob['type'], result: JobResult) {
  if (result.end === 'cancelled') return 'cancelled' as const;
  if (type === 'generate') return 'generated' as const;
  if (type === 'next-season') return 'newSeason' as const;
  if (type === 'create-career') return 'careerCreated' as const;
  if (type === 'commit-match') return 'recorded' as const;
  if (type === 'tournament')
    return result.pendingFixtureId
      ? ('tournamentMatch' as const)
      : result.tournamentLive
        ? ('advanced' as const)
        : ('tournamentOver' as const);
  return result.pendingFixtureId
    ? ('matchday' as const)
    : result.phase === 'complete'
      ? ('finished' as const)
      : ('advanced' as const);
}
/** End the job, then write anything still unsaved (a change made while it ran). */
function finish(
  notice: Parameters<ReturnType<typeof useAppStore.getState>['worldFeedback']>[0],
  error?: string,
) {
  const state = useAppStore.getState();
  state.setWorldJob(null);
  state.worldFeedback(notice, error);
  const after = useAppStore.getState();
  if (after.activeSave && after.change !== after.savedChange && after.saveStatus !== 'error')
    loadedPersistence()?.autosave.schedule();
}

/**
 * Run a world job in the tab's long-lived world worker (docs/RELEASE-1.0-PLAN.md steps
 * 3.2–3.3). The worker holds the world, so the job sends only what the UI changed. For a saved
 * world it encodes a checkpoint after every changed step; each is stored through the
 * persistence worker (the bytes cross this thread without a copy or a parse) while the worker
 * goes on, at most `maxUncommittedWeeks` ahead. At the end the worker publishes the world once,
 * decoded here in short slices, and the store takes it when its last checkpoint has committed,
 * so the screen ends on the committed world and "All changes saved" is true when shown.
 */
export async function startWorldJob(
  type: WorldJob['type'],
  options: WorldJobOptions = {},
): Promise<void> {
  let state = useAppStore.getState();
  if (type === 'generate' && state.trainingDraft) {
    if (!(await confirmTrainingAbandonment())) return;
    state = useAppStore.getState();
  }
  if (state.trainingSaving) return;
  if (
    type !== 'commit-match' &&
    state.matchSession &&
    state.matchSession.state.match.status !== 'finished'
  ) {
    state.worldFeedback(null, 'match-active');
    return;
  }
  if (state.worldJob || (type !== 'generate' && !state.world)) return;
  const advances = ['simulate-week', 'simulate-to-match', 'simulate-season', 'next-season'];
  if (state.world?.career && advances.includes(type)) {
    if (trainingEditBlocked(state)) return;
    if (state.trainingDraft) {
      useAppStore.setState({
        trainingAdvance: {
          type: type as TrainingAdvance['type'],
          autoPlay: options.autoPlay,
          context: trainingContext(state)!,
        },
      });
      return;
    }
    state.setCareerResult(null);
  }
  const totalWeeks =
    type === 'simulate-season' || type === 'simulate-to-match'
      ? getSeasonWeeks(state.world!) - state.world!.date.week + 1
      : 1;
  state.worldFeedback(null);
  state.setWorldJob({ type, completedWeeks: 0, totalWeeks, cancelling: false });
  cancelled = false;
  const job: { requestId: string | null } = { requestId: null };
  current = job;
  let commits: Promise<void> = Promise.resolve();
  let committed = 0;
  let failed = false;
  try {
    // Loading the save system is part of startup, assigned synchronously, so a cancellation
    // during the load waits for it like any other startup work. A write in flight finishes
    // first; anything still unsaved travels with the job's first checkpoint.
    startup = Promise.all([persistence().then((p) => p.autosave.settle()), loadHost()]).then(
      () => {},
    );
    await startup;
    if (cancelled) return;
    const p = loadedPersistence()!;
    const { worldHost, HostStopped, decodeWorld } = loadedHost()!;
    const before = useAppStore.getState();
    const startChange = before.change;
    const world = type === 'generate' ? null : before.world!;
    const checkpoints = Boolean(before.activeSave) && type !== 'generate';
    const handle = worldHost.run(specFor(type, options), world, {
      checkpoints,
      handlers: {
        progress: (completedWeeks, weeks) => {
          if (current === job && !cancelled)
            useAppStore
              .getState()
              .setWorldJob({ type, completedWeeks, totalWeeks: weeks, cancelling: false });
        },
        checkpoint: (checkpoint) => {
          commits = commits.then(async () => {
            const ok = !failed && (await p.commitCheckpoint(checkpoint));
            if (ok) committed++;
            else failed = true;
            worldHost.acknowledge(handle.requestId, checkpoint.checkpoint, ok);
          });
        },
      },
    });
    job.requestId = handle.requestId;
    let result: JobResult;
    try {
      result = await handle.done;
    } catch (error) {
      // The worker stopped. Checkpoints it committed are newer than this tab's world: load
      // the last of them. Without any, this tab's world is still the latest.
      await commits;
      if (error instanceof HostStopped && committed > 0) await p.recoverCommitted().catch(() => {});
      if (current === job)
        finish(cancelled ? 'cancelled' : null, cancelled ? undefined : 'simulation');
      return;
    }
    const encoded = result.world;
    const decoded = encoded
      ? ((await decodeWorld(encoded, { sliceMs: CONFIG.workers.decodeSliceMs })) as World)
      : null;
    await commits;
    if (current !== job) return;
    if (decoded && encoded) worldHost.adopt(decoded, encoded.token);
    const saved = checkpoints && !failed && result.checkpointed && committed === result.checkpoints;
    if (type === 'generate') {
      if (cancelled || !decoded) {
        finish('cancelled');
        return;
      }
      const { autosave, slotLocks } = p;
      // A new world must never overwrite the previously loaded collection/world.
      await autosave.flush().catch(() => {});
      if (cancelled) {
        finish('cancelled');
        return;
      }
      const previous = useAppStore.getState().activeSave?.slot;
      if (previous) await slotLocks.release(previous);
      if (cancelled) {
        // The loaded session survived cancellation; restore exclusive ownership.
        if (previous && useAppStore.getState().activeSave?.slot === previous) {
          try {
            if (!(await slotLocks.acquire(previous)))
              useAppStore.getState().setSaveStatus('error', 'locked');
          } catch (error) {
            useAppStore.getState().setSaveStatus('error', errorCode(error));
          }
        }
        finish('cancelled');
        return;
      }
      useAppStore.getState().clearSession();
      useAppStore.getState().publishWorld(decoded, { save: null, saved: false });
      finish('generated');
      return;
    }
    if (decoded) {
      const now = useAppStore.getState();
      if (type === 'tournament') now.setCareerResult(null);
      // The committed world replaces the finished session, which is kept in memory for its
      // report so a saved world never sits beside a session it already holds.
      if (type === 'commit-match' && result.outcome && options.session)
        now.setCareerResult({ session: options.session, outcome: result.outcome });
      const active = useAppStore.getState().activeSave;
      let save = null;
      if (saved && active && active.payload.kind === 'world') {
        const { matchSession: _session, ...payload } = active.payload;
        void _session;
        save = { ...active, payload: { ...payload, world: decoded } };
      }
      useAppStore.getState().publishWorld(decoded, {
        save,
        saved: saved && useAppStore.getState().change === startChange,
      });
      if (saved) p.publishedStored(decoded);
    }
    if (failed) finish(null, useAppStore.getState().saveError ?? 'storage');
    else finish(noticeFor(type, result));
  } catch (error) {
    await commits.catch(() => {});
    if (current === job)
      finish(
        null,
        error instanceof Error && error.message === 'simulation' ? 'simulation' : errorCode(error),
      );
  } finally {
    if (current === job) current = null;
  }
}
export function cancelWorldJob(): void {
  const running = useAppStore.getState().worldJob;
  if (!running) return;
  cancelled = true;
  useAppStore.getState().setWorldJob({ ...running, cancelling: true });
  const job = current;
  if (job?.requestId) {
    // The worker stops at the end of its week, with that week committed, and publishes it.
    loadedHost()?.worldHost.cancel(job.requestId);
    setTimeout(() => {
      if (current === job) loadedHost()?.worldHost.retire();
    }, CANCEL_TIMEOUT_MS);
    return;
  }
  // Still starting: keep the job occupied until startup settles.
  // A new request cannot reset cancellation while the old startup is still awaiting storage.
  void startup
    .catch(() => {})
    .then(() => {
      if (current === job) current = null;
      useAppStore.getState().setWorldJob(null);
      useAppStore.getState().worldFeedback('cancelled');
    });
}
