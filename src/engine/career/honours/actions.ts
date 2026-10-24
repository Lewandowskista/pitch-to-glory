import type { World } from '../../../model/domain';
import { draftWorld } from '../market/actions';
import { announceFarewell, retireCareer, retirementState } from './retirement';

export type HonoursAction =
  | { type: 'retire' }
  | { type: 'farewell' }
  | { type: 'play-internationals'; on: boolean }
  | { type: 'simulate-window' };

/**
 * Whether the player plays their window matches themselves (version 0.9.0), and having the
 * window's remaining matches simulated. Turning the option off simulates a window already set
 * out for them.
 */
function internationalChoice(
  input: World,
  action: Extract<HonoursAction, { type: 'play-internationals' | 'simulate-window' }>,
): World {
  const world = draftWorld(input);
  const window = input.international?.window;
  if (action.type === 'play-internationals') {
    if (action.on) world.career!.honours.playInternationals = true;
    else delete world.career!.honours.playInternationals;
  } else if (!window) throw new Error('No international window is waiting');
  if (window && (action.type === 'simulate-window' || !action.on))
    world.international = { ...input.international!, window: { ...window, simulate: true } };
  return world;
}

/**
 * Retire from the UI, once the season is complete. Copies only what retirement changes:
 * the player, their clubs and contract, and dressing rooms that hold cliques.
 */
export function applyHonoursAction(input: World, action: HonoursAction): World {
  if (!input.career) throw new Error('No career in this world');
  if (action.type === 'farewell') return announceFarewell(input);
  if (action.type === 'play-internationals' || action.type === 'simulate-window')
    return internationalChoice(input, action);
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
