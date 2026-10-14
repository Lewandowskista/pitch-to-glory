import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import type { Avatar, Career, Challenge, Club, Kit, Player, World } from '../../model/domain';
import {
  availability,
  bootsDeal,
  BRAND_BY_ID,
  challengeDone,
  challengeProgress,
  COSMETIC_BY_ID,
  COSMETICS,
  dealFailureCost,
  sponsorBoots,
  type Availability,
  type CosmeticItem,
} from '../../engine/career/lifestyle';
import { AVATAR_OPTIONS, clubDress, renderAvatar } from '../../engine/assets/avatar';
import { renderFigure } from '../../engine/assets/gear';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { Button, CardTitle, Chip, Panel, cx } from '../../ui/kit';
import { CareerPage, filterButton, plural, ui, useSaveLink } from './shared';
import { ActionError, BlockNote, money } from './marketUi';
import { useChallengeRefresh, useLifestyleAction } from './lifestyleUi';
import { CelebrationPreview } from './CelebrationPreview';
import { LifeIcon, TokenCoin } from './lifeIcons';
import { audio } from '../../audio';
import { CONFIG } from '../../engine/config';
import { Dialog } from '../../ui/Dialog';
import { useUrlDialog } from './useUrlDialog';

type Action = ReturnType<typeof useLifestyleAction>;
const W = l.wardrobe;
const C = l.celebrations;
/** Facial hair fades in with age, so its options are previewed on an older face. */
const FACIAL_HAIR_PREVIEW_AGE = 26;

export default function CareerWardrobe() {
  useChallengeRefresh();
  return (
    <CareerPage title={l.titles.wardrobe} description={W.intro}>
      {({ world, career, player, club, age }) =>
        club ? (
          <WardrobeContent world={world} career={career} player={player} club={club} age={age} />
        ) : null
      }
    </CareerPage>
  );
}

const SECTIONS = ['challenges', 'look', 'kit', 'celebrations'] as const;

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
  const [params, setParams] = useSearchParams();
  // One section at a time or all of them (the default), kept in the URL.
  const chosen = SECTIONS.find((section) => section === params.get('show'));
  const visible = (section: (typeof SECTIONS)[number]) => !chosen || chosen === section;
  const show = (section: (typeof SECTIONS)[number] | null) => {
    const next = new URLSearchParams(params);
    if (section) next.set('show', section);
    else next.delete('show');
    setParams(next, { replace: true });
  };
  const names = {
    challenges: l.challenges.title,
    look: W.look,
    kit: W.kit,
    celebrations: C.title,
  } as const;
  // The preview stays in view beside the choices on wide screens.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(17rem,1fr)_minmax(0,2.6fr)]">
      <Preview career={career} player={player} club={club} age={age} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <div role="group" aria-label={W.sections} className={ui.filters}>
          {[null, ...SECTIONS].map((section) => {
            const pressed = (section ?? undefined) === chosen;
            return (
              <button
                key={section ?? 'all'}
                aria-pressed={pressed}
                onClick={() => show(section)}
                className={filterButton(pressed)}
              >
                {section ? names[section] : W.allSections}
              </button>
            );
          })}
        </div>
        {visible('challenges') && <Challenges world={world} action={action} />}
        {visible('look') && (
          <Look world={world} player={player} club={club} age={age} action={action} />
        )}
        {visible('kit') && (
          <KitOptions world={world} career={career} kit={club.kits.home} action={action} />
        )}
        {visible('celebrations') && (
          <Celebrations world={world} career={career} kit={club.kits.home} action={action} />
        )}
      </div>
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
  const kit = club.kits.home;
  const armband = COSMETIC_BY_ID[equipped.armband]?.colors ?? null;
  const boots = COSMETIC_BY_ID[equipped.boots]?.colors ?? null;
  // One figure, head to boots, in the club's home kit.
  const figure = useMemo(
    () =>
      renderFigure(player.avatar, age, {
        kit,
        crest: club.crest,
        sleeves: equipped.sleeves,
        armband,
        socks: equipped.socks,
        boots: boots ?? ['#1d1d1f', '#ffffff'],
      }),
    [player.avatar, age, kit, club.crest, equipped.sleeves, armband, equipped.socks, boots],
  );
  const tokens = career.style.tokens;
  const summary: [string, string][] = [
    [W.summaryLabels.boots, W.bootNames[equipped.boots] ?? ''],
    [W.summaryLabels.socks, W.sockNames[equipped.socks] ?? ''],
    [W.summaryLabels.sleeves, W.sleeveNames[equipped.sleeves]],
    [W.summaryLabels.armband, W.armbandNames[equipped.armband] ?? ''],
    [
      W.summaryLabels.celebration,
      equipped.celebration ? (C.names[equipped.celebration] ?? '') : C.none,
    ],
  ];
  return (
    <Panel
      tone="blue"
      aria-labelledby="preview-heading"
      className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 xl:sticky xl:top-6"
    >
      <CardTitle id="preview-heading" className="w-full">
        {W.preview}
      </CardTitle>
      <Artwork
        svg={figure}
        alt={`${player.name}. ${format(W.previewAlt, {
          boots: W.bootNames[equipped.boots] ?? '',
          socks: W.sockNames[equipped.socks] ?? '',
        })}`}
        className="block w-28 shrink-0 sm:w-40 xl:w-[12.5rem]"
      />
      <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-3.5 xl:items-center">
        <div className="xl:text-center">
          <p className="inline-flex items-center gap-2 font-display text-[2rem] leading-none">
            <TokenCoin className="h-[1.625rem] w-[1.625rem]" />
            {plural(tokens, W.tokensOne, W.tokens)}
          </p>
          <p className="mt-1 max-w-[16.25rem] text-[0.8125rem] text-info xl:mx-auto">
            {W.tokensBody}
          </p>
        </div>
        <h3 className="sr-only">{W.summary}</h3>
        <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-control bg-surface px-3.5 py-3 text-[0.8125rem]">
          {summary.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
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
 * A choice tile in one of four states: worn (selected), yours to wear, for sale for tokens, or
 * locked. Only the worn tile and the ones you cannot wear yet carry a status line; those show a
 * lock and what opens them. Equips when usable, buys with tokens when affordable.
 */
function Tile({
  item,
  world,
  selected,
  selectedLabel = W.equipped,
  signature = false,
  label,
  children,
  onSelect,
  action,
  size,
}: {
  item: CosmeticItem | null;
  world: World;
  selected: boolean;
  selectedLabel?: string;
  /** The selected celebration wears a gold "Signature" chip instead of the green tick. */
  signature?: boolean;
  label: string;
  children: ReactNode;
  onSelect: () => void;
  action: Action;
  size: 'look' | 'kit' | 'celebration';
}) {
  const state = item ? availability(world, item) : 'owned';
  const usable = state === 'owned' || state === 'fame' || state === 'sponsor';
  const affordable = state === 'tokens' && world.career!.style.tokens >= (item?.tokens ?? Infinity);
  const status = selected ? (
    signature ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-0.5 text-xs font-extrabold text-on-gold">
        <LifeIcon name="check" className="h-3 w-3" />
        {selectedLabel}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[0.6875rem] font-extrabold text-accent">
        <LifeIcon name="check" className="h-3 w-3" />
        {selectedLabel}
      </span>
    )
  ) : usable || !item ? null : (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-px text-[0.6875rem] leading-snug font-extrabold',
        affordable ? 'bg-accent text-on-accent' : 'border border-line bg-surface text-muted',
      )}
    >
      {state === 'tokens' && size === 'look' ? (
        // Narrow look tiles: the coin stands for "tokens" (the button's name says it in full).
        <>
          <TokenCoin className="h-3 w-3" />
          <span className="whitespace-nowrap tabular-nums">{item.tokens}</span>
        </>
      ) : (
        <>
          <LifeIcon name="lock" className="h-3 w-3" />
          {state === 'tokens' ? format(W.price, { tokens: item.tokens! }) : stateLabel(item, state)}
        </>
      )}
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
        // A locked tile keeps its name and price at full contrast; only the artwork recedes.
        className={cx(
          'group flex h-full w-full flex-col items-center gap-1.5 rounded-control border-2 px-1.5 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-100 [&:disabled_.tile-art]:opacity-60',
          size === 'look' && 'min-h-24 justify-center',
          size === 'kit' && 'min-h-28 justify-center',
          size === 'celebration' && 'min-h-[12.5rem] justify-start px-2.5 py-2.5',
          selected
            ? 'border-accent bg-accent-soft'
            : usable || affordable
              ? 'border-transparent bg-surface-soft hover:border-accent'
              : 'border-dashed border-line bg-surface-soft',
        )}
      >
        {children}
        {status}
      </button>
    </li>
  );
}

/** The lower face, where facial hair differs: a whole head hides it at thumbnail size. */
const LOWER_FACE = 'viewBox="54 80 92 92"';
function AvatarOption({
  avatar,
  age,
  club,
  face,
}: {
  avatar: Avatar;
  age: number;
  club: Club;
  face?: boolean;
}) {
  const svg = useMemo(() => {
    const art = renderAvatar(avatar, age, clubDress(club));
    return face ? art.replace(/viewBox="[^"]*"/, LOWER_FACE) : art;
  }, [avatar, age, club, face]);
  // The portrait draws its own disc; the lower-face crop is rounded to match.
  return (
    <Artwork svg={svg} alt="" className={`tile-art h-14 w-14${face ? ' rounded-full' : ''}`} />
  );
}

/** A card section with its Bebas title and optional detail beside it. */
function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id={id} size="lg">
          {title}
        </CardTitle>
        {aside}
      </div>
      {children}
    </Panel>
  );
}

function Look({
  world,
  player,
  club,
  age,
  action,
}: {
  world: World;
  player: Player;
  club: Club;
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
    <Section id="look-heading" title={W.look}>
      <BlockNote block={action.block} />
      <ActionError error={action.error} />
      {slots.map(({ slot, label, option, gated }) => (
        <div key={slot}>
          <h3 className="text-sm font-bold">{label}</h3>
          {slot === 'facialHair' && beardAge > age && (
            <p className="mt-0.5 text-xs text-muted">
              {format(W.facialHairNote, { age: beardAge })}
            </p>
          )}
          <ul
            className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2"
            aria-label={label}
          >
            {Array.from({ length: AVATAR_OPTIONS[slot] }, (_, value) => {
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
                  size="look"
                  onSelect={() => action.run({ type: 'wardrobe', change: { slot, value } })}
                >
                  <AvatarOption
                    avatar={{ ...player.avatar, [slot]: value }}
                    age={slot === 'facialHair' ? beardAge : age}
                    club={club}
                    face={slot === 'facialHair'}
                  />
                </Tile>
              );
            })}
          </ul>
        </div>
      ))}
    </Section>
  );
}

function Swatch({ colors }: { colors: [string, string] }) {
  return (
    <span
      aria-hidden="true"
      className="tile-art flex h-10 w-14 overflow-hidden rounded-chip border border-line"
    >
      <span className="flex-1" style={{ background: colors[0] }} />
      <span className="w-3.5" style={{ background: colors[1] }} />
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
      className="tile-art grid h-10 w-14 place-items-center overflow-hidden rounded-chip border border-line bg-surface"
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
  const link = useSaveLink();
  const confirm = useUrlDialog('break-boots');
  const deal = bootsDeal(world);
  const brand = deal ? BRAND_BY_ID[deal.brandId] : undefined;
  const dealBoots = sponsorBoots(world);
  const breaking =
    confirm.value && deal && brand && COSMETIC_BY_ID[confirm.value]?.kind === 'boots'
      ? confirm.value
      : null;
  const group = (
    kind: 'boots' | 'socks' | 'armband',
    label: string,
    names: Record<string, string>,
    note?: ReactNode,
  ) => (
    <div>
      <h3 className="text-sm font-bold">{label}</h3>
      <ul
        className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(7.375rem,1fr))] gap-2"
        aria-label={label}
      >
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
            size="kit"
            onSelect={() =>
              kind === 'boots' && deal && !dealBoots.includes(item.id)
                ? confirm.open(item.id)
                : action.run({ type: 'wardrobe', change: { slot: kind, id: item.id } })
            }
          >
            {item.colors ? (
              <Swatch colors={item.colors} />
            ) : kind === 'socks' ? (
              <SockGlyph id={item.id} kit={kit} />
            ) : null}
            <span className="text-xs leading-tight font-bold">{names[item.id]}</span>
          </Tile>
        ))}
      </ul>
      {note}
    </div>
  );
  return (
    <Section id="kit-heading" title={W.kit}>
      <fieldset disabled={Boolean(action.block)} className="min-w-0">
        <legend className="text-sm font-bold">{W.sleeves}</legend>
        <div className="mt-2 grid max-w-[22.5rem] grid-cols-2 gap-1 rounded-control bg-surface-soft p-1">
          {(['short', 'long'] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-chip font-bold has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
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
      {group(
        'boots',
        W.boots,
        W.bootNames,
        brand && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span
              aria-hidden="true"
              className="grid h-5 w-5 place-items-center rounded-[0.3rem] bg-night font-display text-sm leading-none text-mint"
            >
              {brand.name.charAt(0)}
            </span>
            {format(W.bootsDeal, { brand: brand.name })}
            <Link
              to={link('/career/lifestyle')}
              className="inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-[3px]"
            >
              {W.seeDeal}
            </Link>
          </p>
        ),
      )}
      {group('socks', W.socks, W.sockNames)}
      {group('armband', W.armband, W.armbandNames)}
      {breaking && deal && brand && (
        <Dialog
          title={format(W.breakTitle, { brand: brand.name })}
          body={format(W.breakBody, {
            fame: dealFailureCost(world, deal).fame,
            amount: money(dealFailureCost(world, deal).clawback),
            seasons: CONFIG.career.lifestyle.sponsor.lockSeasons,
          })}
          confirmLabel={W.breakConfirm}
          danger
          onClose={confirm.close}
          onConfirm={() => {
            confirm.close();
            action.run({
              type: 'wardrobe',
              change: { slot: 'boots', id: breaking, breakDeal: true },
            });
          }}
        />
      )}
    </Section>
  );
}

function Celebrations({
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
  const token = useMemo(() => [kit.colors[0], kit.colors[1]] as const, [kit]);
  return (
    <Section
      id="celebrations-heading"
      title={C.title}
      aside={
        <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-bold">
          <LifeIcon name="star" filled className="h-4 w-4 text-meter-gold" />
          {plural(career.style.signatureUses, C.usesOne, C.uses)}
        </span>
      }
    >
      <p className="max-w-[40rem] text-muted">{C.body}</p>
      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.25rem),1fr))] gap-2.5"
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
              signature
              label={name}
              action={action}
              size="celebration"
              onSelect={() =>
                action.run({ type: 'wardrobe', change: { slot: 'celebration', id: item.id } })
              }
            >
              <span className="tile-art">
                <CelebrationPreview
                  id={item.id}
                  kit={token}
                  motion={item.motion!}
                  label={format(C.preview, { name })}
                  onHover={!selected}
                  className="h-20 w-[7.5rem]"
                />
              </span>
              <span className="text-sm leading-tight font-bold">{name}</span>
              <span className="text-xs leading-snug text-muted">{C.descriptions[item.id]}</span>
            </Tile>
          );
        })}
      </ul>
    </Section>
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
  const label = format(
    challenge.target === 1
      ? l.challenges.kindsOne[challenge.kind]
      : l.challenges.kinds[challenge.kind],
    { target: challenge.target },
  );
  const ready = done && !challenge.claimed;
  return (
    <li
      className={cx(
        'relative flex flex-col gap-2 rounded-control border p-3',
        ready ? 'border-accent bg-accent-soft' : 'border-line bg-surface-soft',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{label}</span>
        <span className="shrink-0 text-xs font-extrabold text-muted tabular-nums">
          {format(l.challenges.progress, { progress, target: challenge.target })}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          <TokenCoin />
          {reward}
        </span>
        {challenge.claimed ? (
          <Chip tone="accent" icon="check">
            {l.challenges.claimed}
          </Chip>
        ) : done ? (
          <Button
            disabled={Boolean(action.block)}
            aria-label={format(l.challenges.claimLabel, { reward, challenge: label })}
            onClick={() => {
              if (action.run({ type: 'claim-challenge', id: challenge.id })) {
                setCelebrate(true);
                audio.play('reward');
              }
            }}
          >
            {l.challenges.claim}
          </Button>
        ) : (
          <span className="text-xs font-extrabold">
            {plural(left, l.challenges.toGoOne, l.challenges.toGo)}
          </span>
        )}
      </div>
      {!done && (
        <div className="h-2 overflow-hidden rounded-full bg-track" aria-hidden="true">
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
            className="inline-flex items-center gap-1.5 font-extrabold text-accent"
          >
            <TokenCoin className="h-[1.125rem] w-[1.125rem]" />
            {l.challenges.reward_got}
          </m.p>
        )}
      </AnimatePresence>
    </li>
  );
}

function cosmeticName(id: string): string {
  return (
    C.names[id] ??
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
  const ready = world.challenges.filter(
    (challenge) => !challenge.claimed && challengeDone(world, challenge),
  ).length;
  return (
    <Section
      id="challenges-heading"
      title={l.challenges.title}
      aside={
        ready > 0 && <Chip tone="gold-soft">{format(l.challenges.ready, { count: ready })}</Chip>
      }
    >
      <p className="-mt-1.5 text-muted">{l.challenges.body}</p>
      <div className="flex flex-wrap gap-4">
        {(['daily', 'weekly'] as const).map((cadence) => (
          <div key={cadence} className="min-w-0 flex-[1_1_18.75rem]">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">{l.challenges[cadence]}</h3>
              <span className="text-xs font-semibold text-muted">
                {l.challenges.renews[cadence]}
              </span>
            </div>
            <ul className="grid gap-2">
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
    </Section>
  );
}
