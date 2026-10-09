import { useState } from 'react';
import type { Career, NationalLevel, Player, World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import { windowWeeks } from '../../engine/career/honours';
import { lineOf } from '../../engine/career/market/rules';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { CareerPage, EmptySection, plural, ui } from './shared';
import { Glyph } from './honoursUi';

const I = CONFIG.career.honours.international;
const LEVELS: NationalLevel[] = ['senior', 'U21', 'U19'];
const LINES = ['GK', 'DEF', 'MID', 'ATT'] as const;

export default function CareerNational() {
  return (
    <CareerPage title={h.titles.national}>
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
  const level = honours.lastCallUp?.level ?? eligible[eligible.length - 1] ?? 'senior';
  const squad = world.nationalTeams[`national:${player.nationalityId}:${level}`];
  const selected = Boolean(squad?.playerIds.includes(player.id));
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
  return (
    // Two stable column stacks: selection, caps and tournaments beside squad and results.
    // Phones read the call-up, the tournaments, then the squad and its matches.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
      <div className="grid min-w-0 content-start gap-5 lg:col-span-5">
        <section
          aria-labelledby="national-heading"
          className={`${ui.panel} ${selected ? 'bg-art-green' : ''}`}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${
                selected ? 'bg-gold text-on-gold' : 'bg-surface-soft text-accent'
              }`}
            >
              <Glyph name="flag" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 id="national-heading" className={ui.heading}>
                {selected
                  ? format(h.national.statusIn, { level: short })
                  : honours.lastCallUp
                    ? format(h.national.statusOut, { level: short })
                    : h.national.statusNone}
              </h2>
              <p className={`${ui.muted} mt-1`}>
                {format(h.national.nationLine, {
                  nation: nation?.name ?? '',
                  levels: eligible.map((l) => h.levelShort[l]).join(', '),
                })}
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-control bg-surface-soft px-3 py-2 text-sm font-semibold">
            {next ? format(h.national.nextWindow, { week: next }) : h.national.noWindow}
          </p>
          <p className="mt-3 text-sm">
            {honours.lastCallUp
              ? format(h.national.lastCallUp, {
                  level: h.levelShort[honours.lastCallUp.level],
                  week: honours.lastCallUp.date.week,
                  season: honours.lastCallUp.date.season,
                })
              : h.national.never}
          </p>
          <p className={`${ui.muted} mt-1 max-w-prose`}>{h.national.body}</p>
          <p className="mt-1 text-xs text-muted">
            {format(h.national.windows, { weeks: windows.join(', ') })}
          </p>
          <h3 className="mt-5 text-sm font-semibold">{h.national.capsTitle}</h3>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            {LEVELS.map((l) => (
              <div key={l} className="min-w-0 rounded-control bg-surface-soft p-3">
                <dt className="text-sm font-semibold">{h.levelShort[l]}</dt>
                <dd className="mt-1">
                  <span className="block font-display text-3xl leading-none">
                    {honours.caps[l]}
                  </span>
                  <span className="block text-xs text-muted">
                    {honours.caps[l] === 1 ? h.national.cap : h.national.capsWord}
                  </span>
                  <span className="mt-1 block whitespace-nowrap text-xs font-semibold">
                    {plural(honours.internationalGoals[l], h.national.goal, h.national.goalsCount)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        {tournaments.length ? (
          <section aria-labelledby="tournaments-heading" className={ui.panel}>
            <h2 id="tournaments-heading" className={ui.heading}>
              {h.national.tournaments}
            </h2>
            <ul className="mt-4 grid gap-3">
              {tournaments.map((tournament) => (
                <li key={tournament.id} className="rounded-control bg-surface-soft p-3 text-sm">
                  <p className="font-semibold">
                    {format(h.national.tournamentLine, {
                      name: tournament.name,
                      year: tournament.year,
                      winner: nations.get(tournament.winnerId)?.name ?? '',
                    })}
                  </p>
                  {tournament.career && (
                    <p className="text-xs text-muted">
                      {nations.get(tournament.career.nationId)?.name}:{' '}
                      {h.national.stages[tournament.career.stage]} ·{' '}
                      {tournament.career.inSquad ? h.national.inSquad : h.national.notInSquad}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptySection id="tournaments-heading" title={h.national.tournaments}>
            {h.national.noTournaments}
          </EmptySection>
        )}
      </div>
      {/* Squad and results on the wider side; the stacks never share row heights. */}
      <div className="grid min-w-0 content-start gap-5 lg:col-span-7">
        <Squad world={world} player={player} squadIds={squad?.playerIds ?? []} level={short} />
        {matches.length ? (
          <section aria-labelledby="internationals-heading" className={ui.panel}>
            <h2 id="internationals-heading" className={ui.heading}>
              {h.national.matches}
            </h2>
            <ul className="mt-4 divide-y divide-line">
              {matches.map((match) => (
                <li
                  key={match.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm"
                >
                  <span className="text-xs text-muted">
                    {format(c.common.seasonWeek, {
                      season: match.date.season,
                      week: match.date.week,
                    })}{' '}
                    · {h.levelShort[match.level]} · {h.national.kinds[match.kind]}
                  </span>
                  <span className="font-semibold">
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
                    <span className="w-full text-xs font-semibold text-accent">
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
          </section>
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
    return (
      <li
        key={member.id}
        className={`flex min-w-0 flex-col rounded-control px-3 py-2 ${mine ? 'bg-accent-soft' : 'bg-surface-soft'}`}
      >
        <span className={`truncate text-sm ${mine ? 'font-bold' : 'font-semibold'}`}>
          {member.name}
          {mine ? ` · ${h.national.you}` : ''}
        </span>
        <span className="truncate text-xs text-muted">
          {c.positions[member.primaryPosition]} ·{' '}
          {member.clubId ? world.clubs[member.clubId]?.name : ''}
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
    <section aria-labelledby="squad-heading" className={ui.panel}>
      <h2 id="squad-heading" className={ui.heading}>
        {format(h.national.squad, { level })}
      </h2>
      {members.length ? (
        <>
          <h3 className="mt-4 text-sm font-semibold">
            {format(h.national.lineTitle, {
              line: h.national.lines[line],
              count: rivals.length,
            })}
          </h3>
          <p className={`${ui.muted} mt-0.5`}>
            {selected ? h.national.lineBodyIn : h.national.lineBodyOut}
          </p>
          <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
            {rivals.map(row)}
          </ul>
          <button
            type="button"
            className="text-button mt-4 min-h-11"
            aria-expanded={full}
            onClick={() => setFull((open) => !open)}
          >
            {full ? h.national.hideSquad : format(h.national.fullSquad, { count: members.length })}
          </button>
          {full && (
            <div id="national-full-squad" className="mt-2 grid gap-4">
              {LINES.filter((other) => other !== line).map((other) => {
                const group = members.filter((member) => lineOf(member.primaryPosition) === other);
                if (!group.length) return null;
                return (
                  <div key={other}>
                    <h3 className="text-sm font-semibold">
                      {format(h.national.lineTitle, {
                        line: h.national.lines[other],
                        count: group.length,
                      })}
                    </h3>
                    <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
                      {group.map(row)}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
