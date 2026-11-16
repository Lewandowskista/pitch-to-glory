import type { ReplayFrame } from '../../model/domain';

/**
 * Goals in a passage of play (release 1.0, step 5.1), for the reel's goal clips
 * (`reel/timeline.ts`) and the GOAL banner. Presentation only: the engine's passages and their
 * sporting times are unchanged.
 */

/** A goal's build-up: this many beats before the shot open its clip. */
export const GOAL_BUILD_UP_BEATS = 3;

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
