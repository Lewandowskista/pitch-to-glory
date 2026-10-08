import type { Hex, SponsorCategory } from '../../../model/domain';

/**
 * Cosmetics, celebrations, sponsor brands and lifestyle items. Cosmetics are earned by fame
 * or bought with style tokens from challenges, never with anything that helps on the pitch.
 * Display names live in the i18n catalogue, keyed by id.
 */
export type CosmeticKind = 'hair' | 'accessory' | 'boots' | 'socks' | 'armband' | 'celebration';
export type CelebrationMotion = 'pose' | 'wave' | 'slide' | 'dance' | 'sprint' | 'spin' | 'flip';
export interface CosmeticItem {
  id: string;
  kind: CosmeticKind;
  /** Fame level that unlocks it for free. */
  fameLevel: number;
  /** Style-token price to unlock it earlier, or null if fame (or a sponsor) is the only way. */
  tokens: number | null;
  colors?: [Hex, Hex];
  motion?: CelebrationMotion;
  /** Only available while sponsored by this brand. */
  brandId?: string;
}

const hair = (index: number, fameLevel: number, tokens: number | null): CosmeticItem => ({
  id: `hair:${index}`,
  kind: 'hair',
  fameLevel,
  tokens,
});
const accessory = (index: number, fameLevel: number, tokens: number | null): CosmeticItem => ({
  id: `accessory:${index}`,
  kind: 'accessory',
  fameLevel,
  tokens,
});
export const COSMETICS: readonly CosmeticItem[] = [
  hair(0, 1, null),
  hair(1, 1, null),
  hair(2, 1, null),
  hair(3, 1, null),
  hair(4, 2, 20),
  hair(5, 3, 30),
  hair(6, 4, 40),
  hair(7, 6, 60),
  accessory(0, 1, null),
  accessory(1, 1, null),
  accessory(2, 1, null),
  accessory(3, 2, 20),
  accessory(4, 3, 30),
  accessory(5, 4, 40),
  accessory(6, 5, 50),
  accessory(7, 7, 80),
  {
    id: 'boots:classic',
    kind: 'boots',
    fameLevel: 1,
    tokens: null,
    colors: ['#1d1d1f', '#ffffff'],
  },
  { id: 'boots:volt', kind: 'boots', fameLevel: 2, tokens: 30, colors: ['#d8f34a', '#1d1d1f'] },
  { id: 'boots:ember', kind: 'boots', fameLevel: 3, tokens: 40, colors: ['#ff6a3d', '#ffffff'] },
  { id: 'boots:ocean', kind: 'boots', fameLevel: 3, tokens: 40, colors: ['#2b7de9', '#ffffff'] },
  { id: 'boots:royal', kind: 'boots', fameLevel: 4, tokens: 60, colors: ['#5b2a86', '#f2c14e'] },
  { id: 'boots:ice', kind: 'boots', fameLevel: 5, tokens: 80, colors: ['#e9f4fb', '#3b8fc4'] },
  { id: 'boots:pink', kind: 'boots', fameLevel: 6, tokens: 100, colors: ['#ff8fc7', '#1d1d1f'] },
  { id: 'boots:gold', kind: 'boots', fameLevel: 8, tokens: 200, colors: ['#d4af37', '#1d1d1f'] },
  {
    id: 'boots:strider',
    kind: 'boots',
    fameLevel: 99,
    tokens: null,
    colors: ['#101820', '#3ddc97'],
    brandId: 'brand:strider',
  },
  {
    id: 'boots:volta',
    kind: 'boots',
    fameLevel: 99,
    tokens: null,
    colors: ['#f5f5f5', '#e63946'],
    brandId: 'brand:volta',
  },
  { id: 'socks:classic', kind: 'socks', fameLevel: 1, tokens: null },
  { id: 'socks:rolled', kind: 'socks', fameLevel: 2, tokens: 20 },
  { id: 'socks:taped', kind: 'socks', fameLevel: 3, tokens: 30 },
  { id: 'socks:high', kind: 'socks', fameLevel: 4, tokens: 40 },
  { id: 'socks:striped', kind: 'socks', fameLevel: 5, tokens: 60 },
  {
    id: 'armband:classic',
    kind: 'armband',
    fameLevel: 1,
    tokens: null,
    colors: ['#f2c14e', '#1d1d1f'],
  },
  { id: 'armband:bold', kind: 'armband', fameLevel: 3, tokens: 30, colors: ['#e63946', '#ffffff'] },
  {
    id: 'armband:striped',
    kind: 'armband',
    fameLevel: 5,
    tokens: 50,
    colors: ['#2b7de9', '#ffffff'],
  },
  {
    id: 'armband:gold',
    kind: 'armband',
    fameLevel: 8,
    tokens: 150,
    colors: ['#d4af37', '#5b2a86'],
  },
  { id: 'celebration:fist-pump', kind: 'celebration', fameLevel: 1, tokens: null, motion: 'pose' },
  { id: 'celebration:arms-wide', kind: 'celebration', fameLevel: 1, tokens: null, motion: 'wave' },
  { id: 'celebration:knee-slide', kind: 'celebration', fameLevel: 2, tokens: 20, motion: 'slide' },
  { id: 'celebration:badge-kiss', kind: 'celebration', fameLevel: 2, tokens: 20, motion: 'pose' },
  { id: 'celebration:corner-flag', kind: 'celebration', fameLevel: 3, tokens: 40, motion: 'dance' },
  { id: 'celebration:airplane', kind: 'celebration', fameLevel: 3, tokens: 40, motion: 'sprint' },
  { id: 'celebration:shush', kind: 'celebration', fameLevel: 4, tokens: 50, motion: 'pose' },
  { id: 'celebration:robot', kind: 'celebration', fameLevel: 4, tokens: 60, motion: 'dance' },
  { id: 'celebration:spin', kind: 'celebration', fameLevel: 5, tokens: 70, motion: 'spin' },
  { id: 'celebration:cartwheel', kind: 'celebration', fameLevel: 6, tokens: 90, motion: 'spin' },
  { id: 'celebration:backflip', kind: 'celebration', fameLevel: 7, tokens: 120, motion: 'flip' },
  { id: 'celebration:ice-cold', kind: 'celebration', fameLevel: 8, tokens: 150, motion: 'pose' },
];
export const COSMETIC_BY_ID: Readonly<Record<string, CosmeticItem>> = Object.fromEntries(
  COSMETICS.map((item) => [item.id, item]),
);

export interface Brand {
  id: string;
  name: string;
  category: SponsorCategory;
  fameLevel: number;
  scale: number;
  bootsId?: string;
}
export const BRANDS: readonly Brand[] = [
  {
    id: 'brand:strider',
    name: 'Strider',
    category: 'boots',
    fameLevel: 2,
    scale: 1,
    bootsId: 'boots:strider',
  },
  { id: 'brand:northline', name: 'Northline', category: 'apparel', fameLevel: 2, scale: 0.8 },
  { id: 'brand:fizzwell', name: 'Fizzwell', category: 'drinks', fameLevel: 3, scale: 0.9 },
  { id: 'brand:pixelpoint', name: 'Pixelpoint', category: 'tech', fameLevel: 4, scale: 1 },
  {
    id: 'brand:volta',
    name: 'Volta',
    category: 'boots',
    fameLevel: 5,
    scale: 1.4,
    bootsId: 'boots:volta',
  },
  { id: 'brand:pace', name: 'Pace & Co', category: 'apparel', fameLevel: 5, scale: 1.2 },
  { id: 'brand:hydra', name: 'Hydra+', category: 'drinks', fameLevel: 6, scale: 1.3 },
  { id: 'brand:meridian', name: 'Meridian Motors', category: 'cars', fameLevel: 6, scale: 1.5 },
  { id: 'brand:chronos', name: 'Chronos Atelier', category: 'watches', fameLevel: 7, scale: 1.6 },
  { id: 'brand:arcadium', name: 'Arcadium', category: 'tech', fameLevel: 8, scale: 1.8 },
];
export const BRAND_BY_ID: Readonly<Record<string, Brand>> = Object.fromEntries(
  BRANDS.map((brand) => [brand.id, brand]),
);

export type LifestyleKind = 'car' | 'house' | 'investment' | 'staff' | 'experience' | 'charity';
/** What an item does for the career beyond money and morale. */
export type LifestyleEffect =
  'physio' | 'nutrition' | 'coach' | 'analyst' | 'holiday' | 'family' | 'foundation' | 'camp';
export interface LifestyleItem {
  id: string;
  kind: LifestyleKind;
  fameLevel: number;
  /** Purchase price floor; for investments, the minimum stake. */
  cost: number;
  /** Cars, homes and experiences are priced at this many weeks of wages, at least `cost`. */
  wageWeeks?: number;
  /** Upkeep floor a week; staff and charities cost `wageShare` of the wage instead. */
  weeklyUpkeep: number;
  wageShare?: number;
  morale: number;
  product?: 'bond' | 'fund' | 'startup';
  effect?: LifestyleEffect;
  /** Homes rest a player: weekly fatigue relief. */
  rest?: number;
}
export const LIFESTYLE: readonly LifestyleItem[] = [
  {
    id: 'car:hatch',
    kind: 'car',
    fameLevel: 1,
    cost: 2_500,
    wageWeeks: 25,
    weeklyUpkeep: 20,
    morale: 1,
  },
  {
    id: 'car:coupe',
    kind: 'car',
    fameLevel: 3,
    cost: 18_000,
    wageWeeks: 60,
    weeklyUpkeep: 120,
    morale: 2,
  },
  {
    id: 'car:grand-tourer',
    kind: 'car',
    fameLevel: 5,
    cost: 60_000,
    wageWeeks: 120,
    weeklyUpkeep: 320,
    morale: 3,
  },
  {
    id: 'car:hypercar',
    kind: 'car',
    fameLevel: 8,
    cost: 180_000,
    wageWeeks: 200,
    weeklyUpkeep: 800,
    morale: 4,
  },
  {
    id: 'house:flat',
    kind: 'house',
    fameLevel: 1,
    cost: 6_000,
    wageWeeks: 60,
    weeklyUpkeep: 50,
    morale: 1,
  },
  {
    id: 'house:townhouse',
    kind: 'house',
    fameLevel: 3,
    cost: 40_000,
    wageWeeks: 150,
    weeklyUpkeep: 220,
    morale: 2,
    rest: 1,
  },
  {
    id: 'house:family',
    kind: 'house',
    fameLevel: 5,
    cost: 110_000,
    wageWeeks: 250,
    weeklyUpkeep: 450,
    morale: 3,
    rest: 2,
  },
  {
    id: 'house:villa',
    kind: 'house',
    fameLevel: 8,
    cost: 320_000,
    wageWeeks: 400,
    weeklyUpkeep: 1_200,
    morale: 5,
    rest: 3,
  },
  {
    id: 'invest:bond',
    kind: 'investment',
    fameLevel: 1,
    cost: 1_000,
    weeklyUpkeep: 0,
    morale: 0,
    product: 'bond',
  },
  {
    id: 'invest:fund',
    kind: 'investment',
    fameLevel: 3,
    cost: 5_000,
    weeklyUpkeep: 0,
    morale: 0,
    product: 'fund',
  },
  {
    id: 'invest:startup',
    kind: 'investment',
    fameLevel: 5,
    cost: 10_000,
    weeklyUpkeep: 0,
    morale: 0,
    product: 'startup',
  },
  // Personal staff: a weekly salary tied to the wage, paid from the first week.
  {
    id: 'staff:physio',
    kind: 'staff',
    fameLevel: 2,
    cost: 0,
    weeklyUpkeep: 60,
    wageShare: 0.15,
    morale: 0,
    effect: 'physio',
  },
  {
    id: 'staff:nutritionist',
    kind: 'staff',
    fameLevel: 3,
    cost: 0,
    weeklyUpkeep: 40,
    wageShare: 0.1,
    morale: 0,
    effect: 'nutrition',
  },
  {
    id: 'staff:coach',
    kind: 'staff',
    fameLevel: 4,
    cost: 0,
    weeklyUpkeep: 80,
    wageShare: 0.2,
    morale: 0,
    effect: 'coach',
  },
  {
    id: 'staff:analyst',
    kind: 'staff',
    fameLevel: 5,
    cost: 0,
    weeklyUpkeep: 60,
    wageShare: 0.15,
    morale: 0,
    effect: 'analyst',
  },
  // Experiences: paid once, felt at once.
  {
    id: 'experience:holiday',
    kind: 'experience',
    fameLevel: 1,
    cost: 500,
    wageWeeks: 4,
    weeklyUpkeep: 0,
    morale: 6,
    effect: 'holiday',
  },
  {
    id: 'experience:family',
    kind: 'experience',
    fameLevel: 1,
    cost: 150,
    wageWeeks: 1,
    weeklyUpkeep: 0,
    morale: 3,
    effect: 'family',
  },
  // Giving back: the fans notice.
  {
    id: 'charity:foundation',
    kind: 'charity',
    fameLevel: 4,
    cost: 0,
    weeklyUpkeep: 50,
    wageShare: 0.1,
    morale: 1,
    effect: 'foundation',
  },
  {
    id: 'charity:camp',
    kind: 'charity',
    fameLevel: 6,
    cost: 0,
    weeklyUpkeep: 100,
    wageShare: 0.15,
    morale: 2,
    effect: 'camp',
  },
];
/** The effects of owned items on the career, from the assets alone (pure). */
export interface AssetEffects {
  /** Multiplier on injury chance. */
  injury: number;
  /** Weekly fatigue relief (homes and the nutritionist). */
  rest: number;
  /** Multiplier on training gains. */
  training: number;
  /** Extra XP for each key decision that comes off. */
  decisionXp: number;
  /** Weekly fan affection from charities, and fame every four weeks. */
  fans: number;
  fame: number;
}
export function assetEffects(assets: readonly { itemId: string }[]): AssetEffects {
  const effects: AssetEffects = {
    injury: 1,
    rest: 0,
    training: 1,
    decisionXp: 0,
    fans: 0,
    fame: 0,
  };
  let bestRest = 0;
  for (const asset of assets) {
    const item = LIFESTYLE_BY_ID[asset.itemId];
    if (!item) continue;
    if (item.rest) bestRest = Math.max(bestRest, item.rest);
    switch (item.effect) {
      case 'physio':
        effects.injury *= 0.8;
        break;
      case 'nutrition':
        effects.rest += 2;
        break;
      case 'coach':
        effects.training *= 1.15;
        break;
      case 'analyst':
        effects.decisionXp += 2;
        break;
      case 'foundation':
        effects.fans += 0.4;
        effects.fame += 1;
        break;
      case 'camp':
        effects.fans += 0.6;
        effects.fame += 2;
        break;
      default:
        break;
    }
  }
  effects.rest += bestRest;
  return effects;
}
export const LIFESTYLE_BY_ID: Readonly<Record<string, LifestyleItem>> = Object.fromEntries(
  LIFESTYLE.map((item) => [item.id, item]),
);
