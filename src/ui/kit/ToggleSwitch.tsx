import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * An on/off switch: a native checkbox with `role="switch"` drawn by the shared `.switch` class
 * (the knob position and the fill both show the state). The visible track is 52 x 30, so it
 * sits inside a 60 x 44 label that takes the click too: the touch target is always 44px.
 * Name it with `labelledBy` (the id of the visible text label); `describedBy` adds its help.
 */
export function ToggleSwitch({
  id,
  checked,
  onChange,
  disabled = false,
  labelledBy,
  describedBy,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  labelledBy?: string;
  describedBy?: string;
  className?: string;
}) {
  return (
    <label
      className={cx(
        'grid min-h-11 min-w-15 shrink-0 place-items-center',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <input
        id={id}
        className="switch"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

/**
 * A titled setting with its switch on the right edge (Settings artboard): a bold title that is
 * the switch's label, one muted line on what it does, and the switch. Rows stack inside a card;
 * pass `divided` to every row after the first for the hairline between them. The title can be
 * a heading (`h2` where the card has no visible title of its own, `h3` under a card title).
 */
export function SwitchRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled = false,
  headingLevel = 'h3',
  badge,
  divided = false,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  headingLevel?: 'h2' | 'h3' | 'h4' | 'p';
  /** A small marker after the title (a `Chip`). */
  badge?: ReactNode;
  divided?: boolean;
  className?: string;
}) {
  const Title = headingLevel;
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div
      className={cx('flex items-center gap-4', divided && 'border-t border-line pt-4', className)}
    >
      <div className="min-w-0 flex-1">
        <Title className="flex flex-wrap items-center gap-2 text-base leading-snug font-extrabold">
          <label id={labelId} htmlFor={id} className="cursor-pointer">
            {title}
          </label>
          {badge}
        </Title>
        {description && (
          <p id={descriptionId} className="mt-0.5 text-[0.8125rem] text-muted">
            {description}
          </p>
        )}
      </div>
      <ToggleSwitch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        labelledBy={labelId}
        describedBy={descriptionId}
      />
    </div>
  );
}
