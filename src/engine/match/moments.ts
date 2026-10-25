/**
 * Opening a key moment: which situation comes up, the decision context its odds are built from,
 * how it is framed, where it happens and the choices it offers. Resolving the choice is in
 * resolve.ts; the choices' odds in decisions.ts.
 */
import type { KeyMoment, Position } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { playerAbility } from '../strength';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { momentPassage, type CastPlan } from './motion';
import type { Situation } from './situations';
import { bookingRisk } from './discipline';
import {
  buildChoices,
  momentBudget,
  round6,
  situationWeights,
  type DecisionContext,
} from './decisions';
import { applyPassage } from './passage';
import { bookedPlayers } from './cards';
import { choiceTarget, pickReceivers, spotWidth, zoneAt } from './targets';
import {
  attacksRight,
  menDown,
  onPitch,
  opposingStyle,
  playedSlot,
  postFlank,
  selectedSide,
} from './shared';

const F = C.cards;

function contextFor(
  session: MatchSession,
  situation: Situation,
  rng: Rng,
  drawn: { keeper?: string; defender?: string; attacker?: string } = {},
  weights = situationWeights(playedSlot(session).position, session.state.match.tactics.role, {
    opponentStyle: opposingStyle(session.setup),
  }),
): DecisionContext {
  const s = session.state,
    setup = session.setup,
    side = selectedSide(setup);
  const player = setup.players[setup.selectedPlayerId]!;
  const opposition = side === 0 ? s.match.away : s.match.home;
  // The drawn opponents are also the ones placed in the moment's scene.
  const theirs = onPitch(opposition);
  const pickAbility = (positions: Position[], role: keyof typeof drawn) => {
    const pool = theirs.filter((id) => positions.includes(setup.players[id]!.primaryPosition));
    const id = rng.pick(pool.length ? pool : theirs);
    drawn[role] = id;
    return round6(playerAbility(setup.players[id]!));
  };
  const slot = playedSlot(session);
  // The finishers a created chance falls to: the best three teammate attackers on the pitch.
  const own = side === 0 ? s.match.home : s.match.away;
  const finishing = onPitch(own)
    .filter((id) => id !== player.id && setup.players[id]!.primaryPosition !== 'GK')
    .map((id) => setup.players[id]!.attributes.finishing)
    .sort((a, b) => b - a)
    .slice(0, 3);
  return {
    player,
    situation,
    budget: momentBudget(
      situation,
      weights,
      s.shares,
      { own: s.expectedGoals[side]!, opposition: s.expectedGoals[1 - side]! },
      s.momentMinutes.length,
    ),
    matchLevel: s.matchLevel,
    importance: setup.fixture?.importance ?? 1,
    fatigue: s.stats.fatigue,
    tactics: s.match.tactics,
    weather: s.match.weather,
    pitchCondition: s.match.pitchCondition,
    ...(s.match.weatherIntensity ? { weatherIntensity: s.match.weatherIntensity } : {}),
    ...(s.match.pitchState ? { pitchState: s.match.pitchState } : {}),
    // A side down to ten men (match-16) plays as if weaker.
    strengthGap: round6(
      s.strength[side]! -
        s.strength[1 - side]! -
        (menDown(s.match)[side]! - menDown(s.match)[1 - side]!) * F.menDown.strength,
    ),
    opponents: {
      keeper: pickAbility(['GK'], 'keeper'),
      defender: pickAbility(['CB', 'LB', 'RB', 'DM'], 'defender'),
      attacker: pickAbility(['ST', 'LW', 'RW', 'AM'], 'attacker'),
    },
    momentum: side === 0 ? s.match.momentum : 100 - s.match.momentum,
    talkOdds: s.talkOdds,
    teammateFinishing: finishing.length
      ? round6(finishing.reduce((sum, value) => sum + value, 0) / finishing.length)
      : s.matchLevel,
    consistencyShift: s.consistencyShift,
    chemistry: setup.chemistry ?? 60,
    positionPenalty: round6((100 - slot.familiarity) * C.decision.positionPenalty),
    // A keeper's saves lean harder on their attributes (match-21).
    ...(C.defending.screening.attributeSlope[slot.position] !== undefined
      ? { defendingSlope: C.defending.screening.attributeSlope[slot.position] }
      : {}),
    // The opposition's style and the player's stronger foot (match-19).
    opponentStyle: opposingStyle(setup),
    ...(setup.prepared ? { prepared: true } : {}),
    foot: {
      strong: player.foot,
      flank: postFlank(session),
      twoFooted: player.traits.includes('two-footed'),
    },
  };
}
/**
 * How a moment reads (engine match-12): one of several sentences for the situation, naming the
 * people in it, and a line on what is at stake late in a close game. Drawn from its own stream,
 * so the wording never moves a roll.
 */
function framing(
  session: MatchSession,
  situation: Situation,
  opponents: { keeper?: string; defender?: string; attacker?: string },
  margin: number,
): Pick<KeyMoment, 'situationKey' | 'situationParams' | 'pressureKey'> {
  const setup = session.setup,
    m = session.state.match,
    side = selectedSide(setup);
  const rng = createRng(`${setup.seed}:framing:${m.minute}`);
  const variant = rng.int(0, C.drama.situationVariants - 1);
  const name = (id: string | undefined) => (id ? setup.players[id]?.name : undefined);
  const own = side === 0 ? m.home : m.away;
  const teammate = onPitch(own)
    .filter((id) => id !== setup.selectedPlayerId && setup.players[id]!.primaryPosition !== 'GK')
    .sort(
      (a, b) =>
        setup.players[b]!.attributes.finishing - setup.players[a]!.attributes.finishing ||
        (a < b ? -1 : 1),
    )[0];
  const params: Record<string, string> = {
    opponent: (side === 0 ? setup.away : setup.home).name,
    minute: String(m.minute),
  };
  for (const [key, value] of [
    ['keeper', name(opponents.keeper)],
    ['defender', name(opponents.defender)],
    ['attacker', name(opponents.attacker)],
    ['teammate', name(teammate)],
  ] as const)
    if (value) params[key] = value;
  const late = m.minute >= C.drama.lateDecisionMinute && Math.abs(margin) <= C.drama.closeMargin;
  return {
    situationKey: `match.situation.${situation.id}.${variant}`,
    situationParams: params,
    ...(late
      ? {
          pressureKey: `match.pressure.${margin === 0 ? 'level' : margin > 0 ? 'ahead' : 'behind'}`,
        }
      : {}),
  };
}
/**
 * The last moment of a match-12 game is placed at the deciding minute: in the closing minutes
 * when the game is within a goal, otherwise where it was provisionally scheduled.
 */
export function placeLateMoment(session: MatchSession): void {
  const s = session.state,
    m = s.match,
    D = C.drama;
  const side = selectedSide(session.setup);
  if (Math.abs(m.score[side]! - m.score[1 - side]!) > D.closeMargin) return;
  const rng = createRng(`${session.setup.seed}:late`);
  s.momentMinutes = [...s.momentMinutes.slice(0, -1), rng.int(D.lateMinutes[0], D.lateMinutes[1])];
}
/**
 * A moment that follows from another (engine match-13): the shootout kick at full time, or the
 * shot after a beaten defender, which carries the chance the dribble made.
 */
export interface ForcedMoment {
  kind: 'shootout' | 'chain';
  situation: Situation;
  /** For a chain: the goal probability the beaten defender opened up. */
  goal?: number;
}
export function openMoment(next: MatchSession, forced?: ForcedMoment): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const rng = createRng(
    forced
      ? `${setup.seed}:${forced.kind}:${m.minute}:${m.keyMoments.length}`
      : `${setup.seed}:situation:${m.minute}`,
  );
  const side = selectedSide(setup);
  const margin = m.score[side]! - m.score[1 - side]!;
  const weights = situationWeights(playedSlot(next).position, m.tactics.role, {
    drama: true,
    state: { minute: m.minute, margin },
    opponentStyle: opposingStyle(setup),
  });
  let situation = weights[weights.length - 1]!.situation;
  if (forced) situation = forced.situation;
  else {
    let target = rng.next() * weights.reduce((sum, w) => sum + w.weight, 0);
    for (const w of weights) {
      target -= w.weight;
      if (target < 0) {
        situation = w.situation;
        break;
      }
    }
  }
  const opponents: { keeper?: string; defender?: string; attacker?: string } = {};
  const context = contextFor(next, situation, rng, opponents, weights);
  // A chained shot is worth what the dribble opened up; the rest of the match is unchanged.
  if (forced?.kind === 'chain') context.budget = { for: forced.goal ?? 0, against: 0 };
  // Place the selected player where the situation happens, attacking the correct end, on the
  // side of their formation post (match-15).
  const right = attacksRight(next, player.clubId!, m.minute);
  const width = spotWidth(next, situation, rng);
  const spot = {
    x: right ? situation.spot.depth : 100 - situation.spot.depth,
    y: !right ? 100 - width : width,
  };
  // The teammates the moment's passes go to are picked before the choice (match-15), on their
  // own stream, so the camera can name them and the pass reaches the one it names.
  const receivers = pickReceivers(next, situation, forced);
  const plan: CastPlan = {
    receivers: [...new Set(receivers.values())],
    ...((receivers.get('through-ball') ?? receivers.get('disguised-pass'))
      ? { runner: receivers.get('through-ball') ?? receivers.get('disguised-pass') }
      : {}),
  };
  // A follow-up moment continues its minute: it replaces the minute's snapshot.
  const passage = momentPassage(next, situation, spot, opponents, plan);
  applyPassage(next, 'moment', passage, [], !!forced);
  const momentFrame = s.frames[s.frames.length - 1]!;
  const choices = buildChoices(context);
  const moment: KeyMoment = {
    id: forced
      ? `${m.id}:moment:${m.minute}:${forced.kind}:${m.keyMoments.length}`
      : `${m.id}:moment:${m.minute}`,
    minute: m.minute,
    situationId: situation.id,
    situationKey: `match.situation.${situation.id}`,
    frame: momentFrame,
    budget: context.budget,
    choices,
  };
  if (passage.cast) {
    const cast = passage.cast;
    moment.zone = zoneAt(situation.spot.depth);
    moment.cast = cast;
    moment.choices = choices.map((choice) => {
      const target = choiceTarget(next, situation, choice.id, momentFrame, cast, receivers);
      return target ? { ...choice, target } : choice;
    });
  }
  // Defending choices carry a booking risk (match-16), shown with the odds.
  if (player.primaryPosition !== 'GK') {
    const booked = bookedPlayers(m).has(player.id);
    moment.choices = moment.choices.map((choice) => {
      const booking = bookingRisk(choice.id, player, choice.probability, booked);
      return booking ? { ...choice, booking } : choice;
    });
  }
  Object.assign(moment, framing(next, situation, opponents, margin));
  if (forced) moment.follows = forced.kind;
  if (forced?.kind === 'shootout')
    moment.situationKey = `match.situation.shootout${situation.id === 'penalty-save' ? '-keeper' : ''}.${
      moment.situationKey.split('.').pop() ?? '0'
    }`;
  s.currentMoment = moment;
  m.keyMoments.push(moment);
  m.status = 'decision';
}
