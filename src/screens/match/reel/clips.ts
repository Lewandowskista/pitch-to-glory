import type { KeyMoment, ReplayFrame } from '../../../model/domain';
import type { MatchSession, MatchState } from '../../../engine/match';
import { choiceArrows, focusFrames, selectedAttacksRight, targetArrows, toCam } from '../cam';
import { shirtNumbers } from '../pitchArt';
import { passageGoal } from '../pace';
import type { ClipSpec } from './clipScene';
import { clipCast } from './cast';
import { currentChain, goalCast, outcomeOf, stepCast } from './chain';
import { goalTimeline, leadTimeline, outcomeTimeline } from './timeline';
import { outcomeBeat, type OutcomeBeat } from './beat';

/*
 * The clips of the reel, built from the engine's passages: the lead-in to a step (its 'moment'
 * passage), the step's outcome (the 'outcome' passage's focus, or the next step's passage when
 * a chain goes on), and a goal without the player (a 'minute' passage that ends in a goal).
 * Each step's keyframes are kept for the report's replays while the match is played.
 */
export type ClipType = 'lead' | 'outcome' | 'goal';
export interface ReelClip extends ClipSpec {
  type: ClipType;
  momentId?: string;
  beat?: OutcomeBeat;
  /** The goal the clip ends in, held back from the scoreboard until it goes in. */
  goalEventId?: string;
}

/** Keyframes of each played step, by session seed and moment id, for the report's replays. */
const played = new Map<string, { lead?: ReplayFrame[]; outcome?: ReplayFrame[] }>();
const playedKey = (seed: string, momentId: string) => `${seed}:${momentId}`;
export function rememberStep(
  seed: string,
  momentId: string,
  part: 'lead' | 'outcome',
  frames: ReplayFrame[],
): void {
  const key = playedKey(seed, momentId);
  const entry = played.get(key) ?? {};
  entry[part] = frames;
  played.set(key, entry);
  // Keep the cache to the last few matches.
  if (played.size > 120) played.delete(played.keys().next().value!);
}
export const playedStep = (seed: string, momentId: string) => played.get(playedKey(seed, momentId));

/** The numbered arrows of a step's choices, in clip metres. */
export function momentArrows(session: MatchSession, moment: KeyMoment) {
  const attacksRight = selectedAttacksRight(session.setup, moment.minute);
  const you = moment.frame.players.find((p) => p.id === session.setup.selectedPlayerId)?.point;
  if (!you) return [];
  const at = toCam(you, attacksRight);
  const aimed =
    (moment.zone ? targetArrows(moment, at, attacksRight) : null) ?? choiceArrows(moment, at);
  if (aimed.length || moment.chainId === undefined) return aimed;
  // A chain's lead-in (X1a) has no target: its options fan out ahead of the player, numbered.
  const count = moment.choices.length;
  return moment.choices.map((_, index) => ({
    number: index + 1,
    from: at,
    to: {
      x: at.x + (index - (count - 1) / 2) * LEAD_SPREAD_M,
      y: Math.max(2, at.y - LEAD_REACH_M),
    },
  }));
}
/** How far a lead-in's arrows reach ahead, and how far apart they fan (metres). */
const LEAD_REACH_M = 9;
const LEAD_SPREAD_M = 7;

const numbersOf = new WeakMap<MatchSession['setup'], Record<string, number>>();
function numbers(session: MatchSession) {
  let found = numbersOf.get(session.setup);
  if (!found) numbersOf.set(session.setup, (found = shirtNumbers(session.setup.players)));
  return found;
}

/** The lead-in to the current step, ending on its decision frame. */
export function leadClip(session: MatchSession, moment: KeyMoment, atEnd = false): ReelClip {
  const motion = session.state.motion;
  const frames =
    motion.kind === 'moment' && motion.frames.length > 1 ? motion.frames : [moment.frame];
  const timeline = leadTimeline(frames);
  rememberStep(session.setup.seed, moment.id, 'lead', frames);
  const chain = currentChain(session);
  return {
    key: `lead:${moment.id}`,
    type: 'lead',
    momentId: moment.id,
    timeline,
    attacksRight: selectedAttacksRight(session.setup, moment.minute),
    cast: clipCast(stepCast(session.setup, moment), session.setup, timeline.frames, {
      step: chain?.step ?? 0,
      numbers: numbers(session),
    }),
    arrows: momentArrows(session, moment),
    deciding: false,
    shotPath: false,
    goal: null,
    ...(atEnd ? { atEnd: true } : {}),
  };
}

/** The same clip, waiting on the decision: held on its last frame with the arrows. */
export const decidingClip = (clip: ReelClip): ReelClip => ({ ...clip, deciding: true });

const sideOfEvent = (session: MatchSession, eventId: string | undefined): 0 | 1 | null => {
  if (!eventId) return null;
  const event = session.state.match.events.find((entry) => entry.id === eventId);
  return event ? (event.teamId === session.setup.home.id ? 0 : 1) : null;
};

/**
 * A step's outcome after `choose`: the outcome passage's focus, or (a chain going on) the
 * passage into the next step, with the ✓ or ✗ and its cause.
 */
export function outcomeClip(
  before: MatchSession,
  after: MatchSession,
  moment: KeyMoment,
): ReelClip | null {
  const found = outcomeOf(after.state.match.events, moment.id);
  const motion = after.state.motion;
  const changed = motion !== before.state.motion;
  const frames =
    changed && motion.kind === 'outcome'
      ? focusFrames(motion)
      : changed && motion.frames.length > 1
        ? motion.frames
        : [moment.frame];
  const timeline = outcomeTimeline(frames);
  rememberStep(after.setup.seed, moment.id, 'outcome', frames);
  const goal = passageGoal(timeline.frames);
  const goalEventId = goal?.eventId;
  const chain = currentChain(before);
  return {
    key: `outcome:${moment.id}`,
    type: 'outcome',
    momentId: moment.id,
    timeline,
    attacksRight: selectedAttacksRight(after.setup, moment.minute),
    cast: clipCast(stepCast(after.setup, moment), after.setup, timeline.frames, {
      step: chain?.step ?? 0,
      numbers: numbers(after),
    }),
    arrows: [],
    deciding: false,
    shotPath: timeline.strike !== null,
    goal: sideOfEvent(after, goalEventId),
    ...(goalEventId ? { goalEventId } : {}),
    ...(found ? { beat: outcomeBeat(moment, found.outcome) } : {}),
  };
}

/** A goal in an ordinary minute: its build-up, strike and celebration. */
export function goalClip(session: MatchSession): ReelClip | null {
  const motion = session.state.motion;
  if (motion.kind !== 'minute') return null;
  const goal = passageGoal(motion.frames);
  const timeline = goal ? goalTimeline(motion.frames) : null;
  if (!goal || !timeline) return null;
  const strike = timeline.strike ?? timeline.frames.length - 1;
  return {
    key: `goal:${goal.eventId ?? session.state.match.minute}`,
    type: 'goal',
    timeline,
    attacksRight: selectedAttacksRight(session.setup, session.state.match.minute),
    cast: clipCast(
      goalCast(session.setup, timeline.frames, strike),
      session.setup,
      timeline.frames,
      {
        step: 1,
        numbers: numbers(session),
      },
    ),
    arrows: [],
    deciding: false,
    shotPath: true,
    lean: 0,
    goal: sideOfEvent(session, goal.eventId),
    ...(goal.eventId ? { goalEventId: goal.eventId } : {}),
  };
}

/** A decision the match waits on before it can go on (match-22's touchline). */
export const awaiting = (state: MatchState) =>
  state.captainDecisionPending ||
  state.substitutionDecisionPending ||
  Boolean(state.injuryDecisionPending);
