import { describe, expect, it } from 'vitest';
import { createRng, restoreRng } from '../src/engine/rng';

describe('seedable RNG', () => {
  it('matches the mulberry32 reference stream for numeric seed 1', () => {
    const rng = createRng(1);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
  });
  it('reproduces text seeds and distinguishes different seeds', () => {
    const a = createRng('glory');
    const b = createRng('glory');
    const c = createRng('other');
    const values = Array.from({ length: 100 }, () => a.next());
    expect(values).toEqual(Array.from({ length: 100 }, () => b.next()));
    expect(values).not.toEqual(Array.from({ length: 100 }, () => c.next()));
  });
  it('resumes exactly from a JSON state snapshot', () => {
    const rng = createRng('resume');
    Array.from({ length: 71 }, () => rng.next());
    const restored = restoreRng(JSON.parse(JSON.stringify(rng.snapshot())));
    expect(restored.snapshot().draws).toBe(71);
    expect(Array.from({ length: 100 }, () => restored.next())).toEqual(
      Array.from({ length: 100 }, () => rng.next()),
    );
  });
  it('keeps draws and inclusive integers in range without bias', () => {
    const rng = createRng('distribution');
    const buckets = [0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i < 20000; i++) {
      const draw = rng.next();
      total += draw;
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThan(1);
      const n = rng.int(0, 3);
      buckets[n] = (buckets[n] ?? 0) + 1;
    }
    expect(total / 20000).toBeCloseTo(0.5, 1);
    for (const count of buckets) expect(count).toBeGreaterThan(4500);
    expect(rng.int(5, 5)).toBe(5);
  });
  it('rejects invalid ranges, empty choices and invalid restore states', () => {
    const rng = createRng('bad');
    expect(() => rng.int(4, 3)).toThrow();
    expect(() => rng.int(0.5, 4)).toThrow();
    expect(() => rng.pick([])).toThrow();
    expect(() => restoreRng({ algorithm: 'mulberry32', seed: '', state: -1, draws: 0 })).toThrow();
  });
  it('scopes forks independently from the parent draw counter', () => {
    const rng = createRng('parent');
    const a = rng.fork('crest');
    rng.next();
    rng.next();
    expect(a.next()).toBe(rng.fork('crest').next());
    expect(rng.fork('crest').next()).not.toBe(rng.fork('avatar').next());
  });
});
