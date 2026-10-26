/**
 * The minute's play: the background's shots and goals and the player's routine passes,
 * momentum and possession after it, and what the end of a half or of the match brings.
 */
import { createRng } from '../rng';
import { rules22, type MatchSession } from './types';
import { halftimeLine } from './commentary';
import { MATCH_CONFIG as C } from './tuning';
import { SITUATION_BY_ID } from './situations';
import { clamp, round6 } from './decisions';
import { event, finisher, goal, line, recordShot } from './events';
import { openMoment } from './moments';
import { extraTimeDue, shootoutDue, startExtraTime } from './extraTime';
import { finish } from './report';
import { updatePossession } from './rates';
import { backgroundConversion } from './shots';
import { clockKey, fullTime, offPitch, selectedSide } from './shared';
import { boardAt, periodEnds, showBoard } from './stoppage';
import { shootoutDue22, startShootout } from './shootout';
import { captainAfterMinute } from './touchline';

export function simulateMinuteGoals(session: MatchSession): void {
  const s = session.state,
    // Match-22: an added minute has its own stream (`45+2`), never its period's last minute's.
    rng = createRng(`${session.setup.seed}:minute:${clockKey(s)}`);
  // Match-22 plays added minutes, so a minute carries expected goals ÷ the match's mean length.
  const length = rules22(session.setup) ? C.occasions.stoppage.matchMinutes : 90;
  const selected = session.setup.players[session.setup.selectedPlayerId]!,
    own = selectedSide(session.setup);
  const off = offPitch(s);
  for (let side = 0; side < 2; side++) {
    // Personal key moments replace part of each side's expected goals while the player is on.
    const replaced = off ? 0 : side === own ? s.shares.attack : s.shares.defence;
    const rate = clamp((s.expectedGoals[side]! * (1 - replaced)) / length, 0, 0.2);
    // Match-22 shoots more and converts less, for the same goals.
    const conversion = backgroundConversion(session);
    if (rng.next() < rate / conversion) {
      const id = finisher(session, side, rng, side === own && !off ? selected.id : undefined);
      // Rolled before the shot is logged (the log draws nothing from `rng`), so the line can
      // say how a miss was missed (match-22).
      const scored = rng.next() < conversion;
      recordShot(session, side, id, 'match.commentary.attempt', conversion, undefined, scored);
      if (scored) goal(session, side, id);
    }
  }
  // Ordinary passes are real logged actions and contribute to the pass map.
  if (!off && selected.primaryPosition !== 'GK' && rng.next() < C.passPerMinute) {
    const P = C.routinePass;
    const probability = round6(
      clamp(
        P.base + selected.attributes.passing * P.passing - s.stats.fatigue * P.fatigue,
        P.minimum,
        P.maximum,
      ),
    );
    const roll = rng.next(),
      success = roll < probability;
    s.stats.passesAttempted++;
    if (success) s.stats.passesCompleted++;
    event(
      session,
      'pass',
      selected.clubId!,
      selected.id,
      line(session, `match.commentary.routine.${success ? 'success' : 'failure'}`),
      {
        input: { momentId: `routine:${s.match.minute}`, choiceId: 'pass' },
        success,
        roll,
        probability,
        factors: [
          { labelKey: 'match.factor.base', source: 'attribute', contribution: probability },
        ],
      },
    );
  }
  s.match.rng = rng.snapshot();
}
/** Momentum decays towards even and reacts to this minute's shots, goals and decisions. */
function updateMomentum(session: MatchSession): void {
  const m = session.state.match,
    M = C.momentum;
  let impulse = 0;
  for (const e of m.events) {
    // In added time (match-22) only this added minute's events count.
    if (e.minute !== m.minute || (e.addedTime ?? 0) !== (session.state.added ?? 0)) continue;
    const sign = e.teamId === session.setup.home.id ? 1 : -1;
    if (e.kind === 'shot') impulse += sign * M.shot;
    else if (e.kind === 'goal') impulse += sign * M.goal;
    else if (e.outcome && !e.outcome.input.momentId.startsWith('routine:'))
      impulse += sign * (e.outcome.success ? M.success : -M.failure);
  }
  m.momentum = clamp(50 + Math.round((m.momentum - 50) * M.decay) + impulse, M.minimum, M.maximum);
  updatePossession(session);
}
export function afterMinute(session: MatchSession) {
  const s = session.state;
  s.ratingByMinute = [...s.ratingByMinute, Math.round(s.stats.rating * 100) / 100];
  updateMomentum(session);
  if (rules22(session.setup)) {
    afterMinute22(session);
    return;
  }
  if (s.match.minute === 45) {
    s.match.status = 'halftime';
    event(
      session,
      'halftime',
      session.setup.players[session.setup.selectedPlayerId]!.clubId!,
      null,
      rules22(session.setup) ? halftimeLine(session) : 'match.commentary.halftime',
    );
  } else if (s.match.minute === 90 && extraTimeDue(session)) {
    startExtraTime(session);
  } else if (s.match.minute === fullTime(session)) {
    if (shootoutDue(session)) {
      const keeper =
        session.setup.players[session.setup.selectedPlayerId]!.primaryPosition === 'GK';
      openMoment(session, {
        kind: 'shootout',
        situation: SITUATION_BY_ID[keeper ? 'penalty-save' : 'penalty']!,
      });
      return;
    }
    finish(session);
  }
}

/**
 * The end of a minute on the match-22 engine: at a period's last minute the board goes up, and
 * only once its added minutes are played does the period end (half time, extra time, the
 * shootout or full time). Otherwise a goal conceded or the late minute of a close game may ask
 * for the captain's call.
 */
function afterMinute22(session: MatchSession): void {
  const s = session.state,
    m = s.match;
  if (periodEnds(s).includes(m.minute)) {
    const board = boardAt(s, m.minute) ?? showBoard(session);
    if ((s.added ?? 0) < board.minutes) return captainAfterMinute(session);
    if (m.minute === 45) {
      m.status = 'halftime';
      event(
        session,
        'halftime',
        session.setup.players[session.setup.selectedPlayerId]!.clubId!,
        null,
        halftimeLine(session),
      );
      return;
    }
    if (m.minute === 90 && extraTimeDue(session)) return startExtraTime(session);
    if (m.minute === fullTime(session)) {
      if (shootoutDue22(session)) return startShootout(session);
      return finish(session);
    }
  }
  captainAfterMinute(session);
}
