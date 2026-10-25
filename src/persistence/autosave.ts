import { CONFIG } from '../engine/config';
export class AutosaveQueue {
  private pending: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly write: () => Promise<void>,
    private readonly delay: number = CONFIG.saves.autosaveDelayMs,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}
  schedule(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = undefined;
      void this.flush().catch(this.onError);
    }, this.delay);
  }
  flush(): Promise<void> {
    clearTimeout(this.pending);
    this.pending = undefined;
    this.queue = this.queue.catch(() => {}).then(this.write);
    return this.queue;
  }
  /**
   * Run another write in this queue (a world worker checkpoint), so writes to the slot never
   * interleave and each sees the revision the previous one left.
   */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => {}).then(task);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  afterMatch(): Promise<void> {
    return this.flush();
  }
  afterWeek(): Promise<void> {
    return this.flush();
  }
  async settle(): Promise<void> {
    clearTimeout(this.pending);
    this.pending = undefined;
    await this.queue.catch(() => {});
  }
  dispose(): void {
    clearTimeout(this.pending);
  }
}
