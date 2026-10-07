import { useState } from 'react';
import { m } from 'framer-motion';
import type { Award, Player, World } from '../../model/domain';
import { CONTINENTAL_IDS, groupTable } from '../../engine/world/continental';
import { rivalOf } from '../../engine/career/social';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { CareerPage, CrestImage, ui } from './shared';
import { useUrlDialog } from './useUrlDialog';
import { audio } from '../../audio';

export default function CareerTrophies() {
  return (
    <CareerPage eyebrow={h.eyebrow} title={h.titles.trophies}>
      {({ world, player }) => <TrophiesContent world={world} player={player} />}
    </CareerPage>
  );
}

const awardName = (award: Award) =>
  award.kind === 'month'
    ? `${h.awards.kinds.month} · ${format(h.awards.monthLabel, { month: award.month ?? 0 })}`
    : h.awards.kinds[award.kind];

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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <section aria-labelledby="ball-heading" className={`${ui.panel} bg-art-gold lg:col-span-12`}>
        <p className={ui.eyebrow}>{h.awards.kinds['golden-ball']}</p>
        <h2 id="ball-heading" className="font-display text-[2.2rem] leading-none">
          {latest
            ? format(h.awards.ceremony, { season: latest.season })
            : h.awards.kinds['golden-ball']}
        </h2>
        <p className={`${ui.muted} mt-2 max-w-prose`}>
          {latest ? h.awards.ceremonyBody : h.awards.none}
        </p>
        {latest && (
          <button className="button mt-4" onClick={() => ceremony.open(String(latest.season))}>
            {h.awards.ceremonyOpen}
          </button>
        )}
      </section>
      <Cabinet world={world} player={player} />
      <SeasonAwards world={world} player={player} />
      <Continental world={world} player={player} />
    </div>
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
          <p className={ui.eyebrow}>{h.awards.kinds['golden-ball']}</p>
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
          const name =
            world.players[entry.playerId]?.name ??
            world.archive?.players[entry.playerId]?.name ??
            '';
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

function Cabinet({ world, player }: { world: World; player: Player }) {
  const trophies = world.trophies.filter((trophy) => trophy.playerIds.includes(player.id));
  const awards = world.awards.filter((award) => award.winnerIds.includes(player.id));
  const tournaments = (world.international?.tournaments ?? []).filter(
    (t) => t.career?.inSquad && t.career.stage === 'winner',
  );
  const records = world.records;
  const nothing = !trophies.length && !awards.length && !tournaments.length;
  return (
    <section aria-labelledby="cabinet-heading" className={`${ui.panel} lg:col-span-7`}>
      <h2 id="cabinet-heading" className={ui.heading}>
        {h.cabinet.title}
      </h2>
      {nothing && <p className={`${ui.muted} mt-3`}>{h.cabinet.empty}</p>}
      {trophies.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">
            {h.cabinet.club}
          </h3>
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            {trophies.map((trophy) => {
              const club = world.clubs[trophy.clubId]!;
              const name =
                world.leagues[trophy.competitionId]?.name ??
                world.competitions[trophy.competitionId]?.name ??
                trophy.competitionId;
              return (
                <li
                  key={trophy.id}
                  className="flex items-center gap-3 rounded-control bg-surface-soft p-3"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-lg"
                  >
                    ★
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{name}</strong>
                    <span className="block truncate text-xs text-muted">
                      {club.name} · {trophy.season}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {awards.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
            {h.cabinet.individual}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {awards.map((award) => (
              <li key={award.id} className={ui.chip}>
                {awardName(award)} · {award.season}
              </li>
            ))}
          </ul>
        </>
      )}
      {tournaments.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
            {h.cabinet.international}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tournaments.map((t) => (
              <li key={t.id} className={ui.chip}>
                {t.name} {t.year}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {h.cabinet.records}
      </h3>
      <ul className="mt-2 grid gap-1 text-sm">
        {records.map((record) => (
          <li
            key={record.id}
            className={record.playerId === player.id ? 'font-bold text-accent' : ''}
          >
            {format(h.cabinet.held, {
              kind: h.cabinet.recordKinds[record.kind],
              value: record.value,
              name: record.playerId === player.id ? h.cabinet.yours : record.playerName,
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeasonAwards({ world, player }: { world: World; player: Player }) {
  const awards = world.awards
    .filter((award) => award.kind !== 'month')
    .slice(-24)
    .reverse();
  return (
    <section aria-labelledby="season-awards-heading" className={`${ui.panel} lg:col-span-5`}>
      <h2 id="season-awards-heading" className={ui.heading}>
        {h.awards.season}
      </h2>
      {awards.length ? (
        <div
          className="relative mt-4 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={h.awards.season}
        >
          <table className="w-full min-w-[18rem] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="py-1 pr-2">
                  {h.awards.columns.season}
                </th>
                <th scope="col" className="py-1 pr-2">
                  {h.awards.columns.award}
                </th>
                <th scope="col" className="py-1">
                  {h.awards.columns.winner}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {awards.map((award) => {
                const winner =
                  award.kind === 'team-season'
                    ? award.winnerIds.includes(player.id)
                    : award.winnerIds[0] === player.id;
                const name =
                  award.kind === 'team-season'
                    ? award.winnerIds.includes(player.id)
                      ? h.awards.teamIn
                      : h.awards.teamOut
                    : (world.players[award.winnerIds[0]!]?.name ??
                      world.archive?.players[award.winnerIds[0]!]?.name ??
                      '');
                return (
                  <tr key={award.id} className={winner ? 'font-bold text-accent' : ''}>
                    <td className="py-1 pr-2">{award.season}</td>
                    <td className="py-1 pr-2">{awardName(award)}</td>
                    <td className="py-1">{name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={`${ui.muted} mt-4`}>{h.awards.seasonEmpty}</p>
      )}
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
      {cups.map((cup) => (
        <div key={cup.id} className="mt-5">
          <h3 className="font-display text-2xl leading-none">
            {cup.name} {cup.season}
          </h3>
          {cup.winnerId && (
            <p className="mt-1 text-sm font-semibold text-accent">
              {format(h.continental.winner, { club: world.clubs[cup.winnerId]!.name })}
            </p>
          )}
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
        </div>
      ))}
    </section>
  );
}
