import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * Buttons share the `.button` component classes in `styles/base.css`, so the kit and every
 * screen that still writes `className="button secondary"` look the same by construction.
 *
 * - `primary`: green fill, the main action of a card.
 * - `play`: gold with a pressed edge, the one "go and play" action on a screen (kick off,
 *   continue to matchday). At most one per screen.
 * - `secondary`: white with a line border, the way out or a lesser action.
 * - `danger` / `danger-outline`: something is lost (delete, retire) or undone (withdraw).
 * - `text`: an underlined link-style action ("Show details", "Dismiss").
 * - `tool`: a small bordered action inside lists and slot cards.
 */
export type ButtonVariant =
  'primary' | 'play' | 'secondary' | 'danger' | 'danger-outline' | 'text' | 'tool';
/** `lg` is the 52px hero size (the play button on a hero panel). */
export type ButtonSize = 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'button',
  play: 'button play',
  secondary: 'button secondary',
  danger: 'button danger',
  'danger-outline': 'button danger-outline',
  text: 'text-button',
  tool: 'button tool',
};

/** The class string of a button variant, for elements the kit does not render itself. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  options: { size?: ButtonSize; block?: boolean } = {},
): string {
  return cx(
    VARIANT_CLASS[variant],
    options.size === 'lg' && 'button-lg',
    options.block && 'w-full',
  );
}

/** A small spinner that follows the text colour. Hidden from assistive technology. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      className={cx('spinner shrink-0', className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M12 3A9 9 0 0 1 21 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's width. */
  block?: boolean;
  /** Leading icon (replaced by the spinner while busy). */
  icon?: IconName;
  /** Trailing icon, such as `arrow` on a "continue" action. */
  iconEnd?: IconName;
}

export interface ButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Working on it: keeps the label, shows a spinner, sets `aria-busy` and ignores clicks. Focus
   * stays on the button (it uses `aria-disabled`, not `disabled`).
   */
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size,
    block,
    icon,
    iconEnd,
    busy = false,
    className,
    children,
    onClick,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(buttonClass(variant, { size, block }), className)}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest['aria-disabled'] || undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {busy ? <Spinner /> : icon && <Icon name={icon} />}
      {children}
      {iconEnd && <Icon name={iconEnd} />}
    </button>
  );
});

export interface ButtonLinkProps extends CommonProps, LinkProps {
  children: ReactNode;
}

/** A router link that looks like a button: navigation, not an action. */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'primary', size, block, icon, iconEnd, className, children, ...rest },
  ref,
) {
  return (
    <Link
      ref={ref}
      className={cx(buttonClass(variant, { size, block }), className as string | undefined)}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
      {iconEnd && <Icon name={iconEnd} />}
    </Link>
  );
});

interface IconCommon {
  /** The accessible name: icon-only controls always carry one. */
  label: string;
  icon: IconName;
  /** Show the label as a native tooltip too (desktop hover). Defaults to true. */
  tooltip?: boolean;
}

/** A 44 x 44 round icon-only button with a line border. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  IconCommon & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>
>(function IconButton({ label, icon, tooltip = true, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={tooltip ? label : undefined}
      className={cx('icon-button', className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
});

/** The link form of `IconButton` (the top bar's settings link). */
export const IconButtonLink = forwardRef<
  HTMLAnchorElement,
  IconCommon & Omit<LinkProps, 'children'>
>(function IconButtonLink({ label, icon, tooltip = true, className, ...rest }, ref) {
  return (
    <Link
      ref={ref}
      aria-label={label}
      title={tooltip ? label : undefined}
      className={cx('icon-button', className as string | undefined)}
      {...rest}
    >
      <Icon name={icon} />
    </Link>
  );
});
