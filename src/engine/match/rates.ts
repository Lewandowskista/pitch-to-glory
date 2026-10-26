/**
 * Expected goals, the share of each side's goals that passes through the player's moments, and
 * possession: from the strength model, personal tactics and the men each side is down.
 */
import type { Position } from '../../model/domain';
import { expectedGoals } from '../strength';
import {
  rules22,
  type MatchSetup,
  type MatchSession,
  type MatchState,
  type Tactics,
} from './types';
import { createRng } from '../rng';
import { MATCH_CONFIG as C } from './tuning';
import { roleEffect } from './roles';
import { clamp, round6, situationWeights } from './decisions';
import { menDown, selectedSide } from './shared';

const F = C.cards;

/** Strength-model expectations adjusted by personal tactics, rounded for stable replay. */
/**
 * Expected goals after personal tactics. Risk scales the whole game; mentality and attacking
 * roles scale the selected team's and the opposition's goals separately, so attacking brings
 * more goals at both ends rather than moving goals from one side to the other.
 */
export function rates(
  setup: MatchSetup,
  strength: [number, number],
  tactics: Tactics,
): [number, number] {
  const [home, away] = expectedGoals(strength[0], strength[1], setup.neutral);
  const risk = C.tactics.riskTotal[tactics.risk];
  const mentality: readonly [number, number] =
    tactics.mentality === 'attacking'
      ? C.tactics.mentality.attacking
      : tactics.mentality === 'defensive'
        ? C.tactics.mentality.defensive
        : [1, 1];
  const role = roleEffect(tactics.role).totals ?? [1, 1];
  const own = selectedSide(setup);
  const factors: [number, number] = [1, 1];
  factors[own] = mentality[0] * role[0];
  factors[1 - own] = mentality[1] * role[1];
  return [round6(home * risk * factors[0]!), round6(away * risk * factors[1]!)];
}
/**
 * Expected goals for the game as it stands: personal tactics, and the men each side is down
 * (match-16). A side a man short scores × (1 − attack) per man (at least the floor), and
 * concedes × (1 + concede) per man the other side is up.
 */
export function currentRates(session: MatchSession, tactics: Tactics): [number, number] {
  const s = session.state;
  const base = rallied(session, rates(session.setup, s.strength, tactics));
  const [home, away] = menDown(s.match);
  if (!home && !away) return base;
  const M = F.menDown;
  const scale = (own: number, other: number) =>
    Math.max(M.attackFloor, 1 - own * M.attack) * (1 + other * M.concede);
  return [round6(base[0] * scale(home, away)), round6(base[1] * scale(away, home))];
}
/**
 * A side the substituted career player rallied as they went off (match-22, step 5.4): its
 * expected goals × `rally.own`, the opposition's × `rally.against`, for the rest of the match.
 */
function rallied(session: MatchSession, base: [number, number]): [number, number] {
  if (!session.state.rally) return base;
  const R = C.occasions.touchline.substitution.rally;
  const own = selectedSide(session.setup);
  const scaled: [number, number] = [base[0], base[1]];
  scaled[own] = round6(base[own]! * R.own);
  scaled[1 - own] = round6(base[1 - own]! * R.against);
  return scaled;
}
export function shares(position: Position, role: string): MatchState['shares'] {
  const [attack, base] = C.shares[position];
  // Decisive defending (match-20): the back line's moments carry more of the opposition's goals.
  // Screening (match-21) raises a defensive midfielder's further.
  const multiplier = C.defending.screening.share[position] ?? C.defending.share[position] ?? 1;
  const defence = round6(Math.min(C.defending.maximum, base * multiplier));
  const weights = situationWeights(position, role);
  // A set-piece taker (engine match-12) carries more of the team's attack: set pieces add to
  // the open-play moments rather than taking from them, and the background plays less.
  const mass = (pool: typeof weights) =>
    pool.reduce((sum, w) => sum + w.weight * w.situation.attackWeight, 0);
  const open = mass(weights);
  const setPieces = open ? mass(situationWeights(position, role, { drama: true })) / open : 1;
  return {
    attack: weights.some((w) => w.situation.attackWeight > 0)
      ? round6(attack * Math.min(C.drama.setPieceShareCap, setPieces))
      : 0,
    defence: weights.some((w) => w.situation.defenceWeight > 0) ? defence : 0,
  };
}
function possessionBase(setup: MatchSetup, state: Pick<MatchState, 'strength'>, tactics: Tactics) {
  const mentality =
    (tactics.mentality === 'attacking' ? 1 : tactics.mentality === 'defensive' ? -1 : 0) *
    C.possession.mentality *
    (selectedSide(setup) === 0 ? 1 : -1);
  return 50 + (state.strength[0] - state.strength[1]) * C.possession.strengthSlope + mentality;
}
/**
 * Match-22's further possession terms (step 5.3): home advantage, both sides' playing styles,
 * the game plan of the day (a triangular draw on its own stream, the same every minute) and
 * the score, a side ahead sitting deeper.
 */
function possession22(session: MatchSession): number {
  const P = C.possession22,
    setup = session.setup;
  const style = (club: { playingStyle: string }) => P.styles[club.playingStyle] ?? 0;
  const draw = createRng(`${setup.seed}:possession`);
  const plan = (draw.next() + draw.next() - 1) * P.spread;
  const [home, away] = session.state.match.score;
  const lead = clamp(home! - away!, -P.leadCap, P.leadCap) * P.lead;
  return (setup.neutral ? 0 : P.home) + style(setup.home) - style(setup.away) + plan - lead;
}
export function updatePossession(session: MatchSession): void {
  const s = session.state;
  // A side down to ten men (match-16) sees less of the ball.
  const [home, away] = menDown(s.match);
  const short = home || away ? (away - home) * F.menDown.possession : 0;
  const latest = rules22(session.setup);
  const bounds = latest ? C.possession22 : C.possession;
  s.stats.homePossession = Math.round(
    clamp(
      possessionBase(session.setup, s, s.match.tactics) +
        short +
        (s.match.momentum - 50) * C.possession.momentum +
        (latest ? possession22(session) : 0),
      bounds.minimum,
      bounds.maximum,
    ),
  );
}
