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
import { careerSelection, relationshipValue } from '../../engine/career/market';
import { nextCareerFixture } from '../../engine/career/fixtures';
import { clubFormation, usesFormations } from '../../engine/selection/world';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { CardTitle, Chip, Disclosure, Panel, chipClass, cx } from '../../ui/kit';
import { ValueMeter } from '../../ui/kit/ValueMeter';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { selectionText as sel } from '../../i18n/selection';
import { CareerPage } from './shared';
import { cultureTraits, signed } from './socialUi';
import { competitionLine, FormationPitch, SelectionReasons } from './selectionUi';
import { PromiseCard, promiseLeads } from './storiesUi';
import { TrendIcon } from './marketUi';
import { StrainNote } from './financeUi';
import { captaincyStanding, renewalWillingness, trustCeiling } from '../../engine/career/facts';

const C = s.club;
/** The small uppercase label over a group inside a card (at most one per card). */
const groupLabel = 'text-xs font-extrabold tracking-[0.1em] text-muted uppercase';
const tone = (value: number) =>
  value > 0 ? 'text-accent' : value < 0 ? 'text-danger' : 'text-muted';

export default function CareerClub() {
  return (
    <CareerPage title={s.titles.club} description={C.description}>
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
  const lead = promiseLeads(world);
  return (
    <div className="grid gap-5">
      {/* The manager's challenge leads the page while it needs an answer or is running. */}
      {lead && <PromiseCard world={world} />}
      {/* The club's finances under strain (review phase 4): what it costs the player. */}
      {club.finances.strain && <StrainNote strain={club.finances.strain} className="" />}
      {/* Two independent columns on wide screens, so a short card never stretches to match its
          neighbour; on phones the columns dissolve and `order` restores the reading order. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-5">
          <MoraleCard career={career} player={player} />
          <DressingRoomCard world={world} player={player} club={club} />
          <Teammates world={world} player={player} club={club} />
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-5">
          <MoraleBreakdown career={career} player={player} />
          <PeopleCard world={world} club={club} />
          <MemoryCard world={world} club={club} />
          <SelectionCard world={world} club={club} />
          {!lead && <PromiseCard world={world} className="order-6 lg:order-none" />}
          <FitCard world={world} player={player} club={club} />
        </div>
      </div>
    </div>
  );
}

/** Small bust portraits for people in the club, in its home kit. */
function Portrait({
  avatar,
  age,
  club,
  className,
}: {
  avatar: Player['avatar'];
  age: number;
  club: Club;
  className: string;
}) {
  const svg = useMemo(
    () => renderAvatar(avatar, Math.max(0, Math.min(110, age)), clubDress(club)),
    [avatar, age, club],
  );
  return <Artwork svg={svg} alt="" className={cx('shrink-0', className)} />;
}

const drift = (morale: number, target: number) =>
  target > morale ? 'up' : target < morale ? 'down' : 'steady';

function MoraleChart({ career }: { career: Career }) {
  const points = career.social.history.slice(-40);
  if (points.length < 2) return <p className="text-sm text-muted">{C.chartSoon}</p>;
  const left = 40;
  const right = 580;
  const base = 180;
  const x = (index: number) => left + (index / (points.length - 1)) * (right - left);
  const y = (value: number) => base - (value / 100) * 165;
  const line = (key: 'morale' | 'form') =>
    points.map((point, index) => `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(' ');
  const last = points.at(-1)!;
  const end = x(points.length - 1);
  // The higher line's label sits above its dot, the lower one's below, so they never collide.
  const moraleHigher = last.morale >= last.form;
  const labelY = (value: number, above: boolean) => y(value) + (above ? -8 : 16);
  const ticks = [
    ...new Set([
      0,
      Math.round((points.length - 1) / 3),
      Math.round(((points.length - 1) * 2) / 3),
      points.length - 1,
    ]),
  ];
  const first = points[0]!;
  const caption =
    first.season === last.season
      ? format(C.chartSeason, { season: last.season })
      : format(C.chartSeasons, { from: first.season, to: last.season });
  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 612 210"
        className="block h-auto w-full font-sans"
        role="img"
        aria-label={`${s.morale.chart}: ${s.morale.morale} ${last.morale}, ${s.morale.form} ${last.form}`}
      >
        {[25, 50, 75].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
              className="stroke-line"
              strokeDasharray="4 6"
            />
            <text x={32} y={y(value) + 4} textAnchor="end" fontSize={11} className="fill-muted">
              {value}
            </text>
          </g>
        ))}
        <line x1={left} x2={right} y1={base} y2={base} className="stroke-line" />
        {ticks.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={198}
            textAnchor="middle"
            fontSize={11}
            className="fill-muted"
          >
            {format(C.chartWeek, { week: points[index]!.week })}
          </text>
        ))}
        <polyline
          points={line('form')}
          fill="none"
          className="stroke-meter-gold"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={line('morale')}
          fill="none"
          className="stroke-accent"
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={end}
          cy={y(last.morale)}
          r={5}
          strokeWidth={2}
          className="fill-accent stroke-surface"
        />
        <circle
          cx={end}
          cy={y(last.form)}
          r={5}
          strokeWidth={2}
          className="fill-meter-gold stroke-surface"
        />
        <text
          x={end + 8}
          y={labelY(last.morale, moraleHigher)}
          fontSize={12}
          fontWeight={800}
          className="fill-accent"
        >
          {last.morale}
        </text>
        <text
          x={end + 8}
          y={labelY(last.form, !moraleHigher)}
          fontSize={12}
          fontWeight={800}
          className="fill-meter-gold"
        >
          {last.form}
        </text>
      </svg>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-4.5 gap-y-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-1 w-5.5 rounded-full bg-accent" />
          {s.morale.morale}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-[3px] w-5.5 rounded-full bg-meter-gold" />
          {s.morale.form}
        </span>
        <span className="font-medium text-muted">
          {s.morale.chart} · {caption}
        </span>
      </figcaption>
      <Disclosure summary={s.morale.chartTable} className="mt-3">
        <div
          className="max-h-52 overflow-y-auto rounded-control border border-line px-3 py-1"
          tabIndex={0}
          role="region"
          aria-label={s.morale.chartTable}
        >
          <table className="w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="text-[0.6875rem] tracking-[0.08em] text-muted uppercase">
                <th scope="col" className="py-1.5 pr-3 font-bold">
                  {s.morale.week}
                </th>
                <th scope="col" className="py-1.5 pr-3 font-bold">
                  {s.morale.morale}
                </th>
                <th scope="col" className="py-1.5 font-bold">
                  {s.morale.form}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={`${point.season}-${point.week}`} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-muted">
                    {format(s.morale.seasonWeek, { season: point.season, week: point.week })}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold">{point.morale}</td>
                  <td className="py-1.5 font-semibold">{point.form}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </figure>
  );
}

function MoraleCard({ career, player }: { career: Career; player: Player }) {
  const effect = (moraleMultiplier(player.morale) - 1) * 100;
  const target = career.social.morale?.target;
  const ratings = career.matches
    .filter((match) => match.minutes > 0)
    .slice(-5)
    .map((match) => match.rating.toFixed(1));
  const formNote = !ratings.length
    ? C.formNone
    : format(ratings.length === 1 ? C.formNoteOne : C.formNote, {
        count: ratings.length,
        ratings: ratings.join(', '),
      });
  return (
    <Panel aria-labelledby="morale-heading" className="order-1 flex flex-col gap-4 lg:order-none">
      <div>
        <CardTitle id="morale-heading" size="lg">
          {s.morale.title}
        </CardTitle>
        <p className="mt-1.5 max-w-prose text-muted">{s.morale.body}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <ValueMeter
          className="flex-[1_1_13rem] rounded-control bg-surface-soft px-4 py-3.5"
          label={s.morale.morale}
          value={player.morale}
          size="lg"
          track="surface"
          note={
            target === undefined
              ? undefined
              : format(C.drift[drift(player.morale, target)], { target })
          }
        />
        <ValueMeter
          className="flex-[1_1_13rem] rounded-control bg-surface-soft px-4 py-3.5"
          label={s.morale.form}
          value={player.form}
          tone="gold"
          size="lg"
          track="surface"
          note={formNote}
        />
      </div>
      <p
        className={cx(
          'flex items-center gap-2.5 rounded-control px-3.5 py-2.5 text-sm font-bold',
          effect < 0 ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent',
        )}
      >
        <TrendIcon down={effect < 0} className="h-4.5 w-4.5 shrink-0" />
        {format(s.morale.matchEffect, {
          effect: `${effect >= 0 ? '+' : '−'}${Math.abs(effect).toFixed(1)}%`,
        })}
      </p>
      <MoraleChart career={career} />
    </Panel>
  );
}

function MoraleBreakdown({ career, player }: { career: Career; player: Player }) {
  const morale = career.social.morale;
  return (
    <Panel
      aria-labelledby="breakdown-heading"
      className="order-2 flex flex-col gap-3.5 lg:order-none"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <CardTitle id="breakdown-heading">
          {morale ? format(s.morale.target, { target: morale.target }) : s.morale.morale}
        </CardTitle>
        {morale && (
          <span className="text-xs font-semibold text-muted">
            {format(C.moraleTrend, {
              value: player.morale,
              trend: C.trend[drift(player.morale, morale.target)],
            })}
          </span>
        )}
      </div>
      {morale ? (
        <>
          <div
            aria-hidden="true"
            className="flex justify-between text-[0.6875rem] font-extrabold tracking-[0.08em] text-muted uppercase"
          >
            <span>− {C.lowers}</span>
            <span>{C.raises} +</span>
          </div>
          <ul className="grid gap-2.5">
            {MORALE_PARTS.filter((part) => morale.parts[part] !== undefined).map((part) => {
              const value = morale.parts[part]!;
              const width = Math.min(50, Math.abs(value) * 4);
              return (
                <li
                  key={part}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                >
                  <span className="text-[0.8125rem]">{s.morale.parts[part]}</span>
                  <span className={cx('text-[0.8125rem] font-extrabold tabular-nums', tone(value))}>
                    {signed(value)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative col-span-2 h-2 rounded-full bg-track"
                  >
                    <span className="absolute -top-0.5 left-1/2 h-3 w-0.5 -translate-x-1/2 bg-muted" />
                    <span
                      className={cx(
                        'absolute top-0 h-2 rounded-full',
                        value >= 0 ? 'left-1/2 bg-accent' : 'right-1/2 bg-danger',
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">{s.morale.noTarget}</p>
      )}
    </Panel>
  );
}

function DressingRoomCard({ world, player, club }: { world: World; player: Player; club: Club }) {
  const room = careerRoom(world);
  const leader = room.leaderIds.includes(player.id);
  const leaders = room.leaderIds
    .map((id) => world.players[id])
    .filter((entry): entry is Player => Boolean(entry));
  return (
    <Panel aria-labelledby="room-heading" className="order-3 flex flex-col gap-4 lg:order-none">
      <CardTitle id="room-heading" size="lg">
        {s.room.title}
      </CardTitle>
      <div className="flex flex-wrap gap-5">
        <ValueMeter className="flex-[1_1_13rem]" label={s.room.mood} value={room.mood} />
        <ValueMeter
          className="flex-[1_1_13rem]"
          label={s.room.standing}
          value={dressingStanding(world)}
          tone="gold"
        />
      </div>
      <div className="flex flex-col gap-1.5 rounded-control bg-surface-soft px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h3 className={groupLabel}>{s.room.leaders}</h3>
          {leaders.length ? (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {leaders.map((entry) => (
                <li
                  key={entry.id}
                  className="inline-flex items-center gap-2 text-[0.8125rem] font-bold"
                >
                  <Portrait
                    avatar={entry.avatar}
                    age={world.date.season - entry.birthSeason}
                    club={club}
                    className="h-9 w-9"
                  />
                  {entry.id === player.id ? s.room.you : entry.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.8125rem] text-muted">{C.noLeaders}</p>
          )}
        </div>
        {leader && <p className="text-[0.8125rem] font-bold text-accent">{s.room.leaderYou}</p>}
      </div>
      <h3 className="mt-1 text-[0.8125rem] font-bold">{s.room.cliques}</h3>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
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
              className={cx(
                'flex flex-col gap-2 rounded-control p-3.5',
                mine
                  ? 'border-2 border-accent bg-accent-soft'
                  : 'border border-line bg-surface-soft',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[0.9375rem]">{s.room.cliqueNames[clique.kind]}</strong>
                {mine && <Chip tone="solid">{s.room.yourGroup}</Chip>}
              </div>
              <p className="text-xs text-muted">
                {format(s.room.members, { count: clique.playerIds.length })}
                {leaderName ? ` · ${format(s.room.leader, { name: leaderName })}` : ''}
              </p>
              <p className="text-[0.8125rem]">{s.room.cliqueBodies[clique.kind]}</p>
              <ValueMeter
                size="sm"
                track="surface"
                label={s.room.affinity}
                ariaLabel={format(s.room.affinityFull, { group: s.room.cliqueNames[clique.kind] })}
                value={clique.affinity}
              />
              <p className="text-xs text-muted">
                {s.room.influence}: <strong className="text-ink">{clique.influence}</strong>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="max-w-prose text-[0.8125rem] text-muted">{s.room.behaviour}</p>
    </Panel>
  );
}

function PeopleCard({ world, club }: { world: World; club: Club }) {
  const manager = world.managers[club.managerId];
  const league = world.leagues[club.leagueId];
  return (
    <Panel aria-labelledby="people-heading" className="order-4 flex flex-col gap-3.5 lg:order-none">
      <CardTitle id="people-heading">{s.people.title}</CardTitle>
      {manager && (
        <div className="flex items-center gap-3">
          <Portrait avatar={manager.avatar} age={manager.age} club={club} className="h-11 w-11" />
          <p className="min-w-0 text-sm break-words">
            <strong>{manager.name}</strong>{' '}
            <span className="text-muted">
              {format(C.prefers, { formation: manager.preferredFormation })}
            </span>
          </p>
        </div>
      )}
      <ValueMeter
        label={s.people.trust}
        value={relationshipValue(world, 'manager', club.managerId)}
      />
      <ValueMeter
        label={s.people.fans}
        value={relationshipValue(world, 'fans', club.id)}
        tone="gold"
      />
      {league && (
        <Link
          className="text-button -ml-3 inline-flex items-center gap-1.5 self-start"
          to={`/world?country=${encodeURIComponent(club.countryId)}&tier=${league.tier}&group=${encodeURIComponent(league.id)}&club=${encodeURIComponent(club.id)}`}
        >
          {s.people.world}
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      )}
    </Panel>
  );
}

/** The manager's shape, the player's place in it and the chance of starting the next match. */
function SelectionCard({ world, club }: { world: World; club: Club }) {
  const fixture = nextCareerFixture(world);
  const injured = Boolean(world.career?.injury);
  const selection = fixture && !injured ? careerSelection(world, fixture) : null;
  const formations = usesFormations(world);
  const opponent = fixture
    ? world.clubs[fixture.homeId === club.id ? fixture.awayId : fixture.homeId]
    : undefined;
  return (
    <Panel
      aria-labelledby="selection-heading"
      className="order-5 flex flex-col gap-3.5 lg:order-none"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <CardTitle id="selection-heading">{sel.title}</CardTitle>
        {fixture && opponent && (
          <span className="text-xs font-semibold text-muted">
            {format(sel.club.next, {
              club: opponent.name,
              venue: fixture.homeId === club.id ? sel.club.home : sel.club.away,
            })}
          </span>
        )}
      </div>
      {selection && formations ? (
        <>
          <div className="flex flex-wrap items-center gap-3.5">
            <FormationPitch world={world} club={club} selection={selection} />
            <div className="flex min-w-0 flex-[1_1_10rem] flex-col gap-1.5">
              <p className="text-[0.8125rem] text-muted">
                {format(sel.formationClub, { formation: clubFormation(world, club) })}
              </p>
              <p className="font-bold">{competitionLine(world, selection)}</p>
            </div>
          </div>
          <SelectionReasons world={world} selection={selection} showLine={false} />
        </>
      ) : (
        <>
          <p className="text-[0.8125rem] text-muted">
            {formations
              ? format(sel.formationClub, { formation: clubFormation(world, club) })
              : sel.lineBased}
          </p>
          {selection ? (
            <SelectionReasons world={world} selection={selection} />
          ) : injured ? (
            <Chip tone="danger" icon="warning" className="self-start">
              {c.hub.injury}
            </Chip>
          ) : (
            <p className="text-[0.8125rem] text-muted">{sel.noFixture}</p>
          )}
        </>
      )}
    </Panel>
  );
}

function Teammates({ world, player, club }: { world: World; player: Player; club: Club }) {
  const teammates = keyTeammates(world);
  return (
    <Panel
      aria-labelledby="teammates-heading"
      className="order-7 flex flex-col gap-4 lg:order-none"
    >
      <div>
        <CardTitle id="teammates-heading" size="lg">
          {s.teammates.title}
        </CardTitle>
        <p className="mt-1.5 max-w-prose text-muted">{s.teammates.body}</p>
      </div>
      {teammates.length ? (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-3">
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
                <Portrait
                  avatar={teammate.avatar}
                  age={world.date.season - teammate.birthSeason}
                  club={club}
                  className="h-13 w-13"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="text-sm font-bold break-words">
                    {teammate.name}{' '}
                    <span className="font-medium text-muted">
                      · {c.positions[teammate.primaryPosition]}
                    </span>
                  </p>
                  <ValueMeter
                    size="sm"
                    track="surface"
                    label={s.teammates.chemistryShort}
                    ariaLabel={format(s.teammates.chemistry, { name: teammate.name })}
                    value={entry?.value ?? 50}
                  />
                  {reasons.length > 0 && (
                    <ul
                      aria-label={format(`${s.teammates.why}: {name}`, { name: teammate.name })}
                      className="flex flex-wrap gap-1.5"
                    >
                      {reasons.map(([part, delta]) => (
                        <li
                          key={part}
                          className={cx(
                            chipClass(delta > 0 ? 'accent' : 'danger'),
                            'min-h-6.5 px-2.5',
                          )}
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
        <p className="text-sm text-muted">{s.teammates.empty}</p>
      )}
    </Panel>
  );
}

function FitCard({ world, player, club }: { world: World; player: Player; club: Club }) {
  const fit = cultureFit(world, player, club);
  const low = fit.value < 45;
  return (
    <Panel aria-labelledby="fit-heading" className="order-8 flex flex-col gap-3.5 lg:order-none">
      <div>
        <CardTitle id="fit-heading">{s.fit.title}</CardTitle>
        <p className="mt-1.5 text-muted">{s.fit.body}</p>
      </div>
      <ValueMeter
        label={s.fit.value}
        value={fit.value}
        tone={low ? 'danger' : 'accent'}
        numberTone={low ? 'danger' : 'accent'}
      />
      <div>
        <h3 className={cx(groupLabel, 'mb-2')}>{s.fit.traits}</h3>
        <ul className="flex flex-wrap gap-1.5">
          {cultureTraits(club).map((trait) => (
            <li key={trait} className={chipClass('accent')}>
              {trait}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="sr-only">{s.fit.partsTitle}</h3>
        <ul className="flex flex-col">
          {(Object.entries(fit.parts) as [FitPart, number][]).map(([part, value]) => (
            <li
              key={part}
              className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[0.8125rem] last:border-b-0"
            >
              <span>{s.fit.parts[part]}</span>
              <span className={cx('font-extrabold tabular-nums', tone(value))}>
                {signed(value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-[0.8125rem] font-bold">{s.fit.personality}</h3>
        <dl className="grid grid-cols-2 gap-2">
          {(Object.keys(s.fit.personalityNames) as (keyof Player['personality'])[]).map((key) => (
            <div key={key} className="rounded-control bg-surface-soft px-3 py-2">
              <dt className="text-xs text-muted">{s.fit.personalityNames[key]}</dt>
              <dd className="font-display text-[1.75rem] leading-[1.05]">
                {player.personality[key]}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

/**
 * What the club and its manager remember of the player (review phase 5): the facts about them,
 * and what they change now. Absent when nothing is remembered here.
 */
function MemoryCard({ world, club }: { world: World; club: Club }) {
  const facts = (world.career!.facts ?? []).filter(
    (fact) => fact.clubId === club.id || fact.managerId === club.managerId,
  );
  if (!facts.length) return null;
  const T = s.memory;
  const manager = world.managers[club.managerId]?.name ?? '';
  const ceiling = trustCeiling(world, club.managerId);
  const renewal = renewalWillingness(world, club.id);
  const captaincy = captaincyStanding(world, club.id, club.managerId);
  return (
    <Panel aria-labelledby="memory-heading" className="order-5 flex flex-col gap-3 lg:order-none">
      <div>
        <CardTitle id="memory-heading">{T.title}</CardTitle>
        <p className="mt-1.5 text-muted">{T.body}</p>
      </div>
      <ul className="flex flex-col">
        {facts
          .slice()
          .reverse()
          .map((fact, index) => (
            <li
              key={`${fact.kind}:${fact.season}:${fact.week}:${index}`}
              className="border-b border-line py-1.5 text-[0.8125rem] last:border-b-0"
            >
              {format(T.facts[fact.kind], {
                manager: world.managers[fact.managerId ?? '']?.name ?? T.formerManager,
                club: world.clubs[fact.clubId ?? '']?.name ?? '',
                player:
                  world.players[fact.playerId ?? '']?.name ??
                  world.archive?.players[fact.playerId ?? '']?.name ??
                  '',
                season: fact.season,
              })}
            </li>
          ))}
      </ul>
      <ul className="flex flex-col gap-1 text-[0.8125rem] font-semibold">
        {ceiling < 100 && <li>{format(T.ceiling, { manager, value: ceiling })}</li>}
        {renewal !== 1 && <li>{format(T.renewal, { value: renewal })}</li>}
        {captaincy !== 0 && (
          <li>
            {format(T.captaincy, {
              value: captaincy > 0 ? `+${captaincy}` : `−${Math.abs(captaincy)}`,
            })}
          </li>
        )}
      </ul>
    </Panel>
  );
}
