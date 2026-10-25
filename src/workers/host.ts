import { recordFailure } from '../diagnostics';
import type { World } from '../model/domain';
import { CONFIG } from '../engine/config';
import { diffWorld } from './worldPatch';
import { createChunkReceiver, sendChunked } from './transport';
import type { CheckpointBytes, HostRequest, HostResponse, JobSpec } from './protocol';
export { decodeWorld } from './worldCodec';

/** The world worker stopped (it crashed, or was retired); its jobs and requests fail. */
export class HostStopped extends Error {
  constructor() {
    super('simulation');
  }
}
export type JobResult = Extract<HostResponse, { type: 'result' }>;
export interface JobHandlers {
  progress(completedWeeks: number, totalWeeks: number): void;
  checkpoint(checkpoint: CheckpointBytes & { checkpoint: number }): void;
}
interface Request {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  handlers?: JobHandlers;
  /** Post again after a whole-world sync, once, when the worker no longer held the world. */
  retry?: () => void;
}

/**
 * The tab's side of the long-lived world worker (docs/RELEASE-1.0-PLAN.md step 3.2). It knows
 * which of the tab's world objects the worker holds (`base`): a job on that same object sends
 * nothing; a job after UI changes sends only the patches between the two (the UI copies what it
 * changes and shares the rest, so the diff visits only the change); anything else, such as a
 * newly loaded save, sends the whole world once, in bounded batches.
 *
 * Measured on the 78.6 MB late save: the whole world costs the UI thread about 0.2 s of
 * batches and the worker 0.6 s to rebuild; a press answer's patches are a few hundred bytes.
 */
export class WorldHost {
  private worker: Worker | null = null;
  private tokens = 0;
  private sequence = 0;
  private base: World | null = null;
  private baseToken: number | null = null;
  private sending: Promise<void> = Promise.resolve();
  private readonly requests = new Map<string, Request>();
  constructor(private readonly create: () => Worker) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const instance = this.create();
    this.worker = instance;
    instance.onmessage = createChunkReceiver<HostResponse>((response) =>
      this.receive(instance, response),
    );
    instance.onerror = (event) => {
      event.preventDefault();
      recordFailure('worker', event.message || 'The world worker stopped', 'world');
      this.stop(instance);
    };
    instance.onmessageerror = () => this.stop(instance);
    return instance;
  }
  /** Terminate a worker and fail what it owed; the next use starts a fresh one. */
  private stop(instance: Worker): void {
    if (this.worker !== instance) return;
    this.worker = null;
    this.base = null;
    this.baseToken = null;
    instance.terminate();
    const owed = [...this.requests.values()];
    this.requests.clear();
    for (const request of owed) request.reject(new HostStopped());
  }
  private post(instance: Worker, message: HostRequest): void {
    this.sending = this.sending
      .catch(() => {})
      .then(async () => {
        if (this.worker !== instance) return;
        await sendChunked(instance, message, () => this.worker !== instance);
      })
      .catch(() => this.stop(instance));
  }
  private receive(instance: Worker, response: HostResponse): void {
    if (this.worker !== instance) return;
    if (response.type === 'synced') return;
    if (response.type === 'sync-failed') {
      // The worker holds something else: the next sync sends the whole world.
      if (this.baseToken === response.token) {
        this.base = null;
        this.baseToken = null;
      }
      return;
    }
    const request = this.requests.get(response.requestId);
    if (!request) return;
    if (response.type === 'progress')
      request.handlers?.progress(response.completedWeeks, response.totalWeeks);
    else if (response.type === 'checkpoint') {
      const { type: _type, requestId: _id, ...checkpoint } = response;
      void [_type, _id];
      request.handlers?.checkpoint(checkpoint);
    } else if (response.type === 'error') {
      if (response.code === 'stale' && request.retry) {
        const retry = request.retry;
        request.retry = undefined;
        this.base = null;
        this.baseToken = null;
        retry();
        return;
      }
      if (response.code === 'simulation') {
        // A failed job may have half-changed the worker's world; it dropped it.
        this.base = null;
        this.baseToken = null;
      }
      this.requests.delete(response.requestId);
      request.reject(new Error(response.code === 'busy' ? 'busy' : 'simulation'));
    } else {
      this.requests.delete(response.requestId);
      if (response.type === 'result' && response.world) {
        // Until the tab adopts the decoded result, the worker's world has no tab object.
        this.base = null;
        this.baseToken = response.world.token;
      }
      request.resolve(response);
    }
  }
  /** Make the worker hold `world`, sending as little as possible; returns its token. */
  private sync(instance: Worker, world: World): number {
    if (this.base === world && this.baseToken !== null) return this.baseToken;
    const token = ++this.tokens;
    if (this.base && this.baseToken !== null) {
      const patches = diffWorld(this.base, world, {
        maxPatches: CONFIG.workers.maxSyncPatches,
        maxVisits: 2_000_000,
      });
      if (patches) {
        this.post(instance, { type: 'patch', from: this.baseToken, token, patches });
        this.base = world;
        this.baseToken = token;
        return token;
      }
    }
    this.post(instance, { type: 'sync', token, world });
    this.base = world;
    this.baseToken = token;
    return token;
  }
  /** The tab's object for the world a job left in the worker (decoded from its result). */
  adopt(world: World, token: number): void {
    if (this.baseToken === token) this.base = world;
  }
  /** Send the world ahead of the first job, when the browser is idle after a load. */
  prewarm(world: World): void {
    try {
      this.sync(this.ensure(), world);
    } catch {
      // Workers unavailable: the first job reports it.
    }
  }
  /**
   * Run a job on `world` (null for a new world). Resolves with the result, or rejects with
   * HostStopped when the worker stops, or with an Error naming the failure.
   */
  run(
    job: JobSpec,
    world: World | null,
    options: { checkpoints: boolean; handlers: JobHandlers },
  ): { requestId: string; done: Promise<JobResult> } {
    const instance = this.ensure();
    const requestId = `job-${++this.sequence}`;
    const resultToken = ++this.tokens;
    const send = () => {
      const token = world ? this.sync(instance, world) : null;
      this.post(instance, {
        type: 'job',
        requestId,
        job,
        token,
        resultToken,
        checkpoints: options.checkpoints,
      });
    };
    const done = new Promise<JobResult>((resolve, reject) => {
      this.requests.set(requestId, {
        resolve: (value) => resolve(value as JobResult),
        reject,
        handlers: options.handlers,
        retry: world ? send : undefined,
      });
    });
    send();
    return { requestId, done };
  }
  /** The world as bytes for a whole save, encoded in the worker. */
  encode(world: World): Promise<CheckpointBytes> {
    let instance: Worker;
    try {
      instance = this.ensure();
    } catch (error) {
      return Promise.reject(error);
    }
    const requestId = `encode-${++this.sequence}`;
    const send = () => {
      const token = this.sync(instance, world);
      this.post(instance, { type: 'encode', requestId, token });
    };
    const done = new Promise<CheckpointBytes>((resolve, reject) => {
      this.requests.set(requestId, {
        resolve: (value) => {
          const {
            type: _type,
            requestId: _id,
            ...bytes
          } = value as Extract<HostResponse, { type: 'encoded' }>;
          void [_type, _id];
          resolve(bytes);
        },
        reject,
        retry: send,
      });
    });
    send();
    return done;
  }
  acknowledge(requestId: string, checkpoint: number, committed: boolean): void {
    if (!this.worker) return;
    this.post(this.worker, {
      type: committed ? 'committed' : 'commit-failed',
      requestId,
      checkpoint,
    });
  }
  cancel(requestId: string): void {
    if (this.worker) this.post(this.worker, { type: 'cancel', requestId });
  }
  /** Stop the worker (another save loaded, or it stopped answering); memory is freed. */
  retire(): void {
    if (this.worker) this.stop(this.worker);
  }
  /** Whether the worker holds exactly this object (tests and diagnostics). */
  holds(world: World): boolean {
    return this.base === world && this.baseToken !== null;
  }
}

/** The tab's world worker. */
export const worldHost = new WorldHost(
  () => new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' }),
);
