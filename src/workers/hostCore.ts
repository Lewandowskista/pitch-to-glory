import type { World } from '../model/domain';
import { CONFIG } from '../engine/config';
import { summarizeWorld } from '../persistence/summary';
import type { HostRequest, HostResponse } from './protocol';
import { CheckpointFailed, runWorldJob, type JobRuntime, type WorldOperations } from './run';
import { encodeWorld, type EncodedWorld } from './worldCodec';
import { applyWorldPatches } from './worldPatch';

export type HostPost = (response: HostResponse, transfer?: Transferable[]) => void;

/**
 * The world worker's state (docs/RELEASE-1.0-PLAN.md steps 3.2–3.3), apart from its message
 * plumbing so tests drive it directly. It holds the tab's world between jobs, so a job sends
 * no world unless the tab changed it, and then only the patches. During a job it encodes each
 * changed world once: a copy of the bytes goes to the tab to be stored as a checkpoint, and at
 * the end the same encoding is published to the tab, which decodes it in short slices.
 *
 * Crash safety: simulation runs at most `maxUncommittedWeeks` checkpoints ahead of storage;
 * a job whose checkpoint storage refuses stops there. A failed job may have half-changed the
 * world in place, so the worker then drops it and the tab sends its own copy again.
 */
export function createWorldHost(
  post: HostPost,
  operations: WorldOperations,
  options: {
    maxUncommitted?: number;
    yieldControl?: () => Promise<void>;
  } = {},
): (message: HostRequest) => void {
  const maxUncommitted = options.maxUncommitted ?? CONFIG.workers.maxUncommittedWeeks;
  const yieldControl =
    options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  let world: World | null = null;
  let token: number | null = null;
  let sizeHint = 16 * 1024 * 1024;
  let job: {
    requestId: string;
    cancelled: boolean;
    failed: boolean;
    posted: number;
    acked: number;
    wake: (() => void) | null;
  } | null = null;
  const encode = (value: World): EncodedWorld => {
    const encoded = encodeWorld(value, Math.ceil(sizeHint * 1.05));
    sizeHint = encoded.bytes.length;
    return encoded;
  };
  const wake = () => {
    const resume = job?.wake;
    if (job) job.wake = null;
    resume?.();
  };

  async function run(message: Extract<HostRequest, { type: 'job' }>): Promise<void> {
    const state = {
      requestId: message.requestId,
      cancelled: false,
      failed: false,
      posted: 0,
      acked: 0,
      wake: null as (() => void) | null,
    };
    job = state;
    // The latest checkpoint's encoding, kept to publish when the job ends on that world.
    let last: { encoded: EncodedWorld; checkpoint: number } | null = null;
    const season = message.job.type === 'simulate-season';
    const runtime: JobRuntime = {
      progress: (progress) => post({ type: 'progress', requestId: message.requestId, ...progress }),
      async checkpoint(value) {
        last = null;
        if (!message.checkpoints) return;
        const encoded = encode(value);
        state.posted++;
        const copy = encoded.bytes.slice();
        post(
          {
            type: 'checkpoint',
            requestId: message.requestId,
            checkpoint: state.posted,
            worldId: value.id,
            summary: summarizeWorld(value),
            bytes: copy,
          },
          [copy.buffer],
        );
        last = { encoded, checkpoint: state.posted };
        while (!state.failed && state.posted - state.acked >= maxUncommitted)
          await new Promise<void>((resolve) => {
            state.wake = resolve;
          });
        if (state.failed) throw new CheckpointFailed();
      },
      cancelled: () => state.cancelled,
      yieldControl,
    };
    const hosted: WorldOperations = {
      ...operations,
      week: (value, autoPlay) => {
        // A season publishes once at its end: no need to keep a week's encoding meanwhile.
        if (season) last = null;
        const step = operations.week(value, autoPlay);
        if (!step.pendingFixtureId) last = null;
        return step;
      },
    };
    const input = message.job.type === 'generate' ? null : world;
    const outcome = await runWorldJob(
      { ...message.job, requestId: message.requestId },
      input,
      runtime,
      hosted,
    );
    job = null;
    if (outcome.kind === 'error') {
      world = null;
      token = null;
      post({ type: 'error', requestId: message.requestId, code: 'simulation' });
      return;
    }
    world = outcome.world;
    let published: { bytes: Uint8Array; parts: EncodedWorld['parts']; token: number } | null = null;
    const checkpointed =
      last !== null && (last as { checkpoint: number }).checkpoint === state.posted;
    if (outcome.changed) {
      token = message.resultToken;
      const encoded = checkpointed ? last!.encoded : encode(world);
      published = { bytes: encoded.bytes, parts: encoded.parts, token: message.resultToken };
    }
    last = null;
    post(
      {
        type: 'result',
        requestId: message.requestId,
        end: outcome.kind,
        world: published,
        checkpoints: state.posted,
        checkpointed,
        completedWeeks: outcome.completedWeeks,
        totalWeeks: outcome.totalWeeks,
        phase: world.phase ?? null,
        pendingFixtureId: outcome.pendingFixtureId,
        ...(outcome.outcome ? { outcome: outcome.outcome } : {}),
        tournamentLive: Boolean(world.international?.live),
      },
      published ? [published.bytes.buffer] : [],
    );
  }

  return (message) => {
    switch (message.type) {
      case 'sync':
        if (job) {
          post({ type: 'sync-failed', token: message.token });
          return;
        }
        world = message.world;
        token = message.token;
        post({ type: 'synced', token });
        return;
      case 'patch':
        if (job || !world || token !== message.from) {
          post({ type: 'sync-failed', token: message.token });
          return;
        }
        try {
          applyWorldPatches(world, message.patches);
          token = message.token;
          post({ type: 'synced', token });
        } catch {
          // Half applied: the tab sends its whole world next time.
          world = null;
          token = null;
          post({ type: 'sync-failed', token: message.token });
        }
        return;
      case 'job':
        if (job) {
          post({ type: 'error', requestId: message.requestId, code: 'busy' });
          return;
        }
        if (message.job.type !== 'generate' && (!world || token !== message.token)) {
          post({ type: 'error', requestId: message.requestId, code: 'stale' });
          return;
        }
        // A throw outside the job's own error handling (such as encoding the result) still
        // answers, so the tab never waits on a job that has stopped.
        run(message).catch(() => {
          job = null;
          world = null;
          token = null;
          post({ type: 'error', requestId: message.requestId, code: 'simulation' });
        });
        return;
      case 'committed':
        if (job?.requestId === message.requestId) {
          job.acked = Math.max(job.acked, message.checkpoint);
          wake();
        }
        return;
      case 'commit-failed':
        if (job?.requestId === message.requestId) {
          job.failed = true;
          wake();
        }
        return;
      case 'cancel':
        if (job?.requestId === message.requestId) {
          job.cancelled = true;
          wake();
        }
        return;
      case 'encode': {
        if (job) {
          post({ type: 'error', requestId: message.requestId, code: 'busy' });
          return;
        }
        if (!world || token !== message.token) {
          post({ type: 'error', requestId: message.requestId, code: 'stale' });
          return;
        }
        try {
          const { bytes } = encode(world);
          post(
            {
              type: 'encoded',
              requestId: message.requestId,
              worldId: world.id,
              summary: summarizeWorld(world),
              bytes,
            },
            [bytes.buffer],
          );
        } catch {
          post({ type: 'error', requestId: message.requestId, code: 'simulation' });
        }
        return;
      }
      case 'drop':
        if (!job) {
          world = null;
          token = null;
        }
        return;
    }
  };
}
