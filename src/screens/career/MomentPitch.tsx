import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip } from '../../engine/career/honours/clip';
import type { Hex } from '../../model/domain';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { cx } from '../../ui/kit';
import { useReducedMotionSetting } from './honoursUi';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Each keyframe of a clip plays for this long. */
const FRAME_MS = 900;
/** Pitch metres per clip unit along the length and across the width. */
const LENGTH = 1.05;
const WIDTH = 0.68;
/** Drawing units per metre: the 68 m width is 340 units wide. */
const SCALE = 5;

export interface ClipPlayback {
  /** Position in keyframes, 0 to frames − 1. */
  progress: number;
  playing: boolean;
  toggle: () => void;
  frames: number;
}

/**
 * Replays a clip's keyframes over about a second each. With reduced motion the clip rests on
 * its final frame, and each press steps one keyframe on (wrapping to the start).
 */
export function useClipPlayback(clip: Clip): ClipPlayback {
  const reduced = useReducedMotionSetting();
  const frames = clip.frames.length;
  const [progress, setProgress] = useState(frames - 1);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      setProgress((value) => (value >= frames - 1 ? 0 : Math.floor(value) + 1));
      setPlaying(false);
      return;
    }
    const start = performance.now();
    const duration = FRAME_MS * (frames - 1);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(t * (frames - 1));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, reduced, frames]);
  return { progress, playing, toggle: () => setPlaying((value) => !value), frames };
}

/**
 * The clip drawn on the attacking third, goal at the top: the ball's path (build-up in mint,
 * the finish in gold), both teams as tokens in their colours and the scorer ringed in gold
 * with their name. The view deepens towards halfway when the move starts further out.
 */
export function ClipPitch({
  clip,
  progress,
  home,
  away,
  label,
  scorer,
  className,
}: {
  clip: Clip;
  progress: number;
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
      px: (x: number, y: number) => ({
        x: (right ? y : 100 - y) * WIDTH * SCALE,
        y: depth(x) * SCALE,
      }),
    };
  }, [clip]);
  const count = clip.frames.length;
  const index = Math.max(0, Math.min(count - 2, Math.floor(progress)));
  const t = count > 1 ? Math.min(1, progress - index) : 0;
  const a = clip.frames[index]!;
  const b = clip.frames[Math.min(count - 1, index + 1)]!;
  const ball = view.px(lerp(a.ball.x, b.ball.x, t), lerp(a.ball.y, b.ball.y, t));
  // The ball's path so far: keyframes reached, then the moving ball.
  const trail = clip.frames.slice(0, index + 1).map((f) => view.px(f.ball.x, f.ball.y));
  const lead = [
    ...trail.slice(0, Math.min(trail.length, count - 1)),
    ...(index < count - 2 ? [ball] : []),
  ];
  const shot = index >= count - 2 && count > 1 ? [trail.at(-1)!, ball] : [];
  const path = (points: { x: number; y: number }[]) =>
    points.length > 1
      ? points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
      : '';
  const H = view.height;
  const stripes = useMemo(() => {
    let d = '';
    for (let y = -22; y < H; y += 40) d += `M-14 ${y}H354V${y + 20}H-14Z`;
    return d;
  }, [H]);
  const name = scorer?.split(' ').at(-1) ?? '';
  const tag = Math.max(34, name.length * 5.6 + 14);
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
        className="fill-white stroke-white"
        fillOpacity="0.16"
        strokeWidth="2"
      />
      <path
        d={path(lead)}
        fill="none"
        className="stroke-mint"
        strokeWidth="2.5"
        strokeDasharray="7 6"
        strokeLinecap="round"
      />
      <path
        d={path(shot)}
        fill="none"
        className="stroke-gold"
        strokeWidth="3"
        strokeDasharray="9 6"
        strokeLinecap="round"
      />
      {a.players.map((point, player) => {
        const to = b.players[player] ?? point;
        const p = view.px(lerp(point.x, to.x, t), lerp(point.y, to.y, t));
        if (p.y > H + 12) return null;
        const selected = player === clip.selected;
        return (
          <g key={player} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
            {selected && <circle r="14" className="fill-gold" fillOpacity="0.35" />}
            <circle
              r="8"
              fill={player < 11 ? home : away}
              className={selected ? 'stroke-gold' : player < 11 ? 'stroke-night' : 'stroke-white'}
              strokeWidth={selected ? 3 : 1.6}
            />
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
      <circle cx={ball.x} cy={ball.y} r="4" className="fill-white stroke-night" strokeWidth="1.5" />
    </svg>
  );
}

/** The replay's progress: a track with a tick per keyframe, and the time. */
export function ClipProgress({ playback }: { playback: ClipPlayback }) {
  const { progress, playing, frames } = playback;
  const span = Math.max(1, frames - 1);
  const total = ((FRAME_MS * span) / 1000).toFixed(1);
  const now = ((FRAME_MS * progress) / 1000).toFixed(1);
  const atEnd = !playing && progress >= frames - 1;
  return (
    <figcaption className="flex items-center gap-2.5">
      <span aria-hidden="true" className="relative h-1.5 flex-1 rounded-full bg-track">
        <span
          className={cx(
            'absolute inset-y-0 left-0 rounded-full',
            playing ? 'bg-accent' : 'bg-muted',
          )}
          style={{ width: `${(progress / span) * 100}%` }}
        />
        {Array.from({ length: Math.max(0, frames - 2) }, (_, tick) => (
          <span
            key={tick}
            className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-muted"
            style={{ left: `${((tick + 1) / span) * 100}%` }}
          />
        ))}
      </span>
      <span className="text-xs whitespace-nowrap text-muted tabular-nums">
        {atEnd ? format(h.moments.timeEnd, { total }) : format(h.moments.time, { now, total })}
      </span>
    </figcaption>
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

/** A clip with its progress and replay button, for the shared replay page. */
export function MomentPitch({
  clip,
  home,
  away,
  label,
  scorer,
}: {
  clip: Clip;
  home: Hex;
  away: Hex;
  label: string;
  scorer?: string;
}) {
  const playback = useClipPlayback(clip);
  return (
    <figure className="flex flex-col gap-2">
      <ClipPitch
        clip={clip}
        progress={playback.progress}
        home={home}
        away={away}
        label={label}
        scorer={scorer}
      />
      <ClipProgress playback={playback} />
      <div>
        <ReplayButton playback={playback} />
      </div>
    </figure>
  );
}
