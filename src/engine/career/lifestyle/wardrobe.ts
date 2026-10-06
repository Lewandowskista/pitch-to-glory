import type { CareerStyle, Player, SleeveLength, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import { COSMETIC_BY_ID, type CosmeticItem } from './catalogue';

export const L = CONFIG.career.lifestyle;

/** Fame level 1–10 from the career's fame, and progress toward the next level. */
export function fameLevel(fame: number): number {
  let level = 1;
  L.fameLevels.forEach((threshold, index) => {
    if (fame >= threshold) level = index + 1;
  });
  return level;
}
export function fameProgress(fame: number): { level: number; into: number; needed: number } {
  const level = fameLevel(fame);
  const floor = L.fameLevels[level - 1]!;
  const next = L.fameLevels[level];
  return {
    level,
    into: Math.max(0, fame - floor),
    needed: next === undefined ? 0 : next - floor,
  };
}
export const careerFameLevel = (world: World) => fameLevel(world.career!.fame);

/** Cosmetics the player starts with: everything free at level 1 and their own look. */
export function initialStyle(player: Player): CareerStyle {
  return {
    tokens: 0,
    owned: [`hair:${player.avatar.hair}`, `accessory:${player.avatar.accessory}`],
    equipped: {
      boots: 'boots:classic',
      socks: 'socks:classic',
      armband: 'armband:classic',
      sleeves: 'short',
      celebration: 'celebration:fist-pump',
    },
    fameLevel: 1,
    signatureUses: 0,
    assets: [],
  };
}

export type Availability = 'owned' | 'fame' | 'tokens' | 'locked' | 'sponsor';
/**
 * Whether the player can use a cosmetic: owned, unlocked by fame, worn for an active
 * sponsor, purchasable with style tokens, or still locked.
 */
export function availability(world: World, item: CosmeticItem): Availability {
  const style = world.career!.style;
  if (item.brandId)
    return world.sponsorships.some(
      (deal) => deal.status === 'active' && deal.brandId === item.brandId,
    )
      ? 'sponsor'
      : 'locked';
  if (style.owned.includes(item.id)) return 'owned';
  if (careerFameLevel(world) >= item.fameLevel) return 'fame';
  return item.tokens !== null ? 'tokens' : 'locked';
}
export const usable = (world: World, item: CosmeticItem) =>
  ['owned', 'fame', 'sponsor'].includes(availability(world, item));

export type WardrobeChange =
  | { slot: 'hair' | 'accessory'; value: number }
  | { slot: 'hairColor' | 'facialHair'; value: number }
  | { slot: 'boots' | 'socks' | 'armband'; id: string }
  | { slot: 'sleeves'; value: SleeveLength }
  | { slot: 'celebration'; id: string | null };

/** Change a look or kit item the player is allowed to use. Mutates the given world. */
export function applyWardrobe(world: World, change: WardrobeChange): void {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const style = career.style;
  switch (change.slot) {
    case 'hair':
    case 'accessory': {
      const item = COSMETIC_BY_ID[`${change.slot}:${change.value}`];
      if (!item || !usable(world, item)) throw new Error('That look is still locked');
      player.avatar[change.slot] = change.value;
      return;
    }
    case 'hairColor':
    case 'facialHair':
      if (!Number.isInteger(change.value) || change.value < 0 || change.value > 7)
        throw new Error('Unknown option');
      player.avatar[change.slot] = change.value;
      return;
    case 'boots':
    case 'socks':
    case 'armband': {
      const item = COSMETIC_BY_ID[change.id];
      if (!item || item.kind !== change.slot || !usable(world, item))
        throw new Error('That item is still locked');
      style.equipped[change.slot] = change.id;
      return;
    }
    case 'sleeves':
      style.equipped.sleeves = change.value === 'long' ? 'long' : 'short';
      return;
    case 'celebration': {
      if (change.id === null) {
        style.equipped.celebration = null;
        return;
      }
      const item = COSMETIC_BY_ID[change.id];
      if (!item || item.kind !== 'celebration' || !usable(world, item))
        throw new Error('That celebration is still locked');
      style.equipped.celebration = change.id;
    }
  }
}

/** Unlock a cosmetic early with style tokens. */
export function buyCosmetic(world: World, id: string): void {
  const style = world.career!.style;
  const item = COSMETIC_BY_ID[id];
  if (!item || availability(world, item) !== 'tokens') throw new Error('Not for sale');
  if (style.tokens < item.tokens!) throw new Error('Not enough style tokens');
  style.tokens -= item.tokens!;
  style.owned.push(item.id);
}

/** After a sponsor leaves, their boots come off. */
export function enforceEquipment(world: World): void {
  const style = world.career!.style;
  const boots = COSMETIC_BY_ID[style.equipped.boots];
  if (!boots || !usable(world, boots)) style.equipped.boots = 'boots:classic';
}
