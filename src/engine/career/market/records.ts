import type { CareerMarket, CareerMove, InboxMessage, World } from '../../../model/domain';
import { M, today } from './rules';

/** A new id for a market record. Ids never repeat within a career. */
export function nextId(world: World, prefix: string): string {
  const market = world.career!.market;
  market.sequence++;
  return `${prefix}:${world.date.season}:${world.date.week}:${market.sequence}`;
}

export type InboxKind =
  | 'welcome-market'
  | 'offer-terms'
  | 'offer-rejected'
  | 'release-clause'
  | 'loan-offer'
  | 'pre-contract-offer'
  | 'renewal-offer'
  | 'renewal-improved'
  | 'renewal-refused'
  | 'offer-expired'
  | 'transfer-complete'
  | 'loan-start'
  | 'loan-end'
  | 'loan-purchase'
  | 'pre-contract-agreed'
  | 'pre-contract-complete'
  | 'renewal-signed'
  | 'contract-extended'
  | 'free-transfer'
  | 'sponsor-clawback'
  | 'sponsor-renewal'
  | 'investment-lost'
  | 'experience'
  | 'dropped'
  | 'promise-broken'
  | 'agent-hired'
  | 'agent-released'
  | 'agent-pitch'
  | 'agent-push'
  | 'agent-renewal'
  | 'transfer-request'
  | 'transfer-request-withdrawn'
  | 'loan-request'
  | 'relocated'
  | 'new-manager'
  | 'press-request'
  | 'rival-transfer'
  | 'sponsor-offer'
  | 'sponsor-signed'
  | 'sponsor-completed'
  | 'sponsor-failed'
  | 'sponsor-dropped'
  | 'asset-sold'
  | 'fame-level'
  | 'call-up'
  | 'tournament'
  | 'award'
  | 'golden-ball'
  | 'trophy'
  | 'record'
  | 'retirement-due'
  | 'promise-offer'
  | 'promise-achieved'
  | 'promise-missed'
  | 'promise-cancelled'
  | 'ambition-achieved';

/** Post an inbox message; old read messages are dropped beyond the limit. */
export function postMessage(
  world: World,
  kind: InboxKind,
  params: InboxMessage['params'] = {},
  actionId: string | null = null,
): void {
  world.inbox.push({
    id: nextId(world, 'inbox'),
    date: today(world),
    subjectKey: kind,
    bodyKey: kind,
    params,
    read: false,
    actionId,
  });
  while (world.inbox.length > M.inboxLimit) {
    const index = world.inbox.findIndex((message) => message.read);
    world.inbox.splice(index >= 0 ? index : 0, 1);
  }
}

/** The career player's relationship with a manager or a club's fans, created on first use. */
export type RelationshipKind = 'manager' | 'fans' | 'teammate';
export function relationship(
  world: World,
  kind: RelationshipKind,
  targetId: string,
  initial?: number,
) {
  const playerId = world.career!.playerId;
  let entry = world.relationships.find(
    (r) => r.sourceId === playerId && r.kind === kind && r.targetId === targetId,
  );
  if (!entry) {
    entry = {
      id: `relationship:${kind}:${targetId}`,
      sourceId: playerId,
      targetId,
      kind,
      value: initial ?? (kind === 'manager' ? M.relationships.newManager : M.relationships.fans),
      history: [],
    };
    world.relationships.push(entry);
  }
  return entry;
}
export function adjustRelationship(
  world: World,
  kind: RelationshipKind,
  targetId: string,
  delta: number,
): void {
  const entry = relationship(world, kind, targetId);
  entry.value = Math.round(Math.max(0, Math.min(100, entry.value + delta)) * 10) / 10;
}
/**
 * Relationships with the current club's manager and fans exist (after a move or sacking).
 * With `announce`, a manager the player has not met yet (a new appointment) is announced.
 */
export function ensureClubRelationships(world: World, announce = false): void {
  const player = world.players[world.career!.playerId]!;
  const club = world.clubs[player.clubId!]!;
  const known = world.relationships.some(
    (r) => r.kind === 'manager' && r.targetId === club.managerId,
  );
  relationship(world, 'manager', club.managerId);
  relationship(world, 'fans', club.id);
  if (!known && announce)
    postMessage(world, 'new-manager', {
      manager: world.managers[club.managerId]!.name,
      club: club.name,
    });
}

export function recordMove(world: World, move: Omit<CareerMove, 'date'>): void {
  world.career!.market.moves.push({ date: today(world), ...move });
}

export function initialMarket(world: World): CareerMarket {
  return {
    agentId: null,
    agentChanged: null,
    lastAdvice: null,
    finances: { cash: 0, lifetimeEarnings: 0, agentFees: 0, lastPay: null },
    pendingBonuses: 0,
    transferRequest: null,
    loanRequest: null,
    renewalAskAfter: null,
    selection: { season: world.date.season, selected: 0, dropped: 0, promiseBroken: false },
    registeredFrom: today(world),
    moves: [],
    sequence: 0,
  };
}
