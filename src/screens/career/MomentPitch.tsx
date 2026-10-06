import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';
import type { Clip } from '../../engine/career/honours/clip';
import type { Hex } from '../../model/domain';
import { honoursText as h } from '../../i18n/honours';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/**
 * A clip replayed on a flat pitch: keyframes are interpolated over about two seconds. With
 * reduced motion the final frame is shown, and the replay button steps through keyframes.
 */
export function MomentPitch({
  clip,
  home,
  away,
  label,
}: {
  clip: Clip;
  home: Hex;
  away: Hex;
  label: string;
}) {
  const systemReduced = useReducedMotion();
  const settingReduced = useAppStore((s) => s.settings.reducedMotion);
  const reduced = Boolean(systemReduced) || settingReduced;
  const [progress, setProgress] = useState(clip.frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      setProgress((value) => (value >= clip.frames.length - 1 ? 0 : Math.floor(value) + 1));
      setPlaying(false);
      return;
    }
    const start = performance.now();
    const duration = 900 * (clip.frames.length - 1);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(t * (clip.frames.length - 1));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, reduced, clip.frames.length]);
  const index = Math.min(clip.frames.length - 2, Math.floor(progress));
  const t = clip.frames.length > 1 ? progress - Math.max(0, index) : 0;
  const a = clip.frames[Math.max(0, index)]!;
  const b = clip.frames[Math.min(clip.frames.length - 1, Math.max(0, index) + 1)]!;
  const x = (value: number) => 8 + value;
  const y = (value: number) => 8 + value * 0.64;
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox="0 0 116 80" role="img" aria-label={label} className="w-full rounded-control">
        <rect width="116" height="80" fill="#143d2d" />
        {Array.from({ length: 10 }, (_, stripe) => (
          <rect
            key={stripe}
            x={8 + stripe * 10}
            y="8"
            width="10"
            height="64"
            fill={stripe % 2 ? '#286345' : '#2e704e'}
          />
        ))}
        <g fill="none" stroke="#d5e8cc" strokeOpacity=".85" strokeWidth=".35">
          <rect x="8" y="8" width="100" height="64" />
          <path d="M58 8V72" />
          <circle cx="58" cy="40" r="9.15" />
          <rect x="8" y="20" width="16.5" height="40" />
          <rect x="91.5" y="20" width="16.5" height="40" />
          <rect x="5" y="35.8" width="3" height="8.4" />
          <rect x="108" y="35.8" width="3" height="8.4" />
        </g>
        {a.players.map((point, player) => {
          const to = b.players[player]!;
          const px = x(lerp(point.x, to.x, t));
          const py = y(lerp(point.y, to.y, t));
          const selected = player === clip.selected;
          return (
            <g key={player} transform={`translate(${px} ${py})`}>
              {selected && <circle r="2.7" fill="none" stroke="#ffda70" strokeWidth=".4" />}
              <circle
                r="1.7"
                fill={player < 11 ? home : away}
                stroke={player < 11 ? '#111e2c' : '#ffffff'}
                strokeWidth=".3"
              />
            </g>
          );
        })}
        <circle
          cx={x(lerp(a.ball.x, b.ball.x, t))}
          cy={y(lerp(a.ball.y, b.ball.y, t))}
          r=".75"
          fill="#ffffff"
          stroke="#17221c"
          strokeWidth=".2"
        />
      </svg>
      <div>
        <button className="button secondary" onClick={() => setPlaying((value) => !value)}>
          {playing ? h.moments.pause : h.moments.replay}
        </button>
      </div>
    </figure>
  );
}
