import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { t, format, errorText } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Dialog } from '../ui/Dialog';
import { startWorldJob, cancelWorldJob } from '../workers/client';
import {
  CompetitionRules,
  LeagueTable,
  FixtureList,
  PostseasonView,
  SeasonReview,
} from './world/CompetitionViews';
import { ClubInspector } from './world/ClubInspector';
import stadium from '../assets/stadium.svg';
import { loadSlot, errorCode } from '../persistence/session';
import type { SlotId } from '../model/domain';
import { pendingCareerFixture } from '../engine/career/fixtures';
import { careerText as c } from '../i18n/career';
import { continueToMatchday, simulateCareerSeason } from './career/actions';

const integer = new Intl.NumberFormat('en');
const nationalViews = ['table', 'fixtures', 'playoffs', 'cup', 'history'] as const;
const legacyViews = ['table', 'fixtures', 'cup', 'history'] as const;
function queryInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value === null ? fallback : Number(value);
  return Math.min(max, Math.max(min, Number.isInteger(parsed) ? parsed : fallback));
}
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
      void loadSlot(Number(slot) as SlotId).catch((error) =>
        useAppStore.getState().worldFeedback(null, errorCode(error)),
      );
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
    setParams(next);
  };
  const selectClub = (id: string) => {
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
  const pending = world?.career ? pendingCareerFixture(world) : null;
  const awaitingRecovery = Boolean(world?.career?.injury && world.career.injury.recovery === null);
  const create = () => {
    if (world) update({ new: '1' });
    else void startWorldJob('generate', { seed });
  };
  return (
    <Page className="world-page">
      <div className="page-heading">
        <h1>{t.world.title}</h1>
        <p>{t.world.description}</p>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {errorText(error)}
          {error === 'match-active' && (
            <Link className="button secondary" to="/match">
              {t.app.match}
            </Link>
          )}
        </div>
      )}
      <p className="world-notice notice" role="status">
        {notice ? t.world.notices[notice] : ''}
      </p>
      {job && (
        <section className="simulation-progress" aria-label={t.world.advancing}>
          <div>
            <strong>
              {job.cancelling
                ? t.world.cancelling
                : job.type === 'generate'
                  ? t.world.generating
                  : t.world.advancing}
            </strong>
            <p>
              {format(t.world.progress, { completed: job.completedWeeks, total: job.totalWeeks })}
            </p>
          </div>
          <progress
            max={Math.max(1, job.totalWeeks)}
            value={job.completedWeeks}
            aria-label={t.world.advancing}
          />
          <button className="button secondary" disabled={job.cancelling} onClick={cancelWorldJob}>
            {t.world.cancel}
          </button>
          <small>{t.world.checkpoint}</small>
        </section>
      )}
      {!world ? (
        <section className="world-create">
          <div>
            <p className="eyebrow">{t.app.name}</p>
            <h2>{t.world.createTitle}</h2>
            <p>{t.world.createBody}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                create();
              }}
            >
              <label htmlFor="world-seed">{t.world.seed}</label>
              <div className="world-seed-control">
                <input
                  id="world-seed"
                  value={seed}
                  maxLength={120}
                  required
                  onChange={(event) => setSeed(event.target.value)}
                  disabled={Boolean(job)}
                />
                <button className="button" disabled={Boolean(job) || !seed.trim()}>
                  {t.world.create}
                  <Icon name="arrow" />
                </button>
              </div>
              <small>{t.world.seedHint}</small>
            </form>
          </div>
          <img src={stadium} alt="" />
        </section>
      ) : (
        <>
          <section className="world-season">
            <div>
              <p className="eyebrow">{world.seed}</p>
              <h2 className="world-date">
                {format(world.phase === 'complete' ? t.world.complete : t.world.date, {
                  season: world.date.season,
                  week: world.date.week,
                })}
              </h2>
            </div>
            <div className="simulation-actions">
              {world.phase === 'complete' ? (
                <button
                  className="button"
                  disabled={Boolean(job)}
                  onClick={() => void startWorldJob('next-season')}
                >
                  {t.world.next}
                  <Icon name="arrow" />
                </button>
              ) : world.career ? (
                <>
                  {pending ? (
                    <Link className="button" to="/match">
                      {c.hub.play}
                      <Icon name="ball" />
                    </Link>
                  ) : (
                    <button
                      className="button"
                      disabled={Boolean(job) || awaitingRecovery}
                      onClick={continueToMatchday}
                    >
                      {c.hub.continue}
                      <Icon name="arrow" />
                    </button>
                  )}
                  <button
                    className="button secondary"
                    disabled={Boolean(job) || awaitingRecovery}
                    onClick={() => update({ autoplay: '1' })}
                  >
                    {t.world.finish}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button"
                    disabled={Boolean(job)}
                    onClick={() => void startWorldJob('simulate-week')}
                  >
                    {t.world.advance}
                    <Icon name="arrow" />
                  </button>
                  <button
                    className="button secondary"
                    disabled={Boolean(job)}
                    onClick={() => void startWorldJob('simulate-season')}
                  >
                    {t.world.finish}
                  </button>
                </>
              )}
              <Link className="text-button" to="/saves">
                {t.world.save}
              </Link>
            </div>
          </section>
          {world.career && (pending || notice === 'matchday') && (
            <div className="mb-6 flex flex-wrap items-center gap-4 rounded-panel bg-field p-4 text-white shadow-surface sm:p-5">
              <Icon name="ball" className="shrink-0 text-gold" />
              <div className="min-w-0 flex-1 basis-60">
                <strong className="block font-display text-2xl leading-none">
                  {c.hub.matchday}
                </strong>
                <p className="text-sm text-white/85">{c.hub.matchdayBody}</p>
              </div>
              <Link className="button" to="/match">
                {c.hub.play}
              </Link>
            </div>
          )}
          {world.career && awaitingRecovery && (
            <p className="mb-6 rounded-control bg-danger-soft p-4 text-sm font-semibold text-danger">
              {c.hub.injuredBlock}{' '}
              <Link className="underline" to="/career">
                {c.titles.hub}
              </Link>
            </p>
          )}
          <dl className="world-facts" aria-label={t.world.facts}>
            {[
              [t.world.countries, Object.keys(world.countries).length],
              [
                world.pyramid ? t.world.leagueGroups : t.world.divisions,
                Object.keys(world.leagues).length,
              ],
              [t.world.clubs, Object.keys(world.clubs).length],
              [t.world.players, Object.keys(world.players).length],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{integer.format(Number(value))}</dd>
              </div>
            ))}
          </dl>
          {!active && (
            <p className="unsaved-world">
              <Icon name="save" />
              {t.world.unsaved}
            </p>
          )}
          {world.phase === 'complete' && backupReminder && (
            <div className="season-backup">
              <div>
                <strong>{t.world.backup}</strong>
                <p>{t.world.backupBody}</p>
              </div>
              <Link className="button secondary" to="/saves">
                {t.world.backupAction}
              </Link>
            </div>
          )}
          <div className="world-browser">
            <section className="competition-panel">
              <div className="world-filters">
                <div>
                  <label htmlFor="world-country">{t.world.country}</label>
                  <select
                    id="world-country"
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
                  </select>
                </div>
                <div>
                  <label htmlFor="world-tier">{t.world.division}</label>
                  <select
                    id="world-tier"
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
                  </select>
                </div>
                {groups.length > 1 && (
                  <div className="world-group-filter">
                    <label htmlFor="world-group">{t.world.group}</label>
                    <select
                      id="world-group"
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
                    </select>
                  </div>
                )}
              </div>
              <CompetitionRules
                league={league!}
                profile={profile}
                division={division}
                rounds={fixtureWeeks.length}
              />
              <div className="world-tabs" role="tablist" aria-label={t.world.tabs}>
                {views.map((item, index) => (
                  <button
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
                className="competition-view"
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
                    />
                    {world.phase === 'complete' && (
                      <SeasonReview world={world} league={league!} onSelect={selectClub} />
                    )}
                  </>
                )}
                {view === 'fixtures' && (
                  <>
                    <div className="view-heading">
                      <h2>{league!.name}</h2>
                      <label>
                        {t.world.round}
                        <select
                          aria-label={t.world.round}
                          value={round}
                          onChange={(event) => update({ round: event.target.value })}
                        >
                          {fixtureWeeks.map((week) => (
                            <option value={week} key={week}>
                              {format(t.world.roundValue, { week })}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
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
                      <div className="postseason-selector">
                        <label htmlFor="world-cup">{t.world.cupCompetition}</label>
                        <select
                          id="world-cup"
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
                        </select>
                      </div>
                    )}
                    <div className="view-heading">
                      <h2>{cup!.name}</h2>
                      <label>
                        {t.world.cupRound}
                        <select
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
                        </select>
                      </label>
                    </div>
                    {cup!.winnerId && (
                      <p className="cup-winner">
                        {format(t.world.cupWinner, { name: world.clubs[cup!.winnerId]!.name })}
                      </p>
                    )}
                    {cup!.stages[stage]?.byeClubIds?.length ? (
                      <p className="table-note">
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
                      <p className="empty-history">{t.world.noCupRounds}</p>
                    )}
                  </>
                )}
                {view === 'history' && (
                  <div className="history-view">
                    <div className="view-heading">
                      <h2>{t.world.archive}</h2>
                      {history && (
                        <label>
                          {t.world.viewSeason}
                          <select
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
                          </select>
                        </label>
                      )}
                    </div>
                    {history ? (
                      <>
                        <h3>
                          {history.season} · {league!.name}
                        </h3>
                        <LeagueTable
                          world={world}
                          league={league!}
                          selected={club!.id}
                          onSelect={selectClub}
                          rows={history.tables[league!.id]}
                        />
                        <SeasonReview
                          world={world}
                          league={league!}
                          summary={history}
                          onSelect={selectClub}
                        />
                        {world.pyramid && (
                          <>
                            <h3 className="archive-postseason-heading">{t.world.playoffs}</h3>
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
                      <p className="empty-history">{t.world.noHistory}</p>
                    )}
                  </div>
                )}
              </div>
              <section className="world-activity">
                <h2>{t.world.activity}</h2>
                {world.events.length ? (
                  <ol>
                    {world.events
                      .slice(-12)
                      .reverse()
                      .map((event) => (
                        <li key={event.id}>
                          <span>
                            {format(t.world.eventDate, {
                              season: event.date.season,
                              week: event.date.week,
                            })}
                          </span>
                          <p>
                            {format(
                              t.world.events[event.kind as keyof typeof t.world.events] ??
                                t.world.quiet,
                              event.params,
                            )}
                          </p>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p>{t.world.quiet}</p>
                )}
              </section>
            </section>
            <ClubInspector
              world={world}
              club={club!}
              selectedPlayer={params.get('player') ?? undefined}
              onPlayer={(id) => update({ player: id })}
            />
          </div>
          <details className="new-world">
            <summary>{t.world.regenerate}</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                create();
              }}
            >
              <label htmlFor="another-world-seed">{t.world.seed}</label>
              <input
                id="another-world-seed"
                maxLength={120}
                required
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                disabled={Boolean(job)}
              />
              <button className="button secondary" disabled={Boolean(job) || !seed.trim()}>
                {t.world.regenerate}
              </button>
            </form>
          </details>
        </>
      )}
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
