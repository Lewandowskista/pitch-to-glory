/**
 * Touchline decisions with trade-offs (match-22, release 1.0 step 5.4; review M13). Each answer
 * has a context where it is the best one, and the engine says why:
 *
 * - Half-time. Motivating lifts momentum most when behind and little when ahead. Asking for a
 *   role (the player picks it) can be refused: less often with the manager's trust, more often
 *   when the request runs against the score. Demanding the ball puts more of the second half
 *   through the player at a cost in trust that a good first half makes small. On the bench,
 *   the player can lift the side or ask to come on.
 * - The captain's call comes at the second half's start, after conceding and late in a close
 *   game, a few times at most.
 * - Substituted, accepting earns the manager's trust; rallying the side as you go off lifts its
 *   momentum instead.
 */
import { createRng } from '../rng';
import type { MatchCommand, MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { halftimeRole, isRoleFor, roleEffect, rolesForPosition } from './roles';
import { clamp, round6 } from './decisions';
import { currentRates, shares } from './rates';
import { changesLeft } from './bench';
import { offPitch, onBench, rolePosition, selectedSide } from './shared';

const T = C.occasions.touchline;

/** The score from the career player's side: goals for less against. */
export const ownMargin = (session: MatchSession) => {
  const side = selectedSide(session.setup),
    score = session.state.match.score;
  return score[side]! - score[1 - side]!;
};

/** Roles that ask for more of the attack, and roles that ask for more caution. */
const BOLD = new Set(['push-forward', 'cut-inside', 'run-behind', 'sweeper-keeper']);
const CAUTIOUS = new Set(['hold-position', 'track-back', 'shot-stopper', 'safe-distribution']);
const bold = (role: string) => BOLD.has(role) || (roleEffect(role).totals?.[0] ?? 1) > 1;

/**
 * The chance the manager refuses a half-time role request: `base` − (trust − 50) × `trust`,
 * plus `against` when it runs against the score, within the bounds.
 */
export function roleRefusal(session: MatchSession, role: string): number {
  const R = T.role;
  const against = roleAgainstScore(session, role);
  return round6(
    clamp(
      R.base - ((session.setup.trust ?? 50) - 50) * R.trust + (against ? R.against : 0),
      R.minimum,
      R.maximum,
    ),
  );
}
/** A role request that runs against the score: more attack when ahead, caution when behind. */
export function roleAgainstScore(session: MatchSession, role: string): boolean {
  const margin = ownMargin(session);
  return (margin > 0 && bold(role)) || (margin < 0 && CAUTIOUS.has(role));
}
/** The roles the player may ask for at half-time: their position's, but the current one. */
export function requestableRoles(session: MatchSession): string[] {
  const current = session.state.match.tactics.role;
  return rolesForPosition(rolePosition(session.setup)).filter((role) => role !== current);
}

/** The trust a demand for the ball costs, by the first half's rating. */
export function demandTrust(rating: number): number {
  const D = T.demand;
  return rating >= D.rating ? D.earned : rating < D.poorRating ? D.poor : D.trust;
}
/** The momentum a motivating talk adds for the player's side, by the score. */
export function motivateLift(session: MatchSession): number {
  const M = T.motivate;
  const margin = ownMargin(session);
  const player = session.setup.players[session.setup.selectedPlayerId]!;
  const factor = margin < 0 ? M.behind : margin === 0 ? M.level : M.ahead;
  const leader = player.traits.includes('leader') ? C.decision.talk.leaderBonus : 1;
  return round6(M.momentum * factor * leader * (onBench(session.state) ? T.bench.momentum : 1));
}

/** The half-time talk (match-22). */
export function halftimeTalk(
  next: MatchSession,
  command: Extract<MatchCommand, { type: 'halftime' }>,
): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const side = selectedSide(setup);
  const benched = onBench(s);
  const push = (lift: number) => {
    m.momentum = clamp(
      m.momentum + (side === 0 ? lift : -lift),
      C.momentum.minimum,
      C.momentum.maximum,
    );
  };
  if (command.response === 'motivate') {
    push(motivateLift(next));
    s.managerTrustDelta = T.motivate.trust;
    s.talkOdds = benched ? 1 : ownMargin(next) > 0 ? T.motivate.oddsAhead : T.motivate.odds;
  } else if (command.response === 'complain') {
    if (benched) {
      // On the bench: ask to come on.
      s.bench = { ...s.bench, asked: true };
      s.managerTrustDelta = C.occasions.bench.askTrust;
      s.talkOdds = 1;
    } else {
      s.managerTrustDelta = demandTrust(s.stats.rating);
      s.talkOdds = 1;
      s.shares = {
        ...s.shares,
        attack: round6(
          Math.min(C.decision.talk.demand.maximum, s.shares.attack * C.decision.talk.demand.share),
        ),
      };
    }
  } else {
    if (benched) throw new Error('No role to ask for on the bench');
    const position = rolePosition(setup);
    const role = command.role ?? halftimeRole(position, m.tactics.role);
    if (!isRoleFor(position, role) || role === m.tactics.role)
      throw new Error('Invalid halftime role');
    const refusal = roleRefusal(next, role);
    const roll = createRng(`${setup.seed}:halftime:role`).next();
    const granted = roll >= refusal;
    s.roleRequest = { role, refusal, roll, granted };
    if (granted) {
      m.tactics.role = role;
      s.expectedGoals = currentRates(next, m.tactics);
      s.shares = shares(position, role);
      s.managerTrustDelta = 0;
      s.talkOdds = 1;
    } else {
      s.managerTrustDelta = T.role.refusedTrust;
      s.talkOdds = T.role.refusedOdds;
    }
  }
}

/** Whether the captain's call can be asked for now: on the pitch, calls left, a gap since. */
function captainCanCall(session: MatchSession): boolean {
  const s = session.state;
  const calls = s.captainCalls ?? [];
  const last = calls[calls.length - 1];
  return (
    s.captain &&
    !offPitch(s) &&
    !s.captainDecisionPending &&
    calls.length < T.captain.maximum &&
    (last === undefined || s.match.minute - last >= T.captain.gap)
  );
}
/** Ask for the captain's call (the second half's start, a goal conceded, late on). */
export function askCaptain(session: MatchSession): void {
  if (!captainCanCall(session)) return;
  const s = session.state;
  s.captainDecisionPending = true;
  s.captainCalls = [...(s.captainCalls ?? []), s.match.minute];
}
/**
 * After a minute (match-22): a goal conceded in it, or the late minute of a close game, asks
 * for the captain's call, not after the last minutes.
 */
export function captainAfterMinute(session: MatchSession): void {
  const s = session.state,
    m = s.match;
  if (m.status !== 'live' || m.minute > T.captain.lastMinute || s.added) return;
  const against = selectedSide(session.setup) === 0 ? session.setup.away.id : session.setup.home.id;
  const conceded = m.events.some(
    (e) => e.kind === 'goal' && e.teamId === against && e.minute === m.minute,
  );
  const late = m.minute === T.captain.lateMinute && Math.abs(ownMargin(session)) <= 1;
  if (conceded || late) askCaptain(session);
}

/** The answer to being substituted (match-22): trust for accepting, momentum for rallying. */
export function substitutionResponse(next: MatchSession, response: 'accept' | 'encourage'): void {
  const s = next.state,
    m = s.match;
  if (response === 'accept') s.managerTrustDelta += T.substitution.acceptTrust;
  else {
    const lift = T.substitution.momentum;
    m.momentum = clamp(
      m.momentum + (selectedSide(next.setup) === 0 ? lift : -lift),
      C.momentum.minimum,
      C.momentum.maximum,
    );
  }
}

/**
 * The headless player's touchline answers on match-22 (simulated careers), each the answer the
 * context favours: at half-time, demanding the ball after a good first half when the side
 * needs a goal, asking for a bolder role when behind or a safer one when ahead if the manager
 * is likely to agree, and otherwise motivating; on the bench, asking to come on when behind.
 * Substituted, rallying the side in a close game with time left, else accepting. After a
 * knock, playing on only in a close, late, important game. Null when nothing is pending.
 */
export function touchlinePolicy(session: MatchSession): MatchCommand | null {
  const s = session.state,
    m = s.match;
  const margin = ownMargin(session);
  if (m.status === 'halftime') {
    if (onBench(s)) return { type: 'halftime', response: margin < 0 ? 'complain' : 'motivate' };
    if (offPitch(s)) return { type: 'halftime', response: 'motivate' };
    if (margin <= 0 && s.stats.rating >= T.demand.rating)
      return { type: 'halftime', response: 'complain' };
    const wanted =
      margin < 0
        ? requestableRoles(session).find((role) => bold(role))
        : margin > 0
          ? requestableRoles(session).find((role) => CAUTIOUS.has(role))
          : undefined;
    if (wanted && roleRefusal(session, wanted) < 0.5)
      return { type: 'halftime', response: 'role', role: wanted };
    return { type: 'halftime', response: 'motivate' };
  }
  if (s.substitutionDecisionPending)
    return {
      type: 'substitution',
      response: Math.abs(margin) <= 1 && m.minute <= 80 ? 'encourage' : 'accept',
    };
  if (s.injuryDecisionPending) {
    const late = m.minute >= 75 && Math.abs(margin) <= 1;
    const big = (session.setup.fixture?.importance ?? 1) > 1;
    const canLeave = changesLeft(session, selectedSide(session.setup), true) > 0;
    return { type: 'injury', response: !canLeave || (late && big) ? 'play-on' : 'off' };
  }
  return null;
}
