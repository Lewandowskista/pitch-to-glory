import { useMemo } from 'react';
import type { Club, Manager, ManagerPromise, World } from '../../model/domain';
import { getSeasonWeeks } from '../../engine/world/calendar';
import { acceptPromise, currentPromise, declinePromise } from '../../engine/career/stories/promise';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { useAppStore } from '../../store';
import { format, t } from '../../i18n';
import { storiesText as s } from '../../i18n/stories';
import { socialText } from '../../i18n/social';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { Button, CardTitle, HeroPanel, Panel, StatusLine } from '../../ui/kit';
import { useEditBlock } from './shared';
import { ClockIcon } from './marketUi';

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

/** Whether the manager's challenge leads Club life: it needs an answer or is running. */
export function promiseLeads(world: World): boolean {
  const status = currentPromise(world)?.status;
  return status === 'offered' || status === 'active';
}

/**
 * The manager's challenge on Club life. An offer to answer or a running challenge leads the
 * page as the field-green hero; how it ended, or why there is none, sits in a quiet card.
 */
export function PromiseCard({ world, className = '' }: { world: World; className?: string }) {
  const promise = currentPromise(world);
  if (promise && (promise.status === 'offered' || promise.status === 'active'))
    return <PromiseHero world={world} promise={promise} className={className} />;
  const manager = promise ? (world.managers[promise.managerId]?.name ?? '') : '';
  const goal = world.career?.coaching?.goal;
  return (
    <Panel aria-labelledby="promise-heading" className={className}>
      <CardTitle id="promise-heading" size="sm">
        {P.title}
      </CardTitle>
      {!promise ? (
        <p className="mt-3 text-sm text-muted">
          {goal?.season === world.date.season && getSeasonWeeks(world) - world.date.week < 6
            ? P.noRoom
            : P.none}
        </p>
      ) : (
        <>
          <p className="mt-3 font-display text-[1.625rem] leading-none">
            {promiseMilestone(promise)}
          </p>
          {promise.status === 'achieved' && (
            <p className="mt-2 flex items-start gap-2 text-[0.8125rem] font-bold text-accent">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
              {format(P.achieved, { week: promise.resolved?.week ?? '', manager })}
            </p>
          )}
          {promise.status === 'missed' && (
            <p className="mt-2 flex items-start gap-2 text-[0.8125rem] font-bold text-danger">
              <Icon name="close" className="mt-0.5 h-4 w-4 shrink-0" />
              {format(P.missed, {
                value: promise.progress,
                target: promise.target,
                week: promise.deadline ?? '',
                manager,
              })}
            </p>
          )}
          {promise.status === 'cancelled' && promise.end && (
            <p className="mt-2 text-[0.8125rem] text-muted">{P.cancelled[promise.end]}</p>
          )}
        </>
      )}
    </Panel>
  );
}

function ManagerPortrait({ manager, club }: { manager: Manager; club: Club | undefined }) {
  const svg = useMemo(
    () => renderAvatar(manager.avatar, Math.min(110, manager.age), clubDress(club)),
    [manager, club],
  );
  return (
    <Artwork
      svg={svg}
      alt=""
      className="h-20 w-20 shrink-0 rounded-full ring-4 ring-gold/50 sm:h-26 sm:w-26"
    />
  );
}

function PromiseHero({
  world,
  promise,
  className,
}: {
  world: World;
  promise: ManagerPromise;
  className: string;
}) {
  const block = useEditBlock();
  const manager = world.managers[promise.managerId];
  const club = world.clubs[promise.clubId];
  const act = (action: (current: World) => World) => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(action(current));
  };
  return (
    <HeroPanel aria-labelledby="promise-heading" markings className={className}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        {manager && <ManagerPortrait manager={manager} club={club} />}
        <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              id="promise-heading"
              className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase"
            >
              {P.title}
            </h2>
            {manager && (
              <span className="rounded-full bg-hero-ink/15 px-2.5 py-0.5 text-xs font-bold">
                {format(socialText.people.manager, {
                  name: manager.name,
                  formation: manager.preferredFormation,
                })}
              </span>
            )}
          </div>
          <p className="font-display text-[2.5rem] leading-[0.95] break-words sm:text-[3rem]">
            {promiseMilestone(promise)}
          </p>
          {promise.status === 'offered' ? (
            <>
              <p className="max-w-[40rem] text-hero-muted">
                {format(P.offered, { manager: manager?.name ?? '' })}
              </p>
              <p className="flex items-center gap-2 font-bold">
                <ClockIcon className="h-4 w-4 shrink-0 text-gold" />
                {format(P.respond, { week: promise.respondBy })}
              </p>
            </>
          ) : (
            <ActiveProgress world={world} promise={promise} />
          )}
        </div>
        {promise.status === 'offered' && (
          <div className="flex w-full flex-col gap-3 sm:w-auto">
            {block && (
              <StatusLine tone="neutral" className="max-w-xs">
                {block}
              </StatusLine>
            )}
            <Button
              variant="play"
              size="lg"
              disabled={Boolean(block)}
              onClick={() => act(acceptPromise)}
            >
              {P.accept}
            </Button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-hero-ink/45 px-5 font-bold text-hero-ink transition-colors hover:bg-hero-ink/10 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={Boolean(block)}
              onClick={() => act(declinePromise)}
            >
              {P.decline}
            </button>
          </div>
        )}
      </div>
    </HeroPanel>
  );
}

function ActiveProgress({ world, promise }: { world: World; promise: ManagerPromise }) {
  const value = Math.min(promise.progress, promise.target);
  const label = format(P.progress, { value: promise.progress, target: promise.target });
  return (
    <div className="mt-1 max-w-[40rem]">
      <p className="text-hero-muted">{format(P.active, { week: promise.deadline ?? '' })}</p>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-display text-[1.75rem] leading-none text-gold">{label}</span>
        <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-hero-muted">
          <ClockIcon className="h-4 w-4 shrink-0" />
          {format(P.weeksLeft, {
            weeks: Math.max(0, (promise.deadline ?? world.date.week) - world.date.week + 1),
          })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={P.progressLabel}
        aria-valuemin={0}
        aria-valuemax={promise.target}
        aria-valuenow={value}
        aria-valuetext={label}
        className="mt-2 h-3 overflow-hidden rounded-full bg-hero-ink/20"
      >
        <div
          className="h-full rounded-full bg-gold"
          style={{ width: `${Math.round((value / promise.target) * 100)}%` }}
        />
      </div>
    </div>
  );
}
