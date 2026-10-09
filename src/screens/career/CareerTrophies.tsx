import { useState, type ReactNode } from 'react';
import { m } from 'framer-motion';
import type { Award, Crest, Player, World } from '../../model/domain';
import { CONTINENTAL_IDS, groupTable } from '../../engine/world/continental';
import { rivalOf } from '../../engine/career/social';
import { trophyName } from '../../engine/career/honours/trophies';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { CareerPage, CrestImage, EmptySection, ui } from './shared';
import { useUrlDialog } from './useUrlDialog';
import { Glyph, type GlyphName } from './honoursUi';
import { audio } from '../../audio';

export default function CareerTrophies() {
  return (
    <CareerPage title={h.titles.trophies}>
      {({ world, player }) => <TrophiesContent world={world} player={player} />}
    </CareerPage>
  );
}

const playerName = (world: World, id: string | undefined) =>
  id ? (world.players[id]?.name ?? world.archive?.players[id]?.name ?? '') : '';

function TrophiesContent({ world, player }: { world: World; player: Player }) {
  const ceremony = useUrlDialog('ceremony');
  const balls = world.awards.filter((award) => award.kind === 'golden-ball');
  const shown = ceremony.value
    ? balls.find((award) => String(award.season) === ceremony.value)
    : undefined;
  if (shown)
    return <Ceremony world={world} award={shown} player={player} onClose={ceremony.close} />;
  const latest = balls.at(-1);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
      <GoldenBall world={world} player={player} award={latest} onOpen={ceremony.open} />
      {/* Two independent columns: the player's honours and the world's, the season's awards. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:col-span-7">
        <Cabinet world={world} player={player} />
        <WorldRecords world={world} player={player} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:col-span-5">
        <SeasonAwards world={world} player={player} />
      </div>
      <Continental world={world} player={player} />
    </div>
  );
}

/** The latest Golden Ball: who won, where the player finished, and the ceremony replay. */
function GoldenBall({
  world,
  player,
  award,
  onOpen,
}: {
  world: World;
  player: Player;
  award: Award | undefined;
  onOpen: (value: string) => void;
}) {
  const winner = award?.shortlist[0];
  const club = winner ? world.clubs[winner.clubId] : undefined;
  const rank = award ? award.shortlist.findIndex((entry) => entry.playerId === player.id) + 1 : 0;
  const won = rank === 1;
  if (!award)
    return (
      <EmptySection
        id="ball-heading"
        title={h.awards.kinds['golden-ball']}
        className="lg:col-span-12"
      >
        {h.awards.none}
      </EmptySection>
    );
  return (
    <section
      aria-labelledby="ball-heading"
      className={`${ui.panel} grid grid-cols-[minmax(0,1fr)] gap-5 bg-art-gold md:grid-cols-2 md:items-center lg:col-span-12`}
    >
      <div>
        <h2 id="ball-heading" className="font-display text-[2.2rem] leading-none">
          {format(h.awards.ceremony, { season: award.season })}
        </h2>
        <p className={`${ui.muted} mt-2 max-w-prose`}>{h.awards.ceremonyBody}</p>
        <button className="button mt-4" onClick={() => onOpen(String(award.season))}>
          {h.awards.ceremonyOpen}
        </button>
      </div>
      {winner && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <div
            className={`flex items-center gap-3 rounded-control p-4 ${won ? 'bg-gold text-on-gold' : 'bg-surface'}`}
          >
            <span
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-on-gold"
            >
              <Glyph name="star" className="h-7 w-7" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">{h.awards.ballWinner}</span>
              <strong className="block truncate font-display text-2xl leading-none">
                {playerName(world, winner.playerId)}
              </strong>
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {club && <CrestImage crest={club.crest} alt="" className="h-5 w-5 shrink-0" />}
                <span className="truncate">{club?.name}</span>
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold">
              {format(h.awards.score, { score: winner.score })}
            </span>
          </div>
          <p className="text-sm font-semibold">
            {won
              ? h.awards.ballYou
              : rank
                ? format(h.awards.yourRank, { rank })
                : h.awards.notRanked}
          </p>
        </div>
      )}
    </section>
  );
}

function Ceremony({
  world,
  award,
  player,
  onClose,
}: {
  world: World;
  award: Award;
  player: Player;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const rival = rivalOf(world);
  const ranked = [...award.shortlist].reverse();
  const rank = (id: string | undefined) =>
    award.shortlist.findIndex((entry) => entry.playerId === id) + 1;
  return (
    <section aria-labelledby="ceremony-heading" className={`${ui.panel} bg-art-gold`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ceremony-heading" className="font-display text-[2.8rem] leading-none">
            {format(h.awards.ceremony, { season: award.season })}
          </h2>
        </div>
        <button className="button secondary" onClick={onClose}>
          {h.awards.close}
        </button>
      </div>
      <ol
        className="mt-6 grid gap-2"
        aria-label={format(h.awards.ceremony, { season: award.season })}
      >
        {ranked.map((entry, index) => {
          const position = ranked.length - index;
          const winner = position === 1;
          if (winner && !revealed) return null;
          const name = playerName(world, entry.playerId);
          const club = world.clubs[entry.clubId];
          const mine = entry.playerId === player.id;
          const theirs = entry.playerId === rival?.id;
          return (
            <m.li
              key={entry.playerId}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: winner ? 0 : index * 0.12,
                type: 'spring',
                stiffness: 220,
                damping: 22,
              }}
              className={`flex items-center gap-3 rounded-control p-3 ${
                winner ? 'bg-gold text-[#1d3127]' : mine ? 'bg-accent-soft' : 'bg-surface'
              }`}
            >
              <span className="w-10 shrink-0 font-display text-2xl">
                {format(h.awards.rank, { rank: position })}
              </span>
              {club && <CrestImage crest={club.crest} alt="" className="h-9 w-9 shrink-0" />}
              <span className="min-w-0 flex-1">
                <strong className="block truncate">
                  {name}
                  {mine ? ` · ${h.awards.you}` : theirs ? ` · ${h.awards.rival}` : ''}
                </strong>
                <span className="block truncate text-xs">{club?.name}</span>
              </span>
              <span className="shrink-0 text-sm font-bold">
                {format(h.awards.score, { score: entry.score })}
              </span>
            </m.li>
          );
        })}
      </ol>
      {!revealed ? (
        <button
          className="button mt-5"
          onClick={() => {
            setRevealed(true);
            audio.play('levelUp');
          }}
        >
          {h.awards.reveal}
        </button>
      ) : (
        <div className="mt-5 grid gap-1 text-sm" role="status">
          <p className="font-semibold">
            {rank(player.id)
              ? format(h.awards.yourRank, { rank: rank(player.id) })
              : h.awards.notRanked}
          </p>
          {rival && (
            <p>
              {rank(rival.id)
                ? format(h.awards.rivalRank, { rival: rival.name, rank: rank(rival.id) })
                : format(h.awards.rivalNot, { rival: rival.name })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** A medal tile in the cabinet: club trophies, individual awards and international honours. */
function Medal({
  glyph,
  title,
  meta,
  crest,
}: {
  glyph: GlyphName;
  title: string;
  meta: string;
  crest?: Crest;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-control bg-surface-soft p-3">
      <span
        aria-hidden="true"
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-on-gold shadow-surface"
      >
        <Glyph name={glyph} className="h-6 w-6" />
        {crest && (
          <CrestImage
            crest={crest}
            alt=""
            className="absolute -right-1.5 -bottom-1.5 h-6 w-6 rounded-full bg-surface p-0.5"
          />
        )}
      </span>
      <span className="min-w-0">
        <strong className="block text-sm leading-tight">{title}</strong>
        <span className="block truncate text-xs text-muted">{meta}</span>
      </span>
    </li>
  );
}

function Cabinet({ world, player }: { world: World; player: Player }) {
  const trophies = world.trophies.filter((trophy) => trophy.playerIds.includes(player.id));
  const awards = world.awards.filter((award) => award.winnerIds.includes(player.id));
  const tournaments = (world.international?.tournaments ?? []).filter(
    (t) => t.career?.inSquad && t.career.stage === 'winner',
  );
  const nothing = !trophies.length && !awards.length && !tournaments.length;
  const group = (title: string, items: ReactNode[]) =>
    items.length > 0 && (
      <>
        <h3 className="mt-5 text-sm font-semibold">{title}</h3>
        <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">{items}</ul>
      </>
    );
  if (nothing)
    return (
      <EmptySection id="cabinet-heading" title={h.cabinet.title}>
        <p className="max-w-prose">{h.cabinet.empty}</p>
      </EmptySection>
    );
  return (
    <section aria-labelledby="cabinet-heading" className={ui.panel}>
      <h2 id="cabinet-heading" className={ui.heading}>
        {h.cabinet.title}
      </h2>
      {group(
        h.cabinet.club,
        trophies.map((trophy) => {
          const club = world.clubs[trophy.clubId];
          return (
            <Medal
              key={trophy.id}
              glyph="trophy"
              title={trophyName(world, trophy)}
              meta={`${club?.name ?? ''} · ${trophy.season}`}
              crest={club?.crest}
            />
          );
        }),
      )}
      {group(
        h.cabinet.individual,
        awards.map((award) => (
          <Medal
            key={award.id}
            glyph={award.kind === 'golden-ball' || award.kind === 'golden-boot' ? 'star' : 'medal'}
            title={h.awards.kinds[award.kind]}
            meta={
              award.kind === 'month' && award.month
                ? `${format(h.awards.monthLabel, { month: award.month })} · ${award.season}`
                : String(award.season)
            }
          />
        )),
      )}
      {group(
        h.cabinet.international,
        tournaments.map((t) => (
          <Medal key={t.id} glyph="flag" title={t.name} meta={String(t.year)} />
        )),
      )}
    </section>
  );
}

function WorldRecords({ world, player }: { world: World; player: Player }) {
  if (!world.records.length)
    return (
      <EmptySection id="records-heading" title={h.cabinet.worldRecords}>
        {h.cabinet.worldRecordsBody} {h.cabinet.noRecords}
      </EmptySection>
    );
  return (
    <section aria-labelledby="records-heading" className={ui.panel}>
      <h2 id="records-heading" className={ui.heading}>
        {h.cabinet.worldRecords}
      </h2>
      <p className={`${ui.muted} mt-1`}>{h.cabinet.worldRecordsBody}</p>
      <ul className="mt-4 grid gap-2">
        {world.records.map((record) => {
          const mine = record.playerId === player.id;
          return (
            <li
              key={record.id}
              className={`flex items-center gap-3 rounded-control p-3 ${mine ? 'bg-accent-soft' : 'bg-surface-soft'}`}
            >
              <span
                aria-hidden="true"
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${mine ? 'bg-gold text-on-gold' : 'bg-surface text-accent'}`}
              >
                <Glyph name="record" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {h.cabinet.recordKinds[record.kind]}
                </span>
                <span className="block truncate text-xs text-muted">
                  {format(h.cabinet.recordHolder, {
                    name: mine ? h.cabinet.yours : record.playerName,
                  })}
                </span>
              </span>
              <span className="shrink-0 font-display text-2xl leading-none">{record.value}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** An award's deciding number, named by what it counts. */
const awardValue = (award: Award) =>
  award.kind === 'golden-boot'
    ? award.value === 1
      ? h.awards.values.goalsOne
      : format(h.awards.values.goals, { value: award.value })
    : format(h.awards.values.points, { value: award.value });

function SeasonAwards({ world, player }: { world: World; player: Player }) {
  const awards = world.awards.filter((award) => award.kind !== 'month').slice(-24);
  const seasons = [...new Set(awards.map((award) => award.season))].reverse();
  if (!seasons.length)
    return (
      <EmptySection id="season-awards-heading" title={h.awards.season}>
        <p>{h.awards.seasonEmpty}</p>
        <p className="mt-1 text-xs">{h.awards.scope}</p>
      </EmptySection>
    );
  return (
    <section aria-labelledby="season-awards-heading" className={ui.panel}>
      <h2 id="season-awards-heading" className={ui.heading}>
        {h.awards.season}
      </h2>
      {seasons.map((season) => {
        const own = awards.filter((award) => award.season === season);
        const team = own.find((award) => award.kind === 'team-season');
        const picked = Boolean(team?.winnerIds.includes(player.id));
        return (
          <div key={season} className="mt-4">
            <h3 className="font-display text-xl leading-none">
              {format(h.awards.seasonGroup, { season })}
            </h3>
            <ul className="mt-1 divide-y divide-line">
              {own
                .filter((award) => award.kind !== 'team-season')
                .map((award) => {
                  const mine = award.winnerIds[0] === player.id;
                  return (
                    <li key={award.id} className="flex items-end gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted">
                          {h.awards.kinds[award.kind]}
                        </span>
                        <span className={`block font-semibold ${mine ? 'text-accent' : ''}`}>
                          {playerName(world, award.winnerIds[0])}
                          {mine ? ` · ${h.awards.you}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                        {awardValue(award)}
                      </span>
                    </li>
                  );
                })}
            </ul>
            {team && (
              <p
                className={`mt-1 flex items-center gap-2 text-sm ${picked ? 'font-semibold text-accent' : 'text-muted'}`}
              >
                {picked && <Glyph name="check" className="h-4 w-4" />}
                {picked ? h.awards.teamLineIn : h.awards.teamLineOut}
              </p>
            )}
          </div>
        );
      })}
      <p className="mt-4 text-xs text-muted">{h.awards.scope}</p>
    </section>
  );
}

function Continental({ world, player }: { world: World; player: Player }) {
  const cups = CONTINENTAL_IDS.map((id) => world.competitions[id]).filter(
    (cup) => cup !== undefined,
  );
  return (
    <section aria-labelledby="continental-heading" className={`${ui.panel} lg:col-span-12`}>
      <h2 id="continental-heading" className={ui.heading}>
        {h.continental.title}
      </h2>
      {!cups.length && <p className={`${ui.muted} mt-3`}>{h.continental.none}</p>}
      {/* Each cup's groups and knockouts open on request; the player's own cup starts open,
          so the full draw never dominates an early cabinet. */}
      {cups.map((cup) => {
        const involved = Boolean(
          player.clubId &&
          cup.stages[0]!.groups.some((_, index) =>
            groupTable(world, cup, index).some((row) => row.clubId === player.clubId),
          ),
        );
        return (
          <div key={cup.id} className="mt-5">
            <h3 className="font-display text-2xl leading-none">
              {cup.name} {cup.season}
            </h3>
            {(cup.winnerId || involved) && (
              <p className="mt-1 text-sm font-semibold text-accent">
                {cup.winnerId
                  ? format(h.continental.winner, { club: world.clubs[cup.winnerId]!.name })
                  : h.continental.youAreIn}
              </p>
            )}
            <details open={involved}>
              <summary className="mt-1 flex min-h-11 w-fit cursor-pointer items-center text-sm font-semibold text-accent">
                {h.continental.showGroups}
              </summary>
              <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {cup.stages[0]!.groups.map((_, index) => (
                  <li key={index} className="rounded-control bg-surface-soft p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                      {format(h.continental.groups, { letter: String.fromCharCode(65 + index) })}
                    </h4>
                    <ol className="mt-2 grid gap-1 text-sm">
                      {groupTable(world, cup, index).map((row) => (
                        <li
                          key={row.clubId}
                          className={`flex justify-between gap-2 ${row.clubId === player.clubId ? 'font-bold text-accent' : ''}`}
                        >
                          <span className="min-w-0 truncate">{world.clubs[row.clubId]!.name}</span>
                          <span className="shrink-0 tabular-nums">{row.points}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
              {cup.stages.length > 1 && (
                <>
                  <h4 className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">
                    {h.continental.knockouts}
                  </h4>
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-4">
                    {cup.stages.slice(1).map((stage) => (
                      <div key={stage.id}>
                        <p className="text-sm font-semibold">
                          {h.continental.stageNames[stage.name] ?? stage.name}
                        </p>
                        <ul className="mt-1 grid gap-1 text-xs">
                          {stage.fixtureIds.map((id) => {
                            const fixture = world.fixtures[id]!;
                            const result = world.results[id];
                            return (
                              <li key={id} className="rounded-control bg-surface-soft px-2 py-1">
                                {world.clubs[fixture.homeId]!.name}{' '}
                                {result ? `${result.score[0]}–${result.score[1]}` : 'v'}{' '}
                                {world.clubs[fixture.awayId]!.name}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </details>
          </div>
        );
      })}
    </section>
  );
}
