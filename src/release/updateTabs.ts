import { BUSY_REASONS, type BusyReason } from './busy';

/**
 * Updating with several tabs open (release 1.0 step 4.1, review S2). Activating a new service
 * worker deletes the old version's files, so a tab still running the old code must reload too,
 * and only when nothing would be lost. Before the update, the tab that asks for it polls every
 * other tab over a BroadcastChannel: each writes its pending autosave and answers with what
 * still holds it (a season being simulated, an unsaved world…) and where it is. The update goes
 * ahead only when every tab that answered is free; once the new version is active, every tab is
 * asked to reload, which each does only when it is safe.
 *
 *   asker                      every other tab
 *   query {id}           →
 *                        ←     ack {id, page}           (at once)
 *                        ←     status {id, busy, page}  (after flushing its autosave)
 *   reload               →     reloads when safe
 *
 * A tab that does not acknowledge within `ackMs` is not counted (a frozen or discarded tab
 * reloads when it is next shown); one that acknowledges but does not answer within `statusMs`
 * holds the update as `unresponsive`.
 */
export const UPDATE_CHANNEL = 'pitch-to-glory:update';

/** A tab that holds the update, and why. */
export interface Blocker {
  busy: BusyReason;
  page: string;
}
type Message =
  | { type: 'query'; id: string; from: string }
  | { type: 'ack'; id: string; from: string; to: string; page: string }
  | {
      type: 'status';
      id: string;
      from: string;
      to: string;
      busy: BusyReason | null;
      page: string;
    }
  | { type: 'reload'; from: string };
/** The part of BroadcastChannel this uses (a fake in tests). */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}
export interface UpdateTabsOptions {
  /** This tab's id, unique among open tabs. */
  tabId: string;
  /** The channel, or null where the browser has none (then there is nobody to ask). */
  channel: ChannelLike | null;
  /** Write this tab's pending autosave, then say what still holds it (null: free to reload). */
  prepare: () => Promise<BusyReason | null>;
  /** Where this tab is, as its page title says ("Matchday"), to name it to the asker. */
  page: () => string;
  /** Another tab activated the update: reload when safe. */
  onReload: () => void;
  ackMs?: number;
  statusMs?: number;
  /** Timers (fake ones in tests). */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}
const isMessage = (data: unknown): data is Message => {
  if (!data || typeof data !== 'object') return false;
  const message = data as Record<string, unknown>;
  if (typeof message.from !== 'string') return false;
  switch (message.type) {
    case 'reload':
      return true;
    case 'query':
      return typeof message.id === 'string';
    case 'ack':
      return typeof message.id === 'string' && typeof message.to === 'string';
    case 'status':
      return (
        typeof message.id === 'string' &&
        typeof message.to === 'string' &&
        (message.busy === null || BUSY_REASONS.includes(message.busy as BusyReason))
      );
    default:
      return false;
  }
};
const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 80) : '');

export class UpdateTabs {
  private readonly ackMs: number;
  private readonly statusMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly polls = new Map<string, (message: Message) => void>();
  private sequence = 0;
  constructor(private readonly options: UpdateTabsOptions) {
    this.ackMs = options.ackMs ?? 400;
    this.statusMs = options.statusMs ?? 15_000;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer =
      options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    options.channel?.addEventListener('message', this.receive);
  }
  private readonly receive = (event: { data: unknown }) => {
    const message = event.data;
    if (!isMessage(message) || message.from === this.options.tabId) return;
    if (message.type === 'reload') {
      this.options.onReload();
      return;
    }
    if (message.type === 'query') {
      void this.answer(message.id, message.from);
      return;
    }
    if (message.to !== this.options.tabId) return;
    this.polls.get(message.id)?.(message);
  };
  private async answer(id: string, to: string): Promise<void> {
    const from = this.options.tabId;
    const channel = this.options.channel;
    const page = text(this.options.page());
    // At once, so the asker waits for this tab and can name it even if it never finishes.
    channel?.postMessage({ type: 'ack', id, from, to, page } satisfies Message);
    let busy: BusyReason | null;
    try {
      busy = await this.options.prepare();
    } catch {
      busy = 'unsaved-changes';
    }
    channel?.postMessage({
      type: 'status',
      id,
      from,
      to,
      busy,
      page: text(this.options.page()),
    } satisfies Message);
  }
  /**
   * Ask every other tab to save and say whether it can reload: the first tab that cannot, or
   * null when every tab that answered is free (or there is no other tab).
   */
  poll(): Promise<Blocker | null> {
    const channel = this.options.channel;
    if (!channel) return Promise.resolve(null);
    const id = `${this.options.tabId}:${++this.sequence}`;
    return new Promise<Blocker | null>((resolve) => {
      const waiting = new Map<string, string>();
      let acking = true;
      let done = false;
      const timers: unknown[] = [];
      const finish = (result: Blocker | null) => {
        if (done) return;
        done = true;
        this.polls.delete(id);
        for (const timer of timers) this.clearTimer(timer);
        resolve(result);
      };
      const settleIfAnswered = () => {
        if (!acking && waiting.size === 0) finish(null);
      };
      this.polls.set(id, (message) => {
        if (message.type === 'ack') {
          if (acking) waiting.set(message.from, text(message.page));
          return;
        }
        if (message.type !== 'status' || !waiting.has(message.from)) return;
        waiting.delete(message.from);
        if (message.busy) finish({ busy: message.busy, page: text(message.page) });
        else settleIfAnswered();
      });
      timers.push(
        this.setTimer(() => {
          acking = false;
          settleIfAnswered();
        }, this.ackMs),
        this.setTimer(() => {
          const [page] = [...waiting.values()];
          if (page !== undefined) finish({ busy: 'unresponsive', page });
          else finish(null);
        }, this.statusMs),
      );
      channel.postMessage({ type: 'query', id, from: this.options.tabId } satisfies Message);
    });
  }
  /** The new version is active: ask every other tab to reload when it safely can. */
  announceReload(): void {
    this.options.channel?.postMessage({ type: 'reload', from: this.options.tabId } as Message);
  }
  close(): void {
    this.options.channel?.removeEventListener('message', this.receive);
    this.options.channel?.close();
  }
}
