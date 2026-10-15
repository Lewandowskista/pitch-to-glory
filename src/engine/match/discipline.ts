import type { Lineup, Player } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { CONFIG } from '../config';

/**
 * Discipline and the managers' substitutions (engine match-15, redesign step M7).
 *
 * Yellow cards are cosmetic for now (decision 5): they are drawn on their own stream, never move
 * an outcome roll and change nobody's strength, and nobody is booked twice (no second yellows or
 * reds yet). AI substitutions follow a plan drawn once per match on `${seed}:ai-subs`, and who
 * comes off is drawn at the minute, so a replay makes the same changes.
 */
const D = CONFIG.match.discipline;
const S = CONFIG.match.aiSubstitutions;

/** A weighted pick: the first id whose cumulative weight passes `roll × total`. */
function weighted(ids: readonly string[], weight: (id: string) => number, roll: number) {
  const weights = ids.map(weight);
  let target = roll * weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < ids.length; i++) {
    target -= weights[i]!;
    if (target < 0) return ids[i];
  }
  return ids[ids.length - 1];
}

/**
 * The yellow cards of a minute: each side is booked with probability `perTeamPerMinute`, and
 * the player is drawn among its outfielders on the pitch not yet booked, weighted by
 * aggression and tackling. Two draws a side every minute, so the stream never shifts.
 */
export function bookings(
  seed: string,
  minute: number,
  lineups: readonly [Lineup, Lineup],
  players: Readonly<Record<string, Player>>,
  booked: ReadonlySet<string>,
): { side: 0 | 1; playerId: string }[] {
  const rng = createRng(`${seed}:discipline:${minute}`);
  const cards: { side: 0 | 1; playerId: string }[] = [];
  for (const side of [0, 1] as const) {
    const booking = rng.next(),
      who = rng.next();
    if (booking >= D.perTeamPerMinute) continue;
    const pool = lineups[side].starterIds.filter(
      (id) => !booked.has(id) && players[id] && players[id].primaryPosition !== 'GK',
    );
    const id = weighted(
      pool,
      (candidate) => {
        const a = players[candidate]!.attributes;
        return D.base + a.aggression * D.aggression + a.tackling * D.tackling;
      },
      who,
    );
    if (id) cards.push({ side, playerId: id });
  }
  return cards;
}

/**
 * Each manager's substitution minutes, from `${seed}:ai-subs`: how many changes (by the
 * configured distribution, at most the side's limit) and when, between `from` and `to`.
 */
export function substitutionPlan(seed: string, limits: readonly [number, number]): number[][] {
  const rng = createRng(`${seed}:ai-subs`);
  return [0, 1].map((side) => {
    const roll = rng.next();
    let count = 0,
      cumulative = 0;
    for (const [n, weight] of S.counts) {
      cumulative += weight;
      if (roll < cumulative) {
        count = n;
        break;
      }
    }
    const minutes: number[] = [];
    for (let i = 0; i < S.counts[S.counts.length - 1]![0]; i++) {
      const minute = rng.int(S.from, S.to);
      if (i < Math.min(count, limits[side]!)) minutes.push(minute);
    }
    return minutes.sort((a, b) => a - b);
  });
}

/**
 * Who a manager takes off: an outfielder who started (never the career player, the keeper or
 * someone who came on), the tired, the unfit and the out-of-form most likely.
 */
export function substitutionOff(
  rng: Rng,
  candidates: readonly string[],
  players: Readonly<Record<string, Player>>,
): string | undefined {
  return weighted(
    candidates,
    (id) => {
      const p = players[id]!;
      return (
        1 +
        Math.max(0, p.fatigue) * S.fatigue +
        Math.max(0, S.staminaFrom - p.attributes.stamina) * S.stamina +
        Math.max(0, S.formFrom - p.form) * S.form
      );
    },
    rng.next(),
  );
}
