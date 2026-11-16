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
        attack: round6(Math.min(C.decision.talk.demand.maximum, s.shares.attack * T.demand.share)),
      };
      // More of the second half goes through the player: extra moments (`${seed}:demand`), one
      // more chain (X1a).
      const rng = createRng(`${setup.seed}:demand`);
      const extra: number[] = [];
      for (let index = 0; index < C.chains.demand; index++)
        extra.push(rng.int(T.demand.from + index * 15, T.demand.from + index * 15 + 12));
      s.momentMinutes = [...new Set([...s.momentMinutes, ...extra])].sort((a, b) => a - b);
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
      s.shares = shares(position, role, true);
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
/**
 * A touchline interrupt (match-22, X1a): the knock, the substitution response or the captain's
 * call, at most `chains.interrupts` a match. True, and counted, when one may still be asked.
 */
export function interrupt(session: MatchSession): boolean {
  const s = session.state;
  if ((s.interrupts ?? 0) >= C.chains.interrupts) return false;
  s.interrupts = (s.interrupts ?? 0) + 1;
  return true;
}
/** Ask for the captain's call (a goal conceded, late on), while an interrupt is left. */
function askCaptain(session: MatchSession): void {
  if (!captainCanCall(session) || !interrupt(session)) return;
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
    // The side digs in for the rest of the match: its odds, not the manager's trust.
    s.rally = true;
    s.expectedGoals = currentRates(next, m.tactics);
  }
}

/** A half-time answer: the response and, for a role, the one asked for. */
export type HalftimeAnswer = Pick<Extract<MatchCommand, { type: 'halftime' }>, 'response' | 'role'>;
/**
 * The half-time decision (X1a): two options, the manager's default first (motivate the side),
 * and the player's alternative for the context: on the bench, asking to come on; after a good
 * first half with the side not ahead, demanding the ball; otherwise asking for the role the
 * score suggests (bolder behind, safer ahead, else the position's half-time role). Off the
 * pitch, only the default.
 */
export function halftimeChoice(session: MatchSession): {
  default: HalftimeAnswer;
  alternative?: HalftimeAnswer;
} {
  const s = session.state;
  const motivate: HalftimeAnswer = { response: 'motivate' };
  if (onBench(s)) return { default: motivate, alternative: { response: 'complain' } };
  if (offPitch(s)) return { default: motivate };
  const margin = ownMargin(session);
  if (margin <= 0 && s.stats.rating >= T.demand.rating)
    return { default: motivate, alternative: { response: 'complain' } };
  const roles = requestableRoles(session);
  const role =
    (margin < 0
      ? roles.find((entry) => bold(entry))
      : margin > 0
        ? roles.find((entry) => CAUTIOUS.has(entry))
        : undefined) ?? halftimeRole(rolePosition(session.setup), s.match.tactics.role);
  return roles.includes(role)
    ? { default: motivate, alternative: { response: 'role', role } }
    : { default: motivate };
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
    // One of the two options on offer: the alternative where the context favours it.
    const { alternative } = halftimeChoice(session);
    const take =
      alternative &&
      (alternative.response === 'complain'
        ? !onBench(s) || margin < 0
        : margin !== 0 && roleRefusal(session, alternative.role!) < 0.5);
    return take ? { type: 'halftime', ...alternative } : { type: 'halftime', response: 'motivate' };
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
