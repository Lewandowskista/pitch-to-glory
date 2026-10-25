import { useCallback, useEffect, useRef } from 'react';

/**
 * Real time a passage has been running on screen: it starts at zero for each new `key` and
 * counts only while `running` (not paused, not hidden), so a resumed match picks up where the
 * pitch stopped instead of starting the minute again.
 */
export function usePlayClock(key: unknown, running: boolean): () => number {
  const clock = useRef<{ key: unknown; elapsed: number; since: number | null }>({
    key,
    elapsed: 0,
    since: null,
  });
  useEffect(() => {
    if (clock.current.key !== key) clock.current = { key, elapsed: 0, since: null };
    if (!running) return;
    const current = clock.current;
    current.since = performance.now();
    return () => {
      if (current.since !== null) current.elapsed += performance.now() - current.since;
      current.since = null;
    };
  }, [key, running]);
  return useCallback(() => {
    const current = clock.current;
    return current.elapsed + (current.since !== null ? performance.now() - current.since : 0);
  }, []);
}
