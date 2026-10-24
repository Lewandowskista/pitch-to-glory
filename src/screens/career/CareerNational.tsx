import { useMemo, useState } from 'react';
import type { Career, NationalLevel, Player, World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import { windowWeeks } from '../../engine/career/honours';
import { lineOf } from '../../engine/career/market/rules';
import { renderTrophy } from '../../engine/assets/trophies';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { CareerPage, CrestImage, EmptySection, plural } from './shared';
import { renderFlag } from '../../engine/assets/flags';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { CardTitle, Panel, cx } from '../../ui/kit';
import { QualifyingPanel } from './QualifyingPanel';
import { useHonoursAction } from './honoursUi';

const I = CONFIG.career.honours.international;
const LEVELS: NationalLevel[] = ['senior', 'U21', 'U19'];
const LINES = ['GK', 'DEF', 'MID', 'ATT'] as const;

export default function CareerNational() {
  return (
    <CareerPage title={h.titles.national} description={h.national.pageBody}>
      {({ world, career, player, age }) => (
        <NationalContent world={world} career={career} player={player} age={age} />
      )}
    </CareerPage>
  );
}

function NationalContent({
  world,
  career,
  player,
  age,
}: {
  world: World;
  career: Career;
  player: Player;
  age: number;
}) {
  const honours = career.honours;
  const nation = world.international?.nations.find((n) => n.countryId === player.nationalityId);
  const eligible = LEVELS.filter((level) => level === 'senior' || age <= I.ages[level]);
  // A window set out for the player to play (0.9.0) is a senior call-up before it is named.
  const waiting = world.international?.window?.season === world.date.season;
  const level = waiting
    ? 'senior'
    : (honours.lastCallUp?.level ?? eligible[eligible.length - 1] ?? 'senior');
  const squad = world.nationalTeams[`national:${player.nationalityId}:${level}`];
  const selected = waiting || Boolean(squad?.playerIds.includes(player.id));
  const windows = windowWeeks(world);
  const next = windows.find((week) => week >= world.date.week);
  const nations = new Map((world.international?.nations ?? []).map((n) => [n.id, n]));
  const matches = (world.international?.matches ?? [])
    .filter(
      (m) => nation && (m.homeId === nation.id || m.awayId === nation.id) && m.career !== undefined,
    )
    .slice(-12)
    .reverse();
  const tournaments = [...(world.international?.tournaments ?? [])].reverse();
  const short = h.levelShort[level];
  const flag = useMemo(
    () =>
      renderFlag(
        world.countries[player.nationalityId]?.counterpart,
        nation ? { colors: nation.colors } : undefined,
      ),
    [world.countries, player.nationalityId, nation],
  );
  const trophy = useMemo(() => renderTrophy('international', true), []);
  return (
    // Two stable column stacks: selection, caps and tournaments beside squad and results.
    // Phones read the call-up, the tournaments, then the squad and its matches.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5 lg:col-span-5">
        <Panel
          aria-labelledby="national-heading"
          tone={selected ? 'green' : 'default'}
          className={cx('relative overflow-hidden', selected && 'ring-1 ring-accent')}
        >
          {/* A faint pennant behind the card, in the accent colour of either theme. */}
          <svg
            viewBox="0 0 200 140"
            aria-hidden="true"
            focusable="false"
            className="pointer-events-none absolute -top-2.5 -right-5 h-[9.625rem] w-[13.75rem] text-accent opacity-[0.12]"
          >
            <path
              d="M40 20V140M40 24Q80 8 120 24T200 24V84Q160 68 120 84T40 84"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinejoin="round"
            />
          </svg>
          <div className="relative grid gap-3.5">
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className={cx(
                  'grid h-13 w-13 shrink-0 place-items-center rounded-full',
                  selected ? 'bg-gold' : 'bg-surface-soft',
                )}
              >
                <Artwork svg={flag} alt="" className="h-5 w-[1.875rem] rounded-[3px]" />
              </span>
              <div className="min-w-0">
                <CardTitle id="national-heading" size="lg">
                  {selected
                    ? format(h.national.statusIn, { level: short })
                    : honours.lastCallUp
                      ? format(h.national.statusOut, { level: short })
                      : h.national.statusNone}
                </CardTitle>
                <p className="mt-1 text-sm">
                  {format(h.national.nationLine, {
                    nation: nation?.name ?? '',
                    levels: eligible.map((l) => h.levelShort[l]).join(', '),
                  })}
                </p>
              </div>
            </div>
            <p
              className={cx(
                'flex items-center gap-2.5 rounded-control px-3.5 py-2.5 text-sm font-bold',
                selected ? 'bg-surface' : 'bg-surface-soft',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4.5 w-4.5 shrink-0 text-accent"
              >
                <path
                  d="M4 6H20V20H4ZM4 10H20M8 3V7M16 3V7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {next ? format(h.national.nextWindow, { week: next }) : h.national.noWindow}
            </p>
            <p className="text-sm font-semibold">
              {honours.lastCallUp
                ? format(h.national.lastCallUp, {
                    level: h.levelShort[honours.lastCallUp.level],
                    week: honours.lastCallUp.date.week,
                    season: honours.lastCallUp.date.season,
                  })
                : h.national.never}
            </p>
            <p className="max-w-[32.5rem] text-[0.8125rem]">{h.national.body}</p>
            {windows.length > 0 && (
              <div>
                <p className="text-xs">
                  {format(h.national.windows, { weeks: windows.join(', ') })}
                </p>
                <ol aria-hidden="true" className="mt-2 flex flex-wrap gap-1.5">
                  {windows.map((week) => {
                    const played = week < world.date.week;
                    const upcoming = week === next;
                    return (
                      <li
                        key={week}
                        className={cx(
                          'rounded-full px-2.5 py-0.5 text-xs font-extrabold',
                          upcoming
                            ? 'bg-accent text-on-accent'
                            : played
                              ? 'bg-surface text-accent'
                              : 'border border-line text-muted',
                        )}
                      >
                        {format(
                          upcoming
                            ? h.national.windowNext
                            : played
                              ? h.national.windowPlayed
                              : h.national.windowLater,
                          { week },
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            <h3 className="mt-1.5 text-sm font-extrabold">{h.national.capsTitle}</h3>
            <dl className="grid grid-cols-3 gap-2">
              {LEVELS.map((l) => (
                <div
                  key={l}
                  className={cx(
                    'min-w-0 rounded-control p-3',
                    selected ? 'bg-surface' : 'bg-surface-soft',
                    l === level &&
                      honours.lastCallUp &&
                      'shadow-[inset_0_0_0_2px_var(--color-gold)]',
                  )}
                >
                  <dt className="text-[0.8125rem] font-extrabold">{h.levelShort[l]}</dt>
                  <dd className="mt-1">
                    <span className="block font-display text-[2.25rem] leading-[0.9]">
                      {honours.caps[l]}
                    </span>
                    <span className="block text-xs text-muted">
                      {honours.caps[l] === 1 ? h.national.cap : h.national.capsWord}
                    </span>
                    <span className="mt-1 block text-xs font-bold whitespace-nowrap">
                      {plural(
                        honours.internationalGoals[l],
                        h.national.goal,
                        h.national.goalsCount,
                      )}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
        <InternationalsOption career={career} />
        {tournaments.length ? (
          <Panel aria-labelledby="tournaments-heading">
            <CardTitle id="tournaments-heading">{h.national.tournaments}</CardTitle>
            <ul className="mt-3.5 grid gap-2.5">
              {tournaments.map((tournament) => (
                <li
                  key={tournament.id}
                  className="flex items-start gap-3 rounded-control bg-surface-soft p-3.5"
                >
                  <Artwork
                    svg={trophy}
                    alt=""
                    className={cx(
                      'h-10 w-10 shrink-0',
                      !tournament.career?.inSquad && 'opacity-60 grayscale',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold">
                      {format(h.national.tournamentLine, {
                        name: tournament.name,
                        year: tournament.year,
                        winner: nations.get(tournament.winnerId)?.name ?? '',
                      })}
                    </p>
                    {tournament.career && (
                      <p className="mt-0.5 text-xs text-muted">
                        {nations.get(tournament.career.nationId)?.name}:{' '}
                        {h.national.stages[tournament.career.stage]} ·{' '}
                        {tournament.career.inSquad ? h.national.inSquad : h.national.notInSquad}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{h.national.noTournaments}</p>
          </Panel>
        ) : (
          <EmptySection id="tournaments-heading" title={h.national.tournaments}>
            {h.national.noTournaments}
          </EmptySection>
        )}
      </div>
      {/* Squad and results on the wider side; the stacks never share row heights. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5 lg:col-span-7">
        {nation && <QualifyingPanel world={world} nationId={nation.id} />}
        <Squad world={world} player={player} squadIds={squad?.playerIds ?? []} level={short} />
        {matches.length ? (
          <Panel aria-labelledby="internationals-heading">
            <CardTitle id="internationals-heading">{h.national.matches}</CardTitle>
            <ul className="mt-2">
              {matches.map((match) => (
                <li
                  key={match.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0"
                >
                  <span className="text-xs text-muted">
                    {format(c.common.seasonWeek, {
                      season: match.date.season,
                      week: match.date.week,
                    })}{' '}
                    · {h.levelShort[match.level]} · {h.national.kinds[match.kind]}
                  </span>
                  <span className="text-[0.9375rem] font-extrabold">
                    {nations.get(match.homeId)?.name} {match.score[0]}–{match.score[1]}{' '}
                    {nations.get(match.awayId)?.name}
                  </span>
                  {match.penalties && (
                    <span className="text-xs text-muted">
                      {format(h.national.penalties, {
                        home: match.penalties[0],
                        away: match.penalties[1],
                      })}
                    </span>
                  )}
                  {match.career && (
                    <span className="w-full text-[0.8125rem] font-bold text-accent">
                      {format(h.national.yourPart, {
                        rating: match.career.rating.toFixed(1),
                        goals: match.career.goals,
                        assists: match.career.assists,
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <EmptySection id="internationals-heading" title={h.national.matches}>
            {h.national.noMatches}
          </EmptySection>
        )}
      </div>
    </div>
  );
}

/**
 * The latest squad at the player's level. Only the player's own line shows by default: those
 * are the names they compete with. The full squad sits behind a disclosure.
 */
function Squad({
  world,
  player,
  squadIds,
  level,
}: {
  world: World;
  player: Player;
  squadIds: string[];
  level: string;
}) {
  const [full, setFull] = useState(false);
  const members = squadIds.flatMap((id) => (world.players[id] ? [world.players[id]] : []));
  const line = lineOf(player.primaryPosition);
  const rivals = members.filter((member) => lineOf(member.primaryPosition) === line);
  const selected = squadIds.includes(player.id);
  const row = (member: Player) => {
    const mine = member.id === player.id;
    const club = member.clubId ? world.clubs[member.clubId] : undefined;
    return (
      <li
        key={member.id}
        className={cx(
          'flex min-w-0 items-center gap-2.5 rounded-control px-3 py-2',
          mine ? 'bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]' : 'bg-surface-soft',
        )}
      >
        {club ? (
          <CrestImage crest={club.crest} alt="" className="h-8 w-7 shrink-0" />
        ) : (
          <Icon name="player" className="h-6 w-7 shrink-0 text-muted" />
        )}
        <span className="flex min-w-0 flex-col">
          <span
            className={cx('truncate text-sm', mine ? 'font-extrabold text-accent' : 'font-bold')}
          >
            {mine ? format(h.national.youSuffix, { name: member.name }) : member.name}
          </span>
          <span className="truncate text-xs text-muted">
            {c.positions[member.primaryPosition]}
            {club ? ` · ${club.name}` : ''}
          </span>
        </span>
      </li>
    );
  };
  if (!members.length)
    return (
      <EmptySection id="squad-heading" title={format(h.national.squad, { level })}>
        {h.national.squadEmpty}
      </EmptySection>
    );
  return (
    <Panel aria-labelledby="squad-heading">
      <CardTitle id="squad-heading">{format(h.national.squad, { level })}</CardTitle>
      <h3 className="mt-3 text-sm font-extrabold">
        {format(h.national.lineTitle, {
          line: h.national.lines[line],
          count: rivals.length,
        })}
      </h3>
      <p className="mt-0.5 text-sm text-muted">
        {selected ? h.national.lineBodyIn : h.national.lineBodyOut}
      </p>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-2">
        {rivals.map(row)}
      </ul>
      <button
        type="button"
        className="text-button mt-3 -ml-3 min-h-11"
        aria-expanded={full}
        aria-controls="national-full-squad"
        onClick={() => setFull((open) => !open)}
      >
        {full ? h.national.hideSquad : format(h.national.fullSquad, { count: members.length })}
      </button>
      <div id="national-full-squad" hidden={!full} className="mt-2 grid gap-4">
        {full &&
          LINES.filter((other) => other !== line).map((other) => {
            const group = members.filter((member) => lineOf(member.primaryPosition) === other);
            if (!group.length) return null;
            return (
              <div key={other}>
                <h3 className="text-[0.8125rem] font-extrabold">
                  {format(h.national.lineTitle, {
                    line: h.national.lines[other],
                    count: group.length,
                  })}
                </h3>
                <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-2">
                  {group.map(row)}
                </ul>
              </div>
            );
          })}
      </div>
    </Panel>
  );
}

/** Whether the player plays their window matches themselves (0.9.0). */
function InternationalsOption({ career }: { career: Career }) {
  const { run, error, block } = useHonoursAction();
  const on = Boolean(career.honours.playInternationals);
  return (
    <Panel aria-labelledby="play-internationals-heading" className="grid gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle id="play-internationals-heading">{c.hub.window.option}</CardTitle>
          <p className="mt-1 text-xs text-muted" role="status">
            {on ? c.hub.window.optionOn : c.hub.window.optionOff}
          </p>
        </div>
        <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 text-sm font-bold">
          <span className="sr-only">{c.hub.window.option}</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={on}
            disabled={Boolean(block)}
            onChange={(event) => run({ type: 'play-internationals', on: event.target.checked })}
          />
        </label>
      </div>
      <p className="max-w-[35rem] text-sm text-muted">{c.hub.window.optionBody}</p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </Panel>
  );
}
