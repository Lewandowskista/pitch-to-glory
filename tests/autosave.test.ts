import { describe, expect, it, vi } from 'vitest';
import { AutosaveQueue } from '../src/persistence/autosave';
describe('autosave coordinator', () => {
  it('debounces edits and flushes a week or match boundary immediately', async () => {
    vi.useFakeTimers();
    let writes = 0;
    const queue = new AutosaveQueue(async () => {
      writes++;
    }, 50);
    queue.schedule();
    queue.schedule();
    queue.schedule();
    await vi.advanceTimersByTimeAsync(49);
    expect(writes).toBe(0);
    await queue.afterWeek();
    expect(writes).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toBe(1);
    await queue.afterMatch();
    expect(writes).toBe(2);
    queue.dispose();
    vi.useRealTimers();
  });
  it('serializes writes and remains retryable after a rejected write', async () => {
    let running = 0;
    let peak = 0;
    let calls = 0;
    const queue = new AutosaveQueue(async () => {
      running++;
      peak = Math.max(peak, running);
      calls++;
      await Promise.resolve();
      running--;
      if (calls === 1) throw new Error('disk full');
    });
    await expect(queue.flush()).rejects.toThrow('disk full');
    await Promise.all([queue.flush(), queue.flush()]);
    expect(peak).toBe(1);
    expect(calls).toBe(3);
    queue.dispose();
  });
});
