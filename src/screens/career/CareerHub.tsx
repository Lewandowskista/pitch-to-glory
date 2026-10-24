import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { lazyPage } from '../../ui/lazyPage';
import type { World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { getSeasonWeeks } from '../../engine/world/calendar';
import { CareerLoading, CareerPage } from './shared';

/**
 * The hub's body is most of the hub's code. Without a career the page shows only the story
 * intro, so the body loads when there is a save to show: from the start when the address names
 * one, beside the save itself.
 */
const loadBody = () => import('./HubBody');
const HubContent = lazyPage(() => loadBody().then((module) => ({ default: module.HubContent })));

/** "Season 2026 · Week 15 of 34", plus what to do first while a recovery choice waits. */
function hubDescription(world: World | null): string | undefined {
  const career = world?.career;
  if (!world || !career) return undefined;
  const weeks = getSeasonWeeks(world);
  const line =
    world.phase === 'complete'
      ? format(c.hub.seasonDone, { season: world.date.season })
      : format(c.hub.seasonWeek, {
          season: world.date.season,
          week: Math.min(world.date.week, weeks),
          weeks,
        });
  return career.injury?.recovery === null && world.phase === 'active'
    ? `${line}. ${c.hub.recoveryFirst}`
    : line;
}

export default function CareerHub() {
  const description = useAppStore((s) => hubDescription(s.world));
  const [params] = useSearchParams();
  const career = useAppStore((s) => Boolean(s.world?.career));
  const saved = params.has('save');
  useEffect(() => {
    if (saved || career) void loadBody().catch(() => {});
  }, [saved, career]);
  return (
    <CareerPage title={c.titles.hub} description={description}>
      {({ world, career, player, club, age }) => (
        <Suspense fallback={<CareerLoading />}>
          <HubContent world={world} career={career} player={player} club={club} age={age} />
        </Suspense>
      )}
    </CareerPage>
  );
}
