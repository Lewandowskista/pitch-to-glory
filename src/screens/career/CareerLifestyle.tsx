import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Career, Sponsorship, World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import { careerContract } from '../../engine/career/market';
import {
  BRAND_BY_ID,
  BRANDS,
  COSMETICS,
  LIFESTYLE,
  LIFESTYLE_BY_ID,
  careerFameLevel,
  fameProgress,
  lifestyleMorale,
  obligationMet,
  obligationProgress,
  resaleValue,
  weeklyUpkeep,
  type LifestyleItem,
} from '../../engine/career/lifestyle';
import { format } from '../../i18n';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { CareerPage, ui } from './shared';
import { ActionError, BlockNote, money, Stat, weekly } from './marketUi';
import { fameName, useLifestyleAction } from './lifestyleUi';
import { audio } from '../../audio';

const L = CONFIG.career.lifestyle;

export default function CareerLifestyle() {
  return (
    <CareerPage eyebrow={l.eyebrow} title={l.titles.lifestyle}>
      {({ world, career }) => <LifestyleContent world={world} career={career} />}
    </CareerPage>
  );
}

function LifestyleContent({ world, career }: { world: World; career: Career }) {
  const action = useLifestyleAction();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <FameCard career={career} />
      <Sponsors world={world} action={action} />
      <Assets world={world} career={career} action={action} />
    </div>
  );
}

type Action = ReturnType<typeof useLifestyleAction>;

function FameCard({ career }: { career: Career }) {
  const progress = fameProgress(career.fame);
  const next = progress.level + 1;
  const unlocks = {
    cosmetics: COSMETICS.filter((item) => item.fameLevel === next).length,
    brands: BRANDS.filter((brand) => brand.fameLevel === next).length,
    items: LIFESTYLE.filter((item) => item.fameLevel === next).length,
  };
  const anything = unlocks.cosmetics + unlocks.brands + unlocks.items > 0;
  return (
    <section aria-labelledby="fame-heading" className={`${ui.panel} bg-art-gold lg:col-span-12`}>
      <div className="flex flex-wrap items-center gap-5">
        <motion.div
          key={progress.level}
          initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-gold font-display text-5xl text-[#1d3127] shadow-surface"
          aria-hidden="true"
        >
          {progress.level}
        </motion.div>
        <div className="min-w-0 flex-1 basis-64">
          <p className={ui.eyebrow}>{l.fame.title}</p>
          <h2 id="fame-heading" className="font-display text-[2.4rem] leading-none">
            {format(l.fame.level, { level: progress.level })} · {fameName(progress.level)}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">{l.fame.body}</p>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-surface-soft"
            role="progressbar"
            aria-label={l.fame.title}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, progress.needed)}
            aria-valuenow={progress.needed ? progress.into : 1}
          >
            <span
              className="block h-full rounded-full bg-gradient-to-r from-accent to-gold"
              style={{
                width: `${progress.needed ? Math.min(100, (progress.into / progress.needed) * 100) : 100}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            {progress.needed
              ? format(l.fame.progress, { into: progress.into, needed: progress.needed })
              : l.fame.max}
          </p>
        </div>
        {progress.needed > 0 && (
          <div className="basis-56">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{l.fame.next}</p>
            {anything ? (
              <ul className="mt-1 text-sm">
                {(Object.keys(unlocks) as (keyof typeof unlocks)[])
                  .filter((key) => unlocks[key])
                  .map((key) => (
                    <li key={key}>{format(l.fame.unlocks[key], { count: unlocks[key] })}</li>
                  ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm">{l.fame.nothing}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DealCard({ world, deal, action }: { world: World; deal: Sponsorship; action: Action }) {
  const brand = BRAND_BY_ID[deal.brandId]!;
  const offered = deal.status === 'offered';
  const active = world.sponsorships.filter((d) => d.status === 'active').length;
  const full = active >= L.maxDeals[careerFameLevel(world) - 1]!;
  return (
    <li className="flex flex-col gap-3 rounded-control border border-line bg-surface-soft p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="font-display text-2xl leading-none">{brand.name}</strong>
        <span className={ui.chip}>
          {l.sponsors.categories[brand.category]} · {l.sponsors.statuses[deal.status]}
        </span>
      </div>
      <p className="text-sm">
        {format(l.sponsors.fee, { fee: money(deal.weeklyFee) })} ·{' '}
        {format(l.sponsors.bonus, { bonus: money(deal.bonus) })} ·{' '}
        {format(l.sponsors.ends, { season: deal.endSeason })}
      </p>
      <ul className="grid gap-2">
        {deal.obligations.map((obligation) => {
          const progress = obligationProgress(world, deal, obligation);
          const met = obligationMet(world, deal, obligation);
          const label = format(l.sponsors.obligations[obligation.kind], {
            target: obligation.target,
          });
          return (
            <li key={obligation.kind} className="text-sm">
              {offered ? (
                <span>{label}</span>
              ) : (
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{label}</span>
                    <span className={`text-xs font-bold ${met ? 'text-accent' : 'text-muted'}`}>
                      {met
                        ? l.sponsors.met
                        : format(l.sponsors.progress, { progress, target: obligation.target })}
                    </span>
                  </div>
                  {obligation.kind !== 'boots' &&
                    obligation.kind !== 'rating' &&
                    obligation.kind !== 'image' && (
                      <div
                        className="mt-1 h-2 overflow-hidden rounded-full bg-surface"
                        aria-hidden="true"
                      >
                        <span
                          className={`block h-full rounded-full ${met ? 'bg-accent' : 'bg-gold'}`}
                          style={{
                            width: `${Math.min(100, (progress / Math.max(1, obligation.target)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {offered && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="button"
            disabled={Boolean(action.block) || full}
            onClick={() => {
              if (action.run({ type: 'accept-sponsor', id: deal.id })) audio.play('reward');
            }}
          >
            {l.sponsors.accept}
            <span className="sr-only"> — {brand.name}</span>
          </button>
          <button
            className="button secondary"
            disabled={Boolean(action.block)}
            onClick={() => action.run({ type: 'decline-sponsor', id: deal.id })}
          >
            {l.sponsors.decline}
            <span className="sr-only"> — {brand.name}</span>
          </button>
          <span className="text-xs text-muted">
            {full ? l.sponsors.full : format(l.sponsors.expires, { week: deal.expires.week })}
          </span>
        </div>
      )}
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
  const max = L.maxDeals[careerFameLevel(world) - 1]!;
  return (
    <section aria-labelledby="sponsors-heading" className={`${ui.panel} lg:col-span-7`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sponsors-heading" className={ui.heading}>
          {l.sponsors.title}
        </h2>
        <span className={ui.chip}>{format(l.sponsors.slots, { used: active.length, max })}</span>
      </div>
      <p className={`${ui.muted} mt-1 max-w-prose`}>{l.sponsors.body}</p>
      <div className="mt-4 grid gap-3">
        <BlockNote block={action.block} />
        <ActionError error={action.error} />
      </div>
      {offers.length + active.length === 0 && (
        <p className={`${ui.muted} mt-4`}>{l.sponsors.none}</p>
      )}
      {offers.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">
            {l.sponsors.offers}
          </h3>
          <ul className="mt-2 grid gap-3">
            {offers.map((deal) => (
              <DealCard key={deal.id} world={world} deal={deal} action={action} />
            ))}
          </ul>
        </>
      )}
      {active.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
            {l.sponsors.active}
          </h3>
          <ul className="mt-2 grid gap-3">
            {active.map((deal) => (
              <DealCard key={deal.id} world={world} deal={deal} action={action} />
            ))}
          </ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
            {l.sponsors.history}
          </h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {history.map((deal) => (
              <li key={deal.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-semibold">{BRAND_BY_ID[deal.brandId]?.name}</span>
                <span className="text-muted">{l.sponsors.statuses[deal.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ShopItem({ world, item, action }: { world: World; item: LifestyleItem; action: Action }) {
  const [amount, setAmount] = useState<number>(item.cost);
  const level = careerFameLevel(world);
  const cash = world.career!.market.finances.cash;
  const price = item.kind === 'investment' ? amount : item.cost;
  const name = l.lifestyle.items[item.id] ?? item.id;
  const reason =
    level < item.fameLevel
      ? format(l.lifestyle.requires, { level: item.fameLevel })
      : cash < price
        ? l.lifestyle.afford
        : '';
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-surface-soft p-3">
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-sm">{name}</strong>
        <span className="font-display text-xl leading-none">{money(price)}</span>
      </div>
      <p className="text-xs text-muted">
        {item.kind === 'investment'
          ? l.lifestyle.returns[item.product!]
          : `${format(l.lifestyle.upkeepValue, { amount: money(item.weeklyUpkeep) })} · ${format(l.lifestyle.moraleValue, { value: item.morale })}`}
      </p>
      {item.kind === 'investment' && (
        <div>
          <label htmlFor={`amount-${item.id}`} className="mb-1 block text-xs font-semibold">
            {l.lifestyle.amount}
          </label>
          <select
            id={`amount-${item.id}`}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink"
          >
            {L.investmentAmounts
              .filter((value) => value >= item.cost)
              .map((value) => (
                <option key={value} value={value}>
                  {money(value)}
                </option>
              ))}
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="button secondary"
          disabled={Boolean(action.block) || Boolean(reason)}
          onClick={() => {
            if (
              action.run({
                type: 'buy-asset',
                itemId: item.id,
                ...(item.kind === 'investment' ? { amount } : {}),
              })
            )
              audio.play('confirm');
          }}
        >
          {item.kind === 'investment' ? l.lifestyle.invest : l.lifestyle.buy}
          <span className="sr-only"> — {name}</span>
        </button>
        {reason && <span className="text-xs text-muted">{reason}</span>}
      </div>
    </li>
  );
}

function Assets({ world, career, action }: { world: World; career: Career; action: Action }) {
  const upkeep = weeklyUpkeep(world);
  const morale = lifestyleMorale(world);
  const overspending = upkeep > careerContract(world).weeklyWage * L.overspendShare;
  return (
    <section aria-labelledby="lifestyle-heading" className={`${ui.panel} lg:col-span-5`}>
      <h2 id="lifestyle-heading" className={ui.heading}>
        {l.lifestyle.title}
      </h2>
      <p className={`${ui.muted} mt-1`}>{l.lifestyle.body}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Stat label={l.lifestyle.savings} value={money(career.market.finances.cash)} />
        <Stat label={l.lifestyle.upkeep} value={weekly(upkeep)} />
      </dl>
      <dl className="mt-3">
        <Stat
          label={l.lifestyle.morale}
          value={`${morale > 0 ? '+' : morale < 0 ? '−' : '±'}${Math.abs(morale)}`}
        />
      </dl>
      {overspending && (
        <p className="mt-2 text-sm font-semibold text-danger">{l.lifestyle.overspend}</p>
      )}
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {l.lifestyle.owned}
      </h3>
      {career.style.assets.length ? (
        <ul className="mt-2 grid gap-2">
          {career.style.assets.map((asset) => {
            const name = l.lifestyle.items[asset.itemId] ?? asset.itemId;
            return (
              <li
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-soft p-3"
              >
                <span className="min-w-0">
                  <strong className="block text-sm">{name}</strong>
                  <span className="text-xs text-muted">
                    {format(l.lifestyle.value, { amount: money(asset.value) })}
                  </span>
                </span>
                <button
                  className="button secondary"
                  disabled={Boolean(action.block)}
                  onClick={() => action.run({ type: 'sell-asset', assetId: asset.id })}
                >
                  {format(l.lifestyle.sell, { amount: money(resaleValue(asset)) })}
                  <span className="sr-only"> — {name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-2`}>{l.lifestyle.none}</p>
      )}
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {l.lifestyle.shop}
      </h3>
      {(['car', 'house', 'investment'] as const).map((kind) => (
        <div key={kind} className="mt-3">
          <h4 className="text-sm font-semibold">{l.lifestyle.kinds[kind]}</h4>
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2">
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
      ))}
    </section>
  );
}
