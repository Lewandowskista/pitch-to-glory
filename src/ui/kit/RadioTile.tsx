import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * A radio choice drawn as a card (Settings artboard, theme picker): a picture of the option
 * on top, then the native radio, an optional icon and the name. The whole card is the label,
 * so it is one large target; the radio itself keeps the focus ring and the arrow keys. The
 * chosen card gets the accent outline and tint, and its radio is filled, so the state never
 * rests on colour. Group tiles in a `<fieldset>` with a `<legend>` (visible or `sr-only`).
 */
export function RadioTile({
  name,
  value,
  checked,
  onChange,
  label,
  icon,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  icon?: IconName;
  /** The picture of the option, hidden from assistive technology. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cx(
        'flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-panel border p-2.5 transition-colors',
        checked
          ? 'border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]'
          : 'border-line bg-surface hover:bg-surface-soft',
        className,
      )}
    >
      {children && (
        <span aria-hidden="true" className="block">
          {children}
        </span>
      )}
      <span className="flex min-h-7 items-center gap-2.5 px-1">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className="m-0 h-5 w-5 shrink-0 cursor-pointer accent-accent"
        />
        {icon && <Icon name={icon} className="h-[18px] w-[18px] shrink-0" />}
        <span className="min-w-0 font-bold">{label}</span>
      </span>
    </label>
  );
}
