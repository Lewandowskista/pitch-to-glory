import type {
  DivisionProfile,
  League,
  LeaguePhase,
  LeagueZone,
  NationalProfile,
  PostseasonTie,
  SeasonSummary,
  Standing,
  World,
} from '../../model/domain';
import { useMemo, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { t, format } from '../../i18n';
import { Artwork } from '../../ui/Artwork';
import { Tooltip } from '../../ui/Tooltip';
import { Icon } from '../../ui/Icon';
import { Chip, cx } from '../../ui/kit';
import { renderCrest } from '../../engine/assets/crest';
import { calendarDate } from '../../engine/world/calendar';
import { formatGameDate } from '../../i18n/calendar';

type SelectClub = (id: string) => void;

/** The career player's club, marked "You" in tables and highlighted in fixture lists. */
export function careerClubId(world: World): string | undefined {
  return world.career ? (world.players[world.career.playerId]?.clubId ?? undefined) : undefined;
}

/** A crest as a decorative image (the club name always sits beside it). */
export function Crest({ world, id, className }: { world: World; id: string; className: string }) {
  const crest = world.clubs[id]?.crest;
  const svg = useMemo(() => (crest ? renderCrest(crest) : ''), [crest]);
  return svg ? <Artwork svg={svg} alt="" className={cx('shrink-0', className)} /> : null;
}

/** A native select drawn as the redesign's field: 44px, radius 12, a chevron on the right. */
export function WorldSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx('relative block min-w-0', className)}>
      <select
        {...props}
        className="block min-h-11 w-full min-w-0 cursor-pointer appearance-none truncate rounded-control border border-line bg-surface py-2 pr-10 pl-3.5 text-sm font-semibold text-ink transition-colors hover:border-muted focus-visible:border-accent"
      />
      <Icon
        name="chevron"
        className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 rotate-90 text-muted"
      />
    </span>
  );
}

/** A labelled select stacked over its label (filters and view pickers). */
export function SelectField({
  id,
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string; label: string }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-bold text-muted">
        {label}
      </label>
      <WorldSelect id={id} {...props}>
        {children}
      </WorldSelect>
    </div>
  );
}

/** A view heading in Bebas with an optional picker on the right (fixtures, cup, archive). */
export function ViewHeading({
  title,
  label,
  children,
  as: Heading = 'h2',
  className,
}: {
  title: ReactNode;
  /** The picker's visible label; its select carries the same `aria-label`. */
  label?: string;
  children?: ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={cx('view-heading flex flex-wrap items-end justify-between gap-3', className)}>
      <Heading className="min-w-0 font-display text-[1.75rem] leading-none font-normal sm:text-[1.875rem]">
        {title}
      </Heading>
      {children && (
        <label className="flex min-w-[9.5rem] flex-col gap-1 text-xs font-bold text-muted">
          {label}
          {children}
        </label>
      )}
    </div>
  );
}

/** A quiet dashed note for a view with nothing in it yet. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="empty-history flex items-start gap-3 rounded-panel border border-dashed border-line px-4 py-4 text-sm text-muted">
      <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const noteClass = 'table-note text-[0.8125rem] text-muted';

export function CompetitionRules({
  league,
  profile,
  division,
  rounds,
}: {
  league: League;
  profile?: NationalProfile;
  division?: DivisionProfile;
  rounds: number;
}) {
  return (
    <section
      className="competition-rules flex flex-col gap-1.5 rounded-control bg-surface-soft px-4 pt-3.5 pb-1.5"
      aria-label={t.world.rulesTitle}
    >
      <p className="rules-reference flex items-start gap-2 font-bold">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-accent"
        >
          <path
            d="M4 5Q8 3 12 6Q16 3 20 5V19Q16 17 12 20Q8 17 4 19ZM12 6V20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        {profile
          ? division?.reference
            ? format(t.world.modelledOn, {
                competition: division.reference,
                season: profile.referenceSeason,
              })
            : format(t.world.reference, {
                counterpart: profile.counterpart,
                season: profile.referenceSeason,
              })
          : t.world.legacyRules}
      </p>
      <p className="rules-facts flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-muted tabular-nums">
        {format(t.world.divisionFacts, { clubs: league.clubIds.length, rounds })}
        {league.status && <Chip tone="info">{t.world.status[league.status]}</Chip>}
      </p>
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold text-accent underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          <Icon
            name="chevron"
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
          />
          {t.world.rulesTitle}
        </summary>
        <div className="flex flex-col gap-2.5 pb-3 text-sm">
          <p className="leading-relaxed">{league.rules ?? t.world.legacyRulesBody}</p>
          {profile && (
            <>
              <ul className="rule-sources flex flex-col">
                {(division?.sources ?? profile.sources).map((source) => (
                  <li key={`${source.url}:${source.referenceSeason}`}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center font-semibold break-words text-accent underline underline-offset-[3px]"
                    >
                      {source.title}
                    </a>
                    <small className="block text-xs text-muted">
                      {format(t.world.sourceSeason, { season: source.referenceSeason })}
                    </small>
                  </li>
                ))}
              </ul>
              {profile.adaptations.length > 0 && (
                <div className="rule-adaptations">
                  <h3 className="text-[0.8125rem] font-extrabold">{t.world.adaptations}</h3>
                  <ul className="mt-1 list-disc pl-5 text-[0.8125rem] leading-relaxed text-muted">
                    {profile.adaptations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </details>
    </section>
  );
}

function tableZones(league: League, rowCount: number): LeagueZone[] {
  if (league.zones) return league.zones;
  return [
    ...(league.promotionPlaces
      ? [
          {
            from: 1,
            to: league.promotionPlaces,
            kind: 'promotion' as const,
            label: t.world.promotion,
          },
        ]
      : []),
    ...(league.relegationPlaces
      ? [
          {
            from: rowCount - league.relegationPlaces + 1,
            to: rowCount,
            kind: 'relegation' as const,
            label: t.world.relegation,
          },
        ]
      : []),
  ];
}

/** A zone key: the zone's chip with its letter or arrow, so colour is never the only cue. */
function ZoneKey({ kind }: { kind: LeagueZone['kind'] }) {
  return (
    <span aria-hidden="true" className={`zone-key ${kind}-key`}>
      {t.world.zoneMarks[kind]}
    </span>
  );
}

const STAT_KEYS = ['played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts'] as const;
const DETAIL_KEYS: readonly string[] = ['won', 'drawn', 'lost', 'gf', 'ga'];

export function LeagueTable({
  world,
  league,
  selected,
  onSelect,
  rows = league.standings,
  initialPoints,
  title,
  titleAs = 'h2',
}: {
  world: World;
  league: League;
  selected: string;
  onSelect: SelectClub;
  rows?: Standing[];
  initialPoints?: Record<string, number>;
  /** A visible heading beside the columns toggle (the caption stays for screen readers). */
  title?: ReactNode;
  titleAs?: 'h2' | 'h3';
}) {
  const [allColumns, setAllColumns] = useState(false);
  const zones = tableZones(league, rows.length);
  const hasBonus = initialPoints && Object.values(initialPoints).some((points) => points > 0);
  const you = careerClubId(world);
  const Heading = titleAs;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {title && (
          <Heading
            className={
              titleAs === 'h2'
                ? 'min-w-0 font-display text-[1.75rem] leading-none font-normal sm:text-[2rem]'
                : 'min-w-0 text-[0.9375rem] font-extrabold'
            }
          >
            {title}
          </Heading>
        )}
        <button
          type="button"
          className="table-columns-toggle ml-auto min-h-11 items-center gap-2 px-1 font-bold text-accent underline underline-offset-4"
          aria-pressed={allColumns}
          onClick={() => setAllColumns(!allColumns)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0">
            <path
              d="M4 6H20M4 12H14M4 18H10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          {allColumns ? t.world.compactStats : t.world.fullStats}
        </button>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={league.name}>
        <table className={cx('standings-table', allColumns && 'all-columns')}>
          <caption className="sr-only">{league.name}</caption>
          <thead>
            <tr>
              <th scope="col" aria-label={t.world.rank} className="w-10">
                #
              </th>
              <th scope="col">{t.world.club}</th>
              {STAT_KEYS.map((key) => (
                <th
                  scope="col"
                  key={key}
                  className={cx('num', DETAIL_KEYS.includes(key) && 'table-detail')}
                  aria-label={t.world[key]}
                >
                  <Tooltip label={t.world[key]}>
                    <abbr className="stat-abbr">{t.world.short[key]}</abbr>
                  </Tooltip>
                </th>
              ))}
              {hasBonus && (
                <th scope="col" className="bonus-column num">
                  {t.world.phaseBonus}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const club = world.clubs[row.clubId]!;
              const zone = zones.find((zone) => index + 1 >= zone.from && index + 1 <= zone.to);
              const difference = row.goalsFor - row.goalsAgainst;
              return (
                <tr
                  key={row.clubId}
                  className={cx(selected === row.clubId && 'selected-row', zone?.kind)}
                >
                  <td>
                    <span
                      className="rank"
                      aria-label={
                        zone
                          ? format(t.world.rankLabel, { rank: index + 1, zone: zone.label })
                          : undefined
                      }
                      role={zone ? 'img' : undefined}
                    >
                      <span aria-hidden={zone ? true : undefined}>{index + 1}</span>
                      {zone && (
                        <span aria-hidden="true" className="rank-mark">
                          {t.world.zoneMarks[zone.kind]}
                        </span>
                      )}
                    </span>
                  </td>
                  <th scope="row">
                    <button
                      type="button"
                      className="club-button"
                      onClick={() => onSelect(club.id)}
                      aria-pressed={selected === club.id}
                    >
                      <Crest world={world} id={club.id} className="h-[1.8rem] w-[1.625rem]" />
                      <span className="min-w-0">{club.name}</span>
                      {club.id === you && <Chip tone="gold">{t.world.you}</Chip>}
                    </button>
                  </th>
                  <td className="num">{row.played}</td>
                  <td className="num table-detail">{row.won}</td>
                  <td className="num table-detail">{row.drawn}</td>
                  <td className="num table-detail">{row.lost}</td>
                  <td className="num table-detail">{row.goalsFor}</td>
                  <td className="num table-detail">{row.goalsAgainst}</td>
                  <td className="num">{difference > 0 ? `+${difference}` : difference}</td>
                  <td className="num points">{row.points}</td>
                  {hasBonus && (
                    <td className="num font-bold text-gold-ink">
                      {initialPoints[row.clubId] ?? 0}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {zones.length > 0 && (
        <ul
          className="table-legend zone-legend flex flex-wrap gap-x-5 gap-y-2"
          aria-label={t.world.zones}
        >
          {zones.map((zone) => (
            <li
              key={`${zone.kind}:${zone.from}:${zone.to}`}
              className="flex items-center gap-2 text-[0.8125rem] font-semibold"
            >
              <ZoneKey kind={zone.kind} />
              <span className={`${zone.kind}-label`}>{zone.label}</span>
              <small className="text-[0.8125rem] font-medium text-muted">
                {zone.from === zone.to ? zone.from : `${zone.from}–${zone.to}`}
              </small>
            </li>
          ))}
        </ul>
      )}
      <p className={noteClass}>
        {initialPoints
          ? hasBonus
            ? t.world.phaseBonusNote
            : t.world.phaseResetNote
          : world.pyramid
            ? t.world.nationalTableNote
            : t.world.legend}
      </p>
    </div>
  );
}

export function FixtureList({
  world,
  fixtureIds,
  onSelect,
  legs = false,
}: {
  world: World;
  fixtureIds: string[];
  onSelect: SelectClub;
  /** Label each row as a leg of a tie ("Leg 1 · Wed 20 May"). */
  legs?: boolean;
}) {
  if (!fixtureIds.length) return <EmptyNote>{t.world.noFixtures}</EmptyNote>;
  const you = careerClubId(world);
  return (
    <div className="fixture-list flex flex-col gap-1.5">
      {fixtureIds.map((id, index) => {
        const fixture = world.fixtures[id];
        if (!fixture) return null;
        const result = world.results[id];
        const home = world.clubs[fixture.homeId]!,
          away = world.clubs[fixture.awayId]!;
        const date = formatGameDate(
          calendarDate(fixture.date.season, fixture.date.week, fixture.date.day),
        );
        const mine = you !== undefined && (home.id === you || away.id === you);
        return (
          <article
            className={cx(
              'fixture-row flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-control px-3 py-2',
              mine ? 'bg-art-gold' : 'bg-surface-soft',
            )}
            key={id}
          >
            <p className="fixture-date basis-full text-[0.6875rem] font-bold text-muted">
              {legs ? `${format(t.world.leg, { leg: index + 1 })} · ${date}` : date}
            </p>
            <button
              type="button"
              className="fixture-team justify-end text-right"
              onClick={() => onSelect(home.id)}
            >
              <span className="min-w-0">{home.name}</span>
              <Crest world={world} id={home.id} className="h-8 w-7" />
            </button>
            <div className="fixture-score flex min-w-[5.25rem] flex-none flex-col items-center text-center">
              <strong className="font-display text-[1.75rem] leading-none font-normal whitespace-nowrap">
                {result ? `${result.score[0]} – ${result.score[1]}` : t.world.pending}
              </strong>
              {result?.extraTime && (
                <small className="text-[0.6875rem] font-bold text-muted">
                  {format(t.world.extraTime, {
                    home: result.extraTime[0],
                    away: result.extraTime[1],
                  })}
                </small>
              )}
              {result?.penalties && (
                <small className="text-[0.6875rem] font-bold text-muted">
                  {format(t.world.penalties, {
                    home: result.penalties[0],
                    away: result.penalties[1],
                  })}
                </small>
              )}
            </div>
            <button type="button" className="fixture-team" onClick={() => onSelect(away.id)}>
              <Crest world={world} id={away.id} className="h-8 w-7" />
              <span className="min-w-0">{away.name}</span>
            </button>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Display label for a playoff tie or extra phase, built from its kind, stage and source
 * division in this world, rather than the engine's internal key.
 */
export function postseasonLabel(world: World, entry: LeaguePhase | PostseasonTie): string {
  const source = entry.sourceLeagueIds.map((id) => world.leagues[id]).find(Boolean);
  const multiple = new Set(entry.sourceLeagueIds.filter((id) => world.leagues[id])).size > 1;
  const [division, group] = source
    ? multiple
      ? [source.name.split(' · ')[0]!, undefined]
      : source.name.split(' · ')
    : [world.countries[entry.countryId]?.name ?? '', undefined];
  const key = entry.name.toLowerCase();
  const number = /(\d+)$/.exec(entry.id)?.[1];
  const stage =
    'standings' in entry
      ? 'league'
      : key.includes('final')
        ? 'final'
        : key.includes('semi')
          ? 'semi'
          : key.includes('eliminator')
            ? 'eliminator'
            : key.includes('preliminary')
              ? 'preliminary'
              : key.includes('extra')
                ? 'decider'
                : key.includes('ranking')
                  ? 'ranking'
                  : 'playoff';
  const numbered = ['semi', 'preliminary', 'eliminator', 'playoff'].includes(stage) && number;
  return format(t.world.postseasonLabel, {
    division,
    kind: t.world.postseasonKinds[entry.kind],
    stage: t.world.postseasonStages[stage],
  }).concat(numbered ? ` ${Number(number) + 1}` : '', group ? ` · ${group}` : '');
}

/** The status of a phase or tie: complete in green, in progress in gold, always in words. */
function StageChips({ kind, status }: { kind: string; status: 'active' | 'complete' }) {
  return (
    <div className="postseason-meta flex flex-wrap gap-2">
      <Chip tone="info">{kind}</Chip>
      <Chip tone={status === 'complete' ? 'accent' : 'gold-soft'}>
        {t.world.stageStatuses[status]}
      </Chip>
    </div>
  );
}

function PhaseTable({
  world,
  league,
  phase,
  selected,
  onSelect,
}: {
  world: World;
  league: League;
  phase: LeaguePhase;
  selected: string;
  onSelect: SelectClub;
}) {
  const phaseLeague: League = {
    ...league,
    id: phase.id,
    name: postseasonLabel(world, phase),
    clubIds: phase.clubIds,
    fixtureIds: phase.fixtureIds,
    standings: phase.standings,
    promotionPlaces: 0,
    relegationPlaces: 0,
    zones: [],
  };
  return (
    <LeagueTable
      world={world}
      league={phaseLeague}
      selected={selected}
      onSelect={onSelect}
      initialPoints={phase.initialPoints}
    />
  );
}

function TieResult({
  world,
  tie,
  onSelect,
  archived,
}: {
  world: World;
  tie: PostseasonTie;
  onSelect: SelectClub;
  archived: boolean;
}) {
  const [homeId, awayId] = tie.clubIds;
  const home = world.clubs[homeId]!,
    away = world.clubs[awayId]!;
  const tieClub =
    'tie-club flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 text-center text-sm font-bold text-ink hover:text-accent';
  return (
    <section
      className="postseason-tie flex flex-col gap-3.5 rounded-panel border border-line p-4 sm:p-[1.125rem]"
      aria-label={postseasonLabel(world, tie)}
    >
      <StageChips kind={t.world.tieLegs[tie.legs]} status={tie.status} />
      <div className="tie-aggregate flex items-center gap-3 rounded-control bg-surface-soft px-2.5 py-3.5">
        <button type="button" className={tieClub} onClick={() => onSelect(homeId)}>
          <Crest world={world} id={home.id} className="h-[3.25rem] w-[2.875rem]" />
          <span className="max-w-full break-words">{home.name}</span>
        </button>
        <div className="flex-none text-center">
          <small className="block text-[0.6875rem] font-extrabold tracking-[0.1em] text-muted uppercase">
            {t.world.aggregate}
          </small>
          <strong className="font-display text-[2.5rem] leading-[0.9] font-normal whitespace-nowrap sm:text-[3rem]">
            {tie.aggregate[0]} – {tie.aggregate[1]}
          </strong>
        </div>
        <button type="button" className={tieClub} onClick={() => onSelect(awayId)}>
          <Crest world={world} id={away.id} className="h-[3.25rem] w-[2.875rem]" />
          <span className="max-w-full break-words">{away.name}</span>
        </button>
      </div>
      {tie.winnerId && (
        <p className="tie-outcome flex flex-wrap items-center gap-2.5">
          <strong className="inline-flex items-center gap-2">
            <Icon name="history" className="h-[1.125rem] w-[1.125rem] shrink-0 text-meter-gold" />
            {format(t.world.tieWinner, { name: world.clubs[tie.winnerId]!.name })}
          </strong>
          {tie.resolution && <Chip tone="gold-soft">{t.world.resolutions[tie.resolution]}</Chip>}
        </p>
      )}
      <p className={noteClass}>{t.world.drawRules[tie.drawRule]}</p>
      {tie.higherRankedId && tie.drawRule.includes('higher-rank') && (
        <p className="text-[0.8125rem] font-bold">
          {format(t.world.higherRanked, { name: world.clubs[tie.higherRankedId]!.name })}
        </p>
      )}
      {!archived && (
        <FixtureList world={world} fixtureIds={tie.fixtureIds} onSelect={onSelect} legs />
      )}
    </section>
  );
}

export function PostseasonView({
  world,
  league,
  selected,
  onSelect,
  selection,
  onChange,
  round,
  onRound,
  summary,
}: {
  world: World;
  league: League;
  selected: string;
  onSelect: SelectClub;
  selection: string | null;
  onChange(id: string): void;
  round: string | null;
  onRound(week: string): void;
  summary?: SeasonSummary;
}) {
  const phases = Object.values(
    summary ? (summary.phases ?? {}) : (world.pyramid?.phases ?? {}),
  ).filter(
    (phase) => phase.countryId === league.countryId && phase.sourceLeagueIds.includes(league.id),
  );
  const ties = Object.values(summary ? (summary.ties ?? {}) : (world.pyramid?.ties ?? {})).filter(
    (tie) => tie.countryId === league.countryId && tie.sourceLeagueIds.includes(league.id),
  );
  const entries = [
    ...phases.map((phase) => ({
      id: `phase:${phase.id}`,
      name: postseasonLabel(world, phase),
      phase,
      tie: undefined,
    })),
    ...ties.map((tie) => ({
      id: `tie:${tie.id}`,
      name: postseasonLabel(world, tie),
      phase: undefined,
      tie,
    })),
  ];
  const entry =
    entries.find((entry) => entry.id === selection) ??
    entries.find((entry) => (entry.phase ?? entry.tie)?.status === 'active') ??
    entries.at(-1);
  if (!entry)
    return <EmptyNote>{summary ? t.world.noArchivedPostseason : t.world.noPostseason}</EmptyNote>;
  const fixtureWeeks = entry.phase
    ? [
        ...new Set(
          entry.phase.fixtureIds
            .map((id) => world.fixtures[id]?.date.week)
            .filter((week): week is number => week !== undefined),
        ),
      ].sort((a, b) => a - b)
    : [];
  const fixtureWeek = fixtureWeeks.includes(Number(round))
    ? Number(round)
    : (fixtureWeeks.find((week) => week >= world.date.week) ?? fixtureWeeks.at(-1));
  return (
    <div className="postseason-view flex flex-col gap-4">
      <SelectField
        id={summary ? 'archived-postseason-stage' : 'postseason-stage'}
        label={t.world.playoffStage}
        value={entry.id}
        onChange={(event) => onChange(event.target.value)}
      >
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </SelectField>
      {summary && <p className={noteClass}>{t.world.archiveResultsNote}</p>}
      {entry.phase ? (
        <>
          <StageChips kind={t.world.phaseKinds[entry.phase.kind]} status={entry.phase.status} />
          <PhaseTable
            world={world}
            league={league}
            phase={entry.phase}
            selected={selected}
            onSelect={onSelect}
          />
          {!summary && fixtureWeek !== undefined && (
            <>
              <ViewHeading
                as="h3"
                title={t.world.fixtures}
                label={t.world.round}
                className="phase-fixtures-heading border-t border-line pt-4"
              >
                <WorldSelect
                  aria-label={t.world.round}
                  value={fixtureWeek}
                  onChange={(event) => onRound(event.target.value)}
                >
                  {fixtureWeeks.map((week) => (
                    <option key={week} value={week}>
                      {format(t.world.roundValue, { week })}
                    </option>
                  ))}
                </WorldSelect>
              </ViewHeading>
              <FixtureList
                world={world}
                fixtureIds={entry.phase.fixtureIds.filter(
                  (id) => world.fixtures[id]?.date.week === fixtureWeek,
                )}
                onSelect={onSelect}
              />
            </>
          )}
        </>
      ) : (
        entry.tie && (
          <TieResult
            world={world}
            tie={entry.tie}
            onSelect={onSelect}
            archived={Boolean(summary)}
          />
        )
      )}
    </div>
  );
}

/** The tier a movement starts or ends in; the regional feeder leagues sit below every tier. */
function movementTier(world: World, leagueId: string): number {
  return world.leagues[leagueId]?.tier ?? 99;
}

export function SeasonReview({
  world,
  league,
  summary = world.history.at(-1),
  onSelect,
}: {
  world: World;
  league: League;
  summary?: SeasonSummary;
  onSelect?: SelectClub;
}) {
  if (!summary) return null;
  const championId = summary.champions[league.id] ?? summary.tables[league.id]?.[0]?.clubId;
  const champion = championId ? world.clubs[championId] : undefined;
  // In a qualifying group the table winner is not the champion; the deciding phase names it.
  const division = league.divisionId ? summary.divisionChampions?.[league.divisionId] : undefined;
  const divisionChampion = division ? world.clubs[division.clubId] : undefined;
  const movements = summary.movements.filter(
    (movement) => movement.fromLeagueId === league.id || movement.toLeagueId === league.id,
  );
  const championCard = (id: string, name: string, eyebrow: string) => (
    <div className="champion flex items-center gap-3.5 rounded-panel bg-art-gold px-4 py-3.5">
      <Crest world={world} id={id} className="h-[4.25rem] w-[3.75rem]" />
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-extrabold tracking-[0.14em] text-gold-ink uppercase">
          {eyebrow}
        </p>
        <h3 className="font-display text-[2.125rem] leading-none font-normal text-ink">{name}</h3>
      </div>
    </div>
  );
  return (
    <section className="season-summary flex flex-col gap-2.5 border-t border-line pt-3.5">
      {champion &&
        championCard(
          champion.id,
          champion.name,
          division ? t.world.groupWinner : t.world.champions,
        )}
      {divisionChampion && (
        <>
          <p className={noteClass}>{t.world.groupWinnerNote}</p>
          {championCard(divisionChampion.id, divisionChampion.name, t.world.divisionChampion)}
        </>
      )}
      <h4 className="mt-1 text-[0.9375rem] font-extrabold">{t.world.movement}</h4>
      <p className={noteClass}>{t.world.seasonReviewNote}</p>
      {movements.length ? (
        <ul className="confirmed-movements flex flex-col gap-1.5">
          {movements.map((movement) => {
            const club = world.clubs[movement.clubId]!;
            const from = world.leagues[movement.fromLeagueId]?.name ?? t.world.feederDivision;
            const to = world.leagues[movement.toLeagueId]?.name ?? t.world.feederDivision;
            const fromTier = movementTier(world, movement.fromLeagueId);
            const toTier = movementTier(world, movement.toLeagueId);
            const direction = toTier < fromTier ? 'up' : toTier > fromTier ? 'down' : 'across';
            return (
              <li
                key={`${movement.clubId}:${movement.fromLeagueId}:${movement.toLeagueId}`}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-control bg-surface-soft px-3 py-1.5"
              >
                <span aria-hidden="true" className={`movement-mark movement-${direction}`}>
                  {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'}
                </span>
                {onSelect ? (
                  <button
                    type="button"
                    className="min-h-11 text-left font-bold text-accent underline underline-offset-4"
                    onClick={() => onSelect(club.id)}
                  >
                    {club.name}
                  </button>
                ) : (
                  <strong className="py-2">{club.name}</strong>
                )}
                <span className="min-w-0 flex-[1_1_13rem] text-[0.8125rem]">
                  <span className="sr-only">
                    {
                      t.world[
                        direction === 'up'
                          ? 'movementUp'
                          : direction === 'down'
                            ? 'movementDown'
                            : 'movementAcross'
                      ]
                    }
                    :{' '}
                  </span>
                  {from} → {to}
                </span>
                <small className="text-xs font-bold text-muted">
                  {t.world.movementReasons[movement.reason ?? 'automatic']}
                </small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={noteClass}>{t.world.noMovement}</p>
      )}
    </section>
  );
}
