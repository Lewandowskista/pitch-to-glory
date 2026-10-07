import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import type { Avatar, Career, Challenge, Club, Kit, Player, World } from '../../model/domain';
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
import { CareerPage, plural, ui } from './shared';
import { ActionError, BlockNote } from './marketUi';
import { CelebrationPreview, useChallengeRefresh, useLifestyleAction } from './lifestyleUi';
import { Glyph } from './honoursUi';
import { audio } from '../../audio';

type Action = ReturnType<typeof useLifestyleAction>;
const W = l.wardrobe;
/** Facial hair fades in with age, so its options are previewed on an older face. */
const FACIAL_HAIR_PREVIEW_AGE = 26;

export default function CareerWardrobe() {
  useChallengeRefresh();
  return (
    <CareerPage title={l.titles.wardrobe}>
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
  // The preview spans every row of the left column and stays in view while choosing.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
      <Preview career={career} player={player} club={club} age={age} />
      <Challenges world={world} action={action} />
      <Look world={world} player={player} age={age} action={action} />
      <KitOptions world={world} career={career} kit={club.kits.home} action={action} />
      <Celebrations world={world} career={career} action={action} />
    </div>
  );
}

/** Plain shorts in the kit colours, joining the shirt to the socks in the preview figure. */
function shortsSvg(kit: Kit): string {
  const [base, accent] = kit.colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" fill="none"><path d="M4 0H96L100 36H56L50 18L44 36H0Z" fill="${base}" stroke="#182a35" stroke-opacity=".25" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 3L5 33M92 3L95 33" stroke="${accent}" stroke-width="3"/></svg>`;
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
  const kit = club.kits.home;
  const armband = COSMETIC_BY_ID[equipped.armband]?.colors ?? null;
  const portrait = useMemo(() => renderAvatar(player.avatar, age), [player.avatar, age]);
  const shirt = useMemo(
    () => renderDressedKit(kit, equipped.sleeves, armband),
    [kit, equipped.sleeves, armband],
  );
  const shorts = useMemo(() => shortsSvg(kit), [kit]);
  const feet = useMemo(
    () =>
      renderSocksAndBoots(
        kit,
        equipped.socks,
        COSMETIC_BY_ID[equipped.boots]?.colors ?? ['#1d1d1f', '#ffffff'],
      ),
    [kit, equipped.socks, equipped.boots],
  );
  const tokens = career.style.tokens;
  // One figure built from the head, shirt, shorts and socks/boots artwork. Percentage margins
  // resolve against the figure's width, so the pieces overlap the same way at every size:
  // the shirt collar covers the neck, the shirt hem the shorts, the shorts the sock tops.
  return (
    <section
      aria-labelledby="preview-heading"
      className={`${ui.panel} bg-art-blue lg:sticky lg:top-6 lg:col-span-4 lg:row-span-4`}
    >
      <h2 id="preview-heading" className={ui.heading}>
        {W.preview}
      </h2>
      <div
        role="img"
        aria-label={`${player.name}. ${format(W.previewAlt, {
          boots: W.bootNames[equipped.boots] ?? '',
          socks: W.sockNames[equipped.socks] ?? '',
        })}`}
        className="mx-auto mt-4 w-36 sm:w-44 lg:w-48"
      >
        <div className="relative z-0 mx-auto w-[95%] overflow-hidden [aspect-ratio:200/166]">
          <Artwork svg={portrait} alt="" className="block w-full" />
        </div>
        <Artwork svg={shirt} alt="" className="relative z-20 -mt-[22.5%] block w-full" />
        <Artwork svg={shorts} alt="" className="relative z-10 mx-auto -mt-[15%] block w-[52%]" />
        <Artwork svg={feet} alt="" className="relative z-0 -mt-[6%] ml-[23%] block w-[61%]" />
        <span
          aria-hidden="true"
          className="mx-auto -mt-[3%] block h-3 w-3/4 rounded-[50%] bg-ink/10"
        />
      </div>
      <p className="mt-4 text-center font-display text-2xl leading-none">
        {plural(tokens, W.tokensOne, W.tokens)}
      </p>
      <p className="mx-auto mt-1 max-w-xs text-center text-xs text-muted">{W.tokensBody}</p>
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

/**
 * A choice tile: equips when usable, offers a token unlock when for sale. Only the selected
 * tile and locked tiles carry a status line; locked tiles show a lock and what opens them.
 */
function Tile({
  item,
  world,
  selected,
  selectedLabel = W.equipped,
  label,
  children,
  onSelect,
  action,
}: {
  item: CosmeticItem | null;
  world: World;
  selected: boolean;
  selectedLabel?: string;
  label: string;
  children: ReactNode;
  onSelect: () => void;
  action: Action;
}) {
  const state = item ? availability(world, item) : 'owned';
  const usable = state === 'owned' || state === 'fame' || state === 'sponsor';
  const affordable = state === 'tokens' && world.career!.style.tokens >= (item?.tokens ?? Infinity);
  const status = selected ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
      <Glyph name="check" className="h-3.5 w-3.5" />
      {selectedLabel}
    </span>
  ) : usable || !item ? null : (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-tight font-bold ${
        affordable ? 'bg-accent text-on-accent' : 'bg-surface text-muted'
      }`}
    >
      <Glyph name="lock" className="h-3.5 w-3.5" />
      {state === 'tokens' ? format(W.price, { tokens: item.tokens! }) : stateLabel(item, state)}
    </span>
  );
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
        className={`group flex h-full min-h-24 w-full flex-col items-center justify-center gap-1 rounded-control border-2 p-2 text-center transition disabled:cursor-not-allowed ${
          selected
            ? 'border-accent bg-accent-soft'
            : usable || affordable
              ? 'border-transparent bg-surface-soft hover:border-accent'
              : 'border-dashed border-line bg-surface-soft'
        }`}
      >
        {children}
        {status}
      </button>
    </li>
  );
}

/** The lower face, where facial hair differs: a whole head hides it at thumbnail size. */
const LOWER_FACE = 'viewBox="46 74 108 108"';
function AvatarOption({ avatar, age, face }: { avatar: Avatar; age: number; face?: boolean }) {
  const svg = useMemo(() => {
    const art = renderAvatar(avatar, age);
    return face ? art.replace(/viewBox="[^"]*"/, LOWER_FACE) : art;
  }, [avatar, age, face]);
  return <Artwork svg={svg} alt="" className="h-14 w-14 rounded-full bg-art-blue" />;
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
  const beardAge = Math.max(age, FACIAL_HAIR_PREVIEW_AGE);
  return (
    <section aria-labelledby="look-heading" className={`${ui.panel} lg:col-span-8`}>
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
          {slot === 'facialHair' && beardAge > age && (
            <p className="mt-0.5 text-xs text-muted">
              {format(W.facialHairNote, { age: beardAge })}
            </p>
          )}
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
                  <AvatarOption
                    avatar={{ ...player.avatar, [slot]: value }}
                    age={slot === 'facialHair' ? beardAge : age}
                    face={slot === 'facialHair'}
                  />
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

/** A small sock in the club's colours showing the option's style, sized like a swatch. */
function SockGlyph({ id, kit }: { id: string; kit: Kit }) {
  const [base, accent] = kit.colors;
  const pattern: Record<string, ReactNode> = {
    'socks:rolled': <path d="M19 15H37" stroke={base} strokeWidth="5" />,
    'socks:taped': <path d="M21 22H35M21 26H35" stroke="#f5f5f5" strokeWidth="2.5" />,
    'socks:high': <path d="M21 1H35V6H21Z" fill={base} />,
    'socks:striped': <path d="M21 9H35M21 15H35M21 21H35" stroke={base} strokeWidth="2.5" />,
  };
  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-14 place-items-center overflow-hidden rounded-control border border-line bg-surface"
    >
      <svg viewBox="0 0 56 40" className="h-10 w-14">
        <path
          d="M21 3H35V27Q35 31 39 32L45 34Q49 35 49 38V40H21Z"
          fill={accent}
          stroke="#182a35"
          strokeOpacity=".3"
          strokeWidth="1"
        />
        {pattern[id] ?? null}
      </svg>
    </span>
  );
}

function KitOptions({
  world,
  career,
  kit,
  action,
}: {
  world: World;
  career: Career;
  kit: Kit;
  action: Action;
}) {
  const equipped = career.style.equipped;
  const group = (
    kind: 'boots' | 'socks' | 'armband',
    label: string,
    names: Record<string, string>,
  ) => (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">{label}</h3>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5" aria-label={label}>
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
            {item.colors ? (
              <Swatch colors={item.colors} />
            ) : kind === 'socks' ? (
              <SockGlyph id={item.id} kit={kit} />
            ) : null}
            <span className="text-xs leading-tight font-semibold">{names[item.id]}</span>
          </Tile>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-labelledby="kit-heading" className={`${ui.panel} lg:col-span-8`}>
      <h2 id="kit-heading" className={ui.heading}>
        {W.kit}
      </h2>
      <fieldset className="mt-4" disabled={Boolean(action.block)}>
        <legend className="text-sm font-semibold">{W.sleeves}</legend>
        <div className="mt-2 grid max-w-sm grid-cols-2 gap-1 rounded-control bg-surface-soft p-1">
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
    <section aria-labelledby="celebrations-heading" className={`${ui.panel} lg:col-span-8`}>
      <h2 id="celebrations-heading" className={ui.heading}>
        {C.title}
      </h2>
      <p className={`${ui.muted} mt-1 max-w-prose`}>{C.body}</p>
      <p className="mt-2 text-sm font-semibold">
        {plural(career.style.signatureUses, C.usesOne, C.uses)}
      </p>
      <ul
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
        aria-label={C.title}
      >
        {COSMETICS.filter((item) => item.kind === 'celebration').map((item) => {
          const name = C.names[item.id] ?? item.id;
          const selected = career.style.equipped.celebration === item.id;
          return (
            <Tile
              key={item.id}
              item={item}
              world={world}
              selected={selected}
              selectedLabel={C.signature}
              label={name}
              action={action}
              onSelect={() =>
                action.run({ type: 'wardrobe', change: { slot: 'celebration', id: item.id } })
              }
            >
              <CelebrationPreview
                motion={item.motion!}
                label={format(C.preview, { name })}
                onHover={!selected}
              />
              <span className="text-sm leading-tight font-semibold">{name}</span>
              <span className="text-xs leading-snug text-muted">{C.descriptions[item.id]}</span>
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
  const progress = Math.min(challengeProgress(world, challenge), challenge.target);
  const left = challenge.target - progress;
  const reward = challenge.rewardCosmeticId
    ? format(l.challenges.rewardCosmetic, {
        tokens: challenge.rewardTokens,
        item: cosmeticName(challenge.rewardCosmeticId),
      })
    : format(l.challenges.reward, { tokens: challenge.rewardTokens });
  const ready = done && !challenge.claimed;
  return (
    <li
      className={`relative flex flex-col gap-2 rounded-control border p-3 ${
        ready ? 'border-accent bg-accent-soft' : 'border-line bg-surface-soft'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {format(
            challenge.target === 1
              ? l.challenges.kindsOne[challenge.kind]
              : l.challenges.kinds[challenge.kind],
            { target: challenge.target },
          )}
        </span>
        <span className="shrink-0 text-xs font-bold text-muted">
          {format(l.challenges.progress, { progress, target: challenge.target })}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-xs text-muted">{reward}</span>
        {challenge.claimed ? (
          <span className={ui.chip}>
            <Glyph name="check" className="h-3.5 w-3.5" />
            {l.challenges.claimed}
          </span>
        ) : done ? (
          <button
            className="button"
            disabled={Boolean(action.block)}
            onClick={() => {
              if (action.run({ type: 'claim-challenge', id: challenge.id })) {
                setCelebrate(true);
                audio.play('reward');
              }
            }}
          >
            {l.challenges.claim}
          </button>
        ) : (
          <span className="text-xs font-bold">
            {plural(left, l.challenges.toGoOne, l.challenges.toGo)}
          </span>
        )}
      </div>
      {!done && (
        <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-meter-gold"
            style={{ width: `${(progress / challenge.target) * 100}%` }}
          />
        </div>
      )}
      <AnimatePresence>
        {celebrate && (
          <m.p
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            onAnimationComplete={() => window.setTimeout(() => setCelebrate(false), 1800)}
            className="text-sm font-bold text-accent"
          >
            {l.challenges.reward_got}
          </m.p>
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
    <section aria-labelledby="challenges-heading" className={`${ui.panel} lg:col-span-8`}>
      <h2 id="challenges-heading" className={ui.heading}>
        {l.challenges.title}
      </h2>
      <p className={`${ui.muted} mt-1`}>{l.challenges.body}</p>
      <div className="grid gap-x-4 xl:grid-cols-2">
        {(['daily', 'weekly'] as const).map((cadence) => (
          <div key={cadence} className="mt-4">
            <h3 className="text-sm font-semibold">{l.challenges[cadence]}</h3>
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
      </div>
    </section>
  );
}
