import type { ManagerPromise, World } from '../../model/domain';
import { getSeasonWeeks } from '../../engine/world/calendar';
import { acceptPromise, currentPromise, declinePromise } from '../../engine/career/stories/promise';
import { useAppStore } from '../../store';
import { format, t } from '../../i18n';
import { storiesText as s } from '../../i18n/stories';
import { ui, useEditBlock } from './shared';

const P = s.promise;

/** A milestone in words: "Complete 35 passes in six weeks". */
export function promiseMilestone(
  promise: Pick<ManagerPromise, 'kind' | 'target' | 'attribute'>,
): string {
  return format(P.milestone[promise.kind], {
    target: promise.target,
    attribute: promise.attribute
      ? (t.world.attributes[promise.attribute as keyof typeof t.world.attributes] ??
        promise.attribute)
      : '',
  });
}

/**
 * The manager's challenge on Club life: the offer to accept or decline, the milestone's
 * weekly progress, or how it ended.
 */
export function PromiseCard({ world, className = '' }: { world: World; className?: string }) {
  const block = useEditBlock();
  const promise = currentPromise(world);
  const manager = promise ? (world.managers[promise.managerId]?.name ?? '') : '';
  const act = (action: (current: World) => World) => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(action(current));
  };
  const goal = world.career?.coaching?.goal;
  return (
    <section aria-labelledby="promise-heading" className={`${ui.panel} ${className}`}>
      <h2 id="promise-heading" className={ui.heading}>
        {P.title}
      </h2>
      {!promise ? (
        <p className={`${ui.muted} mt-3`}>
          {goal?.season === world.date.season && getSeasonWeeks(world) - world.date.week < 6
            ? P.noRoom
            : P.none}
        </p>
      ) : (
        <>
          <p className="mt-3 font-display text-2xl leading-tight">{promiseMilestone(promise)}</p>
          {promise.status === 'offered' && (
            <>
              <p className="mt-2 text-sm text-muted">{format(P.offered, { manager })}</p>
              <p className="mt-1 text-sm font-semibold">
                {format(P.respond, { week: promise.respondBy })}
              </p>
              {block && <p className="mt-2 text-xs text-muted">{block}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="button"
                  disabled={Boolean(block)}
                  onClick={() => act(acceptPromise)}
                >
                  {P.accept}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={Boolean(block)}
                  onClick={() => act(declinePromise)}
                >
                  {P.decline}
                </button>
              </div>
            </>
          )}
          {promise.status === 'active' && <ActiveProgress world={world} promise={promise} />}
          {promise.status === 'achieved' && (
            <p className="mt-2 text-sm font-semibold text-accent">
              {format(P.achieved, { week: promise.resolved?.week ?? '', manager })}
            </p>
          )}
          {promise.status === 'missed' && (
            <p className="mt-2 text-sm font-semibold text-danger">
              {format(P.missed, {
                value: promise.progress,
                target: promise.target,
                week: promise.deadline ?? '',
                manager,
              })}
            </p>
          )}
          {promise.status === 'cancelled' && promise.end && (
            <p className="mt-2 text-sm text-muted">{P.cancelled[promise.end]}</p>
          )}
        </>
      )}
    </section>
  );
}

function ActiveProgress({ world, promise }: { world: World; promise: ManagerPromise }) {
  const value = Math.min(promise.progress, promise.target);
  const label = format(P.progress, { value: promise.progress, target: promise.target });
  return (
    <div className="mt-3">
      <p className="text-sm text-muted">{format(P.active, { week: promise.deadline ?? '' })}</p>
      <p className="mt-2 text-sm font-semibold">{label}</p>
      <div
        role="progressbar"
        aria-label={P.progressLabel}
        aria-valuemin={0}
        aria-valuemax={promise.target}
        aria-valuenow={value}
        aria-valuetext={label}
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.round((value / promise.target) * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {format(P.weeksLeft, {
          weeks: Math.max(0, (promise.deadline ?? world.date.week) - world.date.week + 1),
        })}
      </p>
    </div>
  );
}
