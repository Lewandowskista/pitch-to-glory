import type { ReactNode } from 'react';
import { format } from '../../i18n';
import { kitText as k } from '../../i18n/kit';
import { cx } from './cx';
import type { MeterTone } from './Meter';

const FILL: Record<MeterTone, string> = {
  accent: 'bg-accent',
  danger: 'bg-danger',
  gold: 'bg-meter-gold',
  info: 'bg-info',
};
const NUMBER_TONE: Record<MeterTone | 'ink', string> = {
  ink: '',
  accent: 'text-accent',
  danger: 'text-danger',
  gold: 'text-gold-ink',
  info: 'text-info',
};
const NUMBER_SIZE = {
  sm: 'text-[1.25rem]',
  md: 'text-[1.5rem] sm:text-[1.625rem]',
  lg: 'text-[2.25rem] sm:text-[2.5rem]',
} as const;

/**
 * A meter that leads with its number: the label on the left, the value in Bebas on the right
 * and the bar under both (morale, chemistry, a club's confidence, an agent's network). Use it
 * where the figure itself is the point; the kit's `Meter` stays for quieter "72 of 100" rows.
 * The bar is a `role="meter"` whose spoken value is "72 of 100", so it never relies on the fill.
 */
export function ValueMeter({
  label,
  value,
  max = 100,
  tone = 'accent',
  numberTone = 'ink',
  size = 'md',
  ariaLabel,
  valueText,
  note,
  track = 'track',
  className,
}: {
  label: ReactNode;
  value: number;
  max?: number;
  tone?: MeterTone;
  /** Colour of the number; plain ink by default, the tone's colour when it carries meaning. */
  numberTone?: MeterTone | 'ink';
  /** `sm` 20px numbers inside list rows, `md` 24–26px in cards, `lg` 40px headline meters. */
  size?: keyof typeof NUMBER_SIZE;
  /** The full name for screen readers, when the visible label relies on its surroundings. */
  ariaLabel?: string;
  valueText?: string;
  /** A muted line under the bar ("Target 64 this week, so it drifts down"). */
  note?: ReactNode;
  /** `surface` puts the bar on the card colour, for meters on soft or gold panels. */
  track?: 'track' | 'surface';
  className?: string;
}) {
  const bounded = Math.round(Math.max(0, Math.min(max, value)));
  const text =
    valueText ??
    (max === 100
      ? format(k.meterValue, { value: bounded })
      : format(k.ofMax, { value: bounded, max }));
  return (
    <div className={cx('min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span
          className={cx('font-semibold', size === 'lg' ? 'text-sm font-bold' : 'text-[0.8125rem]')}
        >
          {label}
        </span>
        <span
          aria-hidden="true"
          className={cx(
            'font-display leading-[0.85] tabular-nums',
            NUMBER_SIZE[size],
            NUMBER_TONE[numberTone],
          )}
        >
          {bounded}
        </span>
      </div>
      <div
        role="meter"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={bounded}
        aria-valuetext={text}
        className={cx(
          'overflow-hidden rounded-full',
          size === 'sm' ? 'h-2' : 'h-2.5',
          track === 'surface' ? 'bg-surface' : 'bg-track',
        )}
      >
        <span
          className={cx('block h-full rounded-full', FILL[tone])}
          style={{ width: `${(bounded / max) * 100}%` }}
        />
      </div>
      {note && <p className="mt-1.5 text-xs text-muted">{note}</p>}
    </div>
  );
}
