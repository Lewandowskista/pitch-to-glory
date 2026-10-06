import type { RngState } from '../model/domain';

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(values: readonly T[]): T;
  snapshot(): RngState;
  fork(scope: string): Rng;
}

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function stream(seed: string, initialState: number, initialDraws = 0): Rng {
  let state = initialState;
  let draws = initialDraws;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    draws++;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => {
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      max < min ||
      max - min >= 4294967296
    )
      throw new RangeError('Invalid RNG integer range');
    // Rejection sampling avoids modulo bias even for uneven integer ranges.
    const range = max - min + 1;
    const limit = Math.floor(4294967296 / range) * range;
    let value: number;
    do {
      value = Math.floor(next() * 4294967296);
    } while (value >= limit);
    return min + (value % range);
  };
  return {
    next,
    int,
    pick: <T>(values: readonly T[]) => {
      if (!values.length) throw new RangeError('Cannot pick from an empty array');
      return values[int(0, values.length - 1)]!;
    },
    snapshot: () => ({ algorithm: 'mulberry32', seed, state, draws }),
    fork: (scope) => createRng(`${seed}::${scope}`),
  };
}

export function createRng(seed: string | number): Rng {
  if (typeof seed === 'number' && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff))
    throw new RangeError('Invalid numeric seed');
  return stream(String(seed), typeof seed === 'number' ? seed >>> 0 : hashSeed(seed));
}
export function restoreRng(snapshot: RngState): Rng {
  if (
    snapshot.algorithm !== 'mulberry32' ||
    typeof snapshot.seed !== 'string' ||
    !Number.isInteger(snapshot.state) ||
    snapshot.state < 0 ||
    snapshot.state > 0xffffffff ||
    !Number.isSafeInteger(snapshot.draws) ||
    snapshot.draws < 0
  )
    throw new RangeError('Invalid RNG snapshot');
  return stream(snapshot.seed, snapshot.state, snapshot.draws);
}
