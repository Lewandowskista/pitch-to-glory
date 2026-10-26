/**
 * Applying a command to a session: the state is copied, the command appended to the log, and
 * the command played: a minute advanced (fatigue, the player's substitution, the managers'
 * changes, cards, then a key moment or the minute's play), a choice resolved and the rest of
 * its minute played, or one of the player's touchline decisions (the half-time talk, the
 * response to being substituted, the captain's call).
 */
import { createRng } from '../rng';
import type { MatchCommand, MatchSession, MatchState } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { validateCommand } from './validation';
import { SITUATION_BY_ID } from './situations';
import { halftimeRole, shiftMentality } from './roles';
import { minutePassage, outcomePassage } from './motion';
import { clamp, round6 } from './decisions';
import { event } from './events';
import { applyPassage } from './passage';
import { showCards } from './cards';
import { replacement } from './lineup';
import { managerSubstitutions } from './substitutions';
import { openMoment, placeLateMoment } from './moments';
import { resolveChoice } from './resolve';
import { resolveShootout, settleShootout } from './extraTime';
import { finish } from './report';
import { currentRates, shares, updatePossession } from './rates';
import { afterMinute, simulateMinuteGoals } from './minute';
import { copy, offPitch, rolePosition, selectedSide } from './shared';

export function applyMatchCommand(session: MatchSession, command: MatchCommand): MatchSession {
  validateCommand(command);
  const source = session.state;
  const state: MatchState = {
    ...source,
    stats: { ...source.stats },
    play: { ...source.play },
    ratingParts: { ...source.ratingParts },
    frames: [...source.frames],
    match: {
      ...source.match,
      tactics: { ...source.match.tactics },
      score: [...source.match.score],
      events: [...source.match.events],
      keyMoments: [...source.match.keyMoments],
      reports: [...source.match.reports],
    },
  };
  const next: MatchSession = { ...session, commands: [...session.commands, copy(command)], state };
  const m = state.match;
  const setup = session.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  if (command.type === 'kickoff') {
    if (m.status !== 'preview') throw new Error('Match already started');
    m.status = 'live';
  } else if (command.type === 'advance') {
    if (m.status !== 'live' || state.captainDecisionPending || state.substitutionDecisionPending)
      throw new Error('Cannot advance paused match');
    m.minute++;
    const first = m.events.length;
    if (!offPitch(state)) {
      state.selectedPlayerMinutes++;
      const stamina =
        player.primaryPosition === 'GK'
          ? Math.max(C.keeperStamina, player.attributes.stamina)
          : player.attributes.stamina;
      state.stats.fatigue = round6(
        clamp(
          state.stats.fatigue +
            (C.fatiguePerMinute * (1.3 - stamina / 150) +
              (m.tactics.risk === 'high' ? C.highRiskFatigue : 0)) *
              (player.traits.includes('second-wind') ? C.decision.secondWindFatigue : 1),
          0,
          100,
        ),
      );
      // Fatigue already starts from the player's condition. A tired player comes off; a
      // manager may also replace a poor one, or protect a lead, at a few set minutes.
      const T = C.tacticalSubstitution;
      const own = selectedSide(setup);
      const inWindow =
        m.minute >= C.minimumSubstitutionMinute && m.minute < C.substitutionCutoffMinute;
      // Keepers are not taken off for tiredness, nor for tactics.
      const tired = player.primaryPosition !== 'GK' && state.stats.fatigue >= C.substitutionFatigue;
      const tactical =
        player.primaryPosition !== 'GK' &&
        (T.minutes as readonly number[]).includes(m.minute) &&
        (state.stats.rating < T.ratingBelow || m.score[own]! - m.score[1 - own]! >= T.leadingBy) &&
        createRng(`${setup.seed}:substitution:${m.minute}`).next() < T.chance;
      if (inWindow && (tired || tactical)) {
        const team = own === 0 ? 'home' : 'away';
        const current = m[team];
        const incoming = replacement(next, current.benchIds, player);
        if (incoming) {
          state.substituted = true;
          state.substitutionDecisionPending = true;
          m[team] = {
            ...current,
            starterIds: current.starterIds.map((id) => (id === player.id ? incoming : id)),
            benchIds: current.benchIds.filter((id) => id !== incoming),
          };
          const sub = event(
            next,
            'substitution',
            player.clubId!,
            player.id,
            'match.commentary.substitution',
          );
          // Who comes on (match-15), for the substitution board and minutes.
          sub.receiverId = incoming;
        }
      }
    }
    managerSubstitutions(next);
    // Full discipline (match-16): the minute's cards come first, so a player sent off takes
    // no further part in it (and the selected player has no moment).
    showCards(next);
    if (m.minute === C.drama.lateDecisionMinute) placeLateMoment(next);
    if (!offPitch(state) && state.momentMinutes.includes(m.minute)) openMoment(next);
    else {
      simulateMinuteGoals(next);
      applyPassage(next, 'minute', minutePassage(next, m.events.slice(first)));
      afterMinute(next);
    }
  } else if (command.type === 'choose') {
    if (m.status !== 'decision' || !state.currentMoment) throw new Error('No decision pending');
    if (state.currentMoment.follows === 'shootout') {
      resolveShootout(next, command.choiceId);
      state.currentMoment = null;
      settleShootout(next);
      finish(next);
      return next;
    }
    const first = m.events.length;
    resolveChoice(next, command.choiceId);
    const decided = m.events.length - first;
    if (state.chain) {
      // The defender is beaten: play carries on into the shot it leads to, in the same minute.
      const goal = state.chain.goal;
      delete state.chain;
      openMoment(next, { kind: 'chain', situation: SITUATION_BY_ID['box-chance']!, goal });
      return next;
    }
    simulateMinuteGoals(next);
    // The build-up to the moment leads into its outcome in a goal highlight.
    const lead = source.motion.kind === 'moment' ? source.motion.frames.slice(0, -1) : [];
    applyPassage(
      next,
      'outcome',
      outcomePassage(next, m.events.slice(first), state.currentMoment.situationId, decided),
      lead,
    );
    state.currentMoment = null;
    m.status = 'live';
    afterMinute(next);
  } else if (command.type === 'halftime') {
    if (m.status !== 'halftime' || !['motivate', 'role', 'complain'].includes(command.response))
      throw new Error('Invalid halftime response');
    // The challenge is a demand for the ball (match-13): more of the second half goes through
    // the player, at a smaller cost in trust and no sulk.
    const demand = command.response === 'complain';
    state.managerTrustDelta = demand
      ? C.decision.talk.demand.trust
      : command.response === 'complain'
        ? -5
        : command.response === 'motivate'
          ? 3
          : 1;
    // The talk carries into the second half: a lift in momentum and odds, or a sulk.
    const talk = C.decision.talk;
    const ownSide = selectedSide(setup);
    if (command.response === 'motivate') {
      const lift = talk.momentum * (player.traits.includes('leader') ? talk.leaderBonus : 1);
      m.momentum = clamp(
        m.momentum + (ownSide === 0 ? lift : -lift),
        C.momentum.minimum,
        C.momentum.maximum,
      );
      state.talkOdds = talk.motivate;
    } else if (demand) {
      state.talkOdds = 1;
      state.shares = {
        ...state.shares,
        attack: round6(
          Math.min(C.decision.talk.demand.maximum, state.shares.attack * talk.demand.share),
        ),
      };
    } else state.talkOdds = command.response === 'complain' ? talk.complain : 1;
    if (command.response === 'role') {
      const position = rolePosition(setup);
      m.tactics.role = halftimeRole(position, m.tactics.role);
      state.expectedGoals = currentRates(next, m.tactics);
      state.shares = shares(position, m.tactics.role);
    }
    state.stats.fatigue = round6(Math.max(0, state.stats.fatigue - C.halftimeRecovery));
    // Ends are switched and the away side kicks off the second half.
    state.play = { side: 1, carrierId: null, restart: 'second-half' };
    m.status = 'live';
    // A captain sent off (match-16) no longer leads the side.
    state.captainDecisionPending = state.captain && !state.sentOff;
  } else if (command.type === 'substitution') {
    if (
      m.status === 'finished' ||
      !state.substitutionDecisionPending ||
      !['accept', 'encourage'].includes(command.response)
    )
      throw new Error('No substitution response pending');
    state.substitutionDecisionPending = false;
    if (command.response === 'encourage') state.managerTrustDelta += 1;
  } else if (command.type === 'captain') {
    if (
      m.status !== 'live' ||
      !state.captainDecisionPending ||
      !['push', 'calm'].includes(command.instruction)
    )
      throw new Error('No captain decision pending');
    state.captainDecisionPending = false;
    m.tactics.mentality = shiftMentality(
      m.tactics.mentality,
      command.instruction === 'push' ? 1 : -1,
    );
    if (player.traits.includes('captains-voice')) {
      // A captain the dressing room listens to lifts the side with the call itself.
      const voice = C.decision.captainsVoice[command.instruction];
      m.momentum = clamp(
        m.momentum + (selectedSide(setup) === 0 ? voice : -voice),
        C.momentum.minimum,
        C.momentum.maximum,
      );
    }
    state.expectedGoals = currentRates(next, m.tactics);
    updatePossession(next);
  } else throw new Error('Unknown match command');
  return next;
}
