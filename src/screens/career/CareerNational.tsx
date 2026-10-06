import type { Career, NationalLevel, Player, World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import { windowWeeks } from '../../engine/career/honours';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { CareerPage, plural, ui } from './shared';

const I = CONFIG.career.honours.international;
const LEVELS: NationalLevel[] = ['senior', 'U21', 'U19'];

export default function CareerNational() {
  return (
    <CareerPage eyebrow={h.eyebrow} title={h.titles.national}>
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
  const nations = new Map((world.international?.nations ?? []).map((n) => [n.id, n]));
  const matches = (world.international?.matches ?? [])
    .filter(
      (m) => nation && (m.homeId === nation.id || m.awayId === nation.id) && m.career !== undefined,
    )
    .slice(-12)
    .reverse();
  const tournaments = [...(world.international?.tournaments ?? [])].reverse();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <section aria-labelledby="national-heading" className={`${ui.panel} lg:col-span-5`}>
        <p className={ui.eyebrow}>{nation?.name}</p>
        <h2 id="national-heading" className={ui.heading}>
          {h.national.status}
        </h2>
        <p className={`${ui.muted} mt-1`}>{h.national.body}</p>
        <p className="mt-3 text-sm">
          <strong>{h.national.eligible}:</strong> {eligible.map((l) => h.levels[l]).join(' · ')}
        </p>
        <p className="mt-1 text-sm">
          {honours.lastCallUp
            ? format(h.national.lastCallUp, {
                level: h.levels[honours.lastCallUp.level],
                week: honours.lastCallUp.date.week,
                season: honours.lastCallUp.date.season,
              })
            : h.national.never}
        </p>
        <p className="mt-1 text-xs text-muted">
          {format(h.national.windows, { weeks: windowWeeks(world).join(', ') })}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {LEVELS.map((l) => (
            <div key={l} className="min-w-0 rounded-control bg-surface-soft p-3">
              <dt className="text-xs font-semibold text-muted">{h.levels[l]}</dt>
              <dd className="mt-0.5">
                <span className="block font-display text-3xl leading-none">{honours.caps[l]}</span>
                <span className="block text-xs text-muted">
                  {plural(honours.caps[l], h.national.cap, h.national.capsWord)} ·{' '}
                  {plural(honours.internationalGoals[l], h.national.goal, h.national.goalsCount)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="squad-heading" className={`${ui.panel} lg:col-span-7`}>
        <h2 id="squad-heading" className={ui.heading}>
          {format(h.national.squad, { level: h.levels[level] })}
        </h2>
        {squad?.playerIds.length ? (
          <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
            {squad.playerIds.map((id) => {
              const member = world.players[id];
              if (!member) return null;
              const mine = id === player.id;
              return (
                <li
                  key={id}
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
            })}
          </ul>
        ) : (
          <p className={`${ui.muted} mt-4`}>{h.national.squadEmpty}</p>
        )}
      </section>
      <section aria-labelledby="internationals-heading" className={`${ui.panel} lg:col-span-7`}>
        <h2 id="internationals-heading" className={ui.heading}>
          {h.national.matches}
        </h2>
        {matches.length ? (
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
                  · {h.levels[match.level]} · {h.national.kinds[match.kind]}
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
        ) : (
          <p className={`${ui.muted} mt-4`}>{h.national.noMatches}</p>
        )}
      </section>
      <section aria-labelledby="tournaments-heading" className={`${ui.panel} lg:col-span-5`}>
        <h2 id="tournaments-heading" className={ui.heading}>
          {h.national.tournaments}
        </h2>
        {tournaments.length ? (
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
        ) : (
          <p className={`${ui.muted} mt-4`}>{h.national.noTournaments}</p>
        )}
      </section>
    </div>
  );
}
