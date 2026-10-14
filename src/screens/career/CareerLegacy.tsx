import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Legacy, World } from '../../model/domain';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { trophyName } from '../../engine/career/honours/trophies';
import { useAppStore } from '../../store';
import { Page } from '../../ui/Page';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import {
  Button,
  ButtonLink,
  CardTitle,
  Chip,
  HeroPanel,
  PageHeader,
  Panel,
  StatTile,
  chipClass,
  cx,
} from '../../ui/kit';
import {
  CareerEmpty,
  CareerNav,
  CrestImage,
  PlayerPortrait,
  plural,
  ui,
  useRestoredWorld,
  useSaveLink,
} from './shared';
import { CONFIG } from '../../engine/config';
import { money } from './marketUi';
import { ChronicleView } from './ChronicleView';
import { counted, Glyph, StarMark, EXPAND_CHEVRON } from './honoursUi';

const integer = new Intl.NumberFormat('en');
const R = CONFIG.career.honours.retirement;
/** Honours chips shown before "Show all". */
const HONOURS_SHOWN = 10;

/**
 * Legacies of every career that ended in this world (AGENTS.md §8, §9.2). Works with or
 * without an active career, so it is the landing page right after retirement.
 */
export default function CareerLegacy() {
  const world = useAppStore((s) => s.world);
  const { loading, error } = useRestoredWorld();
  return (
    <Page className="career-page">
      {(loading || world?.career) && <CareerNav />}
      <div className="page-body">
        <PageHeader title={h.titles.legacy} description={h.legacy.body} />
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
          <LegacyContent world={world} />
        )}
      </div>
    </Page>
  );
}

/** A retired player's bust in the kit of the club they finished at. Decorative. */
function LegacyPortrait({
  world,
  legacy,
  className,
}: {
  world: World;
  legacy: Legacy;
  className: string;
}) {
  const lastClub = world.clubs[legacy.clubIds[legacy.clubIds.length - 1] ?? ''];
  const svg = useMemo(
    () => renderAvatar(legacy.avatar, legacy.age, clubDress(lastClub)),
    [legacy.avatar, legacy.age, lastClub],
  );
  return <Artwork svg={svg} alt="" className={className} />;
}

function LegacyContent({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  const legacies = [...world.legacies].reverse();
  const selected = legacies.find((legacy) => legacy.id === params.get('legacy')) ?? legacies[0];
  if (!selected) return <LegacyEmpty world={world} />;
  return (
    <div className="flex flex-wrap items-start gap-6">
      {legacies.length > 1 && (
        <nav
          aria-label={h.legacy.title}
          className="flex min-w-0 flex-[1_1_15rem] flex-col gap-2 lg:sticky lg:top-6 lg:max-w-[15rem]"
        >
          <span className="px-1 text-xs font-extrabold text-muted">
            {counted(legacies.length, h.legacy.careers)}
          </span>
          <ul className="flex flex-col gap-2">
            {legacies.map((legacy) => {
              const current = legacy.id === selected.id;
              return (
                <li key={legacy.id}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set('legacy', legacy.id);
                      setParams(next, { replace: true });
                    }}
                    className={cx(
                      'flex min-h-14 w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors',
                      current
                        ? 'border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]'
                        : 'border-line bg-surface hover:bg-surface-soft',
                    )}
                  >
                    <LegacyPortrait world={world} legacy={legacy} className="h-10 w-10 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{legacy.name}</span>
                      <span className="block text-xs text-muted">
                        {format(h.legacy.selectorLine, {
                          position: c.positions[legacy.position] ?? '',
                          from: legacy.startSeason,
                          to: legacy.retiredAt.season,
                        })}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-[1.375rem] leading-none text-muted">
                      {legacy.retiredAt.season}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <LegacyDetail world={world} legacy={selected} latest={selected.id === legacies[0]!.id} />
    </div>
  );
}

/** Before any career has ended: what a legacy is, and where the story grows meanwhile. */
function LegacyEmpty({ world }: { world: World }) {
  const link = useSaveLink();
  const player = world.career ? world.players[world.career.playerId] : undefined;
  return (
    <Panel
      aria-labelledby="legacy-empty-heading"
      className="flex max-w-3xl flex-wrap items-center gap-5"
    >
      <div className="relative h-28 w-28 shrink-0">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-dashed border-line"
        />
        {player ? (
          <span className="absolute inset-2.5 opacity-55">
            <PlayerPortrait
              player={player}
              age={world.date.season - player.birthSeason}
              club={player.clubId ? world.clubs[player.clubId] : undefined}
              className="h-full w-full"
            />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-2.5 grid place-items-center rounded-full bg-accent-soft text-accent"
          >
            <Icon name="history" className="h-9 w-9" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-[1_1_18.75rem] flex-col items-start gap-2.5">
        <CardTitle id="legacy-empty-heading" size="lg">
          {h.legacy.emptyTitle}
        </CardTitle>
        <p className="max-w-[32.5rem]">
          {format(h.legacy.emptyBody, { age: R.optionalAge, forced: R.forcedAge })}
        </p>
        {world.career ? (
          <ButtonLink to={link('/career/chronicle')} iconEnd="arrow">
            {h.legacy.chronicle}
          </ButtonLink>
        ) : (
          <ButtonLink to={link('/career/new')} iconEnd="arrow">
            {h.legacy.newCareer}
          </ButtonLink>
        )}
      </div>
    </Panel>
  );
}

function LegacyDetail({
  world,
  legacy,
  latest,
}: {
  world: World;
  legacy: Legacy;
  latest: boolean;
}) {
  const link = useSaveLink();
  const [allHonours, setAllHonours] = useState(false);
  const trophies = world.trophies.filter((trophy) => legacy.trophyIds.includes(trophy.id));
  const awards = world.awards.filter((award) => legacy.awardIds.includes(award.id));
  const child = legacy.childPlayerId ? world.players[legacy.childPlayerId] : undefined;
  const ended = !world.career;
  const stats: [string, number][] = [
    [h.legacy.apps, legacy.stats.appearances],
    [h.legacy.goals, legacy.stats.goals],
    [h.legacy.assists, legacy.stats.assists],
    [h.legacy.caps, legacy.stats.caps],
    [h.legacy.intGoals, legacy.stats.internationalGoals],
  ];
  const honours = [
    ...trophies.map((trophy) => ({
      id: trophy.id,
      gold: true,
      text: `${trophyName(world, trophy)} · ${trophy.season}`,
    })),
    ...awards.map((award) => ({
      id: award.id,
      gold: false,
      text: `${h.awards.kinds[award.kind]} · ${award.season}`,
    })),
  ];
  const joined = (clubId: string) =>
    world.chronicle.find(
      (entry) =>
        entry.playerId === legacy.playerId &&
        entry.clubId === clubId &&
        (entry.kind === 'start' || entry.kind === 'move'),
    )?.date.season;
  return (
    <div className="flex min-w-0 flex-[1_1_40rem] flex-col gap-5">
      <HeroPanel aria-labelledby="legacy-heading" markings>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
          <LegacyPortrait
            world={world}
            legacy={legacy}
            className="h-32 w-32 shrink-0 sm:h-[11.875rem] sm:w-[11.875rem]"
          />
          <div className="flex min-w-0 flex-[1_1_22.5rem] flex-col items-start gap-3">
            {latest && ended && (
              <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
                {h.legacy.yourLegacy}
              </p>
            )}
            <h2
              id="legacy-heading"
              className="max-w-full font-display text-[3.5rem] leading-[0.85] font-normal break-words sm:text-[5.25rem]"
            >
              {legacy.name}
            </h2>
            <p className="text-hero-muted">
              {c.positions[legacy.position]} · {world.countries[legacy.nationalityId]?.name} ·{' '}
              {format(h.legacy.retired, { age: legacy.age, season: legacy.retiredAt.season })}
            </p>
            {ended && (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {!legacy.childPlayerId && (
                  <ButtonLink
                    variant="play"
                    size="lg"
                    iconEnd="arrow"
                    to={link(`/career/new?parent=${encodeURIComponent(legacy.id)}`)}
                  >
                    {format(h.legacy.child, { name: legacy.name })}
                  </ButtonLink>
                )}
                <ButtonLink
                  variant="secondary"
                  size="lg"
                  to={link('/career/new')}
                  className="border-hero-ink/45 bg-transparent text-hero-ink hover:bg-hero-ink/10"
                >
                  {h.legacy.newCareer}
                </ButtonLink>
              </div>
            )}
            {ended && !legacy.childPlayerId && (
              <p className="max-w-[32.5rem] text-[0.8125rem] text-hero-muted">
                {h.legacy.childBody}
              </p>
            )}
            {child && (
              <p className="flex items-center gap-2 rounded-control bg-night/30 px-3 py-2.5 font-bold">
                <Glyph name="check" className="h-[1.125rem] w-[1.125rem] text-gold" />
                {h.legacy.childTaken}
              </p>
            )}
          </div>
          <div className="flex min-w-[11.875rem] flex-[0_1_13.75rem] flex-col gap-1 rounded-panel bg-surface px-5 py-4.5 text-ink shadow-surface">
            <span className="text-xs font-extrabold tracking-[0.1em] text-muted uppercase">
              {h.legacy.hallOfFame}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-display text-[5rem] leading-[0.85] text-accent">
                {format(h.awards.rank, { rank: legacy.hallOfFame.rank })}
              </span>
              <StarMark className="h-8 w-8 text-meter-gold" />
            </span>
            <span className="text-[0.8125rem]">
              {format(h.legacy.hallRank, { of: integer.format(legacy.hallOfFame.of) })}
            </span>
          </div>
        </div>
      </HeroPanel>

      {/* Numbers and honours are different content: neither stretches to the other. */}
      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-labelledby="legacy-stats"
          className="flex min-w-0 flex-[1_1_23.75rem] flex-col gap-4"
        >
          <CardTitle id="legacy-stats">{h.legacy.stats}</CardTitle>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.875rem,1fr))] gap-2.5">
            {stats.map(([label, value]) => (
              <li key={label} className="min-w-0">
                <StatTile label={label} value={integer.format(value)} className="h-full" />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2.5">
            <Chip tone="accent">{format(h.legacy.peak, { value: legacy.peakAbility })}</Chip>
            <Chip tone="gold-soft">
              {format(h.legacy.earnings, { amount: money(legacy.earnings) })}
            </Chip>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-extrabold tracking-[0.1em] text-muted uppercase">
              {h.legacy.clubs}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {legacy.clubIds.map((id) => {
                const club = world.clubs[id];
                if (!club) return null;
                const season = joined(id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-full bg-surface-soft py-1 pr-3.5 pl-1.5 text-[0.8125rem]"
                  >
                    <CrestImage crest={club.crest} alt="" className="h-8 w-7 shrink-0" />
                    <span>
                      <span className="block leading-tight font-bold">{club.name}</span>
                      {season !== undefined && (
                        <span className="block text-[0.6875rem] leading-tight text-muted">
                          {format(h.legacy.joined, { season })}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Panel>

        <Panel
          aria-labelledby="legacy-honours"
          className="flex min-w-0 flex-[1.2_1_26.25rem] flex-col gap-3.5"
        >
          <CardTitle id="legacy-honours">{h.legacy.honoursTitle}</CardTitle>
          <p className="text-sm text-muted">
            <b className="text-ink">
              {plural(trophies.length, h.legacy.trophy, h.legacy.trophies)}
            </b>
            {' · '}
            <b className="text-ink">{plural(awards.length, h.legacy.award, h.legacy.awards)}</b>
          </p>
          {honours.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {(allHonours ? honours : honours.slice(0, HONOURS_SHOWN)).map((item) => (
                <li
                  key={item.id}
                  className={cx(
                    chipClass(item.gold ? 'gold-soft' : 'neutral'),
                    'whitespace-normal',
                    !item.gold && 'text-ink',
                  )}
                >
                  {item.gold && <StarMark className="h-[0.8125rem] w-[0.8125rem]" />}
                  {item.text}
                </li>
              ))}
            </ul>
          )}
          {honours.length > HONOURS_SHOWN && (
            <Button
              variant="secondary"
              aria-expanded={allHonours}
              iconEnd="chevron"
              className={cx('self-start', EXPAND_CHEVRON)}
              onClick={() => setAllHonours((value) => !value)}
            >
              {allHonours
                ? h.legacy.showFewer
                : format(h.legacy.showAll, { count: honours.length })}
            </Button>
          )}
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h3 className="text-xs font-extrabold tracking-[0.1em] text-muted uppercase">
              {h.legacy.records}
            </h3>
            {legacy.records.length ? (
              <ul className="flex flex-col gap-1.5">
                {legacy.records.map((kind) => {
                  const record = world.records.find(
                    (entry) => entry.kind === kind && entry.playerId === legacy.playerId,
                  );
                  return (
                    <li key={kind} className="flex items-center gap-2.5 text-sm font-bold">
                      <span
                        aria-hidden="true"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold text-on-gold"
                      >
                        <Glyph name="record" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">{h.cabinet.recordKinds[kind]}</span>
                      {record && (
                        <span className="font-display text-2xl leading-none">{record.value}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">{h.legacy.noRecords}</p>
            )}
          </div>
        </Panel>
      </div>
      {world.players[legacy.playerId] && (
        <ChronicleView world={world} playerId={legacy.playerId} embedded />
      )}
    </div>
  );
}
