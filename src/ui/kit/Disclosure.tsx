import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { cx } from './cx';

/**
 * Depth behind a click: a native `<details>` with a 44px summary and a chevron that turns
 * when open ("Show details", "Why this choice?"). Keyboard and screen readers get the native
 * disclosure behaviour for free.
 */
export function Disclosure({
  summary,
  hint,
  defaultOpen = false,
  className,
  children,
}: {
  summary: ReactNode;
  /** A muted aside after the summary ("3 factors"). */
  hint?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen || undefined}
      className={cx('group rounded-control border border-line px-3.5 open:pb-3.5', className)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevron"
          className="h-4 w-4 shrink-0 text-accent transition-transform group-open:rotate-90"
        />
        <span className="min-w-0">{summary}</span>
        {hint && <span className="text-xs font-medium text-muted">{hint}</span>}
      </summary>
      <div className="text-[0.8125rem]">{children}</div>
    </details>
  );
}
