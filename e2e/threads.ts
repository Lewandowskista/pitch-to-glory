import type { Browser, CDPSession, Page } from '@playwright/test';

/**
 * Honest phone measurements (docs/RELEASE-1.0-PLAN.md step 2.3, finding P2). Chromium's
 * `Emulation.setCPUThrottlingRate` slows only the page's main thread: the world and persistence
 * workers ran at full speed in the "phone" profile. These helpers
 *
 * - attach to every dedicated worker of the page (non-flattened auto-attach on the page's CDP
 *   session) and ask each for the same CPU throttling, recording whether Chromium applied it;
 * - sample the JavaScript heap of the page and every live worker, for a peak across threads;
 * - trace a step and split its CPU time between the main thread and the workers, so when a
 *   worker cannot be throttled its time can be reported separately and scaled.
 */
export type WorkerThrottling = 'applied' | 'unsupported' | 'no workers' | 'not requested';

export interface Workers {
  /** Whether Chromium throttled the workers attached so far. */
  throttling: () => WorkerThrottling;
  /** The summed heap of the page and every live worker, in bytes. */
  heap: () => Promise<number>;
  /** Live worker targets. */
  count: () => number;
}

/**
 * Attach to the page's workers, now and as they start, and throttle each by `rate` where
 * Chromium allows it (Chromium 153 with Playwright 1.63 refuses it for workers: "Operation is only supported
 * for pages, not workers").
 */
export async function attachWorkers(cdp: CDPSession, rate: number): Promise<Workers> {
  const sessions = new Set<string>();
  const pending = new Map<string, (message: { result?: unknown; error?: unknown }) => void>();
  let next = 1;
  let applied = 0;
  let refused = 0;
  const send = (sessionId: string, method: string, params: object = {}) =>
    new Promise<{ result?: unknown; error?: unknown }>((resolve) => {
      const id = next++;
      pending.set(`${sessionId}:${id}`, resolve);
      cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch((error: unknown) => {
          pending.delete(`${sessionId}:${id}`);
          resolve({ error });
        });
    });
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    const message = JSON.parse(event.message) as { id?: number; result?: unknown; error?: unknown };
    if (message.id === undefined || !event.sessionId) return;
    const key = `${event.sessionId}:${message.id}`;
    pending.get(key)?.(message);
    pending.delete(key);
  });
  cdp.on('Target.attachedToTarget', (event) => {
    if (event.targetInfo.type !== 'worker') return;
    sessions.add(event.sessionId);
    if (rate > 1)
      void send(event.sessionId, 'Emulation.setCPUThrottlingRate', { rate }).then((reply) => {
        if (reply.error) refused++;
        else applied++;
      });
  });
  cdp.on('Target.detachedFromTarget', (event) => {
    if (event.sessionId) sessions.delete(event.sessionId);
  });
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: false,
  });
  const heapOf = async (sessionId: string) => {
    const reply = await send(sessionId, 'Runtime.getHeapUsage');
    return (reply.result as { usedSize?: number } | undefined)?.usedSize ?? 0;
  };
  return {
    throttling: () =>
      rate <= 1 ? 'not requested' : refused ? 'unsupported' : applied ? 'applied' : 'no workers',
    heap: async () => {
      const page = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      const workers = await Promise.all([...sessions].map(heapOf));
      return page + workers.reduce((sum, value) => sum + value, 0);
    },
    count: () => sessions.size,
  };
}

/** Sample a value every `ms` until stopped; returns the largest seen. */
export function samplePeak(sample: () => Promise<number>, ms = 250) {
  let peak = 0;
  let running = true;
  const loop = (async () => {
    while (running) {
      peak = Math.max(peak, await sample().catch(() => 0));
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  })();
  return async () => {
    running = false;
    await loop;
    return peak;
  };
}

export interface ThreadTime {
  /** CPU time of the page's main thread (top-level tasks), in ms. */
  mainMs: number;
  /** CPU time of all dedicated workers together, and the longest single worker task. */
  workersMs: number;
  longestWorkerTaskMs: number;
  /** Distinct worker threads that ran. */
  workers: number;
}

/**
 * Trace `action` and split its CPU time by thread: top-level tasks on the renderer's main
 * thread and on dedicated worker threads.
 */
export async function traceThreads(
  browser: Browser,
  page: Page,
  action: () => Promise<void>,
): Promise<ThreadTime> {
  await browser.startTracing(page, { categories: ['toplevel', '__metadata'] });
  let buffer!: Buffer;
  try {
    await action();
  } finally {
    buffer = await browser.stopTracing();
  }
  return threadTime(JSON.parse(buffer.toString()) as TraceFile);
}

interface TraceEvent {
  ph: string;
  name: string;
  pid: number;
  tid: number;
  dur?: number;
  args?: { name?: string };
}
type TraceFile = { traceEvents: TraceEvent[] } | TraceEvent[];

export function threadTime(trace: TraceFile): ThreadTime {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const names = new Map<string, string>();
  for (const event of events)
    if (event.ph === 'M' && event.name === 'thread_name')
      names.set(`${event.pid}:${event.tid}`, event.args?.name ?? '');
  let mainMs = 0;
  let workersMs = 0;
  let longest = 0;
  const workers = new Set<string>();
  for (const event of events) {
    if (event.ph !== 'X' || event.name !== 'ThreadControllerImpl::RunTask') continue;
    const thread = `${event.pid}:${event.tid}`;
    const name = names.get(thread) ?? '';
    const ms = (event.dur ?? 0) / 1000;
    if (name === 'CrRendererMain') mainMs += ms;
    else if (name === 'DedicatedWorker thread') {
      workersMs += ms;
      longest = Math.max(longest, ms);
      workers.add(thread);
    }
  }
  return {
    mainMs: Math.round(mainMs),
    workersMs: Math.round(workersMs),
    longestWorkerTaskMs: Math.round(longest),
    workers: workers.size,
  };
}
