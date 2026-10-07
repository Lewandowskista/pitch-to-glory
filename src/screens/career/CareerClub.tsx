import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Career, Club, Player, World } from '../../model/domain';
import { moraleMultiplier } from '../../engine/match/decisions';
import {
  careerRoom,
  compatibility,
  cultureFit,
  dressingStanding,
  keyTeammates,
  MORALE_PARTS,
  type FitPart,
} from '../../engine/career/social';
import { relationshipValue } from '../../engine/career/market';
import { renderAvatar } from '../../engine/assets/avatar';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { CareerPage, Meter, ui } from './shared';
import { cultureTraits, signed } from './socialUi';

export default function CareerClub() {
  return (
    <CareerPage title={s.titles.club}>
      {({ world, career, player, club }) =>
        club ? <ClubContent world={world} career={career} player={player} club={club} /> : null
      }
    </CareerPage>
  );
}

function ClubContent({
  world,
  career,
  player,
  club,
}: {
  world: World;
  career: Career;
  player: Player;
  club: Club;
}) {
  return (
    // Two independent columns on wide screens, so a short panel never stretches to match its
    // neighbour; on phones the columns dissolve and `order` restores the reading order.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
      <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-5">
        <MoraleCard career={career} player={player} />
        <DressingRoomCard world={world} player={player} />
        <Teammates world={world} player={player} club={club} />
      </div>
      <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-5">
        <MoraleBreakdown career={career} />
        <PeopleCard world={world} club={club} />
        <FitCard world={world} player={player} club={club} />
      </div>
    </div>
  );
}

function MoraleChart({ career }: { career: Career }) {
  const points = career.social.history.slice(-40);
  if (points.length < 2) return null;
  const width = 600;
  const height = 180;
  const x = (index: number) => (index / (points.length - 1)) * (width - 20) + 10;
  const y = (value: number) => height - 10 - (value / 100) * (height - 20);
  const line = (key: 'morale' | 'form') =>
    points.map((point, index) => `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(' ');
  const last = points.at(-1)!;
  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${s.morale.chart}: ${s.morale.morale} ${last.morale}, ${s.morale.form} ${last.form}`}
      >
        {[25, 50, 75].map((value) => (
          <line
            key={value}
            x1={10}
            x2={width - 10}
            y1={y(value)}
            y2={y(value)}
            className="stroke-line"
            strokeDasharray="4 6"
          />
        ))}
        <polyline points={line('form')} fill="none" className="stroke-gold" strokeWidth={3} />
        <polyline points={line('morale')} fill="none" className="stroke-accent" strokeWidth={4} />
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-1 w-5 rounded-full bg-accent" />
          {s.morale.morale}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-1 w-5 rounded-full bg-gold" />
          {s.morale.form}
        </span>
      </figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-accent">
          {s.morale.chartTable}
        </summary>
        <div
          className="mt-2 max-h-56 overflow-y-auto"
          tabIndex={0}
          role="region"
          aria-label={s.morale.chartTable}
        >
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="py-1 pr-3">
                  {s.morale.week}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {s.morale.morale}
                </th>
                <th scope="col" className="py-1">
                  {s.morale.form}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={`${point.season}-${point.week}`}>
                  <td className="py-1 pr-3 text-muted">
                    {format(s.morale.seasonWeek, { season: point.season, week: point.week })}
                  </td>
                  <td className="py-1 pr-3">{point.morale}</td>
                  <td className="py-1">{point.form}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function MoraleCard({ career, player }: { career: Career; player: Player }) {
  const effect = (moraleMultiplier(player.morale) - 1) * 100;
  return (
    <section aria-labelledby="morale-heading" className={`${ui.panel} order-1 lg:order-none`}>
      <h2 id="morale-heading" className={ui.heading}>
        {s.morale.title}
      </h2>
      <p className={`${ui.muted} mt-1 max-w-prose`}>{s.morale.body}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Meter label={s.morale.morale} value={player.morale} />
        <Meter label={s.morale.form} value={player.form} tone="gold" />
      </div>
      <p className="mt-3 text-sm font-semibold">
        {format(s.morale.matchEffect, {
          effect: `${effect >= 0 ? '+' : '−'}${Math.abs(effect).toFixed(1)}%`,
        })}
      </p>
      <MoraleChart career={career} />
    </section>
  );
}

function MoraleBreakdown({ career }: { career: Career }) {
  const morale = career.social.morale;
  return (
    <section aria-labelledby="breakdown-heading" className={`${ui.panel} order-2 lg:order-none`}>
      <h2 id="breakdown-heading" className={ui.heading}>
        {morale ? format(s.morale.target, { target: morale.target }) : s.morale.morale}
      </h2>
      {morale ? (
        <ul className="mt-4 grid gap-2.5">
          {MORALE_PARTS.map((part) => {
            const value = morale.parts[part];
            const width = Math.min(50, Math.abs(value) * 4);
            return (
              <li
                key={part}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
              >
                <span className="text-sm">{s.morale.parts[part]}</span>
                <span
                  className={`text-sm font-bold tabular-nums ${value > 0 ? 'text-accent' : value < 0 ? 'text-danger' : 'text-muted'}`}
                >
                  {signed(value)}
                </span>
                <span
                  aria-hidden="true"
                  className="relative col-span-2 h-2 rounded-full bg-surface-soft"
                >
                  <span className="absolute top-0 left-1/2 h-2 w-px bg-line" />
                  <span
                    className={`absolute top-0 h-2 rounded-full ${value >= 0 ? 'left-1/2 bg-accent' : 'right-1/2 bg-danger'}`}
                    style={{ width: `${width}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4`}>{s.morale.noTarget}</p>
      )}
    </section>
  );
}

function DressingRoomCard({ world, player }: { world: World; player: Player }) {
  const room = careerRoom(world);
  const leader = room.leaderIds.includes(player.id);
  return (
    <section aria-labelledby="room-heading" className={`${ui.panel} order-3 lg:order-none`}>
      <h2 id="room-heading" className={ui.heading}>
        {s.room.title}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Meter label={s.room.mood} value={room.mood} />
        <Meter label={s.room.standing} value={dressingStanding(world)} tone="gold" />
      </div>
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {s.room.leaders}
      </h3>
      <p className="mt-1 text-sm">
        {room.leaderIds
          .map((id) => (id === player.id ? s.room.you : world.players[id]?.name))
          .filter(Boolean)
          .join(' · ')}
      </p>
      {leader && <p className="mt-1 text-sm font-semibold text-accent">{s.room.leaderYou}</p>}
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {s.room.cliques}
      </h3>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {room.cliques.map((clique) => {
          const mine = clique.playerIds.includes(player.id);
          const leaderName = clique.leaderId
            ? clique.leaderId === player.id
              ? s.room.you
              : world.players[clique.leaderId]?.name
            : null;
          return (
            <li
              key={clique.id}
              className={`flex flex-col gap-2 rounded-control border p-3 ${mine ? 'border-accent bg-accent-soft' : 'border-line bg-surface-soft'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{s.room.cliqueNames[clique.kind]}</strong>
                {mine && <span className={ui.chip}>{s.room.yourGroup}</span>}
              </div>
              <p className="text-xs text-muted">
                {format(s.room.members, { count: clique.playerIds.length })}
                {leaderName ? ` · ${format(s.room.leader, { name: leaderName })}` : ''}
              </p>
              <p className="text-xs">{s.room.cliqueBodies[clique.kind]}</p>
              <Meter
                label={s.room.affinity}
                ariaLabel={format(s.room.affinityFull, { group: s.room.cliqueNames[clique.kind] })}
                value={clique.affinity}
              />
              <p className="text-xs text-muted">
                {s.room.influence}: {clique.influence}
              </p>
            </li>
          );
        })}
      </ul>
      <p className={`${ui.muted} mt-4 max-w-prose`}>{s.room.behaviour}</p>
    </section>
  );
}

function PeopleCard({ world, club }: { world: World; club: Club }) {
  const manager = world.managers[club.managerId];
  const league = world.leagues[club.leagueId];
  return (
    <section aria-labelledby="people-heading" className={`${ui.panel} order-4 lg:order-none`}>
      <h2 id="people-heading" className={ui.heading}>
        {s.people.title}
      </h2>
      {manager && (
        <p className="mt-2 text-sm text-muted">
          {format(s.people.manager, { name: manager.name, formation: manager.preferredFormation })}
        </p>
      )}
      <div className="mt-4 grid gap-4">
        <Meter label={s.people.trust} value={relationshipValue(world, 'manager', club.managerId)} />
        <Meter
          label={s.people.fans}
          value={relationshipValue(world, 'fans', club.id)}
          tone="gold"
        />
      </div>
      {league && (
        <Link
          className="text-button -ml-3 mt-3 inline-flex items-center gap-1"
          to={`/world?country=${encodeURIComponent(club.countryId)}&tier=${league.tier}&group=${encodeURIComponent(league.id)}&club=${encodeURIComponent(club.id)}`}
        >
          {s.people.world}
        </Link>
      )}
    </section>
  );
}

function TeammatePortrait({ player, age }: { player: Player; age: number }) {
  const svg = useMemo(() => renderAvatar(player.avatar, age), [player.avatar, age]);
  return <Artwork svg={svg} alt="" className="h-12 w-12 shrink-0 rounded-full bg-art-blue" />;
}

function Teammates({ world, player, club }: { world: World; player: Player; club: Club }) {
  const teammates = keyTeammates(world);
  return (
    <section aria-labelledby="teammates-heading" className={`${ui.panel} order-5 lg:order-none`}>
      <h2 id="teammates-heading" className={ui.heading}>
        {s.teammates.title}
      </h2>
      <p className={`${ui.muted} mt-1 max-w-prose`}>{s.teammates.body}</p>
      {teammates.length ? (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
          {teammates.map((teammate) => {
            const entry = world.relationships.find(
              (r) => r.kind === 'teammate' && r.targetId === teammate.id,
            );
            const parts = compatibility(world, player, teammate, club).parts;
            const reasons = (Object.entries(parts) as [keyof typeof parts, number][]).filter(
              ([, delta]) => Math.abs(delta) >= 1,
            );
            return (
              <li
                key={teammate.id}
                className="flex items-start gap-3 rounded-control bg-surface-soft p-3"
              >
                <TeammatePortrait
                  player={teammate}
                  age={world.date.season - teammate.birthSeason}
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">
                    {teammate.name}{' '}
                    <span className="font-normal text-muted">
                      · {c.positions[teammate.primaryPosition]}
                    </span>
                  </p>
                  <div className="mt-2">
                    <Meter
                      label={s.teammates.chemistryShort}
                      ariaLabel={format(s.teammates.chemistry, { name: teammate.name })}
                      value={entry?.value ?? 50}
                    />
                  </div>
                  {reasons.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {reasons.map(([part, delta]) => (
                        <li
                          key={part}
                          className={`inline-flex min-h-6 items-center rounded-full px-2 text-xs font-bold ${delta > 0 ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'}`}
                        >
                          {s.teammates.reasons[part]} {signed(delta)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4`}>{s.teammates.empty}</p>
      )}
    </section>
  );
}

function FitCard({ world, player, club }: { world: World; player: Player; club: Club }) {
  const fit = cultureFit(world, player, club);
  return (
    <section aria-labelledby="fit-heading" className={`${ui.panel} order-6 lg:order-none`}>
      <h2 id="fit-heading" className={ui.heading}>
        {s.fit.title}
      </h2>
      <p className={`${ui.muted} mt-1`}>{s.fit.body}</p>
      <div className="mt-4">
        <Meter label={s.fit.value} value={fit.value} tone={fit.value < 45 ? 'danger' : 'accent'} />
      </div>
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">{s.fit.traits}</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {cultureTraits(club).map((trait) => (
          <li key={trait} className={ui.chip}>
            {trait}
          </li>
        ))}
      </ul>
      <ul className="mt-4 grid gap-2">
        {(Object.entries(fit.parts) as [FitPart, number][]).map(([part, value]) => (
          <li key={part} className="flex items-baseline justify-between gap-3 text-sm">
            <span>{s.fit.parts[part]}</span>
            <span
              className={`font-bold tabular-nums ${value > 0 ? 'text-accent' : value < 0 ? 'text-danger' : 'text-muted'}`}
            >
              {signed(value)}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {s.fit.personality}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        {(Object.keys(s.fit.personalityNames) as (keyof Player['personality'])[]).map((key) => (
          <div key={key} className="rounded-control bg-surface-soft p-2">
            <dt className="text-xs text-muted">{s.fit.personalityNames[key]}</dt>
            <dd className="font-display text-xl leading-tight">{player.personality[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
