/**
 * What a validator reads (release 1.0 step 4.9): wraps a world in proxies that record, for
 * every manifest path (`src/persistence/coverage.ts`), the fields read there. Only objects on
 * a manifest's path are wrapped, so the rest of the world validates at full speed.
 */
import type { CoverageManifest } from '../../src/persistence/coverage';

const segments = (path: string) => (path ? path.split('.') : []);

export interface Recording<T> {
  /** The world to validate in place of the original. */
  value: T;
  /** Fields read, by manifest path (`players.*`). */
  reads: Map<string, Set<string>>;
}
export function recordReads<T extends object>(
  root: T,
  manifests: readonly CoverageManifest[],
): Recording<T> {
  const patterns = manifests.map((manifest) => segments(manifest.path));
  const reads = new Map<string, Set<string>>();
  /** The pattern segment a child takes: its key, `*`, or null when no manifest lies below. */
  const child = (parent: string[], key: string): string | null => {
    let star = false;
    for (const pattern of patterns) {
      if (pattern.length <= parent.length) continue;
      if (!parent.every((segment, index) => pattern[index] === segment)) continue;
      const next = pattern[parent.length];
      if (next === key) return key;
      if (next === '*') star = true;
    }
    return star ? '*' : null;
  };
  const wrap = (value: unknown, path: string[]): unknown => {
    if (value === null || typeof value !== 'object') return value;
    const name = path.join('.');
    return new Proxy(value, {
      get(target, key, receiver) {
        const result: unknown = Reflect.get(target, key, receiver);
        if (typeof key !== 'string') return result;
        let seen = reads.get(name);
        if (!seen) reads.set(name, (seen = new Set()));
        seen.add(key);
        const next = child(path, key);
        return next === null ? result : wrap(result, [...path, next]);
      },
    });
  };
  return { value: wrap(root, []) as T, reads };
}
/** Every object at a manifest path in a world (`*` over a record's values or an array). */
export function objectsAt(root: unknown, path: string): Record<string, unknown>[] {
  let current: unknown[] = [root];
  for (const segment of segments(path)) {
    const next: unknown[] = [];
    for (const value of current) {
      if (value === null || typeof value !== 'object') continue;
      if (segment === '*') next.push(...Object.values(value));
      else next.push((value as Record<string, unknown>)[segment]);
    }
    current = next;
  }
  return current.filter(
    (value): value is Record<string, unknown> =>
      value !== null && typeof value === 'object' && !Array.isArray(value),
  );
}
