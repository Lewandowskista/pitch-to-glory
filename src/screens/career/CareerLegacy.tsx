import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Legacy, World } from '../../model/domain';
import { renderAvatar } from '../../engine/assets/avatar';
import { trophyName } from '../../engine/career/honours/trophies';
import { useAppStore } from '../../store';
import { Page } from '../../ui/Page';
import { Icon } from '../../ui/Icon';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import {
  CareerEmpty,
  CareerNav,
  CrestImage,
  plural,
  ui,
  useRestoredWorld,
  useSaveLink,
} from './shared';

import { CONFIG } from '../../engine/config';
import { money } from './marketUi';
import { ChronicleView } from './ChronicleView';

const integer = new Intl.NumberFormat('en');
const R = CONFIG.career.honours.retirement;

/**
 * Legacies of every career that ended in this world (AGENTS.md §8, §9.2). Works with or
 * without an active career, so it is the landing page right after retirement.
 */
export default function CareerLegacy() {
  const world = useAppStore((s) => s.world);
  const { loading, error } = useRestoredWorld();
  return (
    <Page className="career-page">
      {world?.career && !loading && <CareerNav />}
      <div className="page-body">
        <header className="page-heading">
          <h1>{h.titles.legacy}</h1>
          <p>{h.legacy.body}</p>
        </header>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status" className={ui.muted}>
            {c.common.loading}
          </p>
        ) : !world ? (
          <CareerEmpty />
        ) : (
          <>
            <LegacyContent world={world} />
          </>
        )}
      </div>
    </Page>
  );
}

function LegacyContent({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  const link = useSaveLink();
  const legacies = [...world.legacies].reverse();
  const selected = legacies.find((legacy) => legacy.id === params.get('legacy')) ?? legacies[0];
  if (!selected)
    return (
      <section
        aria-labelledby="legacy-empty-heading"
        className={`${ui.panel} flex max-w-3xl flex-col gap-4`}
      >
        <h2 id="legacy-empty-heading" className={ui.heading}>
          {h.legacy.emptyTitle}
        </h2>
        <p className="max-w-prose text-sm">
          {format(h.legacy.emptyBody, { age: R.optionalAge, forced: R.forcedAge })}
        </p>
        <div className="flex flex-wrap gap-2">
          {world.career ? (
            <Link className="button" to={link('/career/chronicle')}>
              {h.legacy.chronicle}
              <Icon name="arrow" />
            </Link>
          ) : (
            <Link className="button" to={link('/career/new')}>
              {h.legacy.newCareer}
              <Icon name="arrow" />
            </Link>
          )}
        </div>
      </section>
    );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {legacies.length > 1 && (
        <nav aria-label={h.legacy.title} className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col">
            {legacies.map((legacy) => (
              <li key={legacy.id} className="shrink-0">
                <button
                  aria-current={legacy.id === selected.id ? 'true' : undefined}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('legacy', legacy.id);
                    setParams(next, { replace: true });
                  }}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-control border px-3 py-2 text-left text-sm ${
                    legacy.id === selected.id
                      ? 'border-accent bg-accent-soft font-bold'
                      : 'border-line bg-surface'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{legacy.name}</span>
                  <span className="text-xs text-muted">{legacy.retiredAt.season}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <LegacyDetail
        world={world}
        legacy={selected}
        latest={selected.id === legacies[0]!.id}
        wide={legacies.length > 1}
      />
    </div>
  );
}

function LegacyDetail({
  world,
  legacy,
  latest,
  wide,
}: {
  world: World;
  legacy: Legacy;
  latest: boolean;
  wide: boolean;
}) {
  const portrait = useMemo(
    () => renderAvatar(legacy.avatar, legacy.age),
    [legacy.avatar, legacy.age],
  );
  const trophies = world.trophies.filter((trophy) => legacy.trophyIds.includes(trophy.id));
  const awards = world.awards.filter((award) => legacy.awardIds.includes(award.id));
  const child = legacy.childPlayerId ? world.players[legacy.childPlayerId] : undefined;
  const link = useSaveLink();
  const stats: [string, number][] = [
    [h.legacy.apps, legacy.stats.appearances],
    [h.legacy.goals, legacy.stats.goals],
    [h.legacy.assists, legacy.stats.assists],
    [h.legacy.caps, legacy.stats.caps],
    [h.legacy.intGoals, legacy.stats.internationalGoals],
  ];
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] gap-6 ${wide ? '' : 'lg:col-span-2'}`}>
      <section
        aria-labelledby="legacy-heading"
        className={`${ui.panel} grid grid-cols-[minmax(0,1fr)] gap-6 bg-art-green md:grid-cols-[10rem_minmax(0,1fr)]`}
      >
        <Artwork svg={portrait} alt="" className="h-40 w-40 rounded-full bg-art-blue" />
        <div className="flex min-w-0 flex-col gap-3">
          {latest && !world.career && <p className={ui.eyebrow}>{h.legacy.yourLegacy}</p>}
          <h2 id="legacy-heading" className="font-display text-[2.6rem] leading-[0.95]">
            {legacy.name}
          </h2>
          <p className="text-sm text-muted">
            {c.positions[legacy.position]} · {world.countries[legacy.nationalityId]?.name} ·{' '}
            {format(h.legacy.retired, { age: legacy.age, season: legacy.retiredAt.season })}
          </p>
          <div className="rounded-control bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              {h.legacy.hallOfFame}
            </p>
            <p className="font-display text-4xl leading-none text-accent">
              {format(h.awards.rank, { rank: legacy.hallOfFame.rank })}
            </p>
            <p className="text-sm">
              {format(h.legacy.hallRank, { of: integer.format(legacy.hallOfFame.of) })}
            </p>
          </div>
          {!world.career && (
            <div className="flex flex-wrap gap-2">
              {!legacy.childPlayerId && (
                <Link
                  className="button"
                  to={link(`/career/new?parent=${encodeURIComponent(legacy.id)}`)}
                >
                  {format(h.legacy.child, { name: legacy.name })}
                  <Icon name="arrow" />
                </Link>
              )}
              <Link className="button secondary" to={link('/career/new')}>
                {h.legacy.newCareer}
              </Link>
            </div>
          )}
          {!legacy.childPlayerId && !world.career && (
            <p className="text-xs text-muted">{h.legacy.childBody}</p>
          )}
          {child && <p className="text-sm font-semibold">{h.legacy.childTaken}</p>}
        </div>
      </section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <section aria-labelledby="legacy-stats" className={ui.panel}>
          <h2 id="legacy-stats" className={ui.heading}>
            {h.legacy.stats}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-control bg-surface-soft p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-display text-3xl leading-none">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted">
            {format(h.legacy.peak, { value: legacy.peakAbility })} ·{' '}
            {format(h.legacy.earnings, { amount: money(legacy.earnings) })}
          </p>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
            {h.legacy.clubs}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {legacy.clubIds.map((id) => {
              const club = world.clubs[id];
              if (!club) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-full bg-surface-soft py-1 pl-1 pr-3 text-sm"
                >
                  <CrestImage crest={club.crest} alt="" className="h-7 w-7" />
                  {club.name}
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-labelledby="legacy-honours" className={ui.panel}>
          <h2 id="legacy-honours" className={ui.heading}>
            {h.legacy.honoursTitle}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {plural(trophies.length, h.legacy.trophy, h.legacy.trophies)} ·{' '}
            {plural(awards.length, h.legacy.award, h.legacy.awards)}
          </p>
          {(trophies.length > 0 || awards.length > 0) && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {trophies.map((trophy) => (
                <li key={trophy.id} className={ui.chip}>
                  <span aria-hidden="true">★</span>
                  {trophyName(world, trophy)} · {trophy.season}
                </li>
              ))}
              {awards.map((award) => (
                <li key={award.id} className={ui.chip}>
                  {h.awards.kinds[award.kind]} · {award.season}
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
            {h.legacy.records}
          </h3>
          {legacy.records.length ? (
            <ul className="mt-2 grid gap-1 text-sm font-semibold">
              {legacy.records.map((kind) => (
                <li key={kind}>{h.cabinet.recordKinds[kind]}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{h.legacy.noRecords}</p>
          )}
        </section>
      </div>
      {world.players[legacy.playerId] && <ChronicleView world={world} playerId={legacy.playerId} />}
    </div>
  );
}
