/**
 * Opening a key moment: which situation comes up, the decision context its odds are built from,
 * how it is framed, where it happens and the choices it offers. Resolving the choice is in
 * resolve.ts; the choices' odds in decisions.ts.
 */
import type { DecisionChoice, KeyMoment, MomentRead, Position } from '../../model/domain';
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
  type ContextRead,
  type DecisionContext,
} from './decisions';
import { contextReads, drawReads, markedBy, readDepth, stageReads } from './reads';
import { applyPassage } from './passage';
import { bookedPlayers } from './cards';
import { choiceTarget, pickReceivers, spotWidth, zoneAt } from './targets';
import { rules22 } from './types';
import { momentCount } from './bench';
import {
  addedStamp,
  attacksRight,
  clockKey,
  fullTime,
  menDown,
  onBench,
  onPitch,
  opposingStyle,
  playedSlot,
  postFlank,
  selectedSide,
} from './shared';

const F = C.cards;

export function contextFor(
  session: MatchSession,
  situation: Situation,
  rng: Rng,
  drawn: { keeper?: string; defender?: string; attacker?: string } = {},
  weights = situationWeights(playedSlot(session).position, session.state.match.tactics.role, {
    opponentStyle: opposingStyle(session.setup),
    ...(rules22(session.setup) ? { rules22: true } : {}),
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
    // A chain's steps (match-22) face the opponents drawn once for the chain.
    const preset = drawn[role];
    const pool = theirs.filter((id) => positions.includes(setup.players[id]!.primaryPosition));
    const id = preset ?? rng.pick(pool.length ? pool : theirs);
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
      // A player who came off the bench (match-22): their moments carry only their time.
      momentCount(session),
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
  shootout = false,
  /** A chain's lead-in step (match-22): its own number of sentences. */
  variants?: number,
): Pick<KeyMoment, 'situationKey' | 'situationParams' | 'pressureKey'> {
  const setup = session.setup,
    m = session.state.match,
    side = selectedSide(setup);
  const rng = createRng(`${setup.seed}:framing:${clockKey(session.state)}`);
  // Match-22 has more sentences per situation (review M9); the shootout keeps its three.
  const variant = rng.int(
    0,
    (variants ??
      (rules22(setup) && !shootout ? C.moments22.situationVariants : C.drama.situationVariants)) -
      1,
  );
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
  // Match-22: a player still on the bench has no moments to place.
  if (rules22(session.setup) && (onBench(s) || !s.momentMinutes.length)) return;
  if (Math.abs(m.score[side]! - m.score[1 - side]!) > D.closeMargin) return;
  if (rules22(session.setup)) return placeClimax(session);
  const rng = createRng(`${session.setup.seed}:late`);
  const minute = rng.int(D.lateMinutes[0], D.lateMinutes[1]);
  s.momentMinutes = [...s.momentMinutes.slice(0, -1), minute];
}
/**
 * The close game's climax (match-22, X1a): within a goal at `chains.climax.decide`, the last
 * chain moves to a minute in `climax.minutes` (`${seed}:late`), or with `climax.addedChance`
 * to one of the first `climax.addedMinutes` of second-half added time (`${seed}:late:added`),
 * and has three steps. A last chain due before then, or the one before it later, stays put.
 */
function placeClimax(session: MatchSession): void {
  const s = session.state,
    m = s.match,
    X = C.chains.climax;
  const planned = s.momentMinutes;
  const last = planned[planned.length - 1]!;
  const before = planned[planned.length - 2] ?? 0;
  if (last <= m.minute) return;
  const added = createRng(`${session.setup.seed}:late:added`);
  const minute = createRng(`${session.setup.seed}:late`).int(X.minutes[0], X.minutes[1]);
  if (added.next() < X.addedChance) {
    s.lateAdded = added.int(1, X.addedMinutes);
    s.momentMinutes = [...planned.slice(0, -1), 90];
  } else if (minute > before) s.momentMinutes = [...planned.slice(0, -1), minute];
  else return;
  s.director = { ...s.director, climax: true };
}
/**
 * Whether a key moment is due in the minute being played: one of the moment minutes, or on
 * match-22 in added time the late moment's added minute (the 90th then waits for it).
 */
export function momentDue(session: MatchSession): boolean {
  const s = session.state,
    m = s.match;
  if (!rules22(session.setup)) return s.momentMinutes.includes(m.minute);
  if (s.added) return m.minute === 90 && s.lateAdded === s.added && s.momentMinutes.includes(90);
  return s.momentMinutes.includes(m.minute) && !(m.minute === 90 && s.lateAdded !== undefined);
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
/**
 * A step of a decision chain to open (match-22, release 1.0 X1a; chains.ts): its situation, the
 * finish whose scene it plays in, its budget, the reads the step before staged, the chain's
 * opponents, and how its choices are finished (stakes, bands, consequences).
 */
export interface ChainStepOpen {
  situation: Situation;
  /** The chain's finish: its scene and spot; a lead-in plays a little before it. */
  scene: Situation;
  depth: number;
  budget: { for: number; against: number };
  /** The edge the step before left: a named read and its odds factor. */
  edge?: { read: MomentRead; factor: ContextRead };
  opponents: { keeper?: string; defender?: string; attacker?: string };
  /** The step's own stream, and its moment's id suffix. */
  stream: string;
  suffix: string;
  /** A first step opens the minute's frame; a later one continues it. */
  replace: boolean;
  /** Variants of the step's framing sentence. */
  variants?: number;
  /** Finish the step's choices: their stakes, bands and consequences. */
  decorate: (
    choices: DecisionChoice[],
    context: DecisionContext,
    reads: readonly MomentRead[],
  ) => DecisionChoice[];
  /** The chain fields of the step's moment. */
  fields: Pick<KeyMoment, 'chainId' | 'step' | 'steps'>;
}
/**
 * Defending choices carry a booking risk (match-16), shown with the odds. Match-22: a
 * professional foul risks its card on success, a red by the cover read, and a card's cost (a
 * man down for the rest of the match) counts in a choice's value.
 */
export function withBookings(
  next: MatchSession,
  choices: DecisionChoice[],
  reads: readonly MomentRead[],
): DecisionChoice[] {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  if (player.primaryPosition === 'GK') return choices;
  const v22 = rules22(setup);
  const side = selectedSide(setup);
  const booked = bookedPlayers(m).has(player.id);
  const cover = reads.find((read) => read.id === 'cover')?.state;
  const F = C.cards.menDown;
  const dismissal = v22
    ? (Math.max(0, fullTime(next) - m.minute) / 90) *
      (s.expectedGoals[side]! * F.attack + s.expectedGoals[1 - side]! * F.concede)
    : 0;
  return choices.map((choice) => {
    const foul = v22 && choice.id === 'professional-foul';
    const booking = bookingRisk(
      choice.id,
      player,
      choice.probability,
      booked,
      foul
        ? {
            onSuccess: true,
            straight: C.moments22.professionalFoul[cover === 'alone' ? 'alone' : 'covered'],
          }
        : undefined,
    );
    if (booking && v22 && booking.red > 0) booking.cost = round6(booking.red * dismissal);
    return booking ? { ...choice, booking } : choice;
  });
}
export function openMoment(
  next: MatchSession,
  forced?: ForcedMoment,
  /** A decision chain's step (match-22). */
  step?: ChainStepOpen,
): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const clock = clockKey(s);
  const rng = createRng(
    step
      ? step.stream
      : forced
        ? `${setup.seed}:${forced.kind}:${clock}:${m.keyMoments.length}`
        : `${setup.seed}:situation:${clock}`,
  );
  const side = selectedSide(setup);
  const margin = m.score[side]! - m.score[1 - side]!;
  const v22 = rules22(setup);
  // The 1.0 rules (match-22): the new situations, the marked man's fewer clean chances, and no
  // weaker-foot chance for a two-footed player.
  const marked = v22 ? markedBy(next) : 0;
  const weights = situationWeights(playedSlot(next).position, m.tactics.role, {
    drama: true,
    state: { minute: m.minute, margin },
    opponentStyle: opposingStyle(setup),
    ...(v22
      ? {
          rules22: true,
          twoFooted: player.foot === 'both' || player.traits.includes('two-footed'),
          ...(marked ? { marked } : {}),
        }
      : {}),
  });
  let situation = weights[weights.length - 1]!.situation;
  if (step) situation = step.situation;
  else if (forced) situation = forced.situation;
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
  const opponents: { keeper?: string; defender?: string; attacker?: string } = step
    ? { ...step.opponents }
    : {};
  const context = contextFor(next, situation, rng, opponents, weights);
  // A chained shot is worth what the dribble opened up; the rest of the match is unchanged.
  if (forced?.kind === 'chain') context.budget = { for: forced.goal ?? 0, against: 0 };
  if (step) context.budget = step.budget;
  // What the pitch shows (match-22): reads on their own stream (not for the shootout kick),
  // the marked man, and Clutch's condition. A chain's step shows first the edge the step before
  // it left.
  const reads = v22 && forced?.kind !== 'shootout' ? drawReads(next, situation, opponents) : [];
  if (v22) {
    const K = C.moments22.clutch;
    const factors: ContextRead[] = [
      ...(step?.edge ? [step.edge.factor] : []),
      ...contextReads(situation, reads, marked),
    ];
    if (step?.edge) reads.unshift(step.edge.read);
    context.rules22 = true;
    if (factors.length) context.reads = factors;
    if (
      player.traits.includes('clutch') &&
      ((m.minute >= K.fromMinute && Math.abs(margin) <= K.closeMargin) ||
        (setup.fixture?.importance ?? 1) >= K.importance ||
        forced?.kind === 'shootout')
    )
      context.clutch = true;
    if (marked) reads.push({ id: 'marked', state: 'double' });
  }
  // Place the selected player where the situation happens, attacking the correct end, on the
  // side of their formation post (match-15). A chain's lead-in plays in its finish's scene, a
  // little before its spot (match-22).
  const scene = step?.scene ?? situation;
  const right = attacksRight(next, player.clubId!, m.minute);
  const width = spotWidth(next, scene, rng);
  // A free kick's distance read moves its spot (match-22).
  const at = v22 ? readDepth(scene, reads) : scene.spot.depth;
  const depth = step ? Math.max(0.5, Math.min(99.5, at + step.depth)) : at;
  const spot = {
    x: right ? depth : 100 - depth,
    y: !right ? 100 - width : width,
  };
  // The teammates the moment's passes go to are picked before the choice (match-15), on their
  // own stream, so the camera can name them and the pass reaches the one it names.
  const receivers = pickReceivers(next, situation, forced, step?.suffix);
  const plan: CastPlan = {
    receivers: [...new Set(receivers.values())],
    ...((receivers.get('through-ball') ?? receivers.get('disguised-pass'))
      ? { runner: receivers.get('through-ball') ?? receivers.get('disguised-pass') }
      : {}),
  };
  // A follow-up moment continues its minute: it replaces the minute's snapshot.
  const passage = momentPassage(next, scene, spot, opponents, plan);
  if (v22) stageReads(next, passage, situation, reads);
  applyPassage(next, 'moment', passage, [], step ? step.replace : !!forced);
  const momentFrame = s.frames[s.frames.length - 1]!;
  const built = buildChoices(context);
  const choices = step ? step.decorate(built, context, reads) : built;
  const moment: KeyMoment = {
    id: step
      ? `${m.id}:moment:${clock}:${step.suffix}`
      : forced
        ? `${m.id}:moment:${clock}:${forced.kind}:${m.keyMoments.length}`
        : `${m.id}:moment:${clock}`,
    minute: m.minute,
    ...addedStamp(s),
    situationId: situation.id,
    situationKey: `match.situation.${situation.id}`,
    frame: momentFrame,
    budget: context.budget,
    choices,
  };
  if (reads.length) moment.reads = reads;
  if (passage.cast) {
    const cast = passage.cast;
    moment.zone = zoneAt(scene.spot.depth);
    moment.cast = cast;
    moment.choices = choices.map((choice) => {
      const target = choiceTarget(next, situation, choice.id, momentFrame, cast, receivers);
      return target ? { ...choice, target } : choice;
    });
  }
  // Defending choices carry a booking risk (match-16), shown with the odds.
  moment.choices = withBookings(next, moment.choices, reads);
  Object.assign(
    moment,
    framing(next, situation, opponents, margin, forced?.kind === 'shootout', step?.variants),
  );
  if (forced) moment.follows = forced.kind;
  if (forced?.kind === 'shootout')
    moment.situationKey = `match.situation.${
      // A kick of the match-22 shootout itself, not the promise of one.
      rules22(setup) ? 'shootout-kick' : 'shootout'
    }${situation.id === 'penalty-save' ? '-keeper' : ''}.${moment.situationKey.split('.').pop() ?? '0'}`;
  if (step) Object.assign(moment, step.fields);
  s.currentMoment = moment;
  m.keyMoments.push(moment);
  m.status = 'decision';
}
