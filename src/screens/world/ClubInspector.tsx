import { useMemo, useState } from 'react';
import type { Avatar, Club, Player, World } from '../../model/domain';
import { format, t } from '../../i18n';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { Chip, Disclosure, OverallBadge, cx } from '../../ui/kit';
import { foundedYear, renderCrest } from '../../engine/assets/crest';
import { renderKit } from '../../engine/assets/kit';
import { clubDress, renderAvatar, type AvatarDress } from '../../engine/assets/avatar';
import { kitArt } from '../../ui/kitArt';
import { overallRating } from '../../engine/strength';

const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
/** Rows shown before "Show all players"; the selected player always stays in view. */
const SQUAD_PREVIEW = 8;
/** The same overall rating the career screens show (position-weighted, not a plain mean). */
const ability = (player: Player): number => overallRating(player);

function Portrait({
  avatar,
  age,
  dress,
  className,
}: {
  avatar: Avatar;
  age: number;
  dress: AvatarDress;
  className: string;
}) {
  const svg = useMemo(() => renderAvatar(avatar, Math.min(110, age), dress), [avatar, age, dress]);
  return <Artwork svg={svg} alt="" className={cx('shrink-0 rounded-full', className)} />;
}

export function ClubInspector({
  world,
  club,
  selectedPlayer,
  onPlayer,
}: {
  world: World;
  club: Club;
  selectedPlayer?: string;
  onPlayer(id: string): void;
}) {
  const manager = world.managers[club.managerId]!;
  const founded = foundedYear(club);
  const squad = club.playerIds.map((id) => world.players[id]!);
  const dress = useMemo(() => clubDress(club), [club]);
  const player = squad.find((player) => player.id === selectedPlayer) ?? squad[0]!;
  const age = (player: Player) => world.date.season - player.birthSeason;
  const money = (value: number) => format(t.world.money, { amount: integer.format(value) });
  const crest = useMemo(() => renderCrest(club.crest, { founded }), [club.crest, founded]);
  const cultures: string[] = [
    club.youthFocus >= 60 && t.world.youth,
    club.culture.winNow >= 65 && t.world.winNow,
    club.culture.fanOwned && t.world.fanOwned,
    club.culture.discipline >= 70 && t.world.disciplined,
    club.culture.attacking >= 70 && t.world.attacking,
  ].filter((name) => name !== false);
  const reputation = Math.max(0, Math.min(100, club.reputation));
  return (
    <aside
      className="club-inspector ui-card flex flex-col gap-[1.125rem] rounded-panel border border-line bg-surface p-panel shadow-surface sm:p-6"
      id="club-inspector"
      aria-label={t.world.inspect}
    >
      <header className="club-identity flex items-center gap-4">
        <Artwork svg={crest} alt="" className="h-[5.625rem] w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold tracking-[0.14em] break-words text-muted uppercase">
            {club.city}
          </p>
          <h2
            id="club-inspector-heading"
            tabIndex={-1}
            className="mt-0.5 font-display text-[2.25rem] leading-[0.95] font-normal break-words sm:text-[2.5rem]"
          >
            {club.name}
          </h2>
          <div className="mt-1.5 flex items-center gap-2.5 text-[0.8125rem]">
            <span className="text-muted">{t.world.reputation}</span>
            <strong>{club.reputation}</strong>
            <span
              aria-hidden="true"
              className="h-1.5 max-w-[7.5rem] flex-1 overflow-hidden rounded-full bg-track"
            >
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${reputation}%` }}
              />
            </span>
          </div>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {format(t.world.founded, { year: founded })}
          </p>
        </div>
      </header>
      <div className="club-kits grid grid-cols-3 gap-2">
        {(['home', 'away', 'third'] as const).map((type) => (
          <KitFigure key={type} club={club} type={type} />
        ))}
      </div>
      <dl className="club-details grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t.world.stadium}</dt>
          <dd className="font-bold break-words">
            {club.stadium.name}
            <small className="block text-xs font-medium text-muted">
              {format(t.world.capacity, { count: integer.format(club.stadium.capacity) })}
            </small>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t.world.style}</dt>
          <dd className="font-bold">
            {t.world.styles[club.playingStyle as keyof typeof t.world.styles]}
          </dd>
        </div>
      </dl>
      <div className="manager-line flex items-center gap-3 rounded-control bg-surface-soft px-3 py-2.5">
        <Portrait
          avatar={manager.avatar}
          age={manager.age}
          dress={dress}
          className="h-[3.25rem] w-[3.25rem]"
        />
        <div className="min-w-0 flex-1">
          <span className="block text-xs text-muted">{t.world.manager}</span>
          <strong className="block break-words">{manager.name}</strong>
        </div>
        <span className="rounded-chip border border-line bg-surface px-2.5 py-1 text-[0.8125rem] font-extrabold">
          <span className="sr-only">{t.world.formation}: </span>
          {manager.preferredFormation}
        </span>
      </div>
      {cultures.length > 0 && (
        <ul className="culture-tags flex flex-wrap gap-2" aria-label={t.world.cultures}>
          {cultures.map((name) => (
            <li key={name}>
              <Chip>{name}</Chip>
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary={t.world.finances} className="finance-details">
        <dl className="club-details">
          {(
            [
              [t.world.balance, club.finances.balance],
              [t.world.wageBudget, club.finances.wageBudget],
              [t.world.transferBudget, club.finances.transferBudget],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
            >
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-semibold tabular-nums">{money(value)}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
      <SquadTable
        key={club.id}
        world={world}
        club={club}
        squad={squad}
        selected={player.id}
        onPlayer={onPlayer}
        dress={dress}
      />
      <PlayerInspect player={player} age={age(player)} dress={dress} />
    </aside>
  );
}

function KitFigure({ club, type }: { club: Club; type: 'home' | 'away' | 'third' }) {
  const kit = club.kits[type];
  const svg = useMemo(() => renderKit(kit, kitArt(kit, club.crest)), [kit, club.crest]);
  return (
    <figure className="flex min-w-0 flex-col items-center gap-1 rounded-control bg-surface-soft px-1.5 pt-2.5 pb-2">
      <Artwork
        svg={svg}
        alt={format(t.gallery.kitAlt, { name: club.name, type: t.gallery[type] })}
        className="aspect-square w-full max-w-[5.5rem]"
      />
      <figcaption className="text-xs font-bold">{t.gallery[type]}</figcaption>
    </figure>
  );
}

function SquadTable({
  world,
  club,
  squad,
  selected,
  onPlayer,
  dress,
}: {
  world: World;
  club: Club;
  squad: Player[];
  selected: string;
  onPlayer(id: string): void;
  dress: AvatarDress;
}) {
  const [showAll, setShowAll] = useState(false);
  const age = (player: Player) => world.date.season - player.birthSeason;
  const collapsible = squad.length > SQUAD_PREVIEW;
  return (
    <section aria-labelledby="squad-heading">
      <h3
        id="squad-heading"
        className="squad-heading mb-1.5 flex items-center gap-2 text-[0.9375rem] font-extrabold"
      >
        {t.world.squad}
        <span className="rounded-full bg-surface-soft px-2.5 py-px text-xs text-muted">
          {squad.length}
        </span>
      </h3>
      <div className="table-scroll">
        <table className="squad-table">
          <caption className="sr-only">
            {club.name} · {t.world.squad}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="squad-number">
                <abbr title={t.world.squadNumber} className="no-underline">
                  #
                </abbr>
              </th>
              <th scope="col">{t.world.player}</th>
              <th scope="col" className="num">
                {t.world.age}
              </th>
              <th scope="col" className="num" title={t.world.position}>
                {t.world.position}
              </th>
              <th scope="col" className="num">
                {t.world.ability}
              </th>
              <th scope="col" className="num">
                {t.world.goals}
              </th>
            </tr>
          </thead>
          <tbody>
            {squad.map((member, index) => (
              <tr
                key={member.id}
                className={member.id === selected ? 'selected-row' : undefined}
                hidden={collapsible && !showAll && index >= SQUAD_PREVIEW && member.id !== selected}
              >
                <td className="squad-number">{member.squadNumber}</td>
                <th scope="row">
                  <button
                    type="button"
                    className="club-button"
                    onClick={() => onPlayer(member.id)}
                    aria-pressed={member.id === selected}
                  >
                    <Portrait
                      avatar={member.avatar}
                      age={age(member)}
                      dress={dress}
                      className="squad-portrait h-[1.875rem] w-[1.875rem]"
                    />
                    <span className="min-w-0">{member.name}</span>
                  </button>
                </th>
                <td className="num">{age(member)}</td>
                <td className="num font-bold">{member.primaryPosition}</td>
                <td className="num">{ability(member)}</td>
                <td className="num">{member.stats.goals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {collapsible && (
        <button
          type="button"
          className="mt-1.5 inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-4"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? t.world.showFewer : format(t.world.showSquad, { count: squad.length })}
        </button>
      )}
    </section>
  );
}

const ATTRIBUTE_GROUPS = [
  [
    'technical',
    [
      'finishing',
      'passing',
      'dribbling',
      'firstTouch',
      'crossing',
      'heading',
      'tackling',
      'longShots',
      'setPieces',
    ],
  ],
  ['physical', ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping']],
  [
    'mental',
    ['vision', 'composure', 'positioning', 'decisions', 'workRate', 'leadership', 'aggression'],
  ],
] as const;

function PlayerInspect({
  player,
  age,
  dress,
}: {
  player: Player;
  age: number;
  dress: AvatarDress;
}) {
  const groups: [string, readonly string[]][] = [
    ...ATTRIBUTE_GROUPS.map(([key, keys]) => [t.world[key], keys] as [string, readonly string[]]),
    ...(player.primaryPosition === 'GK'
      ? [[t.world.keeper, Object.keys(player.keeperAttributes)] as [string, string[]]]
      : []),
  ];
  const attributes: Record<string, number> = { ...player.attributes, ...player.keeperAttributes };
  const tiles = [
    [t.world.potential, player.potential, true],
    [t.world.fitness, player.fitness, false],
    [t.world.form, player.form, false],
  ] as const;
  return (
    <section
      className="player-inspect flex flex-col gap-3.5 rounded-panel bg-night p-[1.125rem] text-night-ink"
      aria-labelledby="player-inspect-name"
    >
      <header className="flex items-center gap-3.5">
        <Portrait
          avatar={player.avatar}
          age={age}
          dress={dress}
          className="h-16 w-16 bg-night-raised"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-extrabold tracking-[0.14em] text-mint uppercase">
            {t.world.playerDetail}
          </p>
          <h3
            id="player-inspect-name"
            className="font-display text-[1.875rem] leading-none font-normal break-words"
          >
            {player.name}
          </h3>
          <p className="text-[0.8125rem] text-night-muted">
            {format(t.world.playerLine, {
              number: player.squadNumber,
              position: player.primaryPosition,
              age,
            })}
          </p>
        </div>
        <OverallBadge player={player} size="sm" />
      </header>
      <dl className="player-overview grid grid-cols-3 gap-2 text-center">
        {tiles.map(([label, value, gold]) => (
          <div key={label} className="rounded-control bg-night-raised px-1 py-2">
            <dt className="text-[0.6875rem] font-bold text-night-muted">{label}</dt>
            <dd
              className={cx(
                'font-display text-[1.875rem] leading-none',
                gold ? 'text-gold' : 'text-night-ink',
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="player-foot text-[0.8125rem] text-night-muted">
        {t.world.foot}: {t.world.feet[player.foot]}
      </p>
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold text-mint underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          <Icon
            name="chevron"
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
          />
          {t.world.allAttributes}
        </summary>
        <div className="attribute-groups mt-1 grid gap-x-7 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
          {groups.map(([title, keys]) => (
            <div key={title} className="min-w-0">
              <h4 className="mt-2 mb-1.5 text-[0.8125rem] font-extrabold text-mint">{title}</h4>
              <dl>
                {keys.map((key) => {
                  const value = attributes[key] ?? 0;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2.5 border-b border-night-line py-1.5"
                    >
                      <dt className="min-w-0 flex-1 text-[0.8125rem] font-semibold">
                        {t.world.attributes[key as keyof typeof t.world.attributes]}
                      </dt>
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-night-raised"
                      >
                        <span
                          className={cx(
                            'block h-full rounded-full',
                            value >= 70
                              ? 'bg-mint'
                              : value >= 50
                                ? 'bg-night-ink/60'
                                : 'bg-night-muted/45',
                          )}
                          style={{ width: `${Math.min(99, value)}%` }}
                        />
                      </span>
                      <dd className="w-7 text-right font-display text-[1.375rem] leading-none">
                        {value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
