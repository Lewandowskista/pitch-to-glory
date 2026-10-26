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
import { fullTime, offPitch, selectedSide } from './shared';

export function simulateMinuteGoals(session: MatchSession): void {
  const s = session.state,
    rng = createRng(`${session.setup.seed}:minute:${s.match.minute}`);
  const selected = session.setup.players[session.setup.selectedPlayerId]!,
    own = selectedSide(session.setup);
  const off = offPitch(s);
  for (let side = 0; side < 2; side++) {
    // Personal key moments replace part of each side's expected goals while the player is on.
    const replaced = off ? 0 : side === own ? s.shares.attack : s.shares.defence;
    const rate = clamp((s.expectedGoals[side]! * (1 - replaced)) / 90, 0, 0.2);
    if (rng.next() < rate / C.shotConversion) {
      const id = finisher(session, side, rng, side === own && !off ? selected.id : undefined);
      // Rolled before the shot is logged (the log draws nothing from `rng`), so the line can
      // say how a miss was missed (match-22).
      const scored = rng.next() < C.shotConversion;
      recordShot(
        session,
        side,
        id,
        'match.commentary.attempt',
        C.shotConversion,
        undefined,
        scored,
      );
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
    if (e.minute !== m.minute) continue;
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
