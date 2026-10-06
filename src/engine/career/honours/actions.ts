import type { World } from '../../../model/domain';
import { draftWorld } from '../market/actions';
import { retireCareer, retirementState } from './retirement';

export type HonoursAction = { type: 'retire' };

/**
 * Retire from the UI, once the season is complete. Copies only what retirement changes:
 * the player, their clubs and contract, and dressing rooms that hold cliques.
 */
export function applyHonoursAction(input: World, action: HonoursAction): World {
  if (!input.career) throw new Error('No career in this world');
  if (action.type !== 'retire') throw new Error('Unknown action');
  const state = retirementState(input);
  if (state !== 'available' && !(state === 'forced' && input.phase === 'complete'))
    throw new Error('You cannot retire yet');
  const player = input.players[input.career.playerId]!;
  const clubs = [player.clubId, ...input.loans.map((loan) => loan.parentClubId)].filter(
    (id): id is string => Boolean(id),
  );
  const world = draftWorld(input, {
    players: [player.id],
    clubs,
    contracts: player.contractId ? [player.contractId] : [],
    dressingRooms: Object.values(input.dressingRooms)
      .filter((room) => room.cliques.length || clubs.includes(room.clubId))
      .map((room) => room.id),
  });
  world.legacies = structuredClone(input.legacies);
  world.chronicle = [...input.chronicle];
  world.callUps = [];
  retireCareer(world);
  return world;
}
