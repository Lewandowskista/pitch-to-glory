import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { cx } from './cx';

export type StatusTone = 'success' | 'neutral' | 'error' | 'warning';

const TONE: Record<StatusTone, string> = {
  success: 'bg-accent-soft text-accent font-semibold',
  neutral: 'bg-surface-soft text-ink',
  warning: 'bg-art-gold text-gold-ink font-semibold',
  error: 'border border-danger bg-danger-soft text-danger font-semibold',
};
const ICON = { success: 'check', neutral: 'info', warning: 'warning', error: 'alert' } as const;

/**
 * A one-line result placed right under the control that caused it ("Save stored.", "This
 * backup is invalid."). Errors are `role="alert"` with an outline and an alert icon, so they
 * read without colour; the others are `role="status"`. Render it empty (no children) to keep
 * the live region mounted before the message arrives.
 */
export function StatusLine({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children?: ReactNode;
  className?: string;
}) {
  const empty =
    children === undefined || children === null || children === '' || children === false;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        empty ? 'sr-only' : 'flex items-start gap-2.5 rounded-control px-3.5 py-3 text-[0.8125rem]',
        !empty && TONE[tone],
        className,
      )}
    >
      {!empty && (
        <>
          <Icon name={ICON[tone]} className="mt-px h-4 w-4 shrink-0" />
          <span className="min-w-0">{children}</span>
        </>
      )}
    </p>
  );
}
