/**
 * The AI transfer market (balance pass C). In each transfer week, clubs with money look at
 * their weakest starting slot and sign the best player they can afford for it from a smaller
 * club; fees move between the clubs' accounts, the player signs terms at the buyer, and the
 * seller refills from free agents afterwards (`fillSquads`). Good players therefore move up
 * the pyramid, and squads change for reasons rather than by random swaps.
 *
 * Deterministic: clubs are visited in reputation order and candidates in ability order, with
 * the week's RNG deciding only who shops and who looks abroad.
 */
import type { Club, Id, Player, Position, World } from '../../model/domain';
import { CONFIG } from '../config';
import type { Rng } from '../rng';
import { playerAbility } from '../strength';
import { effectiveAbility } from '../selection/lineup';
import { clubLineup, usesFormations } from '../selection/world';
import { marketValue } from '../career/market/rules';
import { refreshDressingRoom } from './dressing';
import { recordEvent } from './events';
import { contractTerms, isActiveClub, squadRole, groupOf } from './lifecycle';

const M = CONFIG.world.aiMarket;
const L = CONFIG.world.lifecycle;
const money = (value: number) => Math.round(value);

interface Weakest {
  index: number;
  position: Position;
  value: number;
}
/** The starting slot a club would most improve by signing for it (outfield only). */
function weakestSlot(world: World, club: Club): Weakest | null {
  const lineup = clubLineup(world, club);
  if (!lineup || lineup.starterIds.length < 11) return null;
  let weakest: Weakest | null = null;
  lineup.starterIds.forEach((id, index) => {
    if (index === 0) return;
    const position = lineup.slots[index]!;
    const value = effectiveAbility(world.players[id]!, position);
    if (!weakest || value < weakest.value) weakest = { index, position, value };
  });
  return weakest;
}

/** Move a player between clubs for a fee, with fresh terms at the buyer. */
export function transferPlayer(
  world: World,
  player: Player,
  seller: Club,
  buyer: Club,
  fee: number,
  rng: Rng,
): void {
  seller.playerIds = seller.playerIds.filter((id) => id !== player.id);
  buyer.playerIds.push(player.id);
  player.clubId = buyer.id;
  const old = player.contractId;
  if (old) delete world.contracts[old];
  const rank = buyer.playerIds
    .map((id) => world.players[id]!)
    .sort((a, b) => playerAbility(b) - playerAbility(a) || (a.id < b.id ? -1 : 1))
    .findIndex((entry) => entry.id === player.id);
  const contract = contractTerms(
    world,
    buyer,
    player,
    {
      id: `contract:${player.id}:${world.date.season}:${world.date.week}`,
      role: squadRole(world, rank, player),
    },
    rng,
  );
  world.contracts[contract.id] = contract;
  player.contractId = contract.id;
  buyer.finances.balance = money(buyer.finances.balance - fee);
  buyer.finances.transferBudget = money(Math.max(0, buyer.finances.transferBudget - fee));
  seller.finances.balance = money(seller.finances.balance + fee);
  seller.finances.transferBudget = money(seller.finances.transferBudget + fee * M.reinvestShare);
  recordEvent(world, 'transfer', [player.id, seller.id, buyer.id], {
    name: player.name,
    old: seller.name,
    new: buyer.name,
    fee,
  });
  refreshDressingRoom(world, seller);
  refreshDressingRoom(world, buyer);
}

/** One transfer week of AI business. Worlds without formations keep their older exchanges. */
export function aiTransferWindow(world: World, rng: Rng): number {
  if (!usesFormations(world) || world.format !== 'national-v1') return 0;
  const careerId = world.career?.playerId;
  const protectedIds = new Set<Id>([
    ...(careerId ? [careerId] : []),
    ...world.rivalries.map((rivalry) => rivalry.rivalPlayerId),
    ...world.loans.map((loan) => loan.playerId),
  ]);
  const clubs = Object.values(world.clubs)
    .filter((club) => isActiveClub(world, club))
    .sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1));
  // Candidates by position, best first.
  const byPosition = new Map<Position, Player[]>();
  for (const player of Object.values(world.players)) {
    if (player.retired || !player.clubId || player.injuryId || protectedIds.has(player.id))
      continue;
    if (world.date.season - player.birthSeason > M.maximumAge) continue;
    const list = byPosition.get(player.primaryPosition) ?? [];
    list.push(player);
    byPosition.set(player.primaryPosition, list);
  }
  for (const list of byPosition.values())
    list.sort((a, b) => playerAbility(b) - playerAbility(a) || (a.id < b.id ? -1 : 1));
  const sales = new Map<Id, number>();
  let moves = 0;
  for (const buyer of clubs) {
    if (buyer.playerIds.length >= L.squadMaximum) continue;
    if (buyer.finances.transferBudget < M.minimumBudget) continue;
    if (rng.next() >= M.signingChance) continue;
    const abroad = rng.next() < M.abroadChance;
    const weakest = weakestSlot(world, buyer);
    if (!weakest) continue;
    const candidates = byPosition.get(weakest.position) ?? [];
    for (const player of candidates) {
      const value = effectiveAbility(player, weakest.position);
      // Sorted best first: once a candidate is no improvement, none below is either.
      if (value < weakest.value + M.improvement) break;
      const seller = world.clubs[player.clubId!];
      if (!seller || seller.id === buyer.id || !isActiveClub(world, seller)) continue;
      if (!abroad && seller.countryId !== buyer.countryId) continue;
      if (seller.reputation >= buyer.reputation) continue;
      if ((sales.get(seller.id) ?? 0) >= M.salesPerWindow) continue;
      const contract = player.contractId ? world.contracts[player.contractId] : undefined;
      const fee = money(marketValue(world, player) * M.askingFactor[contract?.role ?? 'rotation']);
      if (fee > buyer.finances.transferBudget) continue;
      // The seller keeps every positional group viable; fillSquads tops it up afterwards.
      const group = groupOf(player.primaryPosition);
      const left = seller.playerIds.filter(
        (id) => id !== player.id && groupOf(world.players[id]!.primaryPosition) === group,
      ).length;
      if (left < L.groupMinimum[group]) continue;
      transferPlayer(world, player, seller, buyer, fee, rng);
      sales.set(seller.id, (sales.get(seller.id) ?? 0) + 1);
      candidates.splice(candidates.indexOf(player), 1);
      moves++;
      break;
    }
  }
  return moves;
}
