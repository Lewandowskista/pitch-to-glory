import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * Status chips, 28px pills. Tones carry meaning, never alone: the text says what it means.
 * - `accent`: a role or a good state ("Rotation", "Claimed").
 * - `solid`: the strongest marker in a list ("Recommended", "You").
 * - `gold`: earned or highlighted ("Fame level 2", "Cup").
 * - `gold-soft`: notable, not urgent ("Elite potential", "Unsaved changes").
 * - `danger`: a problem ("Injured · 3 weeks").
 * - `info`: neutral facts ("Away", "Edited", "AUTO").
 * - `neutral`: quiet metadata.
 * - `lock`: not available yet; always shows the lock icon.
 */
export type ChipTone =
  'accent' | 'solid' | 'gold' | 'gold-soft' | 'danger' | 'info' | 'neutral' | 'lock';

const CHIP_TONE: Record<ChipTone, string> = {
  accent: 'bg-accent-soft text-accent',
  solid: 'bg-accent text-on-accent',
  gold: 'bg-gold text-on-gold',
  'gold-soft': 'bg-art-gold text-gold-ink',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-art-blue text-info',
  neutral: 'bg-surface-soft text-muted',
  lock: 'bg-surface-soft text-muted',
};

/** The class string of a chip (`ui.chip` uses the accent tone). */
export function chipClass(tone: ChipTone = 'accent'): string {
  return cx(
    'inline-flex min-h-7 items-center gap-1 rounded-full px-3 text-xs font-bold whitespace-nowrap',
    CHIP_TONE[tone],
  );
}

export function Chip({
  tone = 'accent',
  icon,
  className,
  children,
}: {
  tone?: ChipTone;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}) {
  const glyph = tone === 'lock' ? 'lock' : icon;
  return (
    <span className={cx(chipClass(tone), className)}>
      {glyph && <Icon name={glyph} className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </span>
  );
}

/**
 * A signed effect: "+3 Finishing", "−2 Morale", "+8% Trickster". The sign is always written
 * (a true minus sign for losses), so the meaning never rests on the colour. Gains are accent,
 * losses danger; `gold` marks trait and reward bonuses.
 */
export function EffectChip({
  value,
  label,
  percent = false,
  tone,
  className,
}: {
  value: number;
  label: ReactNode;
  percent?: boolean;
  tone?: 'accent' | 'danger' | 'gold';
  className?: string;
}) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const resolved = tone ?? (value < 0 ? 'danger' : 'accent');
  return (
    <span
      className={cx(
        'inline-flex min-h-[1.625rem] items-center gap-1 rounded-chip px-2.5 text-xs font-extrabold whitespace-nowrap tabular-nums',
        resolved === 'danger'
          ? 'bg-danger-soft text-danger'
          : resolved === 'gold'
            ? 'bg-art-gold text-gold-ink'
            : 'bg-accent-soft text-accent',
        className,
      )}
    >
      {sign}
      {Math.abs(value)}
      {percent ? '%' : ''} {label}
    </span>
  );
}

/**
 * A gold count badge for unread items, capped at "99+". The number is hidden from assistive
 * technology: pass `label` (for example "2 unread") to have it spoken after the element's
 * name, or speak it yourself.
 */
export function CountBadge({
  count,
  label,
  className,
}: {
  count: number;
  label?: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cx(
          'nav-badge inline-grid h-[1.375rem] min-w-[1.375rem] shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[0.6875rem] leading-none font-extrabold whitespace-nowrap text-on-gold',
          className,
        )}
      >
        {count > 99 ? '99+' : count}
      </span>
      {label && <span className="sr-only">, {label}</span>}
    </>
  );
}
