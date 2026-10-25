import type { MatchMotion } from '../../engine/match';
import type { ReplayFrame } from '../../model/domain';

/**
 * How fast each passage of play is shown (release 1.0, step 5.1). A simulated minute takes
 * `MINUTE_MS` of real time at 1×, and its passage is played at the rate that fills that
 * minute, so the pitch never stands still between minutes (review M2). Key-moment build-ups,
 * outcomes and goals play at decision pace; a goal then holds for its banner (review M3).
 * Presentation only: the engine's passages and their sporting times are unchanged.
 */

/** Real milliseconds per simulated minute at 1× speed. */
export const MINUTE_MS = 2200;
/** Ordinary play at 1×: never slower than 1.5 s of football per second, never faster than 18. */
export const MIN_RATE = 1.5;
export const MAX_RATE = 18;
/** Decision pace: key-moment build-ups and outcomes, and the run-in to a goal. */
export const DECISION_RATE = 6;
export const DECISION_MAX_MS = 4200;
/** A goal's build-up: this many beats before the shot slow to decision pace. */
export const GOAL_BUILD_UP_BEATS = 3;
/** Real time, at 1×, that a goal's banner holds after the passage before play goes on. */
export const GOAL_HOLD_MS = 2600;
/** Before a goal's slow build-up, the rest of the passage takes at most this share of a minute. */
const GOAL_LEAD_SHARE = 0.6;
/** At 1×: from kick-off (or a reloaded match's last passage, already shown) to the first minute. */
export const KICKOFF_MS = 300;
/** Simulation-only mode at 1×: the pause before jumping on to the next moment or goal. */
export const JUMP_MS = 450;
/** Simulation-only mode at 1×: how long a goal's banner holds before the next jump. */
export const JUMP_GOAL_HOLD_MS = 1800;

/** How a passage is shown: a rate and cap, and optionally a slower run-in from a keyframe. */
export interface PassagePace {
  /** Sporting milliseconds per real millisecond. */
  rate: number;
  /** The longest the passage (or its part before `slow`) may take, in real milliseconds. */
  maxMs: number;
  /** From keyframe `from` on, play at `rate` within `maxMs` instead. */
  slow?: { from: number; rate: number; maxMs: number };
}

/** An instant replay of a goal: its build-up, shot and celebration, slower than live. */
export const REPLAY_PACE: PassagePace = { rate: 4, maxMs: 6000 };

/** A goal in a passage: its celebration keyframe, the shot that scored and the goal event. */
export interface PassageGoal {
  celebration: number;
  shot: number;
  eventId?: string;
}

/** The goal celebrated in a passage, if any (a passage ends with at most one). */
export function passageGoal(frames: readonly ReplayFrame[]): PassageGoal | null {
  const celebration = frames.findIndex((frame) => frame.beat?.kind === 'celebration');
  if (celebration < 1) return null;
  let shot = celebration - 1;
  for (let index = celebration - 1; index > 0; index--)
    if (frames[index]!.beat?.kind === 'shot' || frames[index]!.beat?.kind === 'header') {
      shot = index;
      break;
    }
  const eventId = frames[celebration]!.beat?.eventId;
  return { celebration, shot, ...(eventId ? { eventId } : {}) };
}

const sportingSpan = (frames: readonly ReplayFrame[]) =>
  frames.length > 1 ? Math.max(0, frames[frames.length - 1]!.timeMs - frames[0]!.timeMs) : 0;
const fillRate = (sporting: number, realMs: number) =>
  Math.min(MAX_RATE, Math.max(MIN_RATE, sporting / realMs));

/**
 * The pace of a passage at `speed` (1, 2 or 4). Minutes fill their share of real time: about
 * 3–5× at 1× for most of them, so the ball keeps moving. A minute with a goal plays its
 * earlier play quickly and then the build-up, shot and celebration at decision pace.
 */
export function passagePace(
  motion: Pick<MatchMotion, 'kind' | 'frames'>,
  speed: number,
): PassagePace {
  if (motion.kind === 'kickoff') return { rate: 1, maxMs: 0 };
  if (motion.kind !== 'minute') return { rate: DECISION_RATE, maxMs: DECISION_MAX_MS };
  const minute = MINUTE_MS / speed;
  const goal = passageGoal(motion.frames);
  if (!goal)
    return { rate: fillRate(sportingSpan(motion.frames), MINUTE_MS) * speed, maxMs: minute };
  const from = Math.max(0, goal.shot - GOAL_BUILD_UP_BEATS);
  const lead = MINUTE_MS * GOAL_LEAD_SHARE;
  return {
    rate: fillRate(sportingSpan(motion.frames.slice(0, from + 1)), lead) * speed,
    maxMs: lead / speed,
    slow: { from, rate: DECISION_RATE * speed, maxMs: DECISION_MAX_MS / speed },
  };
}

/**
 * Real time from a passage's arrival until the next one is asked for: a full minute at least,
 * longer when the passage itself runs longer, plus a goal's hold for its banner.
 */
export function passageWait(
  motion: Pick<MatchMotion, 'kind' | 'frames'>,
  duration: number,
  speed: number,
): number {
  const minute = MINUTE_MS / speed;
  if (motion.kind !== 'minute') return Math.max(minute, duration + 80 / speed);
  // The next minute takes over from the positions on screen, so ordinary play never stops.
  return passageGoal(motion.frames)
    ? Math.max(minute, duration + GOAL_HOLD_MS / speed)
    : Math.max(minute, duration);
}
