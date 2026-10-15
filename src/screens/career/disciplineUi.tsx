import type { DisciplineScope } from '../../model/domain';
import { format } from '../../i18n';
import { disciplineText as d, matchesLabel, scopeLabel } from '../../i18n/discipline';
import { cx } from '../../ui/kit';

/**
 * Cards and suspensions on the career screens (the discipline phase): the referee's card as a
 * small mark, the "Suspended" status beside a fixture, and the hub's note when a ban rules the
 * player out of the next match. The card is decoration; the words carry the meaning.
 */
export function CardMark({ red = false, className }: { red?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block h-3 w-[9px] shrink-0 rounded-xs',
        red ? 'bg-card-red' : 'bg-card-yellow',
        className,
      )}
    />
  );
}

/**
 * "Suspended · 2 matches" as a status pill; beside one of the fixtures a ban covers, "Suspended
 * · match 1 of 2".
 */
export function SuspendedBadge({
  matches,
  match,
  className,
}: {
  matches: number;
  match?: number;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-extrabold text-danger',
        className,
      )}
    >
      <CardMark red />
      {match
        ? format(d.suspendedFixture, { match, matches })
        : format(d.suspended, { matches: matchesLabel(matches) })}
    </span>
  );
}

/** The hub's next match when a ban rules the player out of it: matches left and where. */
export function SuspendedNote({
  matches,
  scope,
  className,
}: {
  matches: number;
  scope: DisciplineScope;
  className?: string;
}) {
  return (
    <div
      className={cx('flex items-start gap-3 rounded-control bg-black/25 px-4 py-3.5', className)}
      data-testid="hub-suspended"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block h-9 w-[26px] shrink-0 -rotate-6 rounded-xs bg-card-red"
      />
      <div className="min-w-0">
        <p className="font-bold">{format(d.suspended, { matches: matchesLabel(matches) })}</p>
        <p className="text-[0.8125rem] text-hero-muted">
          {format(d.suspendedHub, { matches: matchesLabel(matches), scope: scopeLabel(scope) })}
        </p>
      </div>
    </div>
  );
}
