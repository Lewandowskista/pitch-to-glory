import type { Contract, ContractTerms, Loan, TransferOffer, World } from '../../../model/domain';
import { getSeasonWeeks } from '../../world/calendar';
import { recordEvent } from '../../world/events';
import { refreshDressingRoom } from '../../world/dressing';
import { refreshMentor } from '../training';
import { ensureTeammates, syncCliques } from '../social/dressing';
import {
  addWeeks,
  ageOf,
  bonusesFor,
  careerContract,
  fee as roundFee,
  M,
  money,
  today,
} from './rules';
import {
  adjustRelationship,
  ensureClubRelationships,
  nextId,
  postMessage,
  recordMove,
} from './records';

/**
 * Contract and registration changes for the career player: transfers, loans, renewals and
 * the club option, plus wages and bonuses. Each function mutates the world it is given; UI
 * callers pass a draft (see `actions.ts`), the weekly step passes the worker's own world.
 */

/** A contract from agreed terms. `years` counts whole seasons after the current one. */
export function contractFromTerms(
  world: World,
  id: string,
  clubId: string,
  terms: ContractTerms,
  sellOn: { percent: number; clubId: string } | null,
): Contract {
  return {
    id,
    playerId: world.career!.playerId,
    clubId,
    start: today(world),
    end: { season: world.date.season + terms.years, week: getSeasonWeeks(world), day: 7 },
    weeklyWage: terms.weeklyWage,
    role: terms.role,
    ...bonusesFor(terms.weeklyWage),
    releaseClause: terms.releaseClause,
    sellOnPercent: sellOn?.percent ?? 0,
    ...(sellOn ? { sellOnClubId: sellOn.clubId } : {}),
  };
}

/** Pay the player; the agent takes their commission. */
export function pay(world: World, amount: number): number {
  const market = world.career!.market;
  const agent = market.agentId ? world.agents[market.agentId] : undefined;
  const commission = agent ? Math.round((amount * agent.commissionPercent) / 100) : 0;
  market.finances.cash += amount - commission;
  market.finances.lifetimeEarnings += amount;
  market.finances.agentFees += commission;
  return commission;
}

/** Weekly pay day: wage plus bonuses earned since the last one. */
export function payWeek(world: World): void {
  const market = world.career!.market;
  const wage = careerContract(world).weeklyWage;
  const bonuses = market.pendingBonuses;
  const commission = pay(world, wage + bonuses);
  market.pendingBonuses = 0;
  market.finances.lastPay = {
    season: world.date.season,
    week: world.date.week,
    wage,
    bonuses,
    commission,
  };
}

/** Bonuses for a match played: appearance, goals and (for keepers and defenders) a clean sheet. */
export function accrueMatchBonuses(world: World, goals: number, cleanSheet: boolean): void {
  const player = world.players[world.career!.playerId]!;
  const contract = careerContract(world);
  world.career!.market.pendingBonuses +=
    contract.appearanceBonus +
    goals * contract.goalBonus +
    (cleanSheet && (M.bonusDefenders as readonly string[]).includes(player.primaryPosition)
      ? contract.cleanSheetBonus
      : 0);
}

function resetAfterMove(world: World): void {
  const market = world.career!.market;
  market.transferRequest = null;
  market.loanRequest = null;
  market.registeredFrom = addWeeks(world, today(world), 1);
  market.selection = { season: world.date.season, selected: 0, dropped: 0, promiseBroken: false };
}
/**
 * Other open talks lapse when the player moves; the buyer's interest is satisfied and the
 * rest cools. An agreed pre-contract survives a loan but not a permanent move.
 */
function closeOtherTalks(world: World, keepId: string, clubId: string, permanent: boolean): void {
  for (const offer of world.offers) {
    if (offer.id === keepId) continue;
    const open = offer.status === 'terms';
    const agreed = offer.status === 'agreed' && permanent;
    if (!open && !agreed) continue;
    offer.status = open ? 'expired' : 'collapsed';
    if (offer.negotiationId) world.negotiations[offer.negotiationId]!.status = 'expired';
  }
  world.scouting = world.scouting
    .filter((interest) => interest.clubId !== clubId)
    .map((interest) => ({
      ...interest,
      confidence: Math.round(interest.confidence * 0.6),
      stage: interest.stage === 'offer' ? ('scouting' as const) : interest.stage,
    }));
}
function moveRegistration(world: World, fromId: string, toId: string): void {
  const player = world.players[world.career!.playerId]!;
  const from = world.clubs[fromId]!;
  const to = world.clubs[toId]!;
  from.playerIds = from.playerIds.filter((id) => id !== player.id);
  if (!to.playerIds.includes(player.id)) to.playerIds.push(player.id);
  player.clubId = to.id;
  refreshDressingRoom(world, from);
  refreshDressingRoom(world, to);
  ensureClubRelationships(world);
  refreshMentor(world);
  if (world.career!.social) {
    syncCliques(world);
    ensureTeammates(world);
  }
}

/**
 * A permanent move to the offering club on agreed terms: the fee changes hands (less any
 * sell-on share owed to an earlier club), the old contract ends and the new one starts.
 */
export function executeTransfer(world: World, offer: TransferOffer, terms: ContractTerms): void {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const old = careerContract(world);
  const seller = world.clubs[old.clubId]!;
  const buyer = world.clubs[offer.clubId]!;
  const amount = offer.fee;
  if (amount > 0) {
    buyer.finances.balance -= amount;
    buyer.finances.transferBudget = money(buyer.finances.transferBudget - amount);
    const share =
      old.sellOnClubId && world.clubs[old.sellOnClubId] && old.sellOnClubId !== buyer.id
        ? roundFee((amount * old.sellOnPercent) / 100)
        : 0;
    if (share > 0) world.clubs[old.sellOnClubId!]!.finances.balance += share;
    seller.finances.balance += amount - share;
    seller.finances.transferBudget = money(seller.finances.transferBudget + (amount - share) / 2);
  }
  // A loyal departure, without a transfer request, earns the loyalty bonus.
  if (!career.market.transferRequest && old.loyaltyBonus > 0) pay(world, old.loyaltyBonus);
  const loan = world.loans.find((entry) => entry.playerId === player.id);
  if (loan) world.loans = world.loans.filter((entry) => entry !== loan);
  const fromId = player.clubId!;
  delete world.contracts[old.id];
  const sellOn =
    amount > 0 && ageOf(world, player) <= M.sellOnAge
      ? { percent: M.sellOnPercent, clubId: seller.id }
      : null;
  const contract = contractFromTerms(world, nextId(world, 'contract'), buyer.id, terms, sellOn);
  world.contracts[contract.id] = contract;
  player.contractId = contract.id;
  moveRegistration(world, fromId, buyer.id);
  if (fromId !== seller.id) refreshDressingRoom(world, seller);
  if (terms.signingBonus > 0) pay(world, terms.signingBonus);
  offer.status = 'completed';
  closeOtherTalks(world, offer.id, buyer.id, true);
  resetAfterMove(world);
  recordMove(world, {
    kind: offer.kind === 'pre-contract' ? 'pre-contract' : 'transfer',
    fromClubId: seller.id,
    toClubId: buyer.id,
    fee: amount,
    weeklyWage: terms.weeklyWage,
  });
  recordEvent(world, 'transfer', [player.id, seller.id, buyer.id], {
    name: player.name,
    old: seller.name,
    new: buyer.name,
    fee: amount,
  });
  postMessage(
    world,
    offer.kind === 'pre-contract' ? 'pre-contract-complete' : 'transfer-complete',
    { club: buyer.name, fee: amount, wage: terms.weeklyWage },
  );
}

/** A loan to the end of the season; the contract stays with the parent club. */
export function startLoan(world: World, offer: TransferOffer): void {
  const player = world.players[world.career!.playerId]!;
  const destination = world.clubs[offer.clubId]!;
  const parentId = player.clubId!;
  const terms = offer.loan!;
  const loan: Loan = {
    id: nextId(world, 'loan'),
    playerId: player.id,
    parentClubId: parentId,
    destinationClubId: destination.id,
    start: today(world),
    end: { season: world.date.season, week: getSeasonWeeks(world), day: 7 },
    wageShare: terms.wageShare,
    purchaseOption: terms.purchaseOption,
    role: terms.role,
  };
  world.loans.push(loan);
  moveRegistration(world, parentId, destination.id);
  offer.status = 'completed';
  closeOtherTalks(world, offer.id, destination.id, false);
  resetAfterMove(world);
  recordMove(world, {
    kind: 'loan',
    fromClubId: parentId,
    toClubId: destination.id,
    fee: 0,
    weeklyWage: careerContract(world).weeklyWage,
  });
  recordEvent(world, 'loan', [player.id, parentId, destination.id], {
    name: player.name,
    old: world.clubs[parentId]!.name,
    new: destination.name,
  });
  postMessage(world, 'loan-start', { club: destination.name, role: terms.role });
}

/** The player returns from loan to the parent club. */
export function endLoan(world: World, loan: Loan): void {
  const player = world.players[world.career!.playerId]!;
  world.loans = world.loans.filter((entry) => entry.id !== loan.id);
  const destination = world.clubs[loan.destinationClubId]!;
  moveRegistration(world, player.clubId!, loan.parentClubId);
  world.career!.market.registeredFrom = today(world);
  recordMove(world, {
    kind: 'loan-return',
    fromClubId: destination.id,
    toClubId: loan.parentClubId,
    fee: 0,
    weeklyWage: careerContract(world).weeklyWage,
  });
  postMessage(world, 'loan-end', {
    club: destination.name,
    parent: world.clubs[loan.parentClubId]!.name,
  });
}

/** New terms at the current club. Completing the old contract's final season earns loyalty. */
export function signRenewal(world: World, offer: TransferOffer, terms: ContractTerms): void {
  const old = careerContract(world);
  if (old.end.season <= world.date.season && old.loyaltyBonus > 0) pay(world, old.loyaltyBonus);
  const contract = contractFromTerms(
    world,
    old.id,
    old.clubId,
    terms,
    old.sellOnClubId ? { percent: old.sellOnPercent, clubId: old.sellOnClubId } : null,
  );
  world.contracts[old.id] = contract;
  if (terms.signingBonus > 0) pay(world, terms.signingBonus);
  offer.status = 'completed';
  adjustRelationship(
    world,
    'manager',
    world.clubs[old.clubId]!.managerId,
    M.relationships.renewalTrust,
  );
  world.career!.market.renewalAskAfter = null;
  const player = world.players[world.career!.playerId]!;
  recordMove(world, {
    kind: 'renewal',
    fromClubId: old.clubId,
    toClubId: old.clubId,
    fee: 0,
    weeklyWage: terms.weeklyWage,
  });
  recordEvent(world, 'contract', [player.id, old.clubId], {
    name: player.name,
    club: world.clubs[old.clubId]!.name,
    wage: terms.weeklyWage,
  });
  postMessage(world, 'renewal-signed', {
    club: world.clubs[old.clubId]!.name,
    wage: terms.weeklyWage,
    years: terms.years,
  });
}

/** At expiry without a new deal, the club takes up its one-season option on current terms. */
export function extendContract(world: World): void {
  const contract = careerContract(world);
  if (contract.loyaltyBonus > 0) pay(world, contract.loyaltyBonus);
  contract.end = { season: world.date.season, week: getSeasonWeeks(world), day: 7 };
  recordMove(world, {
    kind: 'extension',
    fromClubId: contract.clubId,
    toClubId: contract.clubId,
    fee: 0,
    weeklyWage: contract.weeklyWage,
  });
  postMessage(world, 'contract-extended', {
    club: world.clubs[contract.clubId]!.name,
    season: contract.end.season,
  });
}
