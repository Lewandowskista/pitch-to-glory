import { BRAND_BY_ID, COSMETIC_BY_ID, LIFESTYLE_BY_ID } from '../engine/career/lifestyle/catalogue';
import { array, date, id, number, object, options, requireValue } from './worldValidation';

const KINDS = [
  'play',
  'goals',
  'assists',
  'wins',
  'rating',
  'clean-sheets',
  'press',
  'weeks',
  'xp',
];
const OBLIGATIONS = ['starts', 'goals', 'clean-sheets', 'press', 'rating', 'boots', 'image'];

function cosmetic(value: unknown, kind: string): void {
  const item = COSMETIC_BY_ID[String(value)];
  requireValue(item !== undefined && item.kind === kind);
}

/**
 * The career's style record, sponsorship deals and challenges. A world without a career
 * has neither deals nor challenges.
 */
export function validateLifestyle(w: Record<string, unknown>): void {
  const sponsorships = array(w.sponsorships, 40);
  const challenges = array(w.challenges, 10);
  if (w.career === undefined) {
    requireValue(sponsorships.length === 0 && challenges.length === 0);
    return;
  }
  const career = object(w.career);
  const style = object(career.style);
  number(style.tokens, 0, 1e9, true);
  const owned = array(style.owned, 200);
  requireValue(new Set(owned).size === owned.length);
  owned.forEach((entry) => requireValue(COSMETIC_BY_ID[String(entry)] !== undefined));
  const equipped = object(style.equipped);
  cosmetic(equipped.boots, 'boots');
  cosmetic(equipped.socks, 'socks');
  cosmetic(equipped.armband, 'armband');
  options(equipped.sleeves, ['short', 'long']);
  if (equipped.celebration !== null) cosmetic(equipped.celebration, 'celebration');
  number(style.fameLevel, 1, 10, true);
  number(style.signatureUses, 0, 1e6, true);
  const assetIds = new Set<string>();
  for (const value of array(style.assets, 50)) {
    const asset = object(value);
    id(asset.id);
    requireValue(!assetIds.has(String(asset.id)));
    assetIds.add(String(asset.id));
    const item = LIFESTYLE_BY_ID[String(asset.itemId)];
    requireValue(item !== undefined && item.kind === asset.kind);
    date(asset.bought);
    number(asset.cost, 0, 1e12, true);
    number(asset.value, 0, 1e13, true);
  }
  if (style.experiences !== undefined) {
    const experiences = object(style.experiences);
    requireValue(Object.keys(experiences).length <= 10);
    for (const [itemId, taken] of Object.entries(experiences)) {
      requireValue(LIFESTYLE_BY_ID[itemId]?.kind === 'experience');
      date(taken);
    }
  }

  const dealIds = new Set<string>();
  const activeCategories = new Set<string>();
  for (const value of sponsorships) {
    const deal = object(value);
    id(deal.id);
    requireValue(!dealIds.has(String(deal.id)));
    dealIds.add(String(deal.id));
    const brand = BRAND_BY_ID[String(deal.brandId)];
    requireValue(brand !== undefined && brand.category === deal.category);
    options(deal.status, ['offered', 'active', 'completed', 'ended', 'declined', 'expired']);
    date(deal.offered);
    date(deal.expires);
    number(deal.endSeason, 1800, 9999, true);
    number(deal.weeklyFee, 0, 1e9, true);
    number(deal.bonus, 0, 1e12, true);
    const obligations = array(deal.obligations, 4);
    requireValue(obligations.length >= 1);
    for (const obligationValue of obligations) {
      const obligation = object(obligationValue);
      options(obligation.kind, OBLIGATIONS);
      number(obligation.target, 0, 1000);
    }
    if (deal.status === 'active') {
      requireValue(!activeCategories.has(String(deal.category)));
      activeCategories.add(String(deal.category));
    }
    if (deal.status === 'offered') requireValue(deal.start === null && deal.baseline === null);
    else if (deal.status !== 'declined' && deal.status !== 'expired') {
      date(deal.start);
      const baseline = object(deal.baseline);
      number(baseline.matches, 0, 1e6, true);
      number(baseline.answered, 0, 1e6, true);
    }
  }
  requireValue(activeCategories.size <= 4);
  // Sponsor boots are worn only while that sponsor is active.
  const boots = COSMETIC_BY_ID[String(equipped.boots)]!;
  if (boots.brandId)
    requireValue(
      sponsorships.some(
        (value) => object(value).status === 'active' && object(value).brandId === boots.brandId,
      ),
    );

  const challengeIds = new Set<string>();
  for (const value of challenges) {
    const challenge = object(value);
    id(challenge.id);
    requireValue(!challengeIds.has(String(challenge.id)));
    challengeIds.add(String(challenge.id));
    options(challenge.cadence, ['daily', 'weekly']);
    requireValue(
      typeof challenge.period === 'string' &&
        (challenge.cadence === 'daily'
          ? /^\d{4}-\d{2}-\d{2}$/.test(challenge.period)
          : /^\d{4}-W\d{2}$/.test(challenge.period)),
    );
    options(challenge.kind, KINDS);
    number(challenge.target, 1, 100000, true);
    number(challenge.baseline, 0, 1e9, true);
    number(challenge.rewardTokens, 0, 1000, true);
    if (challenge.rewardCosmeticId !== null)
      requireValue(COSMETIC_BY_ID[String(challenge.rewardCosmeticId)] !== undefined);
    requireValue(typeof challenge.claimed === 'boolean');
  }
}
