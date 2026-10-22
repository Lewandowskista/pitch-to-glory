import type {
  CareerMarket,
  CareerMove,
  GameDate,
  InboxMessage,
  InboxSender,
  World,
} from '../../../model/domain';
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
  | 'contract-decision'
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
  | 'qualified'
  | 'missed-qualification'
  | 'award'
  | 'golden-ball'
  | 'trophy'
  | 'record'
  | 'retirement-due'
  | 'promise-offer'
  | 'promise-achieved'
  | 'promise-missed'
  | 'promise-cancelled'
  | 'mentee-manager'
  | 'ambition-achieved'
  | 'story-offer'
  | 'story-outcome'
  | 'farewell'
  | 'testimonial'
  | 'legacy-project'
  | 'suspended';

/** Messages written by a club, naming it in a parameter (your club, or the one you left). */
const FROM_CLUB: Partial<Record<InboxKind, string>> = {
  'offer-terms': 'parent',
  'offer-rejected': 'parent',
  'renewal-offer': 'club',
  'renewal-improved': 'club',
  'renewal-refused': 'club',
  'contract-extended': 'club',
  'transfer-request': 'club',
  'transfer-request-withdrawn': 'club',
  'loan-request': 'club',
  'promise-broken': 'club',
  'new-manager': 'club',
};
const FROM_AGENT = new Set<InboxKind>([
  'agent-hired',
  'agent-pitch',
  'agent-push',
  'agent-renewal',
]);
const FROM_MANAGER = new Set<InboxKind>([
  'dropped',
  'suspended',
  'promise-offer',
  'promise-achieved',
  'promise-missed',
  'promise-cancelled',
  'mentee-manager',
]);

/** Who wrote a message, as things stand when it is posted (phase 7, C5). */
function senderOf(
  world: World,
  kind: InboxKind,
  params: InboxMessage['params'],
  actionId: string | null,
): InboxSender | undefined {
  const clubParam = FROM_CLUB[kind];
  if (clubParam && typeof params[clubParam] === 'string') {
    const name = params[clubParam];
    const own = world.clubs[world.players[world.career?.playerId ?? '']?.clubId ?? ''];
    const club =
      own?.name === name ? own : Object.values(world.clubs).find((entry) => entry.name === name);
    return { kind: 'club', ...(club ? { id: club.id } : {}), name };
  }
  if (FROM_AGENT.has(kind) && typeof params.agent === 'string') {
    const name = params.agent;
    const agent = Object.values(world.agents).find((entry) => entry.name === name);
    return { kind: 'agent', ...(agent ? { id: agent.id } : {}), name };
  }
  if (kind === 'press-request' && typeof params.outlet === 'string')
    return { kind: 'press', name: params.outlet };
  if (FROM_MANAGER.has(kind)) {
    const promise = actionId
      ? world.career?.social?.promises?.find((entry) => entry.id === actionId)
      : undefined;
    const clubId = world.players[world.career?.playerId ?? '']?.clubId;
    const managerId = promise?.managerId ?? (clubId ? world.clubs[clubId]?.managerId : undefined);
    const manager = managerId ? world.managers[managerId] : undefined;
    if (manager) return { kind: 'manager', id: manager.id, name: manager.name };
  }
  return undefined;
}

/**
 * The last day to answer the item a message is about, while it waits for the player: an
 * offer's terms, a press question, the manager's challenge, a story or a sponsor's offer. The
 * same dates the hub's deadlines read.
 */
function deadlineOf(world: World, actionId: string | null): GameDate | undefined {
  if (!actionId) return undefined;
  const offer = world.offers.find((entry) => entry.id === actionId);
  if (offer) return offer.status === 'terms' ? { ...offer.expires } : undefined;
  const press = world.media.find((entry) => entry.id === actionId);
  if (press)
    return press.choices.length && press.answer === null && press.expires
      ? { ...press.expires }
      : undefined;
  const promise = world.career?.social?.promises?.find((entry) => entry.id === actionId);
  if (promise)
    return promise.status === 'offered'
      ? { season: promise.season, week: promise.respondBy, day: 7 }
      : undefined;
  const story = world.career?.stories?.find((entry) => entry.id === actionId);
  if (story) return story.status === 'offered' ? { ...story.respondBy } : undefined;
  const deal = world.sponsorships.find((entry) => entry.id === actionId);
  if (deal) return deal.status === 'offered' ? { ...deal.expires } : undefined;
  return undefined;
}

/** Post an inbox message; old read messages are dropped beyond the limit. */
export function postMessage(
  world: World,
  kind: InboxKind,
  params: InboxMessage['params'] = {},
  actionId: string | null = null,
): void {
  const sender = senderOf(world, kind, params, actionId);
  const deadline = deadlineOf(world, actionId);
  world.inbox.push({
    id: nextId(world, 'inbox'),
    date: today(world),
    subjectKey: kind,
    bodyKey: kind,
    params,
    read: false,
    actionId,
    ...(sender ? { sender } : {}),
    ...(deadline ? { deadline } : {}),
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
