import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

const DISC = {
  green: 'bg-accent-soft text-accent',
  blue: 'bg-art-blue text-info',
  gold: 'bg-art-gold text-gold-ink',
} as const;

/**
 * A section with nothing in it yet: a 56px icon disc, a title, one line that says how it fills
 * up, and at most one action (usually a secondary `ButtonLink`). Centred, on a white card by
 * default; pass `plain` to drop the card when it already sits inside one.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  tone = 'green',
  headingLevel = 'h2',
  plain = false,
  className,
}: {
  icon: IconName;
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  tone?: keyof typeof DISC;
  headingLevel?: 'h2' | 'h3';
  plain?: boolean;
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-3 text-center',
        plain
          ? 'py-4'
          : 'ui-card rounded-panel border border-line bg-surface px-6 py-7 shadow-surface',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx('grid h-14 w-14 place-items-center rounded-full', DISC[tone])}
      >
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <Heading className="font-display text-[1.875rem] leading-none font-normal">{title}</Heading>
      <p className="max-w-[18rem] text-[0.8125rem] text-muted">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
