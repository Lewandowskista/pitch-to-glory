import type { ReplayFrame } from '../../model/domain';

/** Most keyframes a goal highlight keeps (the Moments clip codec v2 carries up to 24). */
export const HIGHLIGHT_FRAMES = 24;
/** Keyframes kept from sessions without beats (before engine match-14). */
const LEGACY_FRAMES = 12;
/** Fewest keyframes a highlight shows, so a first-time finish still has its approach. */
const MIN_FRAMES = 3;

/**
 * The keyframes of a goal's move (redesign M9): from the frame before the first beat of the
 * build-up to the ball in the net and the celebration. `frames` ends with the celebration.
 *
 * When the strike's beats carry a pattern, the move starts at the first beat of that pattern
 * just before the strike. Otherwise it starts where the scoring side last took the ball:
 * after a beat by the other side (a tackle, an interception, a save, a pass that went
 * astray), a celebration or a reset, or at a restart taken by the scoring side. The cut never
 * exceeds `HIGHLIGHT_FRAMES`, keeping the end of the move. Frames without beats (older
 * sessions) keep the last twelve keyframes, as before.
 */
export function cutHighlight(
  frames: readonly ReplayFrame[],
  scorerId: string,
  homeIds: ReadonlySet<string>,
): ReplayFrame[] {
  const end = frames.length - 1;
  if (end < 0) return [];
  if (!frames.some((frame) => frame.beat)) return frames.slice(-LEGACY_FRAMES);
  const home = homeIds.has(scorerId);
  const ours = (id: string) => homeIds.has(id) === home;
  // The strike: the last keyframe before the celebration the cut ends with.
  let strike = end;
  while (strike > 0 && frames[strike]!.beat?.kind === 'celebration') strike--;
  let start = 0;
  for (let i = strike; i > 0; i--) {
    const frame = frames[i]!;
    if (frame.ballMotion === 'reset') {
      start = i;
      break;
    }
    const beat = frame.beat;
    if (!beat) continue;
    if (beat.kind === 'celebration' || !ours(beat.actorId)) {
      start = i;
      break;
    }
    if (beat.kind === 'restart') {
      start = Math.max(0, i - 1);
      break;
    }
  }
  // A named pattern (wing play, a counter) marks the move itself.
  const pattern = frames
    .slice(start + 1)
    .reverse()
    .find((frame) => frame.beat?.pattern)?.beat?.pattern;
  if (pattern) {
    let first = -1;
    for (let i = strike; i > start; i--) {
      const beat = frames[i]!.beat;
      if (beat?.pattern === pattern) first = i;
      else if (beat && first >= 0) break;
    }
    start = Math.max(start, first - 1);
  }
  start = Math.min(start, Math.max(0, strike - (MIN_FRAMES - 2)));
  start = Math.max(start, end - (HIGHLIGHT_FRAMES - 1));
  return frames.slice(start);
}
