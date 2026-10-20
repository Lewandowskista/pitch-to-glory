import type { BookingRisk, Lineup, Player, ProbabilityFactor } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { CONFIG } from '../config';

/**
 * Discipline and the managers' substitutions (engine match-15, redesign step M7; full
 * discipline from match-16, the discipline phase).
 *
 * On match-15 yellow cards are cosmetic (decision 5): drawn on their own stream, they never move
 * an outcome roll and change nobody's strength, and nobody is booked twice. Match-16 draws its
 * cards on `${seed}:cards:${minute}` with second yellows and straight reds (`cardsOfMinute`),
 * the same draw the background world uses (`drawCard`), and gives defending choices a booking
 * risk (`bookingRisk`). AI substitutions follow a plan drawn once per match on
 * `${seed}:ai-subs`, and who comes off is drawn at the minute, so a replay makes the same changes.
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

const F = CONFIG.match.cards;
const B = CONFIG.match.booking;

/** A player's weight for a card: the cosmetic cards' formula. */
export function cardWeight(player: Pick<Player, 'attributes'>): number {
  return (
    D.base + player.attributes.aggression * D.aggression + player.attributes.tackling * D.tackling
  );
}
/** The chance that a card shown to this player is a straight red. */
export function straightRedChance(player: Pick<Player, 'attributes'>): number {
  return Math.max(
    0,
    F.straightRed * (1 + (player.attributes.aggression - 50) * F.straightAggression),
  );
}
/** One card shown: to whom, and what it means for a player who may already be booked. */
export interface Card {
  side: 0 | 1;
  playerId: string;
  card: 'yellow' | 'second-yellow' | 'red';
}
/**
 * One side's card draw (match-16 and the background world): with `chance`, a card for an
 * outfielder in `pool`, weighted by aggression and tackling (a booked player more careful),
 * a straight red by aggression, else a yellow or, for a booked player, a second yellow. Always
 * three draws, so the stream never shifts.
 */
export function drawCard(
  rng: Rng,
  chance: number,
  pool: readonly string[],
  players: Readonly<Record<string, Pick<Player, 'attributes'>>>,
  booked: ReadonlySet<string>,
  /** A player whose weight is scaled (the selected player, whose moments carry their own risk). */
  scaled?: { id: string; factor: number },
): { playerId: string; card: Card['card'] } | null {
  const happens = rng.next(),
    who = rng.next(),
    red = rng.next();
  if (happens >= chance || !pool.length) return null;
  const id = weighted(
    pool,
    (candidate) =>
      cardWeight(players[candidate]!) *
      (booked.has(candidate) ? F.bookedCaution : 1) *
      (candidate === scaled?.id ? scaled.factor : 1),
    who,
  )!;
  const card =
    red < straightRedChance(players[id]!) ? 'red' : booked.has(id) ? 'second-yellow' : 'yellow';
  return { playerId: id, card };
}
/**
 * The cards of a minute on the current engine (match-16), drawn at the start of the minute on
 * `${seed}:cards:${minute}`: for each side, among its outfielders on the pitch (not sent off),
 * three draws whatever happens. A side already down `maxDismissals` men gets no more reds: the
 * card is not shown.
 */
export function cardsOfMinute(
  seed: string,
  minute: number,
  lineups: readonly [Lineup, Lineup],
  players: Readonly<Record<string, Player>>,
  booked: ReadonlySet<string>,
  scaled?: { id: string; factor: number },
): Card[] {
  const rng = createRng(`${seed}:cards:${minute}`);
  const cards: Card[] = [];
  for (const side of [0, 1] as const) {
    const team = lineups[side];
    const off = new Set(team.sentOffIds ?? []);
    const pool = team.starterIds.filter(
      (id) => !off.has(id) && players[id] && players[id].primaryPosition !== 'GK',
    );
    const drawn = drawCard(rng, F.perTeamPerMinute, pool, players, booked, scaled);
    if (!drawn) continue;
    if (drawn.card !== 'yellow' && off.size >= F.maxDismissals) continue;
    cards.push({ side, ...drawn });
  }
  return cards;
}
/**
 * A defending choice's booking risk (match-16): the chance a failed attempt is a foul worth a
 * card, as a base for the choice moved by aggression and tackling (and care once booked), each
 * shown as a factor that adds up to it; the share of straight reds; and the resulting chances
 * of a yellow and a red when the choice succeeds with `probability`.
 */
export function bookingRisk(
  choiceId: string,
  player: Pick<Player, 'attributes'>,
  probability: number,
  booked: boolean,
): BookingRisk | null {
  const entry = B.choices[choiceId];
  if (!entry) return null;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const a = player.attributes;
  const steps: [string, number][] = [
    ['match.booking.aggression', 1 + (a.aggression - 50) * B.aggression],
    ['match.booking.tackling', 1 - (a.tackling - 50) * B.tackling],
    ...(booked ? ([['match.booking.booked', B.booked]] as [string, number][]) : []),
  ];
  let current = round(entry.foul);
  const factors: ProbabilityFactor[] = [
    { labelKey: 'match.booking.base', source: 'attribute', contribution: current },
  ];
  for (const [labelKey, multiplier] of steps) {
    const next = round(current * multiplier);
    factors.push({ labelKey, source: 'attribute', contribution: round(next - current) });
    current = next;
  }
  const foul = round(Math.max(B.minimum, Math.min(B.maximum, current)));
  if (foul !== current)
    factors.push({
      labelKey: 'match.factor.limit',
      source: 'attribute',
      contribution: round(foul - current),
    });
  const fail = 1 - probability;
  return {
    foul,
    straight: entry.straight,
    yellow: booked ? 0 : round(fail * foul * (1 - entry.straight)),
    red: round(fail * foul * (booked ? 1 : entry.straight)),
    booked,
    factors,
  };
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
