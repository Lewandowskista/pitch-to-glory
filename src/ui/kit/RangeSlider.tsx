import { cx } from './cx';

/**
 * A labelled slider (Settings artboard): the label on the left, the written value on the right
 * in an `<output>` tied to the input, a 44px-tall native range below and optional tick labels
 * under it. `size="lg"` writes the value as a Bebas number (text size); `sm` keeps it in the
 * label's line (volumes). `valueText` is both the visible value and `aria-valuetext`, so a
 * screen reader hears "75%" rather than "75". Disabled sliders dim and stop taking input.
 */
export function RangeSlider({
  id,
  label,
  value,
  valueText,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  ticks,
  size = 'sm',
  className,
}: {
  id: string;
  label: string;
  value: number;
  valueText: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Evenly spaced labels under the track, first at `min` and last at `max`. */
  ticks?: string[];
  size?: 'sm' | 'lg';
  className?: string;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={cx('font-bold', size === 'sm' && 'text-[0.8125rem]')}>
          {label}
        </label>
        <output
          htmlFor={id}
          className={cx(
            size === 'lg'
              ? 'font-display text-[1.75rem] leading-none'
              : 'text-[0.8125rem] font-extrabold',
            disabled ? 'text-muted' : 'text-accent',
          )}
        >
          {valueText}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cx(
          'm-0 block w-full accent-accent',
          size === 'lg' ? 'h-11' : 'h-10',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      />
      {ticks && ticks.length > 1 && (
        <div
          aria-hidden="true"
          className="flex justify-between px-0.5 text-xs font-semibold text-muted"
        >
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      )}
    </div>
  );
}
