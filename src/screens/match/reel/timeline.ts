import type { ReplayFrame } from '../../../model/domain';
import type { Playback } from '../playback';
import { passageGoal, GOAL_BUILD_UP_BEATS } from '../pace';

/*
 * The reel's clock (docs/EXPERIENCE-REDESIGN-1.0.md §1.2–1.3). Presentation only: the engine's
 * passages and their sporting times are unchanged; these functions decide how long each part
 * takes on screen.
 *
 * - The ticker plays dead time at about 2.3 game minutes a second (≈ 40 s a match).
 * - Anticipation before each chain: 1.3 s.
 * - A clip: the lead-in at 1.5× within 2–2.5 s; the decisive touch slowed to about 0.38× for
 *   0.6 s; a 100 ms hitstop as the ball is struck; the outcome within 1.2–1.5 s; a 0.4 s settle.
 * - A goal without the player: 3–4 s from the build-up to the celebration.
 */
export const TICK_MS = 440;
/**
 * Watch highlights plays the same beats shorter, the whole reel in about a minute: a faster
 * ticker, lead-ins cut to their last second, a shorter outcome line and GOAL banner.
 */
export const WATCH_TICK_MS = 150;
export const WATCH_LEAD_MS = 1200;
export const WATCH_BEAT_MS = 800;
export const WATCH_BANNER_MS = 1000;
export const BUILD_MS = 1300;
export const WATCH_BUILD_MS = 700;
/** In Watch highlights, how long the step's frame holds before the decision is made. */
export const WATCH_DECIDE_MS = 500;
export const LEAD_RATE = 1.5;
export const LEAD_MIN_MS = 2000;
export const LEAD_MAX_MS = 2500;
export const SLOW_MS = 600;
export const HITSTOP_MS = 100;
export const OUTCOME_MIN_MS = 1200;
export const OUTCOME_MAX_MS = 1500;
export const SETTLE_MS = 400;
export const GOAL_MIN_MS = 3000;
export const GOAL_MAX_MS = 4000;
/** The outcome line stays up this long after the result is known. */
export const BEAT_MS = 1400;
/** The GOAL banner holds this long after its clip. */
export const BANNER_MS = 1600;
/** Taps on a card are ignored this long after a step replaces it (the audit's mis-taps). */
export const CARD_GUARD_MS = 300;
/** Ball trail length in frames of the renderer. */
export const TRAIL_FRAMES = 11;
/** Rest between beats so one never runs into the next. */
export const GAP_MS = 120;

/** A clip on screen: keyframes with their real times, when the result shows, and the strike. */
export interface ClipTimeline extends Playback {
  /** Real milliseconds from the start until the outcome is visible (the ✓ or ✗ appears). */
  beatAt: number;
  /** The keyframe the ball arrives at from a shot or header, if the clip has one. */
  strike: number | null;
}

const STRIKES = new Set(['shot', 'header']);
const sporting = (frames: readonly ReplayFrame[], index: number) =>
  Math.max(0, frames[index]!.timeMs - frames[index - 1]!.timeMs);
/** A copy of a keyframe, a hold with nothing moving and no action. */
const hold = (frame: ReplayFrame): ReplayFrame => ({
  ...frame,
  beat: undefined,
  ballMotion: frame.ballMotion === 'reset' ? 'dead' : frame.ballMotion,
});
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
/** Scale `spans` so their sum falls within [min, max] (a sum of 0 stays 0). */
function fit(spans: number[], min: number, max: number): number[] {
  const total = sum(spans);
  if (total <= 0) return spans;
  const target = Math.min(max, Math.max(min, total));
  return spans.map((span) => (span * target) / total);
}
function build(frames: ReplayFrame[], spans: number[], beatAt: number, strike: number | null) {
  const times = [0];
  for (const span of spans) times.push(times.at(-1)! + span);
  return { frames, times, duration: times.at(-1)!, beatAt, strike } satisfies ClipTimeline;
}
const empty = (frames: readonly ReplayFrame[]): ClipTimeline => ({
  frames: frames.length ? [frames.at(-1)!] : [],
  times: [0],
  duration: 0,
  beatAt: 0,
  strike: null,
});

/**
 * The lead-in to a step: the last few seconds of the build-up (at most 3.75 s of football),
 * at 1.5× within 2–2.5 s, ending on the frame the decision is drawn on.
 */
export function leadTimeline(frames: readonly ReplayFrame[]): ClipTimeline {
  if (frames.length < 2) return empty(frames);
  const end = frames.length - 1;
  const budget = LEAD_MAX_MS * LEAD_RATE;
  let start = end - 1;
  while (start > 0 && frames[end]!.timeMs - frames[start - 1]!.timeMs <= budget) start--;
  const cut = frames.slice(start);
  const spans = cut.slice(1).map((_, i) => Math.max(120, sporting(cut, i + 1) / LEAD_RATE));
  const fitted = fit(spans, LEAD_MIN_MS, LEAD_MAX_MS);
  return build(cut, fitted, sum(fitted), null);
}

/**
 * A step's outcome: the decisive touch in slow motion, a hitstop as a shot is struck, the rest
 * within 1.2–1.5 s, then a settle on the last frame.
 */
export function outcomeTimeline(frames: readonly ReplayFrame[]): ClipTimeline {
  if (frames.length < 2) return empty(frames);
  const strikeAt = frames.findIndex((frame, i) => i > 0 && STRIKES.has(frame.beat?.kind ?? ''));
  const out: ReplayFrame[] = [frames[0]!];
  const spans: number[] = [];
  let strike: number | null = null;
  let beatAt = 0;
  // The rest of the passage after the decisive touch, fitted to the outcome's time.
  const rest = frames.slice(2).map((_, i) => Math.max(140, sporting(frames, i + 2) / 2.5));
  const restFitted = rest.length ? fit(rest, OUTCOME_MIN_MS, OUTCOME_MAX_MS) : [];
  for (let i = 1; i < frames.length; i++) {
    if (i === strikeAt) {
      // The hitstop: the frame before the strike holds.
      out.push(hold(frames[i - 1]!));
      spans.push(HITSTOP_MS);
    }
    out.push(frames[i]!);
    spans.push(i === 1 ? SLOW_MS : restFitted[i - 2]!);
    if (i === strikeAt) {
      strike = out.length - 1;
      beatAt = sum(spans);
    }
  }
  if (!beatAt) beatAt = Math.min(sum(spans), SLOW_MS + (restFitted[0] ?? 0));
  out.push(hold(frames.at(-1)!));
  spans.push(SETTLE_MS);
  return build(out, spans, beatAt, strike);
}

/**
 * A goal without the player's decision, from its passage: the build-up (the beats before the
 * shot), a hitstop, the shot and the celebration, in 3–4 s.
 */
export function goalTimeline(frames: readonly ReplayFrame[]): ClipTimeline | null {
  const goal = passageGoal(frames);
  if (!goal) return null;
  const start = Math.max(0, goal.shot - GOAL_BUILD_UP_BEATS);
  const cut = frames.slice(start, goal.celebration + 1);
  const shot = goal.shot - start;
  if (cut.length < 2 || shot < 1) return null;
  const buildSpans = cut.slice(1, shot).map((_, i) => Math.max(150, sporting(cut, i + 1) / 3));
  const fittedBuild = buildSpans.length ? fit(buildSpans, 1000, 1800) : [];
  const out: ReplayFrame[] = [cut[0]!];
  const spans: number[] = [];
  for (let i = 1; i < shot; i++) {
    out.push(cut[i]!);
    spans.push(fittedBuild[i - 1]!);
  }
  out.push(hold(cut[shot - 1]!));
  spans.push(HITSTOP_MS);
  out.push(cut[shot]!);
  spans.push(450);
  const strike = out.length - 1;
  const after = cut.slice(shot + 1);
  for (const frame of after) {
    out.push(frame);
    spans.push(800 / after.length);
  }
  out.push(hold(cut.at(-1)!));
  spans.push(300);
  // Within 3–4 s: the build-up takes up the difference.
  const total = sum(spans);
  if (total < GOAL_MIN_MS && fittedBuild.length) {
    const extra = (GOAL_MIN_MS - total) / fittedBuild.length;
    for (let i = 0; i < fittedBuild.length; i++) spans[i]! += extra;
  } else if (total < GOAL_MIN_MS) spans[spans.length - 1]! += GOAL_MIN_MS - total;
  if (sum(spans) > GOAL_MAX_MS && fittedBuild.length) {
    const over = sum(spans) - GOAL_MAX_MS;
    const share = sum(spans.slice(0, fittedBuild.length));
    for (let i = 0; i < fittedBuild.length; i++)
      spans[i]! = Math.max(150, spans[i]! - (over * spans[i]!) / share);
  }
  return build(out, spans, sum(spans.slice(0, strike)), strike);
}
