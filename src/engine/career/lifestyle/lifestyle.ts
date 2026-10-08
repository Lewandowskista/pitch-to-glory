import type { SponsorObligation, Sponsorship, World } from '../../../model/domain';
import { createRng, type Rng } from '../../rng';
import { addWeeks, careerContract, compareDates, relationshipValue, today } from '../market/rules';
import { nextId, postMessage } from '../market/records';
import { pay } from '../market/moves';
import {
  assetEffects,
  BRAND_BY_ID,
  BRANDS,
  COSMETIC_BY_ID,
  LIFESTYLE_BY_ID,
  type LifestyleItem,
} from './catalogue';
import { adjustRelationship } from '../market/records';
import { careerFameLevel, enforceEquipment, L } from './wardrobe';

const SP = L.sponsor;
const ATTACKERS = ['ST', 'LW', 'RW', 'AM'];
const DEFENDERS = ['GK', 'CB', 'LB', 'RB'];

/** Career counters that obligations and challenges are measured against. */
export function counters(world: World) {
  const career = world.career!;
  return { matches: career.matches.length, answered: career.social.answered };
}

/** Progress on an obligation since the deal started. */
export function obligationProgress(
  world: World,
  deal: Sponsorship,
  obligation: SponsorObligation,
): number {
  const career = world.career!;
  const baseline = deal.baseline ?? counters(world);
  const matches = career.matches.slice(baseline.matches);
  switch (obligation.kind) {
    case 'starts':
      return matches.length;
    case 'goals':
      return matches.reduce((sum, m) => sum + m.goals, 0);
    case 'clean-sheets':
      return matches.filter((m) => m.cleanSheet).length;
    case 'press':
      return career.social.answered - baseline.answered;
    case 'rating':
      return matches.length
        ? Math.round((matches.reduce((sum, m) => sum + m.rating, 0) / matches.length) * 100) / 100
        : 0;
    case 'boots':
      return career.style.equipped.boots === BRAND_BY_ID[deal.brandId]?.bootsId ? 1 : 0;
    case 'image': {
      const player = world.players[career.playerId]!;
      return relationshipValue(world, 'fans', player.clubId!);
    }
  }
}
export const obligationMet = (world: World, deal: Sponsorship, obligation: SponsorObligation) =>
  obligationProgress(world, deal, obligation) >= obligation.target;

/** Fixtures the player's club still has this season. */
function remainingFixtures(world: World): number {
  const clubId = world.players[world.career!.playerId]!.clubId;
  return Object.values(world.fixtures).filter(
    (f) =>
      (f.homeId === clubId || f.awayId === clubId) &&
      !world.results[f.id] &&
      f.date.season === world.date.season &&
      f.date.week > world.date.week,
  ).length;
}

/**
 * A sponsor approaches the player: a weekly fee scaled by fame level, a bonus for meeting
 * every obligation by the end of the season, and obligations that suit the position and the
 * brand (boots brands want their boots worn).
 */
export function makeSponsorOffer(world: World, rng: Rng): Sponsorship | null {
  const level = careerFameLevel(world);
  const busy = new Set(
    world.sponsorships
      .filter((deal) => deal.status === 'active' || deal.status === 'offered')
      .map((deal) => deal.category),
  );
  // A category whose last deal failed stays closed for a while.
  const locked = new Set(
    world.sponsorships
      .filter(
        (deal) => deal.status === 'ended' && deal.endSeason >= world.date.season - SP.lockSeasons,
      )
      .map((deal) => deal.category),
  );
  const brands = BRANDS.filter(
    (brand) => brand.fameLevel <= level && !busy.has(brand.category) && !locked.has(brand.category),
  )
    .sort((a, b) => b.fameLevel - a.fameLevel || (a.id < b.id ? -1 : 1))
    .slice(0, 3);
  const remaining = remainingFixtures(world);
  if (!brands.length || remaining < 10) return null;
  const brand = rng.pick(brands);
  const position = world.players[world.career!.playerId]!.primaryPosition;
  const target = (share: number) => Math.max(1, Math.round(remaining * share));
  const obligations: SponsorObligation[] = [{ kind: 'starts', target: target(SP.starts) }];
  if (ATTACKERS.includes(position)) obligations.push({ kind: 'goals', target: target(SP.goals) });
  else if (DEFENDERS.includes(position))
    obligations.push({ kind: 'clean-sheets', target: target(SP.cleanSheets) });
  else obligations.push({ kind: 'rating', target: SP.rating });
  if (brand.bootsId) obligations.push({ kind: 'boots', target: 1 });
  else if (brand.category === 'drinks' || brand.category === 'apparel')
    obligations.push({ kind: 'press', target: target(SP.press) });
  else obligations.push({ kind: 'image', target: SP.image });
  const weeklyFee = Math.round(SP.feeBase * SP.feeGrowth ** (level - 1) * brand.scale);
  const deal: Sponsorship = {
    id: nextId(world, 'sponsor'),
    brandId: brand.id,
    category: brand.category,
    status: 'offered',
    offered: today(world),
    expires: { ...addWeeks(world, today(world), SP.offerWeeks), day: 7 },
    start: null,
    endSeason: world.date.season,
    weeklyFee,
    bonus: weeklyFee * SP.bonusWeeks,
    obligations,
    baseline: null,
  };
  world.sponsorships.push(deal);
  postMessage(world, 'sponsor-offer', { brand: brand.name, fee: weeklyFee }, deal.id);
  return deal;
}

export function acceptSponsor(world: World, id: string): void {
  const deal = world.sponsorships.find((entry) => entry.id === id);
  if (!deal || deal.status !== 'offered') throw new Error('This offer is no longer open');
  if (compareDates(deal.expires, world.date) < 0) throw new Error('This offer has expired');
  const active = world.sponsorships.filter((entry) => entry.status === 'active').length;
  if (active >= L.maxDeals[careerFameLevel(world) - 1]!)
    throw new Error('You already have as many deals as your fame allows');
  deal.status = 'active';
  deal.start = today(world);
  deal.baseline = counters(world);
  const boots = BRAND_BY_ID[deal.brandId]?.bootsId;
  if (boots) world.career!.style.equipped.boots = boots;
  postMessage(world, 'sponsor-signed', { brand: BRAND_BY_ID[deal.brandId]!.name });
}
export function declineSponsor(world: World, id: string): void {
  const deal = world.sponsorships.find((entry) => entry.id === id);
  if (!deal || deal.status !== 'offered') throw new Error('This offer is no longer open');
  deal.status = 'declined';
}

function endDeal(
  world: World,
  deal: Sponsorship,
  status: 'completed' | 'ended',
  fame: number,
  kind: 'sponsor-completed' | 'sponsor-failed' | 'sponsor-dropped',
): void {
  deal.status = status;
  world.career!.fame += fame;
  postMessage(world, kind, { brand: BRAND_BY_ID[deal.brandId]!.name, bonus: deal.bonus });
  enforceEquipment(world);
}

/** Weekly: fees are paid, a boots sponsor checks its boots, offers lapse and new ones come. */
export function sponsorWeek(world: World, rng: Rng): void {
  for (const deal of world.sponsorships) {
    if (deal.status === 'offered' && compareDates(deal.expires, { ...world.date, day: 7 }) <= 0)
      deal.status = 'expired';
    if (deal.status !== 'active') continue;
    if (
      deal.obligations.some((o) => o.kind === 'boots') &&
      !obligationMet(world, deal, { kind: 'boots', target: 1 })
    ) {
      endDeal(world, deal, 'ended', SP.bootsBreachFame, 'sponsor-dropped');
      continue;
    }
    pay(world, deal.weeklyFee, false);
    deal.paid = (deal.paid ?? 0) + deal.weeklyFee;
  }
  const active = world.sponsorships.filter((deal) => deal.status === 'active').length;
  const offered = world.sponsorships.some((deal) => deal.status === 'offered');
  if (!offered && active < L.maxDeals[careerFameLevel(world) - 1]! && rng.next() < SP.offerChance)
    makeSponsorOffer(world, rng);
  // Keep the last few resolved deals for the record.
  const resolved = world.sponsorships.filter((d) => !['active', 'offered'].includes(d.status));
  if (resolved.length > 20) {
    const drop = new Set(resolved.slice(0, resolved.length - 20).map((d) => d.id));
    world.sponsorships = world.sponsorships.filter((d) => !drop.has(d.id));
  }
}

/** Season end: deals are judged on their obligations. Runs after the new season's date is set. */
export function sponsorRollover(world: World): void {
  for (const deal of world.sponsorships) {
    if (deal.status === 'offered') deal.status = 'expired';
    if (deal.status !== 'active' || deal.endSeason >= world.date.season) continue;
    if (deal.obligations.every((obligation) => obligationMet(world, deal, obligation))) {
      pay(world, deal.bonus, false);
      endDeal(world, deal, 'completed', SP.completedFame, 'sponsor-completed');
      renewSponsor(world, deal);
    } else {
      // Failure costs: fame by level and a share of the fees back.
      const clawback = Math.round((deal.paid ?? 0) * SP.clawback);
      world.career!.market.finances.cash = Math.max(
        0,
        world.career!.market.finances.cash - clawback,
      );
      endDeal(world, deal, 'ended', SP.failedFame - careerFameLevel(world), 'sponsor-failed');
      if (clawback > 0)
        postMessage(world, 'sponsor-clawback', {
          brand: BRAND_BY_ID[deal.brandId]!.name,
          amount: clawback,
        });
    }
  }
}

/** A completed deal is offered again at a better fee. */
function renewSponsor(world: World, deal: Sponsorship): void {
  const brand = BRAND_BY_ID[deal.brandId];
  if (!brand || remainingFixtures(world) < 10) return;
  const renewed: Sponsorship = {
    ...deal,
    id: nextId(world, 'sponsor'),
    status: 'offered',
    offered: today(world),
    expires: { ...addWeeks(world, today(world), SP.offerWeeks), day: 7 },
    start: null,
    endSeason: world.date.season,
    weeklyFee: Math.round(deal.weeklyFee * SP.renewalFactor),
    bonus: Math.round(deal.weeklyFee * SP.renewalFactor) * SP.bonusWeeks,
    obligations: deal.obligations.map((obligation) => ({ ...obligation })),
    baseline: null,
    paid: 0,
  };
  world.sponsorships.push(renewed);
  postMessage(world, 'sponsor-renewal', { brand: brand.name, fee: renewed.weeklyFee }, renewed.id);
}

/** Weekly income the lifestyle is measured against: wage plus sponsor fees. */
export function weeklyIncome(world: World): number {
  return (
    careerContract(world).weeklyWage +
    world.sponsorships
      .filter((deal) => deal.status === 'active')
      .reduce((sum, deal) => sum + deal.weeklyFee, 0)
  );
}
/** What an item costs now: cars, homes and experiences scale with the wage; staff charge a hire fee. */
export function priceOf(world: World, item: LifestyleItem): number {
  const wage = careerContract(world).weeklyWage;
  if (item.kind === 'investment') return item.cost;
  if (item.kind === 'staff') return upkeepOf(world, item) * L.hireWeeks;
  if (item.kind === 'charity') return 0;
  return Math.max(item.cost, Math.round((item.wageWeeks ?? 0) * wage));
}
/** What an item costs a week once owned. */
export function upkeepOf(world: World, item: LifestyleItem): number {
  const wage = careerContract(world).weeklyWage;
  if (item.kind === 'investment' || item.kind === 'experience') return 0;
  if (item.wageShare !== undefined)
    return Math.max(item.weeklyUpkeep, Math.round(wage * item.wageShare));
  return Math.max(item.weeklyUpkeep, Math.round(priceOf(world, item) / L.upkeepDivisor));
}

/** Buy a car, a home, an investment stake, an experience, or hire staff or fund a charity. */
export function buyAsset(world: World, itemId: string, amount?: number): void {
  const item = LIFESTYLE_BY_ID[itemId];
  const career = world.career!;
  if (!item) throw new Error('Unknown item');
  if (careerFameLevel(world) < item.fameLevel) throw new Error('Your fame level is too low');
  const price = item.kind === 'investment' ? (amount ?? item.cost) : priceOf(world, item);
  if (
    item.kind === 'investment' &&
    (!(L.investmentAmounts as readonly number[]).includes(price) || price < item.cost)
  )
    throw new Error('Invalid amount');
  if (
    (item.kind === 'staff' ||
      item.kind === 'charity' ||
      item.kind === 'house' ||
      item.kind === 'car') &&
    career.style.assets.some((asset) => asset.itemId === itemId)
  )
    throw new Error('You already have this');
  if (career.market.finances.cash < price) throw new Error('Not enough savings');
  career.market.finances.cash -= price;
  if (item.kind === 'experience') {
    // Felt at once, nothing kept.
    const player = world.players[career.playerId]!;
    player.morale = Math.max(0, Math.min(100, player.morale + item.morale));
    if (item.effect === 'holiday') player.fatigue = Math.max(0, player.fatigue - 20);
    postMessage(world, 'experience', { item: itemId });
    return;
  }
  career.style.assets.push({
    id: nextId(world, 'asset'),
    itemId,
    kind: item.kind,
    bought: today(world),
    cost: price,
    value: price,
    upkeep: upkeepOf(world, item),
  });
}
/** Resale value: investments return their balance, cars and homes a share of the price;
 * staff and charities return nothing when let go. */
export const resaleValue = (asset: { kind: string; value: number }) =>
  asset.kind === 'investment'
    ? asset.value
    : asset.kind === 'staff' || asset.kind === 'charity'
      ? 0
      : Math.round(asset.value * L.resale);
export function sellAsset(world: World, assetId: string): number {
  const style = world.career!.style;
  const asset = style.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error('Unknown asset');
  const proceeds = resaleValue(asset);
  world.career!.market.finances.cash += proceeds;
  style.assets = style.assets.filter((entry) => entry !== asset);
  return proceeds;
}

export function weeklyUpkeep(world: World): number {
  return world.career!.style.assets.reduce(
    (sum, asset) => sum + (asset.upkeep ?? LIFESTYLE_BY_ID[asset.itemId]?.weeklyUpkeep ?? 0),
    0,
  );
}
/** The owned items' effects on the career this week. */
export function careerAssetEffects(world: World) {
  return assetEffects(world.career?.style?.assets ?? []);
}

/**
 * Weekly lifestyle costs and returns: investments move, upkeep is paid from savings, and if
 * savings run short the most valuable car or home is sold to cover it.
 */
export function assetWeek(world: World): void {
  const career = world.career!;
  for (const asset of career.style.assets) {
    const item = LIFESTYLE_BY_ID[asset.itemId];
    if (item?.kind !== 'investment' || !item.product) continue;
    const product = L.investments[item.product];
    const rng = createRng(
      `${world.seed}:invest:${world.date.season}:${world.date.week}:${asset.id}`,
    );
    asset.value = Math.max(
      0,
      Math.round(asset.value * (1 + product.mean + product.spread * (rng.next() * 2 - 1))),
    );
    // A start-up can fold outright.
    if (item.product === 'startup' && asset.value > 0 && rng.next() < L.startupFoldChance) {
      postMessage(world, 'investment-lost', { amount: asset.value });
      asset.value = 0;
    }
  }
  // Charities: the fans notice, and the press does now and then.
  const effects = careerAssetEffects(world);
  if (effects.fans) {
    const player = world.players[career.playerId]!;
    if (player.clubId) adjustRelationship(world, 'fans', player.clubId, effects.fans);
    if (world.date.week % L.charityFameWeeks === 0) career.fame += effects.fame;
  }
  let upkeep = weeklyUpkeep(world);
  const finances = career.market.finances;
  while (finances.cash < upkeep && career.style.assets.length) {
    const sale = [...career.style.assets].sort((a, b) => resaleValue(b) - resaleValue(a))[0]!;
    const proceeds = sellAsset(world, sale.id);
    postMessage(world, 'asset-sold', { item: sale.itemId, proceeds });
    upkeep = weeklyUpkeep(world);
  }
  finances.cash = Math.max(0, finances.cash - upkeep);
}

/** Morale from the best car and home, less a penalty for living beyond one's wage. */
export function lifestyleMorale(world: World): number {
  const assets = world.career!.style.assets;
  const best = (kind: 'car' | 'house') =>
    Math.max(
      0,
      ...assets.filter((a) => a.kind === kind).map((a) => LIFESTYLE_BY_ID[a.itemId]?.morale ?? 0),
    );
  const income = weeklyIncome(world);
  const overspend = weeklyUpkeep(world) > income * L.overspendShare ? L.overspendMorale : 0;
  return Math.max(-L.moraleLimit, Math.min(L.moraleLimit, best('car') + best('house') + overspend));
}

/** Boots a sponsor provides: the cosmetic id for an active boots deal, if any. */
export const sponsorBoots = (world: World) =>
  world.sponsorships
    .filter((deal) => deal.status === 'active')
    .map((deal) => BRAND_BY_ID[deal.brandId]?.bootsId)
    .filter((id): id is string => Boolean(id && COSMETIC_BY_ID[id]));
