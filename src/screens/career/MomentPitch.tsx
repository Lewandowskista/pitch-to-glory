import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip } from '../../engine/career/honours/clip';
import { isParked } from '../../engine/match/parked';
import type { Hex, Point } from '../../model/domain';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { cx } from '../../ui/kit';
import { useReducedMotionSetting } from './honoursUi';
import type { Playback } from '../match/playback';
import { kitNumberColor } from '../match/pitchArt';
import {
  clipName,
  clipStory,
  isAway,
  PASS_BEATS,
  prepareClip,
  RUN_BEATS,
  sampleClip,
  STRIKE_BEATS,
} from './clipReplay';

/** Pitch metres per clip unit along the length and across the width. */
const LENGTH = 1.05;
const WIDTH = 0.68;
/** Drawing units per metre: the 68 m width is 340 units wide. */
const SCALE = 5;
/** How far a lofted ball rises on the drawing at the top of its arc. */
const LIFT = 16;

export interface ClipPlayback {
  /** Milliseconds into the replay, 0 to `duration`. */
  elapsed: number;
  duration: number;
  playing: boolean;
  toggle: () => void;
  playback: Playback;
  /** Keyframes marked on the progress track, as fractions of the replay. */
  ticks: number[];
}

/** Distinct keyframe times, for stepping one keyframe at a time. */
function nextStop(times: readonly number[], elapsed: number, duration: number): number {
  if (elapsed >= duration - 0.5) return 0;
  return times.find((time) => time > elapsed + 0.5) ?? duration;
}

/**
 * Replays a clip through the match replay's interpolation. With reduced motion the clip rests
 * on its final frame, and each press steps one keyframe on (wrapping to the start).
 */
export function useClipPlayback(clip: Clip): ClipPlayback {
  const reduced = useReducedMotionSetting();
  const playback = useMemo(() => prepareClip(clip), [clip]);
  // An annotated clip rests on the ball in the net, before the celebration run.
  const strike = useMemo(() => clipStory(clip).strike, [clip]);
  const { times } = playback;
  const duration = strike === null ? playback.duration : times[strike]!;
  const [elapsed, setElapsed] = useState(duration);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      setElapsed((value) => nextStop(times, value, duration));
      setPlaying(false);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const at = Math.min(duration, now - start);
      setElapsed(at);
      if (at < duration) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, reduced, duration, times]);
  const ticks = useMemo(() => {
    const last = strike ?? clip.frames.length - 1;
    return clip.frames
      .map((f, index) => ({ f, index }))
      .filter(
        ({ f, index }) =>
          index > 0 && index < last && (strike === null || (f.beat && PASS_BEATS.has(f.beat.kind))),
      )
      .map(({ index }) => (duration > 0 ? times[index]! / duration : 0));
  }, [clip, strike, duration, times]);
  return {
    elapsed,
    duration,
    playing,
    toggle: () => setPlaying((value) => !value),
    playback,
    ticks,
  };
}

type Px = { x: number; y: number };
const segment = (a: Px, b: Px) =>
  `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;

/**
 * The clip drawn on the attacking third, goal at the top: the move's trail (passes and
 * crosses in mint, runs with the ball dotted, the finish in gold), both teams as numbered
 * tokens in their kit colours, the scorer ringed in gold with their name, the player who set
 * it up labelled where they played the ball, and the ball arcing when lofted and ending in
 * the net. The view deepens towards halfway when the move starts further out.
 */
export function ClipPitch({
  clip,
  playback,
  home,
  away,
  label,
  scorer,
  className,
}: {
  clip: Clip;
  playback: ClipPlayback;
  home: Hex;
  away: Hex;
  label: string;
  /** The scorer's name for the label beside their token. */
  scorer?: string;
  className?: string;
}) {
  const view = useMemo(() => {
    const last = clip.frames.at(-1)!;
    const right = last.ball.x >= 50;
    const depth = (x: number) => (right ? 100 - x : x) * LENGTH;
    const reach = Math.max(
      ...clip.frames.flatMap((f) => [depth(f.ball.x), depth(f.players[clip.selected]?.x ?? 100)]),
    );
    const metres = Math.min(52.5, Math.max(34, reach + 6));
    return {
      height: metres * SCALE,
      halfway: metres >= 52.5,
      px: (point: Point): Px => ({
        x: (right ? point.y : 100 - point.y) * WIDTH * SCALE,
        y: depth(point.x) * SCALE,
      }),
    };
  }, [clip]);
  const story = useMemo(() => clipStory(clip), [clip]);
  const annotated = story.strike !== null;
  const sample = sampleClip(clip, playback.playback, playback.elapsed);
  const count = clip.frames.length;
  const done = sample.progress >= 1;
  const ball = view.px(sample.ball);
  const at = (index: number) => view.px(clip.frames[index]!.ball);
  // The trail so far: every step reached, then the step in play up to the ball.
  let lead = '',
    runs = '',
    shot = '';
  for (let k = 1; k <= sample.index && k < count; k++) {
    const to = k < sample.index || done ? at(k) : ball;
    const d = segment(at(k - 1), to);
    if (!annotated) {
      if (k < count - 1) lead += d;
      else shot += d;
      continue;
    }
    const frame = clip.frames[k]!;
    const kind = frame.beat?.kind;
    if (kind && STRIKE_BEATS.has(kind)) shot += d;
    else if (kind && PASS_BEATS.has(kind)) lead += d;
    // Runs with the ball, and moves without an action (a scene set for a decision), dotted.
    else if (!kind || RUN_BEATS.has(kind)) runs += d;
  }
  const H = view.height;
  const stripes = useMemo(() => {
    let d = '';
    for (let y = -22; y < H; y += 40) d += `M-14 ${y}H354V${y + 20}H-14Z`;
    return d;
  }, [H]);
  const name = clipName(clip, clip.selected, scorer) ?? '';
  const tag = Math.max(34, name.length * 5.6 + 14);
  const trim = clip.trim;
  const kit = (player: number) => {
    const awaySide = isAway(clip, player);
    const fill = awaySide ? away : home;
    return {
      fill,
      ink: kitNumberColor(fill),
      stroke: trim?.[awaySide ? 1 : 0],
      awaySide,
    };
  };
  // The player who set the goal up, labelled where they played the ball once they have.
  const assist =
    story.assist && sample.index >= story.assist.frame
      ? (() => {
          const assister = clipName(clip, story.assist.actor);
          if (!assister) return null;
          const text = format(h.moments.assistTag[story.assist.kind], { name: assister });
          const width = text.length * 5.4 + 14;
          const from = at(story.assist.frame - 1);
          return {
            text,
            width,
            x: Math.max(width / 2 - 10, Math.min(350 - width / 2, from.x)),
            y: Math.min(H - 4, from.y + 12),
          };
        })()
      : null;
  const inNet = ball.y < 0 && ball.x > 151.7 && ball.x < 188.3;
  const order = clip.frames[0]!.players.map((_, player) => player).sort(
    (a, b) => Number(a === clip.selected) - Number(b === clip.selected),
  );
  const lift = sample.height * LIFT;
  return (
    <svg
      viewBox={`-14 -22 368 ${H + 36}`}
      role="img"
      aria-label={label}
      className={cx('block w-full rounded-control', className)}
    >
      <rect x="-14" y="-22" width="368" height={H + 36} className="fill-field" />
      <path d={stripes} className="fill-field-stripe" />
      <g fill="none" className="stroke-white" strokeOpacity="0.78" strokeWidth="2">
        <path d={`M0 ${H}V0H340V${H}`} />
        <path d="M69.2 0V82.5H270.8V0" />
        <path d="M124.2 0V27.5H215.8V0" />
        <path d="M133.4 82.5A45.75 45.75 0 0 0 206.6 82.5" />
        {view.halfway && (
          <>
            <path d={`M0 ${H}H340`} />
            <path d={`M124.25 ${H}A45.75 45.75 0 0 1 215.75 ${H}`} />
          </>
        )}
      </g>
      <circle cx="170" cy="55" r="2" className="fill-white" fillOpacity="0.78" />
      <rect
        x="151.7"
        y="-11"
        width="36.6"
        height="11"
        className={cx(inNet ? 'fill-gold stroke-gold' : 'fill-white stroke-white')}
        fillOpacity={inNet ? 0.38 : 0.16}
        strokeWidth="2"
      />
      <path
        d={runs}
        fill="none"
        className="stroke-mint"
        strokeOpacity="0.75"
        strokeWidth="2"
        strokeDasharray="1.5 5"
        strokeLinecap="round"
      />
      <path
        d={lead}
        fill="none"
        className="stroke-mint"
        strokeWidth="2.5"
        strokeDasharray="7 6"
        strokeLinecap="round"
      />
      <path
        d={shot}
        fill="none"
        className="stroke-gold"
        strokeWidth="3"
        strokeDasharray="9 6"
        strokeLinecap="round"
      />
      {order.map((player) => {
        // A player sent off before the goal (match-16) is parked off the pitch: not drawn.
        if (isParked(sample.players[player]!)) return null;
        const p = view.px(sample.players[player]!);
        if (p.y > H + 12) return null;
        const selected = player === clip.selected;
        const { fill, ink, stroke, awaySide } = kit(player);
        const number = clip.players?.[player]?.number;
        return (
          <g key={player} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
            {selected && <circle r="14" className="fill-gold" fillOpacity="0.35" />}
            <circle
              r="8"
              fill={fill}
              stroke={selected ? undefined : stroke}
              className={
                selected
                  ? 'stroke-gold'
                  : stroke
                    ? undefined
                    : awaySide
                      ? 'stroke-white'
                      : 'stroke-night'
              }
              strokeWidth={selected ? 3 : 1.6}
            />
            {number && (
              <text
                y="3"
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                fill={ink}
                className="font-sans"
              >
                {number}
              </text>
            )}
            {selected && name && (
              <g>
                <rect
                  x={-tag / 2}
                  y="11"
                  width={tag}
                  height="14"
                  rx="7"
                  className="fill-night stroke-gold"
                  strokeWidth="1.5"
                />
                <text
                  y="21"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  className="fill-hero-ink font-sans"
                >
                  {name}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {assist && (
        <g transform={`translate(${assist.x.toFixed(1)} ${assist.y.toFixed(1)})`}>
          <rect
            x={-assist.width / 2}
            y="0"
            width={assist.width}
            height="14"
            rx="7"
            className="fill-night"
            fillOpacity="0.85"
          />
          <text
            y="10"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            className="fill-hero-ink font-sans"
          >
            {assist.text}
          </text>
        </g>
      )}
      {lift > 0.5 && (
        <ellipse
          cx={ball.x}
          cy={ball.y + 1.5}
          rx="4"
          ry="2.2"
          className="fill-night"
          fillOpacity="0.35"
        />
      )}
      <circle
        cx={ball.x}
        cy={ball.y - lift}
        r={4 + sample.height * 1.6}
        className="fill-white stroke-night"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** The replay's progress: a track with a tick per pass and shot, and the time. */
export function ClipProgress({
  playback,
  as: Tag = 'figcaption',
}: {
  playback: ClipPlayback;
  as?: 'figcaption' | 'div';
}) {
  const { elapsed, duration, playing, ticks } = playback;
  const total = (duration / 1000).toFixed(1);
  const now = (elapsed / 1000).toFixed(1);
  const atEnd = !playing && elapsed >= duration;
  const share = duration > 0 ? Math.min(1, elapsed / duration) : 1;
  return (
    <Tag className="flex items-center gap-2.5">
      <span aria-hidden="true" className="relative h-1.5 flex-1 rounded-full bg-track">
        <span
          className={cx(
            'absolute inset-y-0 left-0 rounded-full',
            playing ? 'bg-accent' : 'bg-muted',
          )}
          style={{ width: `${share * 100}%` }}
        />
        {ticks.map((tick, index) => (
          <span
            key={index}
            className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-muted"
            style={{ left: `${tick * 100}%` }}
          />
        ))}
      </span>
      <span className="text-xs whitespace-nowrap text-muted tabular-nums">
        {atEnd ? format(h.moments.timeEnd, { total }) : format(h.moments.time, { now, total })}
      </span>
    </Tag>
  );
}

/** Replay or pause, with the matching icon. `aria-pressed` while the clip plays. */
export function ReplayButton({ playback }: { playback: ClipPlayback }) {
  return (
    <button
      type="button"
      aria-pressed={playback.playing}
      onClick={playback.toggle}
      className={cx('button', !playback.playing && 'secondary')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-4 w-4">
        <path
          d={playback.playing ? 'M6 4H10V20H6ZM14 4H18V20H14Z' : 'M7 5L19 12L7 19Z'}
          fill="currentColor"
        />
      </svg>
      {playback.playing ? h.moments.pause : h.moments.replay}
    </button>
  );
}

/**
 * A clip with its progress, replay button and, when the clip tells how the goal was made, a
 * caption beside the button, for the shared replay page.
 */
export function MomentPitch({
  clip,
  home,
  away,
  label,
  scorer,
  caption,
}: {
  clip: Clip;
  home: Hex;
  away: Hex;
  label: string;
  scorer?: string;
  caption?: string | null;
}) {
  const playback = useClipPlayback(clip);
  return (
    <figure className="flex flex-col gap-2">
      <ClipPitch
        clip={clip}
        playback={playback}
        home={home}
        away={away}
        label={label}
        scorer={scorer}
      />
      <ClipProgress playback={playback} as={caption ? 'div' : 'figcaption'} />
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <ReplayButton playback={playback} />
        {caption && (
          <figcaption className="min-w-0 flex-[1_1_16rem] text-[0.8125rem] text-muted">
            {caption}
          </figcaption>
        )}
      </div>
    </figure>
  );
}
