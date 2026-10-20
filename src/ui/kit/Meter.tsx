import type { ReactNode } from 'react';
import { format } from '../../i18n';
import { kitText as k } from '../../i18n/kit';
import { cx } from './cx';

export type MeterTone = 'accent' | 'danger' | 'gold' | 'info';
const FILL: Record<MeterTone, string> = {
  accent: 'bg-accent',
  danger: 'bg-danger',
  // Light theme: dark gold that reads on the pale track; dark theme: trophy gold.
  gold: 'bg-meter-gold',
  info: 'bg-info',
};
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/**
 * A labelled bar with its value written beside it (form, morale, fitness, fatigue, challenge
 * progress). Every bar is a `role="meter"`; the written value means it never relies on the
 * fill. `max` defaults to 100 ("72 of 100"); other scales read "2 of 3".
 */
export function Meter({
  label,
  ariaLabel,
  value,
  max = 100,
  tone = 'accent',
  valueText,
  className,
}: {
  /** Shown above the bar: keep it short when the card already names the subject. */
  label: ReactNode;
  /** The full name for screen readers, when the visible label relies on the card title. */
  ariaLabel?: string;
  value: number;
  max?: number;
  tone?: MeterTone;
  /** The written value; defaults to "72 of 100" (or "2 of 3"). */
  valueText?: string;
  className?: string;
}) {
  const bounded = Math.round(clamp(value, max));
  const text =
    valueText ??
    (max === 100
      ? format(k.meterValue, { value: bounded })
      : format(k.ofMax, { value: bounded, max }));
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.8125rem]">
        <span className="font-bold">{label}</span>
        <span className="text-muted tabular-nums">{text}</span>
      </div>
      <div
        role="meter"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={bounded}
        aria-valuetext={text}
        className="h-2 overflow-hidden rounded-full bg-track"
      >
        <span
          className={cx('block h-full rounded-full', FILL[tone])}
          style={{ width: `${(bounded / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Experience towards the next level: "Level 4" in Bebas, "193 / 357 XP", and a green-to-gold
 * bar. At the maximum level (`needed` 0) the bar is full and says so.
 */
export function XpBar({
  level,
  into,
  needed,
  className,
}: {
  level: number;
  into: number;
  needed: number;
  className?: string;
}) {
  const percent = needed ? Math.min(100, (into / needed) * 100) : 100;
  return (
    <div className={className}>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[0.8125rem]">
        <span className="font-display text-[1.375rem] leading-none text-accent">
          {format(k.level, { level })}
        </span>
        <span className="text-muted tabular-nums">
          {needed ? format(k.xp, { into, needed }) : k.xpMax}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={format(k.xpLabel, { level: level + 1 })}
        aria-valuemin={0}
        aria-valuemax={Math.max(1, needed)}
        aria-valuenow={needed ? into : 1}
        className="h-3 overflow-hidden rounded-full bg-track"
      >
        <span
          className="block h-full rounded-full bg-gradient-to-r from-accent to-gold"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * One attribute (1–99): the name, the Bebas value and a bar with a tick at the soft cap.
 * Beyond the cap the fill turns gold (`beyondCap`), because each point now costs more. The
 * optional captions sit under the bar ("Soft cap 66" · "1 pt per +1").
 */
export function AttributeBar({
  label,
  value,
  softCap,
  max = 99,
  capLabel,
  note,
  className,
}: {
  label: ReactNode;
  value: number;
  softCap?: number;
  max?: number;
  /** Left caption; defaults to "Soft cap N" when a cap is given. */
  capLabel?: ReactNode;
  /** Right caption, such as the cost of the next point. */
  note?: ReactNode;
  className?: string;
}) {
  const bounded = Math.round(clamp(value, max));
  const beyond = softCap !== undefined && bounded > softCap;
  const caption =
    capLabel ?? (softCap !== undefined ? format(k.softCap, { value: softCap }) : null);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="font-display text-[1.375rem] leading-none tabular-nums">{bounded}</span>
      </div>
      <div
        role="meter"
        aria-label={typeof label === 'string' ? label : undefined}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={bounded}
        aria-valuetext={
          softCap === undefined
            ? String(bounded)
            : `${bounded}, ${format(k.softCap, { value: softCap })}`
        }
        className="relative mt-1 h-2 rounded-full bg-track"
      >
        <span
          className={cx(
            'absolute inset-y-0 left-0 rounded-full',
            beyond ? 'bg-meter-gold' : 'bg-accent',
          )}
          style={{ width: `${(bounded / max) * 100}%` }}
        />
        {softCap !== undefined && (
          <span
            aria-hidden="true"
            className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full bg-ink"
            style={{ left: `${(clamp(softCap, max) / max) * 100}%` }}
          />
        )}
      </div>
      {(caption || note) && (
        <div className="mt-1 flex justify-between gap-2 text-xs text-muted">
          <span>{caption}</span>
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A change around zero (manager's trust +6, fan affection −4): the bar grows right in accent
 * for gains and left in danger for losses, from a centre tick. The signed value is written.
 */
export function DivergingBar({
  label,
  value,
  range = 20,
  className,
}: {
  label: ReactNode;
  value: number;
  /** The largest change the bar shows at full length on either side. */
  range?: number;
  className?: string;
}) {
  const bounded = Math.max(-range, Math.min(range, value));
  const positive = value >= 0;
  const text = `${positive ? '+' : '−'}${Math.abs(Math.round(value))}`;
  return (
    <div className={className}>
      <div className="mb-1 flex justify-between gap-2 text-[0.8125rem]">
        <span className="font-semibold">{label}</span>
        <span
          className={cx('font-extrabold tabular-nums', positive ? 'text-accent' : 'text-danger')}
        >
          {text}
        </span>
      </div>
      <div
        role="meter"
        aria-label={typeof label === 'string' ? label : undefined}
        aria-valuemin={-range}
        aria-valuemax={range}
        aria-valuenow={Math.round(bounded)}
        aria-valuetext={text}
        className="relative h-2 rounded-full bg-track"
      >
        <span
          aria-hidden="true"
          className="absolute -top-[3px] left-1/2 h-3.5 w-0.5 -translate-x-1/2 bg-muted"
        />
        <span
          className={cx(
            'absolute inset-y-0 rounded-full',
            positive ? 'left-1/2 bg-accent' : 'right-1/2 bg-danger',
          )}
          style={{ width: `${(Math.abs(bounded) / range) * 50}%` }}
        />
      </div>
    </div>
  );
}
