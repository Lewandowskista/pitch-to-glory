import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Avatar, Career, Challenge, Club, Player, World } from '../../model/domain';
import {
  availability,
  challengeDone,
  challengeProgress,
  COSMETIC_BY_ID,
  COSMETICS,
  type Availability,
  type CosmeticItem,
} from '../../engine/career/lifestyle';
import { renderAvatar } from '../../engine/assets/avatar';
import { renderDressedKit, renderSocksAndBoots } from '../../engine/assets/gear';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { CareerPage, ui } from './shared';
import { ActionError, BlockNote } from './marketUi';
import { CelebrationPreview, useChallengeRefresh, useLifestyleAction } from './lifestyleUi';
import { audio } from '../../audio';

type Action = ReturnType<typeof useLifestyleAction>;
const W = l.wardrobe;

export default function CareerWardrobe() {
  useChallengeRefresh();
  return (
    <CareerPage eyebrow={l.eyebrow} title={l.titles.wardrobe}>
      {({ world, career, player, club, age }) =>
        club ? (
          <WardrobeContent world={world} career={career} player={player} club={club} age={age} />
        ) : null
      }
    </CareerPage>
  );
}

function WardrobeContent({
  world,
  career,
  player,
  club,
  age,
}: {
  world: World;
  career: Career;
  player: Player;
  club: Club;
  age: number;
}) {
  const action = useLifestyleAction();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <Preview career={career} player={player} club={club} age={age} />
      <Challenges world={world} action={action} />
      <Look world={world} player={player} age={age} action={action} />
      <KitOptions world={world} career={career} action={action} />
      <Celebrations world={world} career={career} action={action} />
    </div>
  );
}

function Preview({
  career,
  player,
  club,
  age,
}: {
  career: Career;
  player: Player;
  club: Club;
  age: number;
}) {
  const equipped = career.style.equipped;
  const armband = COSMETIC_BY_ID[equipped.armband]?.colors ?? null;
  const portrait = useMemo(() => renderAvatar(player.avatar, age), [player.avatar, age]);
  const shirt = useMemo(
    () => renderDressedKit(club.kits.home, equipped.sleeves, armband),
    [club.kits.home, equipped.sleeves, armband],
  );
  const feet = useMemo(
    () =>
      renderSocksAndBoots(
        club.kits.home,
        equipped.socks,
        COSMETIC_BY_ID[equipped.boots]?.colors ?? ['#1d1d1f', '#ffffff'],
      ),
    [club.kits.home, equipped.socks, equipped.boots],
  );
  return (
    <section aria-labelledby="preview-heading" className={`${ui.panel} bg-art-blue lg:col-span-5`}>
      <h2 id="preview-heading" className={ui.heading}>
        {W.preview}
      </h2>
      <div className="mt-4 flex flex-col items-center gap-2">
        <Artwork svg={portrait} alt={player.name} className="h-36 w-36 rounded-full bg-surface" />
        <Artwork svg={shirt} alt={club.name} className="h-40 w-40" />
        <Artwork
          svg={feet}
          alt={format(W.previewAlt, {
            boots: W.bootNames[equipped.boots] ?? '',
            socks: W.sockNames[equipped.socks] ?? '',
          })}
          className="h-20 w-36"
        />
      </div>
      <p className="mt-4 text-center text-sm font-semibold">
        {format(W.tokens, { count: career.style.tokens })}
      </p>
      <p className="text-center text-xs text-muted">{W.tokensBody}</p>
    </section>
  );
}

function stateLabel(item: CosmeticItem, state: Availability): string {
  if (state === 'owned') return W.states.owned;
  if (state === 'fame') return W.states.fame;
  if (state === 'sponsor') return W.states.sponsor;
  if (state === 'tokens') return format(W.states.tokens, { tokens: item.tokens! });
  return item.brandId ? W.states.lockedSponsor : format(W.states.locked, { level: item.fameLevel });
}

/** A choice tile: equips when usable, offers a token unlock when for sale. */
function Tile({
  item,
  world,
  selected,
  label,
  children,
  onSelect,
  action,
}: {
  item: CosmeticItem | null;
  world: World;
  selected: boolean;
  label: string;
  children: ReactNode;
  onSelect: () => void;
  action: Action;
}) {
  const state = item ? availability(world, item) : 'owned';
  const usable = state === 'owned' || state === 'fame' || state === 'sponsor';
  const affordable = state === 'tokens' && world.career!.style.tokens >= (item?.tokens ?? Infinity);
  return (
    <li>
      <button
        aria-pressed={selected}
        aria-label={`${label}${item ? ` · ${stateLabel(item, state)}` : ''}`}
        disabled={Boolean(action.block) || (!usable && !affordable)}
        onClick={() => {
          if (usable) onSelect();
          else if (item && affordable && action.run({ type: 'buy-cosmetic', id: item.id }))
            audio.play('confirm');
        }}
        className={`flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-control border p-2 text-center transition ${
          selected
            ? 'border-accent bg-accent-soft'
            : 'border-line bg-surface-soft hover:border-accent'
        } ${usable || affordable ? '' : 'opacity-60'}`}
      >
        {children}
        <span className="text-[0.68rem] font-bold leading-tight">
          {selected ? W.equipped : item ? stateLabel(item, state) : ''}
        </span>
      </button>
    </li>
  );
}

function AvatarOption({ avatar, age, label }: { avatar: Avatar; age: number; label: string }) {
  const svg = useMemo(() => renderAvatar(avatar, age), [avatar, age]);
  return <Artwork svg={svg} alt={label} className="h-14 w-14 rounded-full bg-art-blue" />;
}

function Look({
  world,
  player,
  age,
  action,
}: {
  world: World;
  player: Player;
  age: number;
  action: Action;
}) {
  const slots = [
    { slot: 'hair', label: W.hair, option: W.hairOption, gated: true },
    { slot: 'hairColor', label: W.hairColor, option: W.hairColorOption, gated: false },
    { slot: 'facialHair', label: W.facialHair, option: W.facialHairOption, gated: false },
    { slot: 'accessory', label: W.accessory, option: W.accessoryOption, gated: true },
  ] as const;
  return (
    <section aria-labelledby="look-heading" className={`${ui.panel} lg:col-span-7`}>
      <h2 id="look-heading" className={ui.heading}>
        {W.look}
      </h2>
      <div className="mt-3 grid gap-3">
        <BlockNote block={action.block} />
        <ActionError error={action.error} />
      </div>
      {slots.map(({ slot, label, option, gated }) => (
        <div key={slot} className="mt-4">
          <h3 className="text-sm font-semibold">{label}</h3>
          <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label={label}>
            {Array.from({ length: 8 }, (_, value) => {
              const item = gated ? (COSMETIC_BY_ID[`${slot}:${value}`] ?? null) : null;
              const name = format(option, { number: value + 1 });
              return (
                <Tile
                  key={value}
                  item={item}
                  world={world}
                  selected={player.avatar[slot] === value}
                  label={name}
                  action={action}
                  onSelect={() => action.run({ type: 'wardrobe', change: { slot, value } })}
                >
                  <AvatarOption avatar={{ ...player.avatar, [slot]: value }} age={age} label="" />
                </Tile>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Swatch({ colors }: { colors: [string, string] }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-14 overflow-hidden rounded-control border border-line"
    >
      <span className="flex-1" style={{ background: colors[0] }} />
      <span className="w-3" style={{ background: colors[1] }} />
    </span>
  );
}

function KitOptions({ world, career, action }: { world: World; career: Career; action: Action }) {
  const equipped = career.style.equipped;
  const group = (
    kind: 'boots' | 'socks' | 'armband',
    label: string,
    names: Record<string, string>,
  ) => (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={label}>
        {COSMETICS.filter(
          (item) =>
            item.kind === kind && (!item.brandId || availability(world, item) === 'sponsor'),
        ).map((item) => (
          <Tile
            key={item.id}
            item={item}
            world={world}
            selected={equipped[kind] === item.id}
            label={names[item.id] ?? item.id}
            action={action}
            onSelect={() => action.run({ type: 'wardrobe', change: { slot: kind, id: item.id } })}
          >
            {item.colors ? <Swatch colors={item.colors} /> : null}
            <span className="text-xs font-semibold">{names[item.id]}</span>
          </Tile>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-labelledby="kit-heading" className={`${ui.panel} lg:col-span-5`}>
      <h2 id="kit-heading" className={ui.heading}>
        {W.kit}
      </h2>
      <fieldset className="mt-4" disabled={Boolean(action.block)}>
        <legend className="text-sm font-semibold">{W.sleeves}</legend>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-control bg-surface-soft p-1">
          {(['short', 'long'] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-[0.6rem] text-sm font-bold has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                className="sr-only"
                name="sleeves"
                checked={equipped.sleeves === value}
                onChange={() =>
                  action.run({ type: 'wardrobe', change: { slot: 'sleeves', value } })
                }
              />
              {W.sleeveNames[value]}
            </label>
          ))}
        </div>
      </fieldset>
      {group('boots', W.boots, W.bootNames)}
      {group('socks', W.socks, W.sockNames)}
      {group('armband', W.armband, W.armbandNames)}
    </section>
  );
}

function Celebrations({ world, career, action }: { world: World; career: Career; action: Action }) {
  const C = l.celebrations;
  return (
    <section aria-labelledby="celebrations-heading" className={`${ui.panel} lg:col-span-12`}>
      <h2 id="celebrations-heading" className={ui.heading}>
        {C.title}
      </h2>
      <p className={`${ui.muted} mt-1 max-w-prose`}>{C.body}</p>
      <p className="mt-2 text-sm font-semibold">
        {format(C.uses, { count: career.style.signatureUses })}
      </p>
      <ul
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        aria-label={C.title}
      >
        {COSMETICS.filter((item) => item.kind === 'celebration').map((item) => {
          const name = C.names[item.id] ?? item.id;
          return (
            <Tile
              key={item.id}
              item={item}
              world={world}
              selected={career.style.equipped.celebration === item.id}
              label={name}
              action={action}
              onSelect={() =>
                action.run({ type: 'wardrobe', change: { slot: 'celebration', id: item.id } })
              }
            >
              <CelebrationPreview motion={item.motion!} label={format(C.preview, { name })} />
              <span className="text-xs font-semibold">{name}</span>
            </Tile>
          );
        })}
      </ul>
    </section>
  );
}

function ChallengeRow({
  world,
  challenge,
  action,
}: {
  world: World;
  challenge: Challenge;
  action: Action;
}) {
  const [celebrate, setCelebrate] = useState(false);
  const done = challengeDone(world, challenge);
  const progress = challengeProgress(world, challenge);
  const reward = challenge.rewardCosmeticId
    ? format(l.challenges.rewardCosmetic, {
        tokens: challenge.rewardTokens,
        item: cosmeticName(challenge.rewardCosmeticId),
      })
    : format(l.challenges.reward, { tokens: challenge.rewardTokens });
  return (
    <li className="relative flex flex-col gap-2 rounded-control border border-line bg-surface-soft p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {format(l.challenges.kinds[challenge.kind], { target: challenge.target })}
        </span>
        <span className="shrink-0 text-xs font-bold text-muted">
          {format(l.challenges.progress, { progress, target: challenge.target })}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
        <span
          className={`block h-full rounded-full ${done ? 'bg-accent' : 'bg-gold'}`}
          style={{ width: `${(progress / challenge.target) * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">{reward}</span>
        {challenge.claimed ? (
          <span className={ui.chip}>{l.challenges.claimed}</span>
        ) : (
          <button
            className="button"
            disabled={!done || Boolean(action.block)}
            onClick={() => {
              if (action.run({ type: 'claim-challenge', id: challenge.id })) {
                setCelebrate(true);
                audio.play('reward');
              }
            }}
          >
            {l.challenges.claim}
          </button>
        )}
      </div>
      <AnimatePresence>
        {celebrate && (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            onAnimationComplete={() => window.setTimeout(() => setCelebrate(false), 1800)}
            className="text-sm font-bold text-accent"
          >
            {l.challenges.reward_got}
          </motion.p>
        )}
      </AnimatePresence>
    </li>
  );
}

function cosmeticName(id: string): string {
  return (
    l.celebrations.names[id] ??
    W.bootNames[id] ??
    W.sockNames[id] ??
    W.armbandNames[id] ??
    (id.startsWith('hair:')
      ? format(W.hairOption, { number: Number(id.split(':')[1]) + 1 })
      : id.startsWith('accessory:')
        ? format(W.accessoryOption, { number: Number(id.split(':')[1]) + 1 })
        : id)
  );
}

function Challenges({ world, action }: { world: World; action: Action }) {
  return (
    <section aria-labelledby="challenges-heading" className={`${ui.panel} lg:col-span-7`}>
      <h2 id="challenges-heading" className={ui.heading}>
        {l.challenges.title}
      </h2>
      <p className={`${ui.muted} mt-1`}>{l.challenges.body}</p>
      {(['daily', 'weekly'] as const).map((cadence) => (
        <div key={cadence} className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
            {l.challenges[cadence]}
          </h3>
          <ul className="mt-2 grid gap-2">
            {world.challenges
              .filter((challenge) => challenge.cadence === cadence)
              .map((challenge) => (
                <ChallengeRow
                  key={challenge.id}
                  world={world}
                  challenge={challenge}
                  action={action}
                />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
