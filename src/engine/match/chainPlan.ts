/**
 * Planning a match's decision chains (engine match-22, release 1.0 X1a): how many, and the hero
 * beat's minute. Kept apart from the chains themselves (chains.ts), which load once the match
 * screen is up (`loadChains`): a session is created before then.
 */
import type { Position } from '../../model/domain';
import type { Rng } from '../rng';
import { MATCH_CONFIG as C } from './tuning';

const K = C.chains;

/**
 * Chains in a match for the position played: the position's range (`chains.counts`), its ends
 * with `chains.extreme` each, and one more in a big match. One draw, always.
 */
export function chainCount(position: Position, rng: Rng, importance: number): number {
  const [low, high] = K.counts[position] ?? [5, 5];
  const roll = rng.next();
  const count =
    low === high
      ? low
      : high - low === 1
        ? roll < 0.5
          ? low
          : high
        : roll < K.extreme
          ? low
          : roll >= 1 - K.extreme
            ? high
            : Math.round((low + high) / 2);
  return count + (importance >= K.bigMatch ? 1 : 0);
}
/**
 * The hero beat's chain: the planned minute (the late one aside) nearest the middle of the
 * hero's window, moved into it when it falls outside (keeping the minutes in order). Returns the
 * minutes and the hero's minute.
 */
export function placeHero(minutes: readonly number[]): { minutes: number[]; hero?: number } {
  const out = [...minutes];
  if (out.length < 2) return { minutes: out };
  const middle = (K.hero.from + K.hero.to) / 2;
  let index = 0;
  for (let i = 1; i < out.length - 1; i++)
    if (Math.abs(out[i]! - middle) < Math.abs(out[index]! - middle)) index = i;
  const low = Math.max(K.hero.from, (out[index - 1] ?? 0) + 1);
  const high = Math.min(K.hero.to, out[index + 1]! - 1);
  if (low <= high) out[index] = Math.min(high, Math.max(low, out[index]!));
  return { minutes: out, hero: out[index] };
}
