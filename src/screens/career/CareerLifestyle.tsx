import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import type {
  Career,
  SponsorCategory,
  Sponsorship,
  StaffSpeciality,
  World,
} from '../../model/domain';
import { CONFIG } from '../../engine/config';
import {
  BRAND_BY_ID,
  BRANDS,
  COSMETICS,
  LIFESTYLE,
  LIFESTYLE_BY_ID,
  STAFF_SPECIALITIES,
  specialityOf,
  careerFameLevel,
  fameProgress,
  experienceWait,
  firstClubOf,
  lifestyleMorale,
  obligationMet,
  obligationProgress,
  resaleValue,
  priceOf,
  upkeepOf,
  weeklyIncome,
  weeklyUpkeep,
  type LifestyleItem,
} from '../../engine/career/lifestyle';
import { careerContract } from '../../engine/career/market/rules';
import { renderLifestyle } from '../../engine/assets/lifestyle';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { Button, CardTitle, Chip, Panel, StatusLine, cx } from '../../ui/kit';
import { CareerPage, filterButton, plural, ui } from './shared';
import { ActionError, BlockNote, money, weekly } from './marketUi';
import { fameName, useLifestyleAction } from './lifestyleUi';
import { LifeIcon, type LifeIconName } from './lifeIcons';
import { audio } from '../../audio';

const L = CONFIG.career.lifestyle;

export default function CareerLifestyle() {
  return (
    <CareerPage title={l.titles.lifestyle} description={l.intro}>
      {({ world, career }) => <LifestyleContent world={world} career={career} />}
    </CareerPage>
  );
}

function LifestyleContent({ world, career }: { world: World; career: Career }) {
  const action = useLifestyleAction();
  return (
    // Fame, then sponsors beside money and assets, then the catalogue across the full width.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <FameCard career={career} />
      <div className="flex flex-wrap items-start gap-5">
        <Sponsors world={world} action={action} />
        <Assets world={world} career={career} action={action} />
      </div>
      <Shop world={world} action={action} />
    </div>
  );
}

type Action = ReturnType<typeof useLifestyleAction>;

/** A small uppercase heading inside a card (one per group of rows). */
function GroupHeading({ children, className = '' }: { children: string; className?: string }) {
  return (
    <h3 className={cx('text-xs font-extrabold tracking-[0.12em] text-muted uppercase', className)}>
      {children}
    </h3>
  );
}

const UNLOCK_ICON: Record<'cosmetics' | 'brands' | 'items', LifeIconName> = {
  cosmetics: 'shirt',
  brands: 'star',
  items: 'bag',
};

function FameCard({ career }: { career: Career }) {
  const progress = fameProgress(career.fame);
  const next = progress.level + 1;
  const levels = L.fameLevels.length;
  const unlocks = {
    cosmetics: COSMETICS.filter((item) => item.fameLevel === next).length,
    brands: BRANDS.filter((brand) => brand.fameLevel === next).length,
    items: LIFESTYLE.filter((item) => item.fameLevel === next).length,
  };
  const anything = unlocks.cosmetics + unlocks.brands + unlocks.items > 0;
  return (
    <Panel
      tone="gold"
      aria-labelledby="fame-heading"
      className="relative flex flex-wrap items-center gap-x-8 gap-y-5 overflow-hidden"
    >
      {/* Spotlight rays and stars behind the level: decoration only. */}
      <svg
        viewBox="0 0 520 220"
        preserveAspectRatio="xMaxYMid slice"
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute top-0 right-0 h-full w-3/5"
      >
        <g className="fill-gold" opacity="0.45">
          <path d="M520 110L300 0H360ZM520 110L380 0H430ZM520 110L450 0H490ZM520 110L300 220H360ZM520 110L380 220H430Z" />
        </g>
        <g className="fill-gold">
          <path d="M330 46L334 56L345 57L337 64L339 75L330 69L321 75L323 64L315 57L326 56Z" />
          <path d="M420 150L423 157L431 158L425 163L427 171L420 167L413 171L415 163L409 158L417 157Z" />
          <path d="M470 40L472 45L478 46L474 50L475 56L470 53L465 56L466 50L462 46L468 45Z" />
        </g>
      </svg>
      <m.div
        key={progress.level}
        initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="relative grid h-[6.5rem] w-[6.5rem] shrink-0 place-items-center rounded-full bg-gold font-display text-[4.25rem] leading-none text-on-gold shadow-[0_6px_0_var(--color-gold-pressed)]"
        aria-hidden="true"
      >
        {progress.level}
      </m.div>
      <div className="relative min-w-0 flex-[1_1_22rem]">
        <h2
          id="fame-heading"
          className="font-display text-[2.25rem] leading-[0.95] sm:text-[2.75rem]"
        >
          {format(l.fame.level, { level: progress.level })} · {fameName(progress.level)}
        </h2>
        <p className="mt-2 max-w-[35rem] text-sm text-gold-ink">{l.fame.body}</p>
        <div
          className="mt-3.5 h-3.5 max-w-[35rem] overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-label={l.fame.title}
          aria-valuemin={0}
          aria-valuemax={Math.max(1, progress.needed)}
          aria-valuenow={progress.needed ? progress.into : 1}
        >
          <span
            className="block h-full rounded-full bg-gradient-to-r from-field to-gold"
            style={{
              width: `${progress.needed ? Math.min(100, (progress.into / progress.needed) * 100) : 100}%`,
            }}
          />
        </div>
        <div className="mt-1.5 flex max-w-[35rem] flex-wrap items-center justify-between gap-3">
          <span className="text-[0.8125rem] font-semibold text-gold-ink">
            {progress.needed
              ? format(l.fame.progressTowards, {
                  into: progress.into,
                  needed: progress.needed,
                  level: next,
                })
              : l.fame.max}
          </span>
          <span
            role="img"
            aria-label={format(l.fame.ladder, { max: levels, level: progress.level })}
            className="flex gap-[3px]"
          >
            {Array.from({ length: levels }, (_, index) => {
              const level = index + 1;
              return (
                <span
                  key={level}
                  aria-hidden="true"
                  className={cx(
                    'grid h-5 w-5 place-items-center rounded-full text-[0.625rem] font-extrabold',
                    level === progress.level
                      ? 'bg-field text-hero-ink'
                      : level < progress.level
                        ? 'bg-gold text-on-gold'
                        : 'bg-surface text-muted',
                  )}
                >
                  {level}
                </span>
              );
            })}
          </span>
        </div>
      </div>
      {progress.needed > 0 && (
        <div className="relative flex min-w-[13.75rem] flex-[0_1_16.25rem] flex-col gap-2.5 rounded-control bg-surface px-[1.125rem] py-4">
          <h3 className="text-xs font-extrabold tracking-[0.12em] text-gold-ink uppercase">
            {l.fame.next}
          </h3>
          {anything ? (
            <ul className="grid gap-2">
              {(Object.keys(unlocks) as (keyof typeof unlocks)[])
                .filter((key) => unlocks[key])
                .map((key) => (
                  <li key={key} className="flex items-center gap-2.5 font-semibold">
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-chip bg-art-gold text-gold-ink"
                    >
                      <LifeIcon name={UNLOCK_ICON[key]} className="h-[1.125rem] w-[1.125rem]" />
                    </span>
                    {plural(unlocks[key], l.fame.unlocksOne[key], l.fame.unlocks[key])}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm">{l.fame.nothing}</p>
          )}
        </div>
      )}
    </Panel>
  );
}

const BRAND_MARK: Record<SponsorCategory, string> = {
  boots: 'bg-night text-mint',
  apparel: 'bg-info text-surface',
  drinks: 'bg-danger text-on-danger',
  watches: 'bg-gold text-on-gold',
  cars: 'bg-field text-gold',
  tech: 'bg-art-blue text-info',
};

/** A brand's mark: its initial on its category's colour. Decorative; the name is beside it. */
function BrandMark({ name, category }: { name: string; category: SponsorCategory }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid h-12 w-12 shrink-0 place-items-center rounded-control font-display text-[1.75rem] leading-none',
        BRAND_MARK[category],
      )}
    >
      {name.charAt(0)}
    </span>
  );
}

function DealCard({ world, deal, action }: { world: World; deal: Sponsorship; action: Action }) {
  const brand = BRAND_BY_ID[deal.brandId]!;
  const offered = deal.status === 'offered';
  const active = world.sponsorships.filter((d) => d.status === 'active').length;
  const full = active >= L.maxDeals[careerFameLevel(world) - 1]!;
  return (
    <li>
      <article
        aria-label={format(offered ? l.sponsors.offerLabel : l.sponsors.dealLabel, {
          brand: brand.name,
        })}
        className="flex flex-col gap-3 rounded-control border border-line bg-surface-soft p-4"
      >
        <div className="flex items-center gap-3">
          <BrandMark name={brand.name} category={brand.category} />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2">
            <strong className="font-display text-[1.875rem] leading-none font-normal">
              {brand.name}
            </strong>
            <Chip tone={offered ? 'gold-soft' : 'accent'}>
              {l.sponsors.categories[brand.category]} · {l.sponsors.statuses[deal.status]}
            </Chip>
          </div>
        </div>
        <p className="text-sm tabular-nums">
          <strong>{format(l.sponsors.fee, { fee: money(deal.weeklyFee) })}</strong> ·{' '}
          {format(l.sponsors.bonus, { bonus: money(deal.bonus) })} ·{' '}
          {format(l.sponsors.ends, { season: deal.endSeason })}
        </p>
        <ul className={cx('grid text-sm', offered ? 'gap-1.5' : 'gap-2.5')}>
          {deal.obligations.map((obligation) => {
            const progress = obligationProgress(world, deal, obligation);
            const met = obligationMet(world, deal, obligation);
            const label = format(
              (obligation.target === 1 && l.sponsors.obligationsOne[obligation.kind]) ||
                l.sponsors.obligations[obligation.kind],
              { target: obligation.target },
            );
            if (offered)
              return (
                <li key={obligation.kind} className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                  {label}
                </li>
              );
            const bar =
              obligation.kind !== 'boots' &&
              obligation.kind !== 'rating' &&
              obligation.kind !== 'image';
            return (
              <li key={obligation.kind}>
                <div className="flex items-baseline justify-between gap-2">
                  <span>{label}</span>
                  <span
                    className={cx(
                      'inline-flex shrink-0 items-center gap-1 text-xs font-extrabold whitespace-nowrap',
                      met ? 'text-accent' : 'text-muted',
                    )}
                  >
                    {met && <LifeIcon name="check" className="h-3 w-3" />}
                    {met
                      ? l.sponsors.met
                      : format(l.sponsors.progress, { progress, target: obligation.target })}
                  </span>
                </div>
                {bar && (
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface"
                    aria-hidden="true"
                  >
                    <span
                      className={cx('block h-full rounded-full', met ? 'bg-accent' : 'bg-gold')}
                      style={{
                        width: `${Math.min(100, (progress / Math.max(1, obligation.target)) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {offered && (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                disabled={Boolean(action.block) || full}
                onClick={() => {
                  if (action.run({ type: 'accept-sponsor', id: deal.id })) audio.play('reward');
                }}
              >
                {l.sponsors.accept}
                <span className="sr-only"> — {brand.name}</span>
              </Button>
              <Button
                variant="secondary"
                disabled={Boolean(action.block)}
                onClick={() => action.run({ type: 'decline-sponsor', id: deal.id })}
              >
                {l.sponsors.decline}
                <span className="sr-only"> — {brand.name}</span>
              </Button>
            </div>
            <p className="flex items-start gap-2 text-[0.8125rem] text-muted">
              <LifeIcon name={full ? 'info' : 'clock'} className="mt-0.5 h-4 w-4" />
              {full ? l.sponsors.full : format(l.sponsors.expires, { week: deal.expires.week })}
            </p>
          </>
        )}
      </article>
    </li>
  );
}

function Sponsors({ world, action }: { world: World; action: Action }) {
  const offers = world.sponsorships.filter((deal) => deal.status === 'offered');
  const active = world.sponsorships.filter((deal) => deal.status === 'active');
  const history = world.sponsorships
    .filter((deal) => !['offered', 'active'].includes(deal.status))
    .slice(-5)
    .reverse();
  const level = careerFameLevel(world);
  const max = L.maxDeals[level - 1]!;
  // The first fame level any brand will talk to the player at.
  const firstLevel = Math.min(...BRANDS.map((brand) => brand.fameLevel));
  return (
    <Panel
      aria-labelledby="sponsors-heading"
      className="flex min-w-0 flex-[1_1_27.5rem] flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <CardTitle id="sponsors-heading" size="lg">
          {l.sponsors.title}
        </CardTitle>
        <Chip tone={max ? 'accent' : 'neutral'}>
          {format(l.sponsors.slots, { used: active.length, max })}
        </Chip>
      </div>
      <p className="text-muted">{l.sponsors.body}</p>
      <BlockNote block={action.block} />
      <ActionError error={action.error} />
      {offers.length + active.length === 0 &&
        (level < firstLevel ? (
          <p className="flex items-start gap-2.5 rounded-control border border-dashed border-line p-3 text-[0.8125rem] text-muted">
            <LifeIcon name="lock" className="mt-px h-[1.125rem] w-[1.125rem]" />
            {format(l.sponsors.none, { level: firstLevel })}
          </p>
        ) : (
          <p className="text-[0.8125rem] text-muted">{l.sponsors.watching}</p>
        ))}
      {offers.length > 0 && (
        <>
          <GroupHeading className="mt-1.5">{l.sponsors.offers}</GroupHeading>
          <ul className="grid gap-3">
            {offers.map((deal) => (
              <DealCard key={deal.id} world={world} deal={deal} action={action} />
            ))}
          </ul>
        </>
      )}
      {active.length > 0 && (
        <>
          <GroupHeading className="mt-1.5">{l.sponsors.active}</GroupHeading>
          <ul className="grid gap-3">
            {active.map((deal) => (
              <DealCard key={deal.id} world={world} deal={deal} action={action} />
            ))}
          </ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <GroupHeading className="mt-1.5">{l.sponsors.history}</GroupHeading>
          <ul className="text-sm">
            {history.map((deal) => (
              <li
                key={deal.id}
                className="flex flex-wrap justify-between gap-2 border-t border-line py-2"
              >
                <span className="font-bold">{BRAND_BY_ID[deal.brandId]?.name}</span>
                <span className="text-muted">{l.sponsors.statuses[deal.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Each kind's tint behind its drawings (theme-aware tokens). */
const TINT: Record<LifestyleItem['kind'], string> = {
  car: 'bg-art-blue',
  house: 'bg-art-gold',
  staff: 'bg-accent-soft',
  experience: 'bg-art-blue',
  charity: 'bg-danger-soft',
  investment: 'bg-art-gold',
  legacy: 'bg-art-green',
};

/** A shop item's illustration on its kind's tint. Decorative: the name is always beside it. */
function ItemArt({
  itemId,
  kind,
  className,
}: {
  itemId: string;
  kind: LifestyleItem['kind'] | undefined;
  className: string;
}) {
  const svg = useMemo(() => renderLifestyle(itemId, kind), [itemId, kind]);
  return (
    <Artwork
      svg={svg}
      alt=""
      className={`rounded-chip object-contain ${kind ? TINT[kind] : 'bg-art-green'} ${className}`}
    />
  );
}

type Lock = { chip: string; reason: string; kind: 'fame' | 'owned' | 'cooldown' | 'cash' };
const LOCK_LOOK: Record<Lock['kind'], { icon: LifeIconName; className: string }> = {
  owned: { icon: 'check', className: 'bg-accent-soft text-accent' },
  cash: { icon: 'lock', className: 'border border-danger bg-surface text-danger' },
  fame: { icon: 'lock', className: 'border border-line bg-surface text-muted' },
  cooldown: { icon: 'clock', className: 'border border-line bg-surface text-muted' },
};

function ShopItem({ world, item, action }: { world: World; item: LifestyleItem; action: Action }) {
  const [amount, setAmount] = useState<number>(item.cost);
  const level = careerFameLevel(world);
  const cash = world.career!.market.finances.cash;
  // Investments offer only the amounts the savings cover; the smallest one sets the lock.
  const amounts: number[] = L.investmentAmounts.filter(
    (value) => value >= item.cost && value <= cash,
  );
  const chosen = amounts.includes(amount) ? amount : (amounts.at(-1) ?? item.cost);
  const price = item.kind === 'investment' ? chosen : priceOf(world, item);
  const upkeep = upkeepOf(world, item);
  const owned = world.career!.style.assets.some((asset) => asset.itemId === item.id);
  const wait = item.kind === 'experience' ? experienceWait(world, item) : 0;
  // Legacy projects are at the club where the career began.
  const firstClub = world.clubs[firstClubOf(world) ?? '']?.name ?? '';
  const name = format(l.lifestyle.items[item.id] ?? item.id, { club: firstClub });
  const effect = item.effect
    ? format(l.lifestyle.effects[item.effect] ?? '', { club: firstClub })
    : item.rest
      ? format(l.lifestyle.effects.rest!, { value: item.rest })
      : null;
  const lock: Lock | null =
    level < item.fameLevel
      ? {
          chip: format(l.lifestyle.lockedFame, { level: item.fameLevel }),
          reason: format(l.lifestyle.requires, { level: item.fameLevel }),
          kind: 'fame',
        }
      : owned && item.kind !== 'investment' && item.kind !== 'experience'
        ? { chip: l.lifestyle.ownedChip, reason: l.lifestyle.ownedReason, kind: 'owned' }
        : wait > 0
          ? {
              chip: l.lifestyle.cooldownChip,
              reason: plural(wait, l.lifestyle.cooldownNextWeek, l.lifestyle.cooldownWeeks),
              kind: 'cooldown',
            }
          : cash < price
            ? {
                chip: format(l.lifestyle.lockedCash, { amount: money(price) }),
                reason: l.lifestyle.afford,
                kind: 'cash',
              }
            : null;
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-surface-soft p-3">
      <ItemArt itemId={item.id} kind={item.kind} className="h-[5.25rem] w-full" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <strong className="text-sm">{name}</strong>
        <span className="font-display text-2xl leading-none tabular-nums">{money(price)}</span>
      </div>
      <p className="text-xs text-muted">
        {item.kind === 'investment'
          ? l.lifestyle.returns[item.product!]
          : item.kind === 'staff'
            ? `${format(l.lifestyle.salaryValue, { amount: money(upkeep), hire: money(price) })} · ${effect}`
            : item.kind === 'charity'
              ? `${format(l.lifestyle.donationValue, { amount: money(upkeep) })} · ${effect}`
              : item.kind === 'experience' || item.kind === 'legacy'
                ? effect
                : [
                    format(l.lifestyle.upkeepValue, { amount: money(upkeep) }),
                    format(l.lifestyle.moraleValue, { value: item.morale }),
                    ...(effect ? [effect] : []),
                  ].join(' · ')}
      </p>
      {item.kind === 'investment' && !lock && (
        <div>
          <label htmlFor={`amount-${item.id}`} className="mb-1 block text-xs font-bold">
            {l.lifestyle.amount}
          </label>
          <select
            id={`amount-${item.id}`}
            value={chosen}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink"
          >
            {amounts.map((value) => (
              <option key={value} value={value}>
                {money(value)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mt-auto pt-0.5">
        {lock ? (
          <p
            className={cx(
              'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold',
              LOCK_LOOK[lock.kind].className,
            )}
          >
            <LifeIcon name={LOCK_LOOK[lock.kind].icon} className="h-3.5 w-3.5" />
            {lock.chip}
            <span className="sr-only"> · {lock.reason}</span>
          </p>
        ) : (
          <Button
            variant="secondary"
            disabled={Boolean(action.block)}
            onClick={() => {
              if (
                action.run({
                  type: 'buy-asset',
                  itemId: item.id,
                  ...(item.kind === 'investment' ? { amount: chosen } : {}),
                })
              )
                audio.play('confirm');
            }}
          >
            {item.kind === 'investment' ? l.lifestyle.invest : l.lifestyle.buy}
            <span className="sr-only"> — {name}</span>
          </Button>
        )}
      </div>
    </li>
  );
}

function Assets({ world, career, action }: { world: World; career: Career; action: Action }) {
  const upkeep = weeklyUpkeep(world);
  const morale = lifestyleMorale(world);
  const overspending = upkeep > weeklyIncome(world) * L.overspendShare;
  return (
    // Named "Lifestyle" for assistive technology: the page's own record of what you own.
    <Panel
      aria-label={l.lifestyle.title}
      className="flex min-w-0 flex-[1.25_1_30rem] flex-col gap-4"
    >
      <CardTitle size="lg">{l.lifestyle.heading}</CardTitle>
      <p className="text-muted">{l.lifestyle.body}</p>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2.5">
        <div className="rounded-control bg-surface-soft px-3.5 py-3">
          <dt className="text-xs font-semibold text-muted">{l.lifestyle.savings}</dt>
          <dd className="mt-0.5 font-display text-[2rem] leading-[0.95] tabular-nums">
            {money(career.market.finances.cash)}
          </dd>
        </div>
        <div className="rounded-control bg-surface-soft px-3.5 py-3">
          <dt className="text-xs font-semibold text-muted">{l.lifestyle.upkeep}</dt>
          <dd className="mt-0.5 font-display text-[2rem] leading-[0.95] tabular-nums">
            {weekly(upkeep)}
          </dd>
        </div>
        <div
          className={cx(
            'rounded-control px-3.5 py-3',
            morale > 0
              ? 'bg-accent-soft text-accent'
              : morale < 0
                ? 'bg-danger-soft text-danger'
                : 'bg-surface-soft',
          )}
        >
          <dt className={cx('text-xs font-semibold', morale === 0 && 'text-muted')}>
            {l.lifestyle.morale}
          </dt>
          <dd className="mt-0.5 font-display text-[2rem] leading-[0.95] tabular-nums">
            {`${morale > 0 ? '+' : morale < 0 ? '−' : '±'}${Math.abs(morale)}`}
          </dd>
        </div>
      </dl>
      {overspending && <StatusLine tone="error">{l.lifestyle.overspend}</StatusLine>}
      <GroupHeading className="mt-1">{l.lifestyle.owned}</GroupHeading>
      {career.style.assets.length ? (
        <ul className="grid gap-2.5">
          {career.style.assets.map((asset) => {
            const name = l.lifestyle.items[asset.itemId] ?? asset.itemId;
            return (
              <li
                key={asset.id}
                className="flex flex-wrap items-center gap-3.5 rounded-control bg-surface-soft px-3 py-2.5"
              >
                <ItemArt
                  itemId={asset.itemId}
                  kind={LIFESTYLE_BY_ID[asset.itemId]?.kind}
                  className="h-[3.125rem] w-[5.25rem] shrink-0"
                />
                <span className="min-w-0 flex-[1_1_8.75rem]">
                  <strong className="block">{name}</strong>
                  <span className="text-[0.8125rem] text-muted">
                    {asset.kind === 'staff'
                      ? specialityEffect(specialityOf(asset)!)
                      : format(l.lifestyle.value, { amount: money(asset.value) })}
                  </span>
                </span>
                {STAFF_SPECIALITIES[asset.itemId] && (
                  // What they specialise in (review phase 4): either, changed at any time.
                  <fieldset className="flex flex-wrap gap-1 rounded-control bg-surface p-1">
                    <legend className="sr-only">
                      {l.lifestyle.speciality} — {name}
                    </legend>
                    {STAFF_SPECIALITIES[asset.itemId]!.map((speciality) => (
                      <label
                        key={speciality}
                        className="relative flex min-h-10 cursor-pointer items-center rounded-chip px-2.5 text-[0.8125rem] font-bold has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`speciality-${asset.id}`}
                          checked={specialityOf(asset) === speciality}
                          disabled={Boolean(action.block)}
                          onChange={() =>
                            action.run({ type: 'staff-speciality', assetId: asset.id, speciality })
                          }
                        />
                        {l.lifestyle.specialities[speciality]}
                      </label>
                    ))}
                  </fieldset>
                )}
                <Button
                  variant="secondary"
                  disabled={Boolean(action.block)}
                  onClick={() => action.run({ type: 'sell-asset', assetId: asset.id })}
                >
                  {format(l.lifestyle.sell, { amount: money(resaleValue(asset)) })}
                  <span className="sr-only"> — {name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[0.8125rem] text-muted">{l.lifestyle.none}</p>
      )}
      <p className="flex items-start gap-3 rounded-control bg-art-blue px-3.5 py-3 text-[0.8125rem] font-semibold text-info">
        <LifeIcon name="info" className="mt-px h-[1.125rem] w-[1.125rem]" />
        {format(l.lifestyle.resaleNote, { percent: Math.round(L.resale * 100) })}
      </p>
    </Panel>
  );
}

const KINDS = ['car', 'house', 'staff', 'experience', 'charity', 'legacy', 'investment'] as const;
const KIND_ICON: Record<(typeof KINDS)[number], LifeIconName> = {
  car: 'car',
  house: 'home',
  staff: 'person',
  experience: 'sun',
  charity: 'heart',
  legacy: 'legacy',
  investment: 'chart',
};
/** Small categories sit side by side on wide screens. */
const HALF = new Set<string>(['experience', 'charity', 'legacy']);

/** The catalogue across the full width, one category or all of them (kept in the URL). */
function Shop({ world, action }: { world: World; action: Action }) {
  const [params, setParams] = useSearchParams();
  const chosen = KINDS.find((kind) => kind === params.get('shop'));
  const show = (kind: (typeof KINDS)[number] | null) => {
    const next = new URLSearchParams(params);
    if (kind) next.set('shop', kind);
    else next.delete('shop');
    setParams(next, { replace: true });
  };
  return (
    <Panel aria-labelledby="shop-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id="shop-heading" size="lg">
          {l.lifestyle.shop}
        </CardTitle>
        <span className="text-[0.8125rem] font-semibold text-muted">
          {format(l.lifestyle.wageNote, { wage: money(careerContract(world).weeklyWage) })}
        </span>
      </div>
      <div role="group" aria-label={l.lifestyle.categories} className={ui.filters}>
        {[null, ...KINDS].map((kind) => {
          const pressed = (kind ?? undefined) === chosen;
          return (
            <button
              key={kind ?? 'all'}
              aria-pressed={pressed}
              onClick={() => show(kind)}
              className={filterButton(pressed)}
            >
              {kind ? l.lifestyle.kinds[kind] : l.lifestyle.allKinds}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-[1.375rem]">
        {(chosen ? [chosen] : KINDS).map((kind) => {
          const half = !chosen && HALF.has(kind);
          return (
            <div
              key={kind}
              className={cx('min-w-0', half ? 'flex-[1_1_27.5rem]' : 'flex-[1_1_100%]')}
            >
              <h3 className="mb-2.5 flex items-center gap-2 text-[0.9375rem] font-bold">
                <LifeIcon
                  name={KIND_ICON[kind]}
                  className="h-[1.125rem] w-[1.125rem] text-accent"
                />
                {l.lifestyle.kinds[kind]}
              </h3>
              <ul
                className={cx(
                  'grid gap-3',
                  half
                    ? 'grid-cols-[repeat(auto-fill,minmax(min(100%,12.5rem),1fr))]'
                    : 'grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))]',
                )}
              >
                {LIFESTYLE.filter((item) => item.kind === kind).map((item) => (
                  <ShopItem
                    key={item.id}
                    world={world}
                    item={LIFESTYLE_BY_ID[item.id]!}
                    action={action}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** What a member of staff's speciality does, in numbers. */
function specialityEffect(speciality: StaffSpeciality): string {
  const S = CONFIG.career.lifestyle.staff;
  const percent = (factor: number) => Math.round(Math.abs(factor - 1) * 100);
  return format(l.lifestyle.specialityEffects[speciality], {
    percent:
      speciality === 'prevention'
        ? percent(S.prevention)
        : speciality === 'endurance'
          ? percent(S.endurance)
          : speciality === 'development'
            ? percent(S.development)
            : speciality === 'mentoring'
              ? percent(S.mentoring)
              : 0,
    value: speciality === 'recovery' ? S.recovery : S.decisions,
  });
}
