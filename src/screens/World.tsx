import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore, type WorldJob } from '../store';
import { t, format, errorText } from '../i18n';
import { Page } from '../ui/Page';
import { Icon, type IconName } from '../ui/Icon';
import { Dialog } from '../ui/Dialog';
import { Button, ButtonLink, CardTitle, HeroPanel, PageHeader, Panel, cx } from '../ui/kit';
import { startWorldJob, cancelWorldJob } from '../workers/client';
import {
  CompetitionRules,
  Crest,
  EmptyNote,
  FixtureList,
  LeagueTable,
  PostseasonView,
  SeasonReview,
  SelectField,
  ViewHeading,
  WorldSelect,
} from './world/CompetitionViews';
import { ClubInspector } from './world/ClubInspector';
import { WorldMap } from './world/WorldMap';
import { errorCode } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import type { Fixture, GameEvent, SlotId, World } from '../model/domain';
import { nextCareerFixture, pendingCareerFixture } from '../engine/career/fixtures';
import { calendarDate, getSeasonWeeks } from '../engine/world/calendar';
import { formatGameDate } from '../i18n/calendar';
import { careerText as c } from '../i18n/career';
import { continueToMatchday, simulateCareerSeason } from './career/actions';

const integer = new Intl.NumberFormat('en');
const nationalViews = ['table', 'fixtures', 'playoffs', 'cup', 'history'] as const;
const legacyViews = ['table', 'fixtures', 'cup', 'history'] as const;
function queryInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value === null ? fallback : Number(value);
  return Math.min(max, Math.max(min, Number.isInteger(parsed) ? parsed : fallback));
}
/** On one column the club inspector sits below the table: bring the chosen club into view. */
function revealInspector() {
  if (!window.matchMedia('(max-width: 900px)').matches) return;
  requestAnimationFrame(() => {
    document.getElementById('club-inspector')?.scrollIntoView({ block: 'start' });
    document.getElementById('club-inspector-heading')?.focus({ preventScroll: true });
  });
}

const eyebrowClass = 'text-xs font-extrabold tracking-[0.14em] text-gold uppercase';
/** A lesser action on the field-green hero: outlined in cream on a darker green. */
const heroSecondary =
  'inline-flex min-h-11 items-center rounded-control border border-hero-ink/50 bg-black/25 px-4 font-bold text-hero-ink transition-colors hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-60';
const heroLink =
  'inline-flex min-h-11 items-center px-1 font-semibold text-hero-ink underline underline-offset-4';

export default function WorldScreen() {
  const world = useAppStore((s) => s.world);
  const job = useAppStore((s) => s.worldJob);
  const active = useAppStore((s) => s.activeSave);
  const backupReminder = useAppStore((s) => s.settings.backupReminder);
  const error = useAppStore((s) => s.worldError);
  const notice = useAppStore((s) => s.worldNotice);
  const [seed, setSeed] = useState(world?.seed ?? 'pitch-to-glory');
  const [params, setParams] = useSearchParams();
  const pendingParams = useRef(params);
  pendingParams.current = params;
  const attemptedSlot = useRef<string | null>(null);
  useEffect(() => {
    const slot = params.get('save');
    if (world && active?.payload.kind === 'world' && slot !== String(active.slot)) {
      const next = new URLSearchParams(params);
      next.set('save', String(active.slot));
      setParams(next, { replace: true });
    } else if (world && slot && active?.payload.kind !== 'world') {
      const next = new URLSearchParams(params);
      next.delete('save');
      setParams(next, { replace: true });
    } else if (
      !world &&
      !job &&
      slot &&
      ['1', '2', '3'].includes(slot) &&
      attemptedSlot.current !== slot
    ) {
      attemptedSlot.current = slot;
      void persistence()
        .then((p) => p.loadSlot(Number(slot) as SlotId))
        .catch((error) => useAppStore.getState().worldFeedback(null, errorCode(error)));
    }
  }, [world, active, job, params, setParams]);
  const country =
    world?.countries[params.get('country') ?? ''] ??
    (world ? Object.values(world.countries)[0] : undefined);
  const countryLeagues = country ? country.leagueIds.map((id) => world!.leagues[id]!) : [];
  const tiers = [...new Set(countryLeagues.map((league) => league.tier))].sort((a, b) => a - b);
  const tier = tiers.find((tier) => tier === Number(params.get('tier'))) ?? tiers[0] ?? 1;
  const groups = countryLeagues.filter((league) => league.tier === tier);
  const league = groups.find((league) => league.id === params.get('group')) ?? groups[0];
  const profile = country ? world?.pyramid?.profiles[country.id] : undefined;
  const division = profile?.divisions.find((division) => division.id === league?.divisionId);
  const views = world?.pyramid ? nationalViews : legacyViews;
  const view = views.find((view) => view === params.get('view')) ?? 'table';
  const countryCups = country
    ? Object.values(world!.competitions).filter(
        (cup) =>
          cup.id === country.domesticCupId ||
          cup.countryId === country.id ||
          // Continental cups are listed under every country with a club taking part.
          ((cup.kind === 'champions' || cup.kind === 'continental') &&
            cup.stages[0]?.groups
              .flat()
              .some((id) => world!.clubs[id]?.countryId === country.id)) ||
          (cup.kind === 'domestic' &&
            cup.stages.some((stage) =>
              stage.groups.flat().some((id) => world!.clubs[id]?.countryId === country.id),
            )),
      )
    : [];
  const cup =
    countryCups.find((cup) => cup.id === params.get('competition')) ??
    countryCups.find((cup) => cup.id === country?.domesticCupId);
  const fixtureWeeks = league
    ? [...new Set(league.fixtureIds.map((id) => world!.fixtures[id]!.date.week))].sort(
        (a, b) => a - b,
      )
    : [];
  const round = fixtureWeeks.includes(Number(params.get('round')))
    ? Number(params.get('round'))
    : (fixtureWeeks.find((week) => week >= (world?.date.week ?? 1)) ?? fixtureWeeks.at(-1) ?? 1);
  const stage = cup
    ? queryInteger(params.get('stage'), cup.stages.length - 1, 0, cup.stages.length - 1)
    : 0;
  const history =
    world?.history.find((summary) => summary.season === Number(params.get('season'))) ??
    world?.history.at(-1);
  const visibleClubIds =
    view === 'history' && history && league
      ? (history.tables[league.id] ?? league.standings).map((row) => row.clubId)
      : league?.clubIds;
  const club = league
    ? world!.clubs[
        visibleClubIds!.includes(params.get('club') ?? '') ||
        ((['history', 'playoffs', 'cup'].includes(view) ||
          (world!.clubs[params.get('club') ?? ''] !== undefined &&
            !world!.leagues[world!.clubs[params.get('club') ?? '']!.leagueId])) &&
          world!.clubs[params.get('club') ?? '']?.countryId === country!.id)
          ? params.get('club')!
          : visibleClubIds![0]!
      ]!
    : undefined;
  const update = (patch: Record<string, string | null>) => {
    // React Router does not queue same-tick search-param updates. Keep the pending
    // query so a fast second input cannot overwrite the first before the next render.
    const next = new URLSearchParams(pendingParams.current);
    if (country && !next.has('country')) next.set('country', country.id);
    if (!next.has('tier')) next.set('tier', String(tier));
    if (
      league &&
      !next.has('group') &&
      next.get('country') === country?.id &&
      next.get('tier') === String(tier)
    )
      next.set('group', league.id);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    pendingParams.current = next;
    // Commit synchronously: in a transition, controlled selects would flick back to the old
    // value for a frame before the new URL renders.
    setParams(next, { flushSync: true });
  };
  const selectClub = (id: string) => {
    revealInspector();
    const selected = world!.clubs[id]!;
    const selectedLeague = world!.leagues[selected.leagueId];
    update({
      club: id,
      player: null,
      ...(view === 'history' || !selectedLeague
        ? {}
        : {
            country: selected.countryId,
            tier: String(selectedLeague?.tier ?? tier),
            group: selectedLeague?.id ?? league!.id,
          }),
    });
  };
  const create = () => {
    if (world) update({ new: '1' });
    else void startWorldJob('generate', { seed });
  };
  return (
    <Page className="world-page">
      <PageHeader
        title={t.world.title}
        description={t.world.description}
        actions={<WorldNotice notice={notice} />}
      />
      <div className="flex min-w-0 flex-col gap-5">
        {error && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-panel border border-danger bg-danger-soft px-4 py-3.5 font-bold text-danger"
            role="alert"
          >
            <Icon name="alert" className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-[1_1_12rem]">{errorText(error)}</span>
            {error === 'match-active' && (
              <ButtonLink variant="secondary" to="/match">
                {t.app.match}
              </ButtonLink>
            )}
          </div>
        )}
        {job && <SimulationProgress job={job} />}
        {!world ? (
          <HeroPanel
            aria-labelledby="create-title"
            className="world-create world-hero shadow-surface"
          >
            <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
              <div className="flex min-w-0 flex-[1_1_24rem] flex-col gap-3">
                <p className={eyebrowClass}>{t.app.name}</p>
                <h2
                  id="create-title"
                  className="font-display text-[2.75rem] leading-[0.9] font-normal sm:text-[3.5rem]"
                >
                  {t.world.createTitle}
                </h2>
                <p className="max-w-[30rem] text-[0.9375rem] text-hero-muted sm:text-base">
                  {t.world.createBody}
                </p>
                <SeedForm
                  id="world-seed"
                  seed={seed}
                  onSeed={setSeed}
                  busy={Boolean(job)}
                  onSubmit={create}
                  hero
                />
              </div>
              <WorldMap className="world-map mx-auto w-full max-w-[18rem] flex-none lg:mx-0 lg:max-w-[14rem]" />
            </div>
          </HeroPanel>
        ) : (
          <>
            <SeasonHero
              world={world}
              job={job}
              notice={notice}
              onAutoplay={() => update({ autoplay: '1' })}
            />
            <dl
              className="world-facts ui-card grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line shadow-surface sm:grid-cols-4"
              aria-label={t.world.facts}
            >
              {[
                [t.world.countries, Object.keys(world.countries).length],
                [
                  world.pyramid ? t.world.leagueGroups : t.world.divisions,
                  Object.keys(world.leagues).length,
                ],
                [t.world.clubs, Object.keys(world.clubs).length],
                [t.world.players, Object.keys(world.players).length],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col gap-0.5 bg-surface px-5 py-3.5">
                  <dt className="text-xs font-bold text-muted">{label}</dt>
                  <dd className="font-display text-[2rem] leading-none tabular-nums sm:text-[2.5rem]">
                    {integer.format(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            {!active && (
              <p className="unsaved-world flex items-start gap-3 rounded-panel bg-art-blue px-4 py-3.5">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface text-info"
                >
                  <Icon name="save" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.world.unsaved}</span>
                  <Link
                    to="/saves"
                    className="inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-4"
                  >
                    {t.world.unsavedAction}
                  </Link>
                </span>
              </p>
            )}
            {world.phase === 'complete' && backupReminder && (
              <div className="season-backup flex flex-wrap items-center gap-4 rounded-panel bg-art-gold px-5 py-[1.125rem]">
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-gold text-on-gold"
                >
                  <Icon name="download" className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-[1_1_15rem]">
                  <strong className="block font-display text-[1.875rem] leading-none font-normal text-ink">
                    {t.world.backup}
                  </strong>
                  <p className="mt-1 text-gold-ink">{t.world.backupBody}</p>
                </div>
                <ButtonLink variant="secondary" to="/saves">
                  {t.world.backupAction}
                </ButtonLink>
              </div>
            )}
            {/* One column: the club details sit below the whole table, so offer a way straight
                there. */}
            <button
              type="button"
              className="text-button world-jump self-start"
              onClick={() => {
                document.getElementById('club-inspector')?.scrollIntoView({ block: 'start' });
                document.getElementById('club-inspector-heading')?.focus({ preventScroll: true });
              }}
            >
              {t.world.jumpToClub} ↓
            </button>
            <div className="world-browser">
              <Panel className="competition-panel flex flex-col gap-[1.125rem]">
                <div className="world-filters flex flex-wrap gap-3">
                  <SelectField
                    id="world-country"
                    label={t.world.country}
                    className="flex-[1_1_10rem]"
                    value={country!.id}
                    onChange={(event) =>
                      update({
                        country: event.target.value,
                        tier: '1',
                        group: null,
                        club: null,
                        player: null,
                        competition: null,
                        stage: null,
                        round: null,
                        postseason: null,
                        postRound: null,
                      })
                    }
                  >
                    {Object.values(world.countries).map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    id="world-tier"
                    label={t.world.division}
                    className="flex-[2_1_16rem]"
                    value={tier}
                    onChange={(event) =>
                      update({
                        tier: event.target.value,
                        group: null,
                        club: null,
                        player: null,
                        round: null,
                        postseason: null,
                        postRound: null,
                      })
                    }
                  >
                    {tiers.map((tier) => (
                      <option key={tier} value={tier}>
                        {profile
                          ? format(t.world.tierDivision, {
                              tier,
                              name: profile.divisions.find((division) => division.tier === tier)!
                                .name,
                            })
                          : format(t.world.tier, { tier })}
                      </option>
                    ))}
                  </SelectField>
                  {groups.length > 1 && (
                    <SelectField
                      id="world-group"
                      label={t.world.group}
                      className="world-group-filter flex-[1_1_9rem]"
                      value={league!.id}
                      onChange={(event) =>
                        update({
                          group: event.target.value,
                          club: null,
                          player: null,
                          round: null,
                          postseason: null,
                          postRound: null,
                        })
                      }
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.group ?? group.region ?? group.name}
                        </option>
                      ))}
                    </SelectField>
                  )}
                </div>
                <CompetitionRules
                  league={league!}
                  profile={profile}
                  division={division}
                  rounds={fixtureWeeks.length}
                />
                <div
                  className="world-tabs segmented-tabs segmented-tabs-fill"
                  role="tablist"
                  aria-label={t.world.tabs}
                >
                  {views.map((item, index) => (
                    <button
                      type="button"
                      role="tab"
                      id={`world-tab-${item}`}
                      aria-controls="competition-view"
                      aria-selected={view === item}
                      tabIndex={view === item ? 0 : -1}
                      key={item}
                      onClick={() => update({ view: item })}
                      onKeyDown={(event) => {
                        const direction =
                          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                        if (!direction && !['Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const target =
                          event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? views.length - 1
                              : (index + direction + views.length) % views.length;
                        update({ view: views[target]! });
                        document.getElementById(`world-tab-${views[target]}`)?.focus();
                      }}
                    >
                      {t.world[item]}
                    </button>
                  ))}
                </div>
                <div
                  className="competition-tabpanel flex min-w-0 flex-col gap-4"
                  id="competition-view"
                  role="tabpanel"
                  aria-labelledby={`world-tab-${view}`}
                >
                  {view === 'table' && (
                    <>
                      <LeagueTable
                        world={world}
                        league={league!}
                        selected={club!.id}
                        onSelect={selectClub}
                        title={league!.name}
                      />
                      {world.phase === 'complete' && (
                        <SeasonReview world={world} league={league!} onSelect={selectClub} />
                      )}
                    </>
                  )}
                  {view === 'fixtures' && (
                    <>
                      <ViewHeading title={league!.name} label={t.world.round}>
                        <WorldSelect
                          aria-label={t.world.round}
                          value={round}
                          onChange={(event) => update({ round: event.target.value })}
                        >
                          {fixtureWeeks.map((week) => (
                            <option value={week} key={week}>
                              {format(t.world.roundValue, { week })}
                            </option>
                          ))}
                        </WorldSelect>
                      </ViewHeading>
                      <FixtureList
                        world={world}
                        fixtureIds={league!.fixtureIds.filter(
                          (id) => world.fixtures[id]!.date.week === round,
                        )}
                        onSelect={selectClub}
                      />
                    </>
                  )}
                  {view === 'playoffs' && (
                    <PostseasonView
                      world={world}
                      league={league!}
                      selected={club!.id}
                      onSelect={selectClub}
                      selection={params.get('postseason')}
                      onChange={(id) => update({ postseason: id, postRound: null })}
                      round={params.get('postRound')}
                      onRound={(week) => update({ postRound: week })}
                    />
                  )}
                  {view === 'cup' && (
                    <>
                      {countryCups.length > 1 && (
                        <SelectField
                          id="world-cup"
                          label={t.world.cupCompetition}
                          value={cup!.id}
                          onChange={(event) =>
                            update({ competition: event.target.value, stage: null })
                          }
                        >
                          {countryCups.map((cup) => (
                            <option key={cup.id} value={cup.id}>
                              {cup.name}
                            </option>
                          ))}
                        </SelectField>
                      )}
                      <ViewHeading title={cup!.name} label={t.world.cupRound}>
                        <WorldSelect
                          aria-label={t.world.cupRound}
                          value={stage}
                          onChange={(event) => update({ stage: event.target.value })}
                        >
                          {cup!.stages.map((stage, index) => (
                            <option value={index} key={index}>
                              {stage.name === 'groups'
                                ? t.world.groupStage
                                : stage.groups.flat().length === 2
                                  ? t.world.rounds[4]
                                  : stage.groups.flat().length === 4
                                    ? t.world.rounds[3]
                                    : stage.groups.flat().length === 8
                                      ? t.world.rounds[2]
                                      : format(t.world.cupRoundSize, {
                                          clubs: stage.groups.flat().length,
                                        })}
                            </option>
                          ))}
                        </WorldSelect>
                      </ViewHeading>
                      {cup!.winnerId && (
                        <p className="cup-winner flex items-center gap-2.5 rounded-control bg-art-gold px-3.5 py-2.5 font-extrabold text-gold-ink">
                          <Crest
                            world={world}
                            id={cup!.winnerId}
                            className="h-[2.125rem] w-[1.875rem]"
                          />
                          {format(t.world.cupWinner, { name: world.clubs[cup!.winnerId]!.name })}
                        </p>
                      )}
                      {cup!.stages[stage]?.byeClubIds?.length ? (
                        <p className="rounded-control bg-art-blue px-3.5 py-2.5 text-[0.8125rem] font-semibold text-info">
                          {format(t.world.cupByes, {
                            clubs: cup!.stages[stage]!.byeClubIds!.map(
                              (id) => world.clubs[id]!.name,
                            ).join(' · '),
                          })}
                        </p>
                      ) : null}
                      {cup!.stages[stage] ? (
                        <FixtureList
                          world={world}
                          fixtureIds={cup!.stages[stage]!.fixtureIds}
                          onSelect={selectClub}
                        />
                      ) : (
                        <EmptyNote>{t.world.noCupRounds}</EmptyNote>
                      )}
                    </>
                  )}
                  {view === 'history' && (
                    <div className="history-view flex flex-col gap-4">
                      <ViewHeading
                        title={t.world.archive}
                        label={history ? t.world.viewSeason : undefined}
                      >
                        {history && (
                          <WorldSelect
                            aria-label={t.world.viewSeason}
                            value={history.season}
                            onChange={(event) =>
                              update({
                                season: event.target.value,
                                postseason: null,
                                postRound: null,
                              })
                            }
                          >
                            {world.history.map((summary) => (
                              <option key={summary.season} value={summary.season}>
                                {summary.season}
                              </option>
                            ))}
                          </WorldSelect>
                        )}
                      </ViewHeading>
                      {history ? (
                        <>
                          <LeagueTable
                            world={world}
                            league={league!}
                            selected={club!.id}
                            onSelect={selectClub}
                            rows={history.tables[league!.id]}
                            title={`${history.season} · ${league!.name}`}
                            titleAs="h3"
                          />
                          <SeasonReview
                            world={world}
                            league={league!}
                            summary={history}
                            onSelect={selectClub}
                          />
                          {world.pyramid && (
                            <>
                              <h3 className="archive-postseason-heading mt-2 text-[0.9375rem] font-extrabold">
                                {t.world.playoffs}
                              </h3>
                              <PostseasonView
                                world={world}
                                league={league!}
                                selected={club!.id}
                                onSelect={selectClub}
                                summary={history}
                                selection={params.get('postseason')}
                                onChange={(id) => update({ postseason: id, postRound: null })}
                                round={null}
                                onRound={(week) => update({ postRound: week })}
                              />
                            </>
                          )}
                        </>
                      ) : (
                        <EmptyNote>{t.world.noHistory}</EmptyNote>
                      )}
                    </div>
                  )}
                </div>
              </Panel>
              <ClubInspector
                world={world}
                club={club!}
                selectedPlayer={params.get('player') ?? undefined}
                onPlayer={(id) => update({ player: id })}
              />
              <WorldActivity world={world} />
            </div>
            <details className="new-world group ui-card rounded-panel border border-line bg-surface px-5 shadow-surface sm:px-6">
              <summary className="flex min-h-[3.75rem] cursor-pointer list-none items-center justify-between gap-3 font-bold [&::-webkit-details-marker]:hidden">
                {t.world.regenerate}
                <Icon
                  name="chevron"
                  className="h-[1.125rem] w-[1.125rem] shrink-0 rotate-90 text-muted transition-transform group-open:-rotate-90"
                />
              </summary>
              <div className="pb-5">
                <SeedForm
                  id="another-world-seed"
                  seed={seed}
                  onSeed={setSeed}
                  busy={Boolean(job)}
                  onSubmit={create}
                />
              </div>
            </details>
          </>
        )}
      </div>
      {world?.career && params.get('autoplay') === '1' && (
        <Dialog
          title={c.hub.autoTitle}
          body={c.hub.autoBody}
          confirmLabel={c.hub.autoConfirm}
          busy={Boolean(job)}
          onClose={() => update({ autoplay: null })}
          onConfirm={() => {
            update({ autoplay: null });
            simulateCareerSeason(true);
          }}
        />
      )}
      {world && params.get('new') === '1' && (
        <Dialog
          title={t.world.replaceTitle}
          body={t.world.replaceBody}
          confirmLabel={t.world.replaceConfirm}
          busy={Boolean(job)}
          onClose={() => update({ new: null })}
          onConfirm={() => {
            update({
              new: null,
              club: null,
              player: null,
              round: null,
              group: null,
              postseason: null,
              postRound: null,
              competition: null,
              stage: null,
              season: null,
              save: null,
            });
            void startWorldJob('generate', { seed });
          }}
        />
      )}
    </Page>
  );
}

/** The last announcement as a pill beside the title; always mounted so it is read aloud. */
function WorldNotice({ notice }: { notice: keyof typeof t.world.notices | null }) {
  const neutral = notice === 'cancelled';
  return (
    <p
      role="status"
      className={cx(
        'world-notice',
        notice
          ? cx(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-bold',
              neutral ? 'bg-art-blue text-info' : 'bg-accent-soft text-accent',
            )
          : 'sr-only',
      )}
    >
      {notice && (
        <>
          <Icon name={neutral ? 'info' : 'check'} className="h-3.5 w-3.5 shrink-0" />
          {t.world.notices[notice]}
        </>
      )}
    </p>
  );
}

/** Worker progress: shown above the world while any job runs; Cancel keeps completed weeks. */
function SimulationProgress({ job }: { job: WorldJob }) {
  const title = job.cancelling
    ? t.world.cancelling
    : job.type === 'generate'
      ? t.world.generating
      : t.world.advancing;
  const total = Math.max(1, job.totalWeeks);
  const done = Math.min(total, job.completedWeeks);
  const progress = format(t.world.progress, {
    completed: job.completedWeeks,
    total: job.totalWeeks,
  });
  return (
    <section
      className="simulation-progress ui-card sticky top-3 z-[5] flex flex-wrap items-center gap-x-6 gap-y-4 rounded-panel border border-line bg-surface px-5 py-5 shadow-surface sm:px-6"
      aria-label={t.world.progressTitle}
    >
      <span
        aria-hidden="true"
        className="grid h-[3.25rem] w-[3.25rem] shrink-0 place-items-center rounded-full bg-accent-soft text-accent max-sm:hidden"
      >
        <Icon name="globe" className="h-[1.625rem] w-[1.625rem]" />
      </span>
      <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-2">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
          <strong>{title}</strong>
          <span className={cx('font-bold', job.cancelling ? 'text-muted' : 'text-accent')}>
            {progress}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={progress}
          className="h-3 overflow-hidden rounded-full bg-track"
        >
          <div
            className={cx(
              'simulation-bar h-full w-full origin-left rounded-full',
              job.cancelling ? 'bg-muted' : 'bg-accent',
            )}
            style={{ transform: `scaleX(${done / total})` }}
          />
        </div>
        <small className="text-xs text-muted">{t.world.checkpoint}</small>
      </div>
      <Button variant="secondary" disabled={job.cancelling} onClick={cancelWorldJob}>
        {t.world.cancel}
      </Button>
    </section>
  );
}

/** The seed form: on the create hero (gold action) and inside "Create another world". */
function SeedForm({
  id,
  seed,
  onSeed,
  busy,
  onSubmit,
  hero = false,
}: {
  id: string;
  seed: string;
  onSeed(seed: string): void;
  busy: boolean;
  onSubmit(): void;
  hero?: boolean;
}) {
  return (
    <form
      className={cx('flex flex-col gap-2', hero && 'mt-1 max-w-[32.5rem]')}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="text-[0.8125rem] font-bold">
        {t.world.seed}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          value={seed}
          maxLength={120}
          required
          onChange={(event) => onSeed(event.target.value)}
          disabled={busy}
          className={cx(
            'min-w-0 flex-[1_1_13rem] font-semibold',
            hero &&
              'min-h-[3.25rem] border-2 border-hero-ink/40 bg-hero-ink text-base text-on-gold disabled:opacity-70',
          )}
        />
        <Button
          type="submit"
          variant={hero ? 'play' : 'secondary'}
          size={hero ? 'lg' : 'md'}
          iconEnd={hero ? 'arrow' : undefined}
          disabled={busy || !seed.trim()}
        >
          {hero ? t.world.create : t.world.regenerate}
        </Button>
      </div>
      {hero && <small className="text-[0.8125rem] text-hero-muted">{t.world.seedHint}</small>}
    </form>
  );
}

/**
 * The season hero: the date, your club, and one call to action that follows the season —
 * play the matchday, continue to it, advance the week, or start the next season.
 */
function SeasonHero({
  world,
  job,
  notice,
  onAutoplay,
}: {
  world: World;
  job: WorldJob | null;
  notice: keyof typeof t.world.notices | null;
  onAutoplay(): void;
}) {
  const busy = Boolean(job);
  const complete = world.phase === 'complete';
  const career = world.career;
  const pending = career ? pendingCareerFixture(world) : null;
  const awaitingRecovery = Boolean(career?.injury && career.injury.recovery === null);
  const matchday = Boolean(career && (pending || notice === 'matchday'));
  const careerPlayer = career ? world.players[career.playerId] : undefined;
  const careerClub = careerPlayer?.clubId ? world.clubs[careerPlayer.clubId] : undefined;
  const next = career && !complete && !matchday ? nextCareerFixture(world) : null;
  const shown = pending ?? next;
  let icon: IconName = 'ball';
  let title: string;
  let body: ReactNode = null;
  let action: ReactNode;
  if (complete) {
    icon = 'history';
    title = t.world.hero.completeTitle;
    body = t.world.seasonReviewBody;
    action = (
      <Button
        variant="play"
        size="lg"
        iconEnd="arrow"
        disabled={busy}
        onClick={() => void startWorldJob('next-season')}
      >
        {t.world.next}
      </Button>
    );
  } else if (career && matchday) {
    title = c.hub.matchday;
    body = c.hub.matchdayBody;
    action = (
      <ButtonLink variant="play" size="lg" iconEnd="ball" to="/match">
        {c.hub.play}
      </ButtonLink>
    );
  } else if (career) {
    title = c.hub.nextMatch;
    body = shown
      ? formatGameDate(calendarDate(shown.date.season, shown.date.week, shown.date.day))
      : null;
    action = (
      <Button
        variant="play"
        size="lg"
        iconEnd="arrow"
        disabled={busy || awaitingRecovery}
        onClick={continueToMatchday}
      >
        {c.hub.continue}
      </Button>
    );
  } else {
    icon = 'globe';
    title = format(t.world.hero.weekTitle, {
      week: world.date.week,
      total: getSeasonWeeks(world),
    });
    body = t.world.hero.weekBody;
    action = (
      <Button
        variant="play"
        size="lg"
        iconEnd="arrow"
        disabled={busy}
        onClick={() => void startWorldJob('simulate-week')}
      >
        {t.world.advance}
      </Button>
    );
  }
  return (
    <HeroPanel markings aria-labelledby="world-date" className="world-hero shadow-surface">
      <div className="flex flex-wrap items-stretch gap-x-8 gap-y-5">
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col justify-center gap-2.5">
          <p className={eyebrowClass}>
            {format(t.world.seasonEyebrow, { season: world.date.season })}
          </p>
          <h2
            id="world-date"
            className="world-date font-display text-[3rem] leading-[0.9] font-normal sm:text-[3.75rem]"
          >
            {format(complete ? t.world.complete : t.world.date, {
              season: world.date.season,
              week: world.date.week,
            })}
          </h2>
          {careerClub && (
            <p className="world-career-club flex items-center gap-2.5 font-semibold break-words">
              <Crest world={world} id={careerClub.id} className="h-8 w-7" />
              <span className="min-w-0">
                {format(t.world.yourClub, {
                  club: careerClub.name,
                  league: world.leagues[careerClub.leagueId]?.name ?? '',
                })}
              </span>
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {!complete && (
              <button
                type="button"
                className={heroSecondary}
                disabled={busy || awaitingRecovery}
                onClick={career ? onAutoplay : () => void startWorldJob('simulate-season')}
              >
                {t.world.finish}
              </button>
            )}
            <Link className={heroLink} to="/saves">
              {t.world.save}
            </Link>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-3.5 rounded-panel bg-black/30 px-5 py-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-gold/20 text-gold"
            >
              <Icon name={icon} className="h-[1.375rem] w-[1.375rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block font-display text-[1.875rem] leading-none font-normal">
                {title}
              </strong>
              {body && <span className="block text-[0.8125rem] text-hero-muted">{body}</span>}
            </div>
          </div>
          {career && !complete && shown && <HeroFixture world={world} fixture={shown} />}
          {career && awaitingRecovery && !complete && (
            <p className="rounded-control bg-danger-soft px-3.5 py-3 text-[0.8125rem] font-bold text-danger">
              {c.hub.injuredBlock}{' '}
              <Link className="underline underline-offset-2" to="/career">
                {c.titles.hub}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">{action}</div>
        </div>
      </div>
    </HeroPanel>
  );
}

function HeroFixture({ world, fixture }: { world: World; fixture: Fixture }) {
  const home = world.clubs[fixture.homeId];
  const away = world.clubs[fixture.awayId];
  if (!home || !away) return null;
  return (
    <p className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-control bg-hero-ink/10 px-3 py-2.5 font-bold">
      <span className="flex min-w-0 flex-col items-center gap-1.5 text-center text-sm sm:flex-row-reverse sm:justify-start sm:text-right sm:text-base">
        <Crest world={world} id={home.id} className="h-9 w-8" />
        <span className="max-w-full min-w-0 break-words">{home.name}</span>
      </span>
      <span className="font-display text-2xl font-normal text-gold">
        {c.common.vs.toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col items-center gap-1.5 text-center text-sm sm:flex-row-reverse sm:justify-end sm:text-left sm:text-base">
        <Crest world={world} id={away.id} className="h-9 w-8" />
        <span className="max-w-full min-w-0 break-words">{away.name}</span>
      </span>
    </p>
  );
}

const EVENT_ICONS: Record<string, { path: string; tone: string }> = {
  transfer: {
    path: 'M4 8H18M14 4L18 8L14 12M20 16H6M10 12L6 16L10 20',
    tone: 'bg-art-blue text-info',
  },
  'manager-change': {
    path: 'M12 12A4 4 0 1 0 12 4A4 4 0 1 0 12 12ZM4 21Q4 15 12 15Q20 15 20 21',
    tone: 'bg-surface text-ink',
  },
  'youth-intake': {
    path: 'M12 3L14.6 9L21 9.5L16 13.6L17.6 20L12 16.6L6.4 20L8 13.6L3 9.5L9.4 9Z',
    tone: 'bg-accent-soft text-accent',
  },
  retirement: { path: 'M5 12H19M12 5V19', tone: 'bg-surface text-muted' },
  trophy: {
    path: 'M8 4H16V9Q16 14 12 14Q8 14 8 9ZM8 6H4Q4 10 8 10M16 6H20Q20 10 16 10M12 14V18M8 20H16',
    tone: 'bg-art-gold text-gold-ink',
  },
  release: { path: 'M9 6H5V18H9M15 8L19 12L15 16M19 12H9', tone: 'bg-danger-soft text-danger' },
  signing: { path: 'M4 20H8L19 9L15 5L4 16Z', tone: 'bg-accent-soft text-accent' },
};

/** World news: the latest transfers, sackings, academy intakes, retirements and trophies. */
function WorldActivity({ world }: { world: World }) {
  const kinds = t.world.events as Record<string, string>;
  const events = world.events
    .filter((event: GameEvent) => kinds[event.kind])
    .slice(-12)
    .reverse();
  return (
    <Panel
      className="world-activity flex flex-col gap-3.5"
      aria-labelledby="world-activity-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id="world-activity-heading">{t.world.activity}</CardTitle>
        {events.length > 0 && (
          <span className="text-[0.8125rem] font-semibold text-muted">
            {format(t.world.latestEvents, { count: events.length })}
          </span>
        )}
      </div>
      {events.length ? (
        <ol className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17.5rem),1fr))]">
          {events.map((event) => {
            const style = EVENT_ICONS[event.kind]!;
            return (
              <li
                key={event.id}
                className="flex items-start gap-3 rounded-control bg-surface-soft px-3.5 py-3"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center rounded-control',
                    style.tone,
                  )}
                >
                  <svg viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem]">
                    <path
                      d={style.path}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-muted">
                    {format(t.world.eventDate, {
                      season: event.date.season,
                      week: event.date.week,
                    })}{' '}
                    · {t.world.eventKinds[event.kind as keyof typeof t.world.eventKinds]}
                  </span>
                  <span className="block font-semibold break-words">
                    {format(kinds[event.kind]!, event.params)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted">{t.world.quiet}</p>
      )}
    </Panel>
  );
}
