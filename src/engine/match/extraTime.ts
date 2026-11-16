/**
 * Extra time (match-18) and the shootout: when each is due, the player's own kick or save, and
 * the tallies settled in the session.
 */
import { createRng } from '../rng';
import { CONFIG } from '../config';
import { rules22, type MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { event, line } from './events';
import { offPitch, selectedSide } from './shared';

/** Level on aggregate at 90 minutes in a match that plays extra time (match-18). */
export function extraTimeDue(session: MatchSession): boolean {
  const s = session.state,
    lead = session.setup.fixture?.extraTimeLead;
  return lead !== undefined && !s.regulation && s.match.score[0] - s.match.score[1] + lead === 0;
}
/**
 * Extra time (match-18): play goes on to 120 minutes, with one or two more key moments for the
 * player if they are still on the pitch, on their own stream so earlier draws are untouched.
 */
export function startExtraTime(session: MatchSession): void {
  const s = session.state,
    E = C.extraTime;
  s.regulation = [s.match.score[0], s.match.score[1]];
  const rng = createRng(`${session.setup.seed}:extra-time`);
  const count = offPitch(s) ? 0 : rng.int(E.moments[0], E.moments[1]);
  const added: number[] = [];
  for (let index = 0; index < count; index++) {
    const from = 90 + E.firstMoment + Math.floor((index * (E.minutes - E.firstMoment)) / count);
    const to =
      90 + E.firstMoment + Math.floor(((index + 1) * (E.minutes - E.firstMoment)) / count) - 1;
    added.push(rng.int(from, Math.max(from, to)));
  }
  s.momentMinutes = [...s.momentMinutes, ...added];
  event(
    session,
    'halftime',
    session.setup.players[session.setup.selectedPlayerId]!.clubId!,
    null,
    rules22(session.setup)
      ? line(session, 'match.commentary.extra-time')
      : 'match.commentary.extra-time',
  );
}
/**
 * The shootout's result (match-18), settled in the session: even, moved by the player's own
 * kick or save as the background moves it, with the loser's tally from the same range.
 */
export function settleShootout(session: MatchSession): void {
  session.state.penalties = shootoutDraw(session);
}
/** The shootout's tallies, home first, from the session's own stream and the player's kick. */
function shootoutDraw(session: MatchSession): [number, number] {
  const B = CONFIG.world.background;
  const kick = session.state.shootout;
  const homeSide = selectedSide(session.setup) === 0;
  const shift = kick ? (kick.success ? 1 : -1) * B.shootoutKick : 0;
  const rng = createRng(`${session.setup.seed}:penalties`);
  const homeWins = rng.next() < B.penaltyWinnerChance + (homeSide ? shift : -shift);
  const loser = rng.int(B.penaltyLoserGoals[0], B.penaltyLoserGoals[1]);
  return homeWins ? [loser + 1, loser] : [loser, loser + 1];
}
/**
 * The shootout a finished session's tie needs (0.9.1), home first: the one settled in the
 * session, or, when the player was substituted or sent off before a level knockout's shootout,
 * the same draw without their kick. Read at commit and never stored in the session, so saved
 * sessions replay exactly as they were. Null when the match needs no shootout.
 */
export function sessionPenalties(session: MatchSession): [number, number] | null {
  const s = session.state,
    lead = session.setup.fixture?.shootoutLead;
  if (s.penalties) return [s.penalties[0], s.penalties[1]];
  return s.match.status === 'finished' &&
    lead !== undefined &&
    s.match.score[0] - s.match.score[1] + lead === 0
    ? shootoutDraw(session)
    : null;
}
/**
 * A level knockout at full time (match-13): the player takes a shootout kick, or faces them in
 * goal, should extra time not separate the sides. Not after being substituted. Extra time is
 * played first (match-18), so the kick comes only when it is needed.
 */
export function shootoutDue(session: MatchSession): boolean {
  const s = session.state,
    lead = session.setup.fixture?.shootoutLead;
  return (
    lead !== undefined &&
    !offPitch(s) &&
    !s.shootout &&
    s.match.score[0] - s.match.score[1] + lead === 0
  );
}
/** The shootout kick: success by the stated chance, no goal on the scoreboard. */
export function resolveShootout(next: MatchSession, choiceId: string): void {
  const s = next.state,
    setup = next.setup,
    moment = s.currentMoment!;
  const choice = moment.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Invalid decision choice');
  const roll = createRng(`${setup.seed}:shootout:${choice.id}`).next();
  const success = roll < choice.probability;
  s.shootout = { choiceId: choice.id, probability: choice.probability, roll, success };
  const p = setup.players[setup.selectedPlayerId]!;
  event(
    next,
    p.primaryPosition === 'GK' ? 'save' : 'shot',
    p.clubId!,
    p.id,
    line(
      next,
      `match.commentary.${p.primaryPosition === 'GK' ? 'shootout-keeper' : 'shootout'}.${success ? 'success' : 'failure'}`,
    ),
    {
      input: { momentId: moment.id, choiceId: choice.id },
      success,
      roll,
      probability: choice.probability,
      factors: choice.factors,
    },
  );
}
