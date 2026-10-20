import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * A big Bebas number with a short Inter label, on a soft tile: season stats ("Goals 6"),
 * attribute summaries ("71 PAC"). The label always comes first in reading order; `valueFirst`
 * only flips the visual order (number on top, label under it).
 */
export function StatTile({
  label,
  value,
  hint,
  valueFirst = false,
  size = 'lg',
  tone = 'soft',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** A small line under the number ("of 34", "+2 this week"). */
  hint?: ReactNode;
  valueFirst?: boolean;
  /** `lg`: 44px numbers for headline stats; `sm`: 26px for compact rows of four. */
  size?: 'sm' | 'lg';
  /** `soft` on white cards; `surface` on soft or tinted cards. */
  tone?: 'soft' | 'surface';
  className?: string;
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 gap-1 rounded-control',
        valueFirst ? 'flex-col-reverse items-center text-center' : 'flex-col justify-between',
        size === 'lg' ? 'px-3.5 py-3' : 'px-1.5 py-2',
        tone === 'soft' ? 'bg-surface-soft' : 'border border-line bg-surface',
        className,
      )}
    >
      <span
        className={cx(
          'text-muted',
          valueFirst ? 'text-[0.6875rem] font-bold tracking-[0.06em]' : 'text-xs font-semibold',
        )}
      >
        {label}
      </span>
      <span
        className={cx(
          'font-display leading-[0.9] tabular-nums',
          size === 'lg' ? 'text-[2.75rem]' : 'text-[1.625rem] leading-none',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
