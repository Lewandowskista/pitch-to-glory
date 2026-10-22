import type { StaffSpeciality, World } from '../../../model/domain';
import { draftWorld } from '../market/actions';
import { LIFESTYLE_BY_ID, STAFF_SPECIALITIES } from './catalogue';
import { firstClubOf } from './lifestyle';
import { acceptSponsor, breakBootsDeal, buyAsset, declineSponsor, sellAsset } from './lifestyle';
import { claimChallenge, refreshChallenges } from './challenges';
import { applyWardrobe, buyCosmetic, type WardrobeChange } from './wardrobe';

export type LifestyleAction =
  | { type: 'wardrobe'; change: WardrobeChange }
  | { type: 'buy-cosmetic'; id: string }
  | { type: 'buy-asset'; itemId: string; amount?: number }
  | { type: 'sell-asset'; assetId: string }
  /** A member of staff's speciality (review phase 4). */
  | { type: 'staff-speciality'; assetId: string; speciality: StaffSpeciality }
  | { type: 'accept-sponsor'; id: string }
  | { type: 'decline-sponsor'; id: string }
  | { type: 'refresh-challenges'; date: string }
  | { type: 'claim-challenge'; id: string };

/**
 * The player's lifestyle decisions from the UI, with structural sharing. A look change and an
 * experience (morale, a holiday's rest) touch the player; everything else lives in the career,
 * sponsorships and challenges. Returns the input unchanged when refreshing challenges finds
 * nothing new.
 */
export function applyLifestyleAction(input: World, action: LifestyleAction): World {
  if (!input.career) throw new Error('No career in this world');
  // A legacy project changes the first club, which is copied before it is touched.
  const kind = action.type === 'buy-asset' ? LIFESTYLE_BY_ID[action.itemId]?.kind : undefined;
  const legacyClub = kind === 'legacy' ? firstClubOf(input) : null;
  const touchesPlayer = action.type === 'wardrobe' || kind === 'experience';
  const world = draftWorld(input, {
    players: touchesPlayer ? [input.career.playerId] : [],
    clubs: legacyClub ? [legacyClub] : [],
  });
  switch (action.type) {
    case 'wardrobe':
      if (action.change.slot === 'boots' && action.change.breakDeal) breakBootsDeal(world);
      applyWardrobe(world, action.change);
      break;
    case 'buy-cosmetic':
      buyCosmetic(world, action.id);
      break;
    case 'buy-asset':
      buyAsset(world, action.itemId, action.amount);
      break;
    case 'sell-asset':
      sellAsset(world, action.assetId);
      break;
    case 'staff-speciality': {
      const asset = world.career!.style.assets.find((entry) => entry.id === action.assetId);
      if (!asset || !STAFF_SPECIALITIES[asset.itemId]?.includes(action.speciality))
        throw new Error('That speciality is not on offer');
      asset.speciality = action.speciality;
      break;
    }
    case 'accept-sponsor':
      acceptSponsor(world, action.id);
      break;
    case 'decline-sponsor':
      declineSponsor(world, action.id);
      break;
    case 'refresh-challenges':
      if (!refreshChallenges(world, action.date)) return input;
      break;
    case 'claim-challenge':
      claimChallenge(world, action.id);
      break;
  }
  return world;
}
