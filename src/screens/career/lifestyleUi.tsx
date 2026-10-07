import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { applyLifestyleAction, type LifestyleAction } from '../../engine/career/lifestyle';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { useEditBlock } from './shared';
import { audio } from '../../audio';

/** Run a lifestyle decision; the world is replaced only when it changed. */
export function useLifestyleAction() {
  const block = useEditBlock();
  const [error, setError] = useState('');
  const run = (action: LifestyleAction): boolean => {
    const world = useAppStore.getState().world;
    if (!world?.career || block) return false;
    try {
      const next = applyLifestyleAction(world, action);
      if (next !== world) useAppStore.getState().setWorld(next);
      setError('');
      return true;
    } catch (cause) {
      audio.play('error');
      setError(cause instanceof Error ? cause.message : '');
      return false;
    }
  };
  return { run, error, block };
}

/** Today's local date as YYYY-MM-DD, for the real-calendar challenges. */
export function localDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Bring the day's and week's challenges up to date whenever the career is open. */
export function useChallengeRefresh(): void {
  const block = useEditBlock();
  const career = useAppStore((s) => Boolean(s.world?.career));
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (block || !career) return;
    const world = useAppStore.getState().world;
    if (!world?.career) return;
    try {
      const next = applyLifestyleAction(world, { type: 'refresh-challenges', date: today });
      if (next !== world) useAppStore.getState().setWorld(next);
    } catch {
      // A malformed clock is ignored; challenges stay as they were.
    }
  }, [today, block, career]);
}

export const fameName = (level: number) => l.fame.names[level - 1] ?? '';

/**
 * An animated token performing a celebration, for previews (static under reduced motion).
 * With `onHover`, it holds still until the surrounding `group` is hovered or focused, so a
 * grid of previews does not loop all at once.
 */
export function CelebrationPreview({
  motion,
  label,
  onHover = false,
}: {
  motion: string;
  label: string;
  onHover?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 60 40"
      className={`celebration-preview h-16 w-24 ${
        onHover
          ? '[&_.celebrate]:[animation-play-state:paused] group-hover:[&_.celebrate]:[animation-play-state:running]! group-focus-visible:[&_.celebrate]:[animation-play-state:running]!'
          : ''
      }`}
      role="img"
      aria-label={label}
    >
      <rect width="60" height="40" rx="6" className="fill-field" />
      <path d="M30 0V40M0 20H60" stroke="#d5e8cc" strokeOpacity=".4" strokeWidth=".6" />
      <g transform="translate(30 20)">
        <g className={`celebrate celebrate-${motion}`}>
          <circle r="6.5" fill="none" stroke="#ffda70" strokeWidth="1.2" />
          <circle r="5" fill="#075e45" stroke="#111e2c" strokeWidth="1" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize="5"
            fontWeight="700"
          >
            9
          </text>
        </g>
      </g>
    </svg>
  );
}
