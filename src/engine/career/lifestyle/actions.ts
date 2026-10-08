import type { World } from '../../../model/domain';
import { draftWorld } from '../market/actions';
import { acceptSponsor, breakBootsDeal, buyAsset, declineSponsor, sellAsset } from './lifestyle';
import { claimChallenge, refreshChallenges } from './challenges';
import { applyWardrobe, buyCosmetic, type WardrobeChange } from './wardrobe';

export type LifestyleAction =
  | { type: 'wardrobe'; change: WardrobeChange }
  | { type: 'buy-cosmetic'; id: string }
  | { type: 'buy-asset'; itemId: string; amount?: number }
  | { type: 'sell-asset'; assetId: string }
  | { type: 'accept-sponsor'; id: string }
  | { type: 'decline-sponsor'; id: string }
  | { type: 'refresh-challenges'; date: string }
  | { type: 'claim-challenge'; id: string };

/**
 * The player's lifestyle decisions from the UI, with structural sharing. Only a look change
 * touches the player; everything else lives in the career, sponsorships and challenges.
 * Returns the input unchanged when refreshing challenges finds nothing new.
 */
export function applyLifestyleAction(input: World, action: LifestyleAction): World {
  if (!input.career) throw new Error('No career in this world');
  const world = draftWorld(input, {
    players: action.type === 'wardrobe' ? [input.career.playerId] : [],
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
