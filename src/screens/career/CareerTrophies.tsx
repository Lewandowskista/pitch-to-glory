import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import type {
  Avatar,
  Award,
  Club,
  Competition,
  Crest,
  Id,
  Player,
  Position,
  World,
} from '../../model/domain';
import { CONTINENTAL_IDS, groupTable } from '../../engine/world/continental';
import { rivalOf } from '../../engine/career/social';
import { tournamentPart, trophyName } from '../../engine/career/honours/trophies';
import { liveHallOfFameRank } from '../../engine/career/honours/retirement';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { renderTrophy, trophyKindFor, type TrophyKind } from '../../engine/assets/trophies';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { Button, CardTitle, Chip, KeyHint, Panel, cx } from '../../ui/kit';
import { CareerPage, CrestImage, useSaveLink } from './shared';
import { useUrlDialog } from './useUrlDialog';
import {
  counted,
  Glyph,
  ordinal,
  StarMark,
  useReducedMotionSetting,
  EXPAND_CHEVRON,
} from './honoursUi';
import { audio } from '../../audio';

export default function CareerTrophies() {
  return (
    <CareerPage
      title={h.titles.trophies}
      description={h.cabinet.pageBody}
      actions={({ world, player }) => <Summary world={world} player={player} />}
    >
      {({ world, player }) => <TrophiesContent world={world} player={player} />}
    </CareerPage>
  );
}

/** Anyone who appears in an award: a current player, or one archived after retiring. */
interface Person {
  name: string;
  avatar: Avatar;
  birthSeason: number;
  position: Position;
  nationalityId: Id;
}
function personOf(world: World, id: Id | undefined): Person | undefined {
  if (!id) return undefined;
  const player = world.players[id];
  if (player)
    return {
      name: player.name,
      avatar: player.avatar,
      birthSeason: player.birthSeason,
      position: player.primaryPosition,
      nationalityId: player.nationalityId,
    };
  const archived = world.archive?.players[id];
  return archived
    ? {
        name: archived.name,
        avatar: archived.avatar,
        birthSeason: archived.birthSeason,
        position: archived.primaryPosition,
        nationalityId: archived.nationalityId,
      }
    : undefined;
}

/** How many Golden Balls a player had won by the end of a season. */
const ballsWon = (world: World, id: Id, season: number) =>
  world.awards.filter(
    (award) =>
      award.kind === 'golden-ball' && award.season <= season && award.shortlist[0]?.playerId === id,
  ).length;
/** "second", "third" ... then "11th". */
const nthWord = (count: number) => h.awards.nth[count - 1] ?? ordinal(count);
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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

/** What the player has won, for the cabinet's counts. */
function honoursOf(world: World, player: Player) {
  return {
    trophies: world.trophies.filter((trophy) => trophy.playerIds.includes(player.id)),
    awards: world.awards.filter((award) => award.winnerIds.includes(player.id)),
    tournaments: (world.international?.tournaments ?? []).filter((t) => {
      const part = tournamentPart(world, player.id, t);
      return part?.inSquad && part.stage === 'winner';
    }),
  };
}

/** Three counts beside the page title: club trophies, individual awards, international. */
function Summary({ world, player }: { world: World; player: Player }) {
  const { trophies, awards, tournaments } = honoursOf(world, player);
  // Where the career stands in the Hall of Fame, scored as retirement will score it.
  const standing = useMemo(() => liveHallOfFameRank(world), [world]);
  const ranked = standing.score > 0;
  if (!trophies.length && !awards.length && !tournaments.length && !ranked) return null;
  const items: [number, { one: string; many: string }][] = [
    [trophies.length, h.cabinet.counts.club],
    [awards.length, h.cabinet.counts.individual],
    [tournaments.length, h.cabinet.counts.international],
  ];
  return (
    <ul aria-label={h.cabinet.summary} className="flex flex-wrap gap-2">
      {items
        .filter(([count]) => count > 0)
        .map(([count, forms]) => {
          const [number, ...words] = counted(count, forms).split(' ');
          return (
            <li
              key={forms.many}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-[0.8125rem] font-bold"
            >
              <span className="font-display text-[1.375rem] leading-none text-accent">
                {number}{' '}
              </span>
              {words.join(' ')}
            </li>
          );
        })}
      {ranked && (
        <li
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gold bg-art-gold px-3.5 text-[0.8125rem] font-bold text-gold-ink"
          data-testid="hall-of-fame-rank"
        >
          <StarMark className="h-4 w-4" />
          {format(h.hallOfFameLive.line, {
            rank: standing.rank,
            of: standing.of.toLocaleString('en'),
          })}
        </li>
      )}
    </ul>
  );
}

/** A trophy, alone or on its gold-rimmed disc. Decorative: its name is always beside it. */
function TrophyArt({
  kind,
  disc = true,
  className,
}: {
  kind: TrophyKind;
  disc?: boolean;
  className: string;
}) {
  const svg = useMemo(() => renderTrophy(kind, disc), [kind, disc]);
  return <Artwork svg={svg} alt="" className={className} />;
}

/** A bust in the kit of the given club. Decorative: the name is always beside it. */
function Bust({
  person,
  age,
  club,
  className,
}: {
  person: Person;
  age: number;
  club: Club | undefined;
  className: string;
}) {
  const svg = useMemo(
    () => renderAvatar(person.avatar, age, clubDress(club)),
    [person.avatar, age, club],
  );
  return <Artwork svg={svg} alt="" className={className} />;
}

/** Faint gold rays behind the Golden Ball card. */
function Rays() {
  const path = useMemo(() => {
    let d = '';
    for (let ray = 0; ray < 18; ray++) {
      const a = (ray / 18) * Math.PI * 2;
      const b = a + Math.PI / 36;
      d += `M600 180L${(600 + Math.cos(a) * 900).toFixed(0)} ${(180 + Math.sin(a) * 900).toFixed(0)}L${(600 + Math.cos(b) * 900).toFixed(0)} ${(180 + Math.sin(b) * 900).toFixed(0)}Z`;
    }
    return d;
  }, []);
  return (
    <svg
      viewBox="0 0 1200 360"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 h-full w-full text-gold opacity-30"
    >
      <path d={path} fill="currentColor" />
    </svg>
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
  if (!award)
    return (
      <section
        aria-labelledby="ball-heading"
        className="flex items-center gap-4 rounded-panel border border-gold bg-art-gold px-5 py-4 lg:col-span-12"
      >
        <TrophyArt kind="golden-ball" disc={false} className="h-14 w-14 shrink-0 opacity-60" />
        <div className="min-w-0">
          <h2 id="ball-heading" className="font-display text-[2rem] leading-none font-normal">
            {h.awards.kinds['golden-ball']}
          </h2>
          <p className="mt-1 text-sm text-gold-ink">{h.awards.none}</p>
        </div>
      </section>
    );
  const winner = award.shortlist[0];
  const person = personOf(world, winner?.playerId);
  const club = winner ? world.clubs[winner.clubId] : undefined;
  const rank = award.shortlist.findIndex((entry) => entry.playerId === player.id) + 1;
  const won = rank === 1;
  const mine = ballsWon(world, player.id, award.season);
  return (
    <section
      aria-labelledby="ball-heading"
      className="relative overflow-hidden rounded-panel border border-gold bg-art-gold p-panel sm:px-8 sm:py-7 lg:col-span-12"
    >
      <Rays />
      <div className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-9">
        <div className="flex min-w-0 flex-col items-start gap-3">
          <Chip tone="gold" className="tracking-[0.1em] uppercase">
            {format(h.awards.endOfSeason, { season: award.season })}
          </Chip>
          <h2
            id="ball-heading"
            className="font-display text-[2.75rem] leading-[0.9] font-normal sm:text-[3.5rem]"
          >
            {format(h.awards.ceremony, { season: award.season })}
          </h2>
          <p className="max-w-[25rem] text-gold-ink">{h.awards.ceremonyBody}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button icon="play" onClick={() => onOpen(String(award.season))}>
              {h.awards.ceremonyOpen}
            </Button>
            {mine > 0 && (
              <span className="text-xs font-semibold text-gold-ink">
                {format(h.awards.yourNth, { nth: nthWord(mine) })}
              </span>
            )}
          </div>
        </div>
        <TrophyArt
          kind="golden-ball"
          disc={false}
          className="h-32 w-32 justify-self-center max-md:hidden md:h-44 md:w-44"
        />
        {winner && (
          <div className="flex min-w-0 flex-col gap-3 md:col-span-2 xl:col-span-1">
            <div
              className={cx(
                'flex items-center gap-3.5 rounded-control px-4 py-3.5',
                won ? 'bg-gold text-on-gold shadow-gold' : 'bg-surface text-ink',
              )}
            >
              {person && (
                <Bust
                  person={person}
                  age={award.season - person.birthSeason}
                  club={club}
                  className="h-16 w-16 shrink-0"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold">{h.awards.ballWinner}</span>
                <strong className="block truncate font-display text-[2rem] leading-[0.95] font-normal">
                  {person?.name}
                </strong>
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                  {club && (
                    <CrestImage crest={club.crest} alt="" className="h-5 w-[1.125rem] shrink-0" />
                  )}
                  <span className="truncate">{club?.name}</span>
                </span>
              </span>
              <span className="shrink-0 text-[0.9375rem] font-extrabold">
                {format(h.awards.score, { score: winner.score })}
              </span>
            </div>
            <p className="text-base font-extrabold">
              {won
                ? h.awards.ballYou
                : rank
                  ? format(h.awards.yourRank, { rank })
                  : h.awards.notRanked}
            </p>
            {award.shortlist.length > 1 && (
              <ol aria-label={h.awards.topThree} className="grid gap-1">
                {award.shortlist.slice(1, 3).map((entry, index) => {
                  const rowClub = world.clubs[entry.clubId];
                  const self = entry.playerId === player.id;
                  return (
                    <li
                      key={entry.playerId}
                      className={cx(
                        'flex min-w-0 items-center gap-2.5 rounded-chip px-2.5 py-1.5 text-[0.8125rem]',
                        self ? 'bg-accent-soft text-accent' : 'bg-surface/60',
                      )}
                    >
                      <span className="w-6 shrink-0 font-display text-xl leading-none">
                        {format(h.awards.rank, { rank: index + 2 })}
                      </span>
                      {rowClub && (
                        <CrestImage
                          crest={rowClub.crest}
                          alt=""
                          className="h-5 w-[1.125rem] shrink-0"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {personOf(world, entry.playerId)?.name}
                        {self ? ` · ${h.awards.you}` : ''}
                      </span>
                      <span className="shrink-0 font-bold text-gold-ink">
                        {format(h.awards.score, { score: entry.score })}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Spotlights and confetti behind the ceremony stage. */
function Stage() {
  return (
    <svg
      viewBox="0 0 1160 900"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path d="M150 -20L230 -20L470 900L-60 900Z" className="fill-gold" opacity="0.07" />
      <path d="M330 -20L380 -20L560 900L250 900Z" className="fill-gold" opacity="0.1" />
      <path d="M880 -20L930 -20L1040 900L700 900Z" className="fill-mint" opacity="0.05" />
      <ellipse cx="290" cy="830" rx="300" ry="54" className="fill-night-raised" />
      <ellipse cx="290" cy="830" rx="200" ry="32" className="fill-gold" opacity="0.12" />
      <g className="fill-gold">
        <path d="M120 150l10-4l3 9l-10 4Z" />
        <path d="M520 110l8 5l-5 8l-8-5Z" />
        <path d="M470 260h9v9h-9Z" opacity="0.6" />
        <path d="M70 420l7 6l-6 7l-7-6Z" opacity="0.7" />
      </g>
      <g className="fill-mint">
        <path d="M210 90l9 3l-3 9l-9-3Z" />
        <path d="M560 340l6 7l-7 6l-6-7Z" opacity="0.7" />
        <path d="M40 260h8v8h-8Z" opacity="0.6" />
      </g>
    </svg>
  );
}

/**
 * The Golden Ball ceremony (`?ceremony=season`): a dark stage where the top ten slide in from
 * tenth place upwards, and the winner is revealed last. Back, Escape and the close button leave.
 */
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
  const reduced = useReducedMotionSetting();
  const reveal = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const rival = rivalOf(world);
  const ranked = [...award.shortlist].reverse();
  const rank = (id: string | undefined) =>
    award.shortlist.findIndex((entry) => entry.playerId === id) + 1;
  const winner = award.shortlist[0];
  const person = personOf(world, winner?.playerId);
  const club = winner ? world.clubs[winner.clubId] : undefined;
  const balls = winner ? ballsWon(world, winner.playerId, award.season) : 0;
  const runnerUp = award.shortlist[1];

  useEffect(() => reveal.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (revealed) status.current?.focus({ preventScroll: true });
  }, [revealed]);
  // Escape leaves the ceremony here (before the shell's "go back" shortcut), so a ceremony
  // opened from a refreshed URL returns to the cabinet rather than the previous page.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      close.current();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, []);

  const heading = format(h.awards.ceremony, { season: award.season });
  return (
    <section
      aria-labelledby="ceremony-heading"
      className="relative flex flex-col gap-7 overflow-hidden rounded-sheet bg-night px-5 py-6 text-night-ink sm:px-9 sm:pt-8 sm:pb-9"
    >
      <Stage />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
            {format(h.awards.stageEyebrow, { season: award.season })}
          </p>
          <h2
            id="ceremony-heading"
            className="mt-1 font-display text-[3.5rem] leading-[0.85] font-normal text-hero-ink sm:text-[5.25rem]"
          >
            {heading}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-night-muted max-sm:hidden">
            <KeyHint keys="Esc" onHero />
            {h.awards.toLeave}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center gap-2 rounded-control border border-night-line bg-night-soft px-4 font-bold text-night-ink transition-colors hover:bg-night-raised"
          >
            <Icon name="arrow" className="h-[18px] w-[18px] rotate-180" />
            {h.awards.close}
          </button>
        </div>
      </div>

      <div className="relative grid grid-cols-[minmax(0,1fr)] items-stretch gap-7 lg:grid-cols-2 lg:gap-9">
        <div className="flex min-w-0 flex-col items-center justify-end gap-3.5 pb-2.5 text-center">
          {revealed && winner && person ? (
            <m.div
              initial={reduced ? false : { opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="flex min-w-0 flex-col items-center gap-3.5"
            >
              <div className="flex items-end justify-center">
                <Bust
                  person={person}
                  age={award.season - person.birthSeason}
                  club={club}
                  className="relative z-[1] h-44 w-44 rounded-full ring-4 ring-gold sm:h-[14.75rem] sm:w-[14.75rem]"
                />
                <TrophyArt
                  kind="golden-ball"
                  disc={false}
                  className="relative z-[2] -ml-9 h-28 w-28 sm:h-[9.375rem] sm:w-[9.375rem]"
                />
              </div>
              <span className="rounded-full bg-gold px-3.5 py-1 text-xs font-extrabold tracking-[0.12em] text-on-gold uppercase">
                {h.awards.winner}
              </span>
              <p className="max-w-full font-display text-[3.5rem] leading-[0.85] break-words text-gold sm:text-[4.75rem]">
                {person.name}
              </p>
              <p className="flex flex-wrap items-center justify-center gap-2.5 font-bold">
                {club && <CrestImage crest={club.crest} alt="" className="h-8 w-7 shrink-0" />}
                {club?.name}
                <span className="font-semibold text-night-muted">
                  <span aria-hidden="true" className="max-sm:hidden">
                    ·{' '}
                  </span>
                  {c.positions[person.position]} · {world.countries[person.nationalityId]?.name}
                </span>
              </p>
              <div className="flex flex-wrap justify-center gap-2.5">
                <span className="rounded-full border border-night-line bg-night-raised px-3.5 py-1 text-[0.8125rem] font-bold">
                  {format(h.awards.score, { score: winner.score })}
                </span>
                {runnerUp && (
                  <span className="rounded-full border border-night-line bg-night-raised px-3.5 py-1 text-[0.8125rem] font-bold">
                    {format(h.awards.clear, {
                      points: Math.round((winner.score - runnerUp.score) * 10) / 10,
                    })}
                  </span>
                )}
                {balls > 1 && (
                  <span className="rounded-full border border-night-line bg-night-raised px-3.5 py-1 text-[0.8125rem] font-bold text-mint">
                    {format(h.awards.theirNth, { nth: capitalised(nthWord(balls)) })}
                  </span>
                )}
              </div>
            </m.div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <TrophyArt
                kind="golden-ball"
                disc={false}
                className="h-36 w-36 opacity-80 sm:h-48 sm:w-48"
              />
              <p className="text-night-muted">{h.awards.waiting}</p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <ol aria-label={heading} className="grid gap-1.5">
            {ranked.map((entry, index) => {
              const position = ranked.length - index;
              const first = position === 1;
              if (first && !revealed) return null;
              const name = personOf(world, entry.playerId)?.name ?? '';
              const rowClub = world.clubs[entry.clubId];
              const mine = entry.playerId === player.id;
              const theirs = entry.playerId === rival?.id;
              const tag = mine ? h.awards.you : theirs ? h.awards.rival : '';
              return (
                <m.li
                  key={entry.playerId}
                  initial={reduced ? false : { opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: first ? 0 : index * 0.12,
                    type: 'spring',
                    stiffness: 220,
                    damping: 22,
                  }}
                  className={cx(
                    'flex min-w-0 items-center gap-3 rounded-control',
                    first
                      ? 'mt-1.5 bg-gold px-4 py-3.5 text-on-gold shadow-[0_6px_0_var(--color-gold-pressed)]'
                      : 'border border-night-line bg-night-soft px-3.5 py-2',
                  )}
                >
                  <span
                    className={cx(
                      'w-11 shrink-0 font-display leading-none',
                      first ? 'text-[2.5rem]' : 'text-2xl text-night-muted',
                    )}
                  >
                    {format(h.awards.rank, { rank: position })}
                  </span>
                  {rowClub && (
                    <CrestImage
                      crest={rowClub.crest}
                      alt=""
                      className="h-[2.125rem] w-[1.875rem] shrink-0"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">
                      {name}
                      {tag && (
                        <span
                          className={cx(
                            'ml-2 rounded-full px-2 py-px align-[2px] text-[0.6875rem] font-extrabold',
                            first
                              ? 'bg-on-gold text-gold'
                              : 'border border-night-line bg-night-raised text-mint',
                          )}
                        >
                          <span className="sr-only">, </span>
                          {tag}
                        </span>
                      )}
                    </strong>
                    <span
                      className={cx(
                        'block truncate text-xs',
                        first ? 'text-on-gold' : 'text-night-muted',
                      )}
                    >
                      {rowClub?.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold whitespace-nowrap">
                    {format(h.awards.score, { score: entry.score })}
                  </span>
                </m.li>
              );
            })}
          </ol>
          {!revealed && (
            <Button
              ref={reveal}
              variant="play"
              size="lg"
              className="self-start"
              onClick={() => {
                setRevealed(true);
                audio.play('levelUp');
              }}
            >
              <StarMark />
              {h.awards.reveal}
            </Button>
          )}
          <div
            ref={status}
            role="status"
            tabIndex={-1}
            className={
              revealed
                ? 'grid gap-1 rounded-control border border-night-line bg-night-soft px-4 py-3 outline-none'
                : 'sr-only outline-none'
            }
          >
            {revealed && (
              <>
                <p className="font-extrabold text-gold">
                  {rank(player.id)
                    ? format(h.awards.yourRank, { rank: rank(player.id) })
                    : h.awards.notRanked}
                </p>
                {rival && (
                  <p className="text-night-muted">
                    {rank(rival.id)
                      ? format(h.awards.rivalRank, { rival: rival.name, rank: rank(rival.id) })
                      : format(h.awards.rivalNot, { rival: rival.name })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** A labelled group inside the cabinet, with its count beside the heading. */
function Shelf({
  title,
  count,
  aside,
  children,
}: {
  title: string;
  count: number;
  aside?: ReactNode;
  children: ReactNode;
}) {
  if (!count) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          {title}
          <span className="rounded-full bg-accent-soft px-2 text-xs font-extrabold text-accent">
            <span className="sr-only">(</span>
            {count}
            <span className="sr-only">)</span>
          </span>
        </h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Cabinet({ world, player }: { world: World; player: Player }) {
  const link = useSaveLink();
  const { trophies, awards, tournaments } = honoursOf(world, player);
  const total = trophies.length + awards.length + tournaments.length;
  const clubs = new Set(trophies.map((trophy) => trophy.clubId)).size;
  if (!total)
    return (
      <Panel aria-labelledby="cabinet-heading" className="flex flex-col gap-3">
        <CardTitle id="cabinet-heading">{h.cabinet.title}</CardTitle>
        <div className="flex gap-2.5" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <span
              key={slot}
              className="h-14 w-14 rounded-full border-2 border-dashed border-line"
            />
          ))}
        </div>
        <p className="max-w-prose text-muted">{h.cabinet.empty}</p>
      </Panel>
    );
  return (
    <Panel aria-labelledby="cabinet-heading" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id="cabinet-heading" size="lg">
          {h.cabinet.title}
        </CardTitle>
        <span className="text-[0.8125rem] font-semibold text-muted">
          {clubs
            ? format(h.cabinet.across, {
                honours: counted(total, h.cabinet.honours),
                clubs: counted(clubs, h.cabinet.clubs),
              })
            : counted(total, h.cabinet.honours)}
        </span>
      </div>
      <Shelf title={h.cabinet.club} count={trophies.length}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
          {trophies.map((trophy) => {
            const club = world.clubs[trophy.clubId];
            return (
              <li
                key={trophy.id}
                className="flex min-w-0 flex-col items-center gap-2 rounded-control bg-surface-soft px-2.5 pt-4 pb-3.5 text-center shadow-[inset_0_-4px_0_var(--track)]"
              >
                <span className="relative h-[5.25rem] w-[5.25rem] shrink-0">
                  <TrophyArt
                    kind={trophyKindFor(trophy.competitionId)}
                    className="h-[5.25rem] w-[5.25rem]"
                  />
                  {club && <CrestBadge crest={club.crest} />}
                </span>
                <span className="min-w-0">
                  <strong className="block text-[0.8125rem] leading-tight">
                    {trophyName(world, trophy)}
                  </strong>
                  <span className="block text-xs text-muted">
                    {club?.name} · {trophy.season}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Shelf>
      <Shelf title={h.cabinet.individual} count={awards.length}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-2">
          {awards.map((award) => (
            <li
              key={award.id}
              className="flex min-w-0 items-center gap-3 rounded-control bg-surface-soft px-3 py-2.5"
            >
              <TrophyArt kind={trophyKindFor(award.kind)} className="h-12 w-12 shrink-0" />
              <span className="min-w-0">
                <strong className="block text-[0.8125rem] leading-tight">
                  {h.awards.kinds[award.kind]}
                </strong>
                <span className="block text-xs text-muted">
                  {award.kind === 'month' && award.month
                    ? `${format(h.awards.monthLabel, { month: award.month })} · ${award.season}`
                    : award.season}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Shelf>
      <Shelf
        title={h.cabinet.international}
        count={tournaments.length}
        aside={
          <Link className="text-button" to={link('/career/national')}>
            {h.cabinet.national}
          </Link>
        }
      >
        <ul className="grid gap-2">
          {tournaments.map((t) => (
            <li
              key={t.id}
              className="flex min-w-0 flex-wrap items-center gap-4 rounded-control bg-art-blue px-4 py-3"
            >
              <TrophyArt kind={trophyKindFor(t.kind)} className="h-16 w-16 shrink-0" />
              <span className="min-w-0 flex-1 basis-48">
                <strong className="block text-[0.9375rem]">{t.name}</strong>
                <span className="block text-xs font-semibold text-info">
                  {format(h.cabinet.intlMeta, {
                    year: t.year,
                    nation: world.countries[t.career?.nationId ?? '']?.name ?? '',
                    stage: h.national.stages.winner,
                  })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Shelf>
    </Panel>
  );
}

/** A club crest on a small white disc at the foot of a trophy. Decorative. */
function CrestBadge({ crest }: { crest: Crest }) {
  return (
    <span className="absolute -right-1.5 -bottom-1 grid h-[2.125rem] w-[2.125rem] place-items-center rounded-full border border-line bg-surface">
      <CrestImage crest={crest} alt="" className="h-[1.6875rem] w-6" />
    </span>
  );
}

function WorldRecords({ world, player }: { world: World; player: Player }) {
  if (!world.records.length)
    return (
      <Panel padding="compact" aria-labelledby="records-heading">
        <CardTitle id="records-heading" size="sm">
          {h.cabinet.worldRecords}
        </CardTitle>
        <p className="mt-1.5 text-[0.8125rem] text-muted">{h.cabinet.noRecords}</p>
      </Panel>
    );
  return (
    <Panel aria-labelledby="records-heading" className="flex flex-col gap-3">
      <div>
        <CardTitle id="records-heading">{h.cabinet.worldRecords}</CardTitle>
        <p className="mt-1 text-muted">{h.cabinet.worldRecordsBody}</p>
      </div>
      <ul className="grid gap-2">
        {world.records.map((record) => {
          const mine = record.playerId === player.id;
          return (
            <li
              key={record.id}
              className={cx(
                'flex min-w-0 items-center gap-3 rounded-control px-3.5 py-2.5',
                mine ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]' : 'bg-surface-soft',
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                  mine ? 'bg-gold text-on-gold' : 'bg-surface text-accent',
                )}
              >
                <Glyph name="record" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {h.cabinet.recordKinds[record.kind]}
                </span>
                <span
                  className={cx(
                    'block truncate text-xs',
                    mine ? 'font-semibold text-accent' : 'text-muted',
                  )}
                >
                  {format(h.cabinet.recordHolder, {
                    name: mine ? h.cabinet.yours : record.playerName,
                  })}
                </span>
              </span>
              <span className="shrink-0 font-display text-[2.125rem] leading-none">
                {record.value}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** An award's deciding number, named by what it counts. */
const awardValue = (award: Award) =>
  award.kind === 'golden-boot'
    ? award.value === 1
      ? h.awards.values.goalsOne
      : format(h.awards.values.goals, { value: award.value })
    : format(h.awards.values.points, { value: award.value });

/** The latest three seasons show; earlier ones open on request. */
const SEASONS_SHOWN = 3;

function SeasonAwards({ world, player }: { world: World; player: Player }) {
  const [all, setAll] = useState(false);
  const awards = world.awards.filter((award) => award.kind !== 'month');
  const seasons = [...new Set(awards.map((award) => award.season))].sort((a, b) => b - a);
  if (!seasons.length)
    return (
      <Panel padding="compact" aria-labelledby="season-awards-heading">
        <CardTitle id="season-awards-heading" size="sm">
          {h.awards.season}
        </CardTitle>
        <p className="mt-1.5 text-[0.8125rem] text-muted">{h.awards.seasonEmpty}</p>
      </Panel>
    );
  const hidden = seasons.length - SEASONS_SHOWN;
  const shown = all ? seasons : seasons.slice(0, SEASONS_SHOWN);
  return (
    <Panel aria-labelledby="season-awards-heading" className="flex flex-col gap-4">
      <CardTitle id="season-awards-heading">{h.awards.season}</CardTitle>
      {shown.map((season) => {
        const own = awards.filter((award) => award.season === season);
        const team = own.find((award) => award.kind === 'team-season');
        const picked = Boolean(team?.winnerIds.includes(player.id));
        return (
          <div key={season} className="flex flex-col gap-1">
            <h3 className="font-display text-2xl leading-none font-normal">
              {format(h.awards.seasonGroup, { season })}
            </h3>
            <ul className="divide-y divide-line">
              {own
                .filter((award) => award.kind !== 'team-season')
                .map((award) => {
                  const mine = award.winnerIds[0] === player.id;
                  return (
                    <li key={award.id} className="flex items-end gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted">
                          {h.awards.kinds[award.kind]}
                        </span>
                        <span
                          className={cx(
                            'block truncate',
                            mine ? 'font-bold text-accent' : 'font-semibold',
                          )}
                        >
                          {personOf(world, award.winnerIds[0])?.name}
                          {mine ? ` · ${h.awards.you}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-muted">
                        {awardValue(award)}
                      </span>
                    </li>
                  );
                })}
            </ul>
            {team && (
              <p
                className={cx(
                  'mt-1 flex items-center gap-2 text-[0.8125rem]',
                  picked ? 'font-bold text-accent' : 'text-muted',
                )}
              >
                {picked && <Glyph name="check" className="h-4 w-4" />}
                {picked ? h.awards.teamLineIn : h.awards.teamLineOut}
              </p>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <Button
          variant="secondary"
          aria-expanded={all}
          onClick={() => setAll((value) => !value)}
          iconEnd="chevron"
          className={cx('justify-between', EXPAND_CHEVRON)}
        >
          {all ? h.awards.fewer : counted(hidden, h.awards.earlier)}
        </Button>
      )}
      <p className="text-xs text-muted">{h.awards.scope}</p>
    </Panel>
  );
}

/** Where a continental cup stands: its winner, the next round or the last one played. */
function cupProgress(world: World, cup: Competition): string {
  if (cup.winnerId)
    return format(h.continental.winner, { club: world.clubs[cup.winnerId]?.name ?? '' });
  const knockouts = cup.stages.slice(1);
  const done = (ids: Id[]) => ids.length > 0 && ids.every((id) => world.results[id]);
  const played = knockouts.filter((stage) => done(stage.fixtureIds)).at(-1);
  const stageName = (name: string) => h.continental.stageNames[name] ?? name;
  if (played) return format(h.continental.played, { stage: stageName(played.name) });
  return h.continental.groupStage;
}

function Continental({ world, player }: { world: World; player: Player }) {
  const cups = CONTINENTAL_IDS.map((id) => world.competitions[id]).filter(
    (cup) => cup !== undefined,
  );
  if (!cups.length)
    return (
      <Panel padding="compact" aria-labelledby="continental-heading" className="lg:col-span-12">
        <CardTitle id="continental-heading" size="sm">
          {h.continental.title}
        </CardTitle>
        <p className="mt-1.5 text-[0.8125rem] text-muted">{h.continental.none}</p>
      </Panel>
    );
  const own = player.clubId;
  const inCup = (cup: Competition) =>
    Boolean(own && cup.stages[0]!.groups.some((group) => group.includes(own)));
  return (
    <Panel aria-labelledby="continental-heading" className="flex flex-col gap-4 lg:col-span-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id="continental-heading" size="lg">
          {h.continental.title}
        </CardTitle>
        {cups.some(inCup) && (
          <span className="flex items-center gap-2 text-[0.8125rem] font-semibold text-accent">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 rounded-chip border-2 border-accent bg-accent-soft"
            />
            {h.continental.yourClub}
          </span>
        )}
      </div>
      {/* Each cup's groups and knockouts open on request; the player's own cup starts open,
          so the full draw never dominates an early cabinet. */}
      {cups.map((cup, index) => {
        const involved = inCup(cup);
        const groups = cup.stages[0]!.groups;
        return (
          <details
            key={cup.id}
            open={involved}
            className={cx('group', index > 0 && 'border-t border-line pt-3.5')}
          >
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3 [&::-webkit-details-marker]:hidden">
              <TrophyArt
                kind={trophyKindFor(cup.id)}
                className={cx('h-10 w-10 shrink-0', !involved && 'opacity-60 grayscale')}
              />
              <span className="min-w-0 flex-1 basis-56">
                <h3 className="font-display text-[1.625rem] leading-none font-normal">
                  {cup.name} {cup.season}
                </h3>
                <span className="block text-xs text-muted">
                  {[
                    counted(groups.length, h.continental.groupsCount),
                    cupProgress(world, cup),
                    involved ? h.continental.youAreIn : h.continental.notIn,
                  ].join(' · ')}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-accent">
                {h.continental.showGroups}
                <Icon
                  name="chevron"
                  className="h-4 w-4 rotate-90 transition-transform group-open:-rotate-90"
                />
              </span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(14.375rem,1fr))] gap-3">
                {groups.map((_, group) => (
                  <li key={group} className="rounded-control bg-surface-soft p-3.5">
                    <h4 className="mb-2 text-xs font-extrabold tracking-[0.1em] text-muted uppercase">
                      {format(h.continental.groups, { letter: String.fromCharCode(65 + group) })}
                    </h4>
                    <ol className="grid gap-0.5">
                      {groupTable(world, cup, group).map((row, position) => {
                        const club = world.clubs[row.clubId];
                        const mine = row.clubId === own;
                        return (
                          <li
                            key={row.clubId}
                            className={cx(
                              'flex min-w-0 items-center gap-2 rounded-chip px-2 py-1 text-sm',
                              mine &&
                                'bg-accent-soft font-bold text-accent shadow-[inset_0_0_0_2px_var(--accent)]',
                            )}
                          >
                            <span className="w-3.5 shrink-0 text-xs font-bold text-muted">
                              {position + 1}
                            </span>
                            {club && (
                              <CrestImage
                                crest={club.crest}
                                alt=""
                                className="h-[1.4375rem] w-5 shrink-0"
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate">{club?.name}</span>
                            <span className="shrink-0 font-extrabold tabular-nums">
                              {row.points}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </li>
                ))}
              </ul>
              {cup.stages.length > 1 && (
                <div className="flex flex-col gap-2">
                  <h4 className="mt-1 text-xs font-extrabold tracking-[0.1em] text-muted uppercase">
                    {h.continental.knockouts}
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {cup.stages.slice(1).map((stage) => (
                      <div
                        key={stage.id}
                        className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1.5"
                      >
                        <p className="font-bold">
                          {h.continental.stageNames[stage.name] ?? stage.name}
                        </p>
                        <ul className="grid gap-1.5">
                          {stage.fixtureIds.map((id) => {
                            const fixture = world.fixtures[id];
                            if (!fixture) return null;
                            const result = world.results[id];
                            const mine = fixture.homeId === own || fixture.awayId === own;
                            const [home, away] = result?.score ?? [0, 0];
                            return (
                              <li
                                key={id}
                                className={cx(
                                  'flex min-w-0 items-center gap-2 rounded-control px-3 py-2 text-sm',
                                  mine
                                    ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]'
                                    : 'bg-surface-soft',
                                )}
                              >
                                <span
                                  className={cx(
                                    'min-w-0 flex-1 truncate text-right',
                                    result && home > away && 'font-bold',
                                  )}
                                >
                                  {world.clubs[fixture.homeId]?.name}
                                </span>
                                <span className="min-w-12 shrink-0 rounded-chip bg-surface px-2 text-center font-display text-lg leading-7">
                                  {result ? `${home}–${away}` : 'v'}
                                </span>
                                <span
                                  className={cx(
                                    'min-w-0 flex-1 truncate',
                                    result && away > home && 'font-bold',
                                  )}
                                >
                                  {world.clubs[fixture.awayId]?.name}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </Panel>
  );
}
