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
import { useState } from 'react';
import { t, format } from '../../i18n';
import { Artwork } from '../../ui/Artwork';
import { Tooltip } from '../../ui/Tooltip';
import { renderCrest } from '../../engine/assets/crest';

type SelectClub = (id: string) => void;

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
    <section className="competition-rules" aria-label={t.world.rulesTitle}>
      <p className="rules-reference">
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
      <p className="rules-facts">
        {format(t.world.divisionFacts, { clubs: league.clubIds.length, rounds })}
        {league.status && <span>{t.world.status[league.status]}</span>}
      </p>
      <details>
        <summary>{t.world.rulesTitle}</summary>
        <p>{league.rules ?? t.world.legacyRulesBody}</p>
        {profile && (
          <>
            <ul className="rule-sources">
              {(division?.sources ?? profile.sources).map((source) => (
                <li key={`${source.url}:${source.referenceSeason}`}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                  <small>{format(t.world.sourceSeason, { season: source.referenceSeason })}</small>
                </li>
              ))}
            </ul>
            {profile.adaptations.length > 0 && (
              <div className="rule-adaptations">
                <h3>{t.world.adaptations}</h3>
                <ul>
                  {profile.adaptations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
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

export function LeagueTable({
  world,
  league,
  selected,
  onSelect,
  rows = league.standings,
  initialPoints,
}: {
  world: World;
  league: League;
  selected: string;
  onSelect: SelectClub;
  rows?: Standing[];
  initialPoints?: Record<string, number>;
}) {
  const [allColumns, setAllColumns] = useState(false);
  const zones = tableZones(league, rows.length);
  const hasBonus = initialPoints && Object.values(initialPoints).some((points) => points > 0);
  return (
    <>
      <button
        className="table-columns-toggle text-button"
        aria-pressed={allColumns}
        onClick={() => setAllColumns(!allColumns)}
      >
        {allColumns ? t.world.compactStats : t.world.fullStats}
      </button>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={league.name}>
        <table className={`standings-table ${allColumns ? 'all-columns' : ''}`}>
          <caption>{league.name}</caption>
          <thead>
            <tr>
              <th scope="col" aria-label={t.world.rank}>
                #
              </th>
              <th scope="col">{t.world.club}</th>
              {(['played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts'] as const).map((key) => (
                <th
                  scope="col"
                  key={key}
                  className={
                    ['won', 'drawn', 'lost', 'gf', 'ga'].includes(key) ? 'table-detail' : ''
                  }
                  aria-label={t.world[key]}
                >
                  <Tooltip label={t.world[key]}>
                    <abbr className="no-underline">{t.world.short[key]}</abbr>
                  </Tooltip>
                </th>
              ))}
              {hasBonus && (
                <th scope="col" className="bonus-column">
                  {t.world.phaseBonus}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const club = world.clubs[row.clubId]!;
              const zone = zones.find((zone) => index + 1 >= zone.from && index + 1 <= zone.to);
              return (
                <tr
                  key={row.clubId}
                  className={`${selected === row.clubId ? 'selected-row' : ''} ${zone?.kind ?? ''}`}
                >
                  <td>
                    <span
                      className="rank"
                      aria-label={
                        zone
                          ? format(t.world.rankLabel, { rank: index + 1, zone: zone.label })
                          : undefined
                      }
                    >
                      {index + 1}
                    </span>
                  </td>
                  <th scope="row">
                    <button onClick={() => onSelect(club.id)} aria-pressed={selected === club.id}>
                      <Artwork svg={renderCrest(club.crest)} alt="" />
                      <span>{club.name}</span>
                    </button>
                  </th>
                  <td>{row.played}</td>
                  <td className="table-detail">{row.won}</td>
                  <td className="table-detail">{row.drawn}</td>
                  <td className="table-detail">{row.lost}</td>
                  <td className="table-detail">{row.goalsFor}</td>
                  <td className="table-detail">{row.goalsAgainst}</td>
                  <td>{row.goalsFor - row.goalsAgainst}</td>
                  <td className="points">{row.points}</td>
                  {hasBonus && <td>{initialPoints[row.clubId] ?? 0}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {zones.length > 0 && (
        <ul className="table-legend zone-legend">
          {zones.map((zone) => (
            <li key={`${zone.kind}:${zone.from}:${zone.to}`}>
              <span className={`${zone.kind}-key`}>{zone.label}</span>
              <small>{zone.from === zone.to ? zone.from : `${zone.from}–${zone.to}`}</small>
            </li>
          ))}
        </ul>
      )}
      <p className="table-note">
        {initialPoints
          ? hasBonus
            ? t.world.phaseBonusNote
            : t.world.phaseResetNote
          : world.pyramid
            ? t.world.nationalTableNote
            : t.world.legend}
      </p>
    </>
  );
}

export function FixtureList({
  world,
  fixtureIds,
  onSelect,
  showDate = false,
}: {
  world: World;
  fixtureIds: string[];
  onSelect: SelectClub;
  showDate?: boolean;
}) {
  if (!fixtureIds.length) return <p className="empty-history">{t.world.noFixtures}</p>;
  return (
    <div className="fixture-list">
      {fixtureIds.map((id) => {
        const fixture = world.fixtures[id];
        if (!fixture) return null;
        const result = world.results[id];
        const home = world.clubs[fixture.homeId]!,
          away = world.clubs[fixture.awayId]!;
        return (
          <article className="fixture-row" key={id}>
            {showDate && (
              <p className="fixture-date">
                {format(t.world.scheduledWeek, { week: fixture.date.week, day: fixture.date.day })}
              </p>
            )}
            <button className="fixture-team" onClick={() => onSelect(home.id)}>
              <Artwork svg={renderCrest(home.crest)} alt="" />
              <span>{home.name}</span>
            </button>
            <div className="fixture-score">
              <strong>
                {result ? `${result.score[0]} – ${result.score[1]}` : t.world.pending}
              </strong>
              {result?.extraTime && (
                <small>
                  {format(t.world.extraTime, {
                    home: result.extraTime[0],
                    away: result.extraTime[1],
                  })}
                </small>
              )}
              {result?.penalties && (
                <small>
                  {format(t.world.penalties, {
                    home: result.penalties[0],
                    away: result.penalties[1],
                  })}
                </small>
              )}
            </div>
            <button className="fixture-team away-team" onClick={() => onSelect(away.id)}>
              <span>{away.name}</span>
              <Artwork svg={renderCrest(away.crest)} alt="" />
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
  return (
    <section className="postseason-tie" aria-label={postseasonLabel(world, tie)}>
      <div className="postseason-meta">
        <span>{t.world.tieLegs[tie.legs]}</span>
        <span>{t.world.stageStatuses[tie.status]}</span>
      </div>
      <div className="tie-aggregate">
        <button className="tie-club" onClick={() => onSelect(homeId)}>
          <Artwork svg={renderCrest(home.crest)} alt="" />
          <span>{home.name}</span>
        </button>
        <div>
          <small>{t.world.aggregate}</small>
          <strong>
            {tie.aggregate[0]} – {tie.aggregate[1]}
          </strong>
        </div>
        <button className="tie-club" onClick={() => onSelect(awayId)}>
          <Artwork svg={renderCrest(away.crest)} alt="" />
          <span>{away.name}</span>
        </button>
      </div>
      {tie.winnerId && (
        <p className="tie-outcome">
          <strong>{format(t.world.tieWinner, { name: world.clubs[tie.winnerId]!.name })}</strong>
          {tie.resolution && <span>{t.world.resolutions[tie.resolution]}</span>}
        </p>
      )}
      <p className="table-note">{t.world.drawRules[tie.drawRule]}</p>
      {tie.higherRankedId && tie.drawRule.includes('higher-rank') && (
        <p className="table-note">
          {format(t.world.higherRanked, { name: world.clubs[tie.higherRankedId]!.name })}
        </p>
      )}
      {!archived && (
        <FixtureList world={world} fixtureIds={tie.fixtureIds} onSelect={onSelect} showDate />
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
    return (
      <p className="empty-history">
        {summary ? t.world.noArchivedPostseason : t.world.noPostseason}
      </p>
    );
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
    <div className="postseason-view">
      <div className="postseason-selector">
        <label htmlFor={summary ? 'archived-postseason-stage' : 'postseason-stage'}>
          {t.world.playoffStage}
        </label>
        <select
          id={summary ? 'archived-postseason-stage' : 'postseason-stage'}
          value={entry.id}
          onChange={(event) => onChange(event.target.value)}
        >
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      {summary && <p className="table-note">{t.world.archiveResultsNote}</p>}
      {entry.phase ? (
        <>
          <div className="postseason-meta">
            <span>{t.world.phaseKinds[entry.phase.kind]}</span>
            <span>{t.world.stageStatuses[entry.phase.status]}</span>
          </div>
          <PhaseTable
            world={world}
            league={league}
            phase={entry.phase}
            selected={selected}
            onSelect={onSelect}
          />
          {!summary && fixtureWeek !== undefined && (
            <>
              <div className="view-heading phase-fixtures-heading">
                <h3>{t.world.fixtures}</h3>
                <label>
                  {t.world.round}
                  <select
                    aria-label={t.world.round}
                    value={fixtureWeek}
                    onChange={(event) => onRound(event.target.value)}
                  >
                    {fixtureWeeks.map((week) => (
                      <option key={week} value={week}>
                        {format(t.world.roundValue, { week })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
  return (
    <section className="season-summary">
      {champion && (
        <>
          <p className="eyebrow">{division ? t.world.groupWinner : t.world.champions}</p>
          <div className="champion">
            <Artwork svg={renderCrest(champion.crest)} alt="" />
            <h3>{champion.name}</h3>
          </div>
        </>
      )}
      {divisionChampion && (
        <>
          <p className="table-note">{t.world.groupWinnerNote}</p>
          <p className="eyebrow">{t.world.divisionChampion}</p>
          <div className="champion">
            <Artwork svg={renderCrest(divisionChampion.crest)} alt="" />
            <h3>{divisionChampion.name}</h3>
          </div>
        </>
      )}
      <h4>{t.world.movement}</h4>
      <p className="table-note">{t.world.seasonReviewNote}</p>
      {movements.length ? (
        <ul className="confirmed-movements">
          {movements.map((movement) => {
            const club = world.clubs[movement.clubId]!;
            const from = world.leagues[movement.fromLeagueId]?.name ?? t.world.feederDivision;
            const to = world.leagues[movement.toLeagueId]?.name ?? t.world.feederDivision;
            return (
              <li key={`${movement.clubId}:${movement.fromLeagueId}:${movement.toLeagueId}`}>
                {onSelect ? (
                  <button className="text-button" onClick={() => onSelect(club.id)}>
                    {club.name}
                  </button>
                ) : (
                  <strong>{club.name}</strong>
                )}
                <span>
                  {from} → {to}
                </span>
                <small>{t.world.movementReasons[movement.reason ?? 'automatic']}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="table-note">{t.world.noMovement}</p>
      )}
    </section>
  );
}
