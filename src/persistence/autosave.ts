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
