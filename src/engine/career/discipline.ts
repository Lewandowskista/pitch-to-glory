import type { World } from '../../model/domain';
import type { NewBan } from '../world/discipline';
import { postMessage } from './market/records';

/**
 * The career player's suspensions (the discipline phase): when a fixture starts a ban for
 * them, the manager tells them in the inbox how many matches they miss, where and why.
 */
export function noteBans(world: World, bans: readonly NewBan[]): void {
  const career = world.career;
  if (!career || !bans.length) return;
  const ban = bans.find((entry) => entry.playerId === career.playerId);
  if (!ban) return;
  const clubId = world.players[career.playerId]?.clubId;
  postMessage(world, 'suspended', {
    matches: ban.matches,
    scope: ban.scope,
    reason: ban.reason,
    club: (clubId && world.clubs[clubId]?.name) || '',
  });
}
