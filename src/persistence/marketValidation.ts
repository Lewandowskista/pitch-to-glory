import type { ContractTerms, Player } from '../model/domain';
import { CONFIG } from '../engine/config';
import { validTerms } from '../engine/career/market/offers';
import {
  array,
  avatar,
  date,
  id,
  ids,
  number,
  object,
  options,
  ref,
  requireValue,
  text,
} from './worldValidation';

const M = CONFIG.career.market;
const ROLES = ['key', 'rotation', 'backup', 'youth'];
/** Every inbox message kind a save may hold; each has copy in an i18n `messages` table. */
export const INBOX_KINDS = [
  'welcome-market',
  'offer-terms',
  'offer-rejected',
  'release-clause',
  'loan-offer',
  'pre-contract-offer',
  'renewal-offer',
  'renewal-improved',
  'renewal-refused',
  'offer-expired',
  'transfer-complete',
  'loan-start',
  'loan-end',
  'loan-purchase',
  'pre-contract-agreed',
  'pre-contract-complete',
  'renewal-signed',
  'contract-extended',
  'dropped',
  'promise-broken',
  'agent-hired',
  'agent-released',
  'agent-pitch',
  'agent-push',
  'agent-renewal',
  'transfer-request',
  'transfer-request-withdrawn',
  'loan-request',
  'relocated',
  'new-manager',
  'press-request',
  'rival-transfer',
  'sponsor-offer',
  'sponsor-signed',
  'sponsor-completed',
  'sponsor-failed',
  'sponsor-dropped',
  'sponsor-clawback',
  'sponsor-renewal',
  'free-transfer',
  'experience',
  'investment-lost',
  'asset-sold',
  'fame-level',
  'call-up',
  'tournament',
  'award',
  'golden-ball',
  'trophy',
  'record',
  'retirement-due',
  'promise-offer',
  'promise-achieved',
  'promise-missed',
  'promise-cancelled',
];

const nullableDate = (value: unknown) => {
  if (value !== null) date(value);
};
function params(value: unknown): void {
  const entries = Object.entries(object(value));
  requireValue(entries.length <= 20);
  for (const [, entry] of entries)
    if (typeof entry === 'number') number(entry, -1e12);
    else requireValue(typeof entry === 'string' && entry.length <= 200);
}
function terms(value: unknown): void {
  const t = object(value);
  requireValue(Object.keys(t).length === 5 && validTerms(t as unknown as ContractTerms));
}

/**
 * The career's market records: agents, scouting interest, offers, negotiations, loans,
 * relationships and the inbox. A world without a career keeps every one of them empty.
 */
export function validateMarket(w: Record<string, unknown>): void {
  const agents = object(w.agents);
  const negotiations = object(w.negotiations);
  if (w.career === undefined) {
    requireValue(Object.keys(agents).length === 0 && Object.keys(negotiations).length === 0);
    for (const key of ['scouting', 'offers', 'loans', 'relationships', 'inbox'])
      requireValue(array(w[key]).length === 0);
    return;
  }
  const career = object(w.career);
  const playerId = String(career.playerId);
  const players = object(w.players);
  const clubs = object(w.clubs);
  const contracts = object(w.contracts);
  const current = object(w.date);
  const player = players[playerId] as unknown as Player;
  const market = object(career.market);

  // Agents.
  requireValue(Object.keys(agents).length <= 20);
  for (const [key, value] of Object.entries(agents)) {
    const agent = object(value);
    requireValue(agent.id === key);
    id(key);
    text(agent.name);
    avatar(agent.avatar);
    options(agent.personality, ['aggressive', 'connected', 'economical']);
    number(agent.negotiation, 1, 99, true);
    number(agent.network, 1, 99, true);
    number(agent.commissionPercent, 0, 30, true);
    number(agent.minimumStanding, 0, 99, true);
    const clients = ids(agent.clientIds, 1);
    requireValue(
      clients.every((client) => client === playerId) &&
        (clients.length === 1) === (market.agentId === key),
    );
  }
  if (market.agentId !== null) ref(market.agentId, agents);
  nullableDate(market.agentChanged);
  nullableDate(market.lastAdvice);
  nullableDate(market.transferRequest);
  nullableDate(market.loanRequest);
  nullableDate(market.renewalAskAfter);
  date(market.registeredFrom);
  number(market.pendingBonuses, 0, 1e12, true);
  number(market.sequence, 0, 1e12, true);
  const finances = object(market.finances);
  number(finances.cash, 0, 1e15, true);
  number(finances.lifetimeEarnings, 0, 1e15, true);
  number(finances.agentFees, 0, Number(finances.lifetimeEarnings), true);
  if (finances.lastPay !== null) {
    const pay = object(finances.lastPay);
    number(pay.season, 1800, Number(current.season), true);
    number(pay.week, 1, 80, true);
    for (const key of ['wage', 'bonuses', 'commission']) number(pay[key], 0, 1e12, true);
  }
  const selection = object(market.selection);
  number(selection.season, 1800, Number(current.season), true);
  number(selection.selected, 0, 200, true);
  number(selection.dropped, 0, 200, true);
  requireValue(typeof selection.promiseBroken === 'boolean');
  for (const value of array(market.moves, 500)) {
    const move = object(value);
    date(move.date);
    options(move.kind, [
      'transfer',
      'loan',
      'loan-return',
      'renewal',
      'pre-contract',
      'extension',
      'relocation',
    ]);
    if (move.fromClubId !== null) ref(move.fromClubId, clubs);
    ref(move.toClubId, clubs);
    number(move.fee, 0, 1e12, true);
    number(move.weeklyWage, 0, 1e9, true);
  }

  // Loans: at most one, and the registration must match it.
  const loans = array(w.loans, 1);
  const contract = object(contracts[String(player.contractId)]);
  if (contract.sellOnClubId !== undefined) ref(contract.sellOnClubId, clubs);
  for (const value of loans) {
    const loan = object(value);
    id(loan.id);
    requireValue(loan.playerId === playerId);
    ref(loan.parentClubId, clubs);
    ref(loan.destinationClubId, clubs);
    requireValue(
      loan.parentClubId === contract.clubId &&
        loan.destinationClubId === player.clubId &&
        loan.parentClubId !== loan.destinationClubId,
    );
    date(loan.start);
    date(loan.end);
    number(loan.wageShare, 0, 1);
    if (loan.purchaseOption !== null) number(loan.purchaseOption, 0, 1e12, true);
    options(loan.role, ROLES);
  }
  if (!loans.length) requireValue(player.clubId === contract.clubId);

  // Scouting interest.
  const seen = new Set<string>();
  for (const value of array(w.scouting, M.scouting.maximumTransfer + M.scouting.maximumLoan + 6)) {
    const interest = object(value);
    id(interest.id);
    ref(interest.clubId, clubs);
    requireValue(interest.playerId === playerId && !seen.has(String(interest.clubId)));
    seen.add(String(interest.clubId));
    options(interest.kind, ['transfer', 'loan']);
    date(interest.started);
    number(interest.weeksObserved, 0, 1000, true);
    number(interest.confidence, 0, 100, true);
    options(interest.stage, ['watching', 'scouting', 'offer']);
    nullableDate(interest.lastOffer);
  }

  // Offers and their negotiations.
  const offerIds = new Set<string>();
  const linked = new Set<string>();
  let agreed = 0;
  for (const value of array(w.offers, 400)) {
    const offer = object(value);
    id(offer.id);
    requireValue(!offerIds.has(String(offer.id)));
    offerIds.add(String(offer.id));
    options(offer.kind, ['transfer', 'loan', 'renewal', 'pre-contract']);
    ref(offer.clubId, clubs);
    ref(offer.parentClubId, clubs);
    requireValue(offer.playerId === playerId);
    date(offer.created);
    date(offer.expires);
    number(offer.fee, 0, 1e12, true);
    array(offer.bids, 3).forEach((bid) => number(bid, 0, 1e12, true));
    requireValue(typeof offer.releaseClauseTriggered === 'boolean');
    options(offer.status, [
      'terms',
      'agreed',
      'completed',
      'rejected',
      'declined',
      'collapsed',
      'expired',
    ]);
    if (offer.status === 'agreed') {
      requireValue(offer.kind === 'pre-contract');
      agreed++;
    }
    requireValue((offer.kind === 'loan') === (offer.loan !== null));
    if (offer.loan !== null) {
      const loan = object(offer.loan);
      number(loan.wageShare, 0, 1);
      if (loan.purchaseOption !== null) number(loan.purchaseOption, 0, 1e12, true);
      options(loan.role, ROLES);
    }
    if (offer.negotiationId === null)
      requireValue(offer.kind === 'loan' || offer.status === 'rejected');
    else {
      ref(offer.negotiationId, negotiations);
      requireValue(!linked.has(String(offer.negotiationId)));
      linked.add(String(offer.negotiationId));
      requireValue(object(negotiations[String(offer.negotiationId)]).offerId === offer.id);
    }
  }
  requireValue(agreed <= 1);
  requireValue(Object.keys(negotiations).length <= 400);
  for (const [key, value] of Object.entries(negotiations)) {
    const negotiation = object(value);
    requireValue(negotiation.id === key && linked.has(key));
    id(key);
    options(negotiation.status, ['open', 'accepted', 'collapsed', 'declined', 'expired']);
    const rounds = array(negotiation.rounds, 20);
    requireValue(rounds.length >= 1);
    for (const roundValue of rounds) {
      const round = object(roundValue);
      options(round.actor, ['club', 'player']);
      date(round.date);
      terms(round.terms);
      if (round.response !== undefined) options(round.response, ['accept', 'counter', 'walk-away']);
      if (round.reasons !== undefined)
        array(round.reasons, 6).forEach((reason) =>
          options(reason, ['wage', 'role', 'years', 'clause', 'no-clause', 'bonus']),
        );
    }
    requireValue(object(rounds[0]).actor === 'club');
    const limits = object(negotiation.limits);
    number(limits.maxWage, 0, 1e9, true);
    options(limits.bestRole, ROLES);
    const years = array(limits.years, 2);
    requireValue(years.length === 2);
    years.forEach((value) => number(value, 1, M.negotiation.maximumYears, true));
    if (limits.minimumClause !== null) number(limits.minimumClause, 0, 1e12, true);
    number(limits.maxSigningBonus, 0, 1e12, true);
    number(negotiation.patience, 0, 5, true);
    if (negotiation.agentEstimate !== null) number(negotiation.agentEstimate, 0, 1e9, true);
  }

  // Relationships: the career player's with managers and fans.
  const relationIds = new Set<string>();
  for (const value of array(w.relationships, 500)) {
    const relation = object(value);
    id(relation.id);
    requireValue(!relationIds.has(String(relation.id)));
    relationIds.add(String(relation.id));
    requireValue(relation.sourceId === playerId);
    id(relation.targetId);
    options(relation.kind, ['manager', 'fans', 'teammate']);
    number(relation.value, 0, 100);
    ids(relation.history, 50);
  }

  // Inbox.
  const messageIds = new Set<string>();
  for (const value of array(w.inbox, M.inboxLimit)) {
    const message = object(value);
    id(message.id);
    requireValue(!messageIds.has(String(message.id)));
    messageIds.add(String(message.id));
    date(message.date);
    options(message.subjectKey, INBOX_KINDS);
    options(message.bodyKey, INBOX_KINDS);
    params(message.params);
    requireValue(typeof message.read === 'boolean');
    if (message.actionId !== null) id(message.actionId);
  }
}
