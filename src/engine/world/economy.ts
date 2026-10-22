import type { Club, World } from '../../model/domain';
import { CONFIG } from '../config';

/**
 * The club economy (review phase 4, step 4.4). Each season a club's running costs are set so
 * that, paying what clubs of its standing usually pay, it spends `wageShare` of what is left
 * on wages: one paying more than its peers runs at a loss and has to cut, one paying less
 * saves. The usual pay is measured from the world itself, so it follows wages as they develop.
 */
const E = CONFIG.world.background.economy;

/** Whether the world runs the club economy. */
export const usesEconomy = (world: Pick<World, 'economyVersion'>): boolean =>
  (world.economyVersion ?? 0) >= 1;

/** A club's weekly wage bill. */
export const wageBill = (world: World, club: Club): number =>
  club.playerIds.reduce(
    (sum, id) => sum + (world.contracts[world.players[id]?.contractId ?? '']?.weeklyWage ?? 0),
    0,
  );

/**
 * The usual weekly wage bill of each club's peers: the median over clubs in the leagues within
 * `peerWindow` reputation points, widened until it holds `peers` clubs.
 */
export function usualWages(world: World): Map<string, number> {
  const clubs = Object.values(world.clubs)
    .filter((club) => world.leagues[club.leagueId])
    .map((club) => ({ id: club.id, reputation: club.reputation, wages: wageBill(world, club) }))
    .sort((a, b) => a.reputation - b.reputation || (a.id < b.id ? -1 : 1));
  const usual = new Map<string, number>();
  for (const club of clubs) {
    let window = E.peerWindow;
    let peers = clubs.filter((other) => Math.abs(other.reputation - club.reputation) <= window);
    while (peers.length < Math.min(E.peers, clubs.length)) {
      window++;
      peers = clubs.filter((other) => Math.abs(other.reputation - club.reputation) <= window);
    }
    const wages = peers.map((peer) => peer.wages).sort((a, b) => a - b);
    usual.set(club.id, wages[Math.floor(wages.length / 2)]!);
  }
  return usual;
}

/** Weekly running costs under the economy: income less what the usual wages need. */
export function economyCosts(usual: number, income: number): number {
  const net = Math.max(E.netFloor, usual / E.wageShare);
  return Math.max(0, Math.round(income - net));
}

/** Set every league club's running costs for a season, from what its peers pay. */
export function setSeasonCosts(world: World): void {
  const usual = usualWages(world);
  for (const club of Object.values(world.clubs)) {
    const wages = usual.get(club.id);
    if (wages !== undefined)
      club.finances.weeklyCosts = economyCosts(wages, club.finances.weeklyIncome);
  }
}
