import type { ContractTerms, World } from '../../../model/domain';
import { recordEvent } from '../../world/events';
import {
  activeLoan,
  addWeeks,
  careerContract,
  careerStanding,
  compareDates,
  deservedRole,
  M,
  managerTrust,
  marketWage,
  ROLE_RANK,
  today,
} from './rules';
import { adjustRelationship, postMessage } from './records';
import {
  acceptTerms,
  counterOffer,
  declineOffer,
  makeRenewalOffer,
  offerById,
  type CounterResult,
} from './offers';

/**
 * The player's market decisions, called from the UI. Each returns a new world that copies
 * only the records it changes (structural sharing), so actions stay well under 100 ms on
 * a full national world. The weekly simulation mutates its own world directly instead.
 */
export type MarketAction =
  | { type: 'hire-agent'; agentId: string }
  | { type: 'release-agent' }
  | { type: 'transfer-request' }
  | { type: 'withdraw-transfer-request' }
  | { type: 'loan-request' }
  | { type: 'withdraw-loan-request' }
  | { type: 'ask-contract' }
  | { type: 'accept'; offerId: string }
  | { type: 'counter'; offerId: string; terms: ContractTerms }
  | { type: 'decline'; offerId: string }
  | { type: 'read'; messageId: string }
  | { type: 'read-all' };
export type MarketResult = CounterResult | 'done' | 'opened' | 'refused';

interface Touch {
  clubs?: string[];
  players?: string[];
  contracts?: string[];
  dressingRooms?: string[];
}
type EntityKey = keyof Required<Touch>;
/** A copy of the world whose market records, and the listed entities, are safe to mutate. */
export function draftWorld(world: World, touch: Touch = {}): World {
  const next: World = {
    ...world,
    career: structuredClone(world.career!),
    agents: structuredClone(world.agents),
    offers: structuredClone(world.offers),
    negotiations: structuredClone(world.negotiations),
    loans: structuredClone(world.loans),
    scouting: structuredClone(world.scouting),
    relationships: structuredClone(world.relationships),
    inbox: structuredClone(world.inbox),
    media: structuredClone(world.media),
    rivalries: structuredClone(world.rivalries),
    events: [...world.events],
  };
  for (const key of ['clubs', 'players', 'contracts', 'dressingRooms'] as EntityKey[]) {
    const ids = touch[key];
    if (!ids?.length) continue;
    const source = world[key] as Record<string, unknown>;
    const copy: Record<string, unknown> = { ...source };
    for (const id of ids) if (source[id] !== undefined) copy[id] = structuredClone(source[id]);
    (next as unknown as Record<string, unknown>)[key] = copy;
  }
  return next;
}
/** Everything a completed move can touch: both clubs, any loan or sell-on club, and the player. */
function moveTouch(world: World, offerId: string): Touch {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const contract = careerContract(world);
  const offer = offerById(world, offerId);
  const loan = activeLoan(world, player.id);
  const clubs = [
    ...new Set(
      [
        player.clubId!,
        contract.clubId,
        offer.clubId,
        contract.sellOnClubId,
        loan?.destinationClubId,
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  return {
    clubs,
    players: [player.id],
    contracts: [contract.id],
    dressingRooms: clubs.map((id) => world.clubs[id]!.dressingRoomId),
  };
}

export type AgentAvailability = 'available' | 'current' | 'standing' | 'cooldown' | 'negotiating';
/** Whether talks are under way: an agent cannot be changed in the middle of them. */
function negotiating(world: World): boolean {
  return world.offers.some(
    (offer) =>
      offer.status === 'terms' &&
      offer.negotiationId !== null &&
      world.negotiations[offer.negotiationId]!.rounds.some((round) => round.actor === 'player'),
  );
}
function agentCooldown(world: World): boolean {
  const changed = world.career!.market.agentChanged;
  return Boolean(
    changed && compareDates(addWeeks(world, changed, M.agents.changeCooldownWeeks), world.date) > 0,
  );
}
export function agentAvailability(world: World, agentId: string): AgentAvailability {
  const market = world.career!.market;
  if (market.agentId === agentId) return 'current';
  if (careerStanding(world) < world.agents[agentId]!.minimumStanding) return 'standing';
  if (agentCooldown(world)) return 'cooldown';
  if (negotiating(world)) return 'negotiating';
  return 'available';
}
export function canReleaseAgent(world: World): AgentAvailability {
  if (!world.career!.market.agentId) return 'standing';
  if (agentCooldown(world)) return 'cooldown';
  if (negotiating(world)) return 'negotiating';
  return 'available';
}

export type ContractAsk = 'available' | 'cooldown' | 'trust' | 'on-loan' | 'talking';
export function contractAskState(world: World): ContractAsk {
  const market = world.career!.market;
  if (activeLoan(world, world.career!.playerId)) return 'on-loan';
  if (world.offers.some((o) => o.kind === 'renewal' && o.status === 'terms')) return 'talking';
  if (market.renewalAskAfter && compareDates(market.renewalAskAfter, world.date) > 0)
    return 'cooldown';
  if (managerTrust(world) < M.renewal.minimumTrust) return 'trust';
  return 'available';
}
/** Whether the club would agree to talk: underpaid, a stronger role earned, or a final season. */
export function deservesNewContract(world: World): boolean {
  const player = world.players[world.career!.playerId]!;
  const contract = careerContract(world);
  const club = world.clubs[contract.clubId]!;
  const deserved = deservedRole(world, club, player);
  return (
    contract.end.season <= world.date.season ||
    ROLE_RANK[deserved] > ROLE_RANK[contract.role] ||
    marketWage(club, player, deserved) >= contract.weeklyWage * M.renewal.askUnderpaid
  );
}
export function canRequestLoan(world: World): boolean {
  const market = world.career!.market;
  return (
    !market.loanRequest &&
    !activeLoan(world, world.career!.playerId) &&
    ['backup', 'youth', 'rotation'].includes(careerContract(world).role)
  );
}

export function applyMarketAction(
  input: World,
  action: MarketAction,
): { world: World; result: MarketResult } {
  if (!input.career) throw new Error('No career in this world');
  const isMove = action.type === 'accept' || action.type === 'counter';
  const world = draftWorld(input, isMove ? moveTouch(input, action.offerId) : {});
  const career = world.career!;
  const market = career.market;
  const player = world.players[career.playerId]!;
  const contract = careerContract(world);
  const parent = world.clubs[contract.clubId]!;
  let result: MarketResult = 'done';
  switch (action.type) {
    case 'hire-agent': {
      const agent = world.agents[action.agentId];
      if (!agent || agentAvailability(input, action.agentId) !== 'available')
        throw new Error('This agent is not available');
      if (market.agentId) {
        const previous = world.agents[market.agentId]!;
        previous.clientIds = previous.clientIds.filter((id) => id !== player.id);
      }
      agent.clientIds.push(player.id);
      market.agentId = agent.id;
      market.agentChanged = today(world);
      postMessage(world, 'agent-hired', {
        agent: agent.name,
        commission: agent.commissionPercent,
      });
      break;
    }
    case 'release-agent': {
      if (canReleaseAgent(input) !== 'available') throw new Error('The agent cannot leave now');
      const agent = world.agents[market.agentId!]!;
      agent.clientIds = agent.clientIds.filter((id) => id !== player.id);
      market.agentId = null;
      market.agentChanged = today(world);
      postMessage(world, 'agent-released', { agent: agent.name });
      break;
    }
    case 'transfer-request': {
      if (market.transferRequest || activeLoan(world, player.id))
        throw new Error('A transfer request cannot be made now');
      const T = M.transferRequest;
      // A broken promise makes the request understandable to the manager.
      adjustRelationship(
        world,
        'manager',
        parent.managerId,
        market.selection.promiseBroken ? T.brokenTrust : T.trust,
      );
      adjustRelationship(world, 'fans', parent.id, T.fans);
      market.transferRequest = today(world);
      for (const interest of world.scouting)
        if (interest.kind === 'transfer')
          interest.confidence = Math.min(100, interest.confidence + 10);
      recordEvent(world, 'contract', [player.id, parent.id], {
        name: player.name,
        club: parent.name,
        request: 1,
      });
      postMessage(world, 'transfer-request', { club: parent.name });
      break;
    }
    case 'withdraw-transfer-request': {
      if (!market.transferRequest) throw new Error('No transfer request to withdraw');
      adjustRelationship(world, 'manager', parent.managerId, M.transferRequest.withdrawTrust);
      adjustRelationship(world, 'fans', parent.id, M.transferRequest.withdrawFans);
      market.transferRequest = null;
      postMessage(world, 'transfer-request-withdrawn', { club: parent.name });
      break;
    }
    case 'loan-request': {
      if (!canRequestLoan(input)) throw new Error('A loan cannot be requested now');
      market.loanRequest = today(world);
      postMessage(world, 'loan-request', { club: parent.name });
      break;
    }
    case 'withdraw-loan-request':
      if (!market.loanRequest) throw new Error('No loan request to withdraw');
      market.loanRequest = null;
      world.scouting = world.scouting.filter((interest) => interest.kind !== 'loan');
      break;
    case 'ask-contract': {
      if (contractAskState(input) !== 'available')
        throw new Error('A new contract cannot be requested now');
      market.renewalAskAfter = addWeeks(world, today(world), M.renewal.askCooldownWeeks);
      if (deservesNewContract(world)) {
        makeRenewalOffer(world, false, false);
        result = 'opened';
      } else {
        postMessage(world, 'renewal-refused', { club: parent.name });
        result = 'refused';
      }
      break;
    }
    case 'accept':
      acceptTerms(world, action.offerId);
      break;
    case 'counter':
      result = counterOffer(world, action.offerId, action.terms);
      break;
    case 'decline':
      declineOffer(world, action.offerId);
      break;
    case 'read': {
      const message = world.inbox.find((entry) => entry.id === action.messageId);
      if (!message) throw new Error('Unknown message');
      message.read = true;
      break;
    }
    case 'read-all':
      for (const message of world.inbox) message.read = true;
      break;
  }
  return { world, result };
}
