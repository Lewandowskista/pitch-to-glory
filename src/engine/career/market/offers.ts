import type {
  Club,
  ContractTerms,
  GameDate,
  Negotiation,
  NegotiationRound,
  ScoutingInterest,
  TransferOffer,
  World,
} from '../../../model/domain';
import { createRng } from '../../rng';
import { CONFIG } from '../../config';
import {
  addWeeks,
  ageOf,
  careerContract,
  compareDates,
  deservedRole,
  fee,
  M,
  marketValue,
  marketWage,
  ROLE_RANK,
  today,
  transferWindows,
  windowState,
  type Role,
} from './rules';
import { nextId, postMessage } from './records';
import { executeTransfer, signRenewal, startLoan } from './moves';

const N = M.negotiation;
const ROLE_UP: Record<Role, Role> = {
  backup: 'rotation',
  youth: 'rotation',
  rotation: 'key',
  key: 'key',
};

/** Open offers awaiting the player's answer. */
export function openOffers(world: World): TransferOffer[] {
  return world.offers.filter((offer) => offer.status === 'terms');
}
export function offerById(world: World, id: string): TransferOffer {
  const offer = world.offers.find((entry) => entry.id === id);
  if (!offer) throw new Error('Unknown offer');
  return offer;
}
/** When an offer lapses: three weeks, but never beyond the window it was made in. */
function expiry(world: World, kind: TransferOffer['kind'], seen: GameDate): GameDate {
  const weeks = kind === 'renewal' || kind === 'pre-contract' ? N.renewalWeeks : N.offerWeeks;
  const lapse = { ...addWeeks(world, seen, weeks - 1), day: 7 };
  const closes = seen.season === world.date.season ? windowState(world, seen.week).closes : null;
  if ((kind === 'transfer' || kind === 'loan') && closes !== null) {
    const end = { season: seen.season, week: closes, day: 7 };
    return compareDates(end, lapse) < 0 ? end : lapse;
  }
  return lapse;
}
/**
 * The week the player first sees an offer: offers made by the weekly simulation arrive with
 * the following week, offers from the player's own requests at once.
 */
export function offerSeen(world: World, weekly: boolean): GameDate {
  return weekly ? addWeeks(world, today(world), 1) : today(world);
}
/** Whether clubs can still make transfer or loan offers the player will see in a window. */
export function windowForOffers(world: World): boolean {
  const seen = offerSeen(world, true);
  return seen.season === world.date.season && windowState(world, seen.week).open;
}

function contractYears(age: number): number {
  return age <= 21 ? 4 : age <= 26 ? 3 : age <= 30 ? 2 : 1;
}

/**
 * The club's opening terms and private limits. Desire (its scouting confidence) and the
 * player's agent stretch the limits; a strong agent also earns one more counter-offer.
 */
function openTerms(world: World, offer: TransferOffer, club: Club, desire: number): Negotiation {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const agent = career.market.agentId ? world.agents[career.market.agentId] : undefined;
  const skill = agent?.negotiation ?? 0;
  const current = careerContract(world);
  const deserved = deservedRole(world, club, player);
  const role =
    offer.kind === 'renewal' && ROLE_RANK[current.role] > ROLE_RANK[deserved]
      ? current.role
      : deserved;
  const value = marketValue(world, player);
  const market = marketWage(club, player, role) * N.openingWage;
  const wage = Math.max(
    CONFIG.world.generation.wageFloor,
    Math.round(offer.kind === 'renewal' ? Math.max(market, current.weeklyWage * 1.05) : market),
  );
  const years = Math.min(N.maximumYears, contractYears(ageOf(world, player)));
  const clauseAllowed = club.reputation < 75;
  const terms: ContractTerms = {
    weeklyWage: wage,
    years,
    role,
    releaseClause: clauseAllowed ? Math.max(100, fee(value * N.defaultClauseFactor)) : null,
    signingBonus: Math.round(wage * (offer.kind === 'renewal' ? 2 : N.signingBonusWeeks)),
  };
  const id = nextId(world, 'negotiation');
  const maxWage = Math.round(
    wage * (1 + N.wageStretch + skill * N.agentStretch + (desire - 70) * N.desireStretch),
  );
  const negotiation: Negotiation = {
    id,
    offerId: offer.id,
    rounds: [{ actor: 'club', date: today(world), terms }],
    status: 'open',
    limits: {
      maxWage: Math.max(wage, maxWage),
      bestRole: desire >= N.roleConfidence ? ROLE_UP[role] : role,
      years: [Math.max(1, years - 1), Math.min(N.maximumYears, years + 1)],
      minimumClause: clauseAllowed ? Math.max(100, fee(value * N.minimumClauseFactor)) : null,
      maxSigningBonus: Math.round(wage * (N.maximumSigningBonusWeeks + skill * N.agentBonusWeeks)),
    },
    patience: N.patience + (skill >= N.agentPatienceAt ? 1 : 0),
    agentEstimate: null,
  };
  if (agent) {
    const error =
      (createRng(`${world.seed}:${id}:estimate`).next() * 2 - 1) *
      ((100 - agent.negotiation) / N.estimateError);
    negotiation.agentEstimate = Math.round(negotiation.limits.maxWage * (1 + error));
  }
  world.negotiations[id] = negotiation;
  offer.negotiationId = id;
  return negotiation;
}

function newOffer(
  world: World,
  kind: TransferOffer['kind'],
  club: Club,
  weekly: boolean,
): TransferOffer {
  const player = world.players[world.career!.playerId]!;
  const offer: TransferOffer = {
    id: nextId(world, 'offer'),
    kind,
    clubId: club.id,
    parentClubId: careerContract(world).clubId,
    playerId: player.id,
    created: today(world),
    expires: expiry(world, kind, offerSeen(world, weekly)),
    fee: 0,
    bids: [],
    releaseClauseTriggered: false,
    loan: null,
    status: 'terms',
    negotiationId: null,
  };
  world.offers.push(offer);
  return offer;
}

/**
 * A club bids for the player. The selling club accepts its asking price (lower after a
 * transfer request) and must accept a bid that meets the release clause. A buyer bids twice
 * at most, never beyond its budget. Returns the offer, accepted or rejected.
 */
export function makeTransferBid(
  world: World,
  buyer: Club,
  confidence: number,
): TransferOffer | null {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const contract = careerContract(world);
  const value = marketValue(world, player);
  const asking = fee(
    value *
      M.askingFactor[contract.role] *
      (career.market.transferRequest ? M.transferRequestDiscount : 1),
  );
  const maxBid = fee(
    Math.min(buyer.finances.transferBudget, value * (1 + confidence * M.bidConfidenceWeight)),
  );
  const opening = fee(value * M.openingBid);
  const clause = contract.releaseClause;
  const meetsClause = clause !== null && maxBid >= clause && clause <= asking;
  // A buyer that cannot come close to the player's value does not bid at all.
  if (!meetsClause && (maxBid < opening / 2 || maxBid <= 0)) return null;
  const offer = newOffer(world, 'transfer', buyer, true);
  if (meetsClause) {
    offer.bids = [clause!];
    offer.fee = clause!;
    offer.releaseClauseTriggered = true;
  } else {
    offer.bids = [Math.min(opening, maxBid)];
    const second = Math.min(maxBid, asking);
    if (offer.bids[0]! < asking && second > offer.bids[0]!) offer.bids.push(second);
    offer.fee = offer.bids.at(-1)!;
    if (offer.fee < asking) offer.status = 'rejected';
  }
  if (offer.status === 'rejected') {
    postMessage(world, 'offer-rejected', {
      club: buyer.name,
      bid: offer.fee,
      parent: world.clubs[contract.clubId]!.name,
    });
    return offer;
  }
  openTerms(world, offer, buyer, confidence);
  postMessage(
    world,
    offer.releaseClauseTriggered ? 'release-clause' : 'offer-terms',
    { club: buyer.name, fee: offer.fee, parent: world.clubs[contract.clubId]!.name },
    offer.id,
  );
  return offer;
}

/** A loan offer to the end of the season, with the loan club's role promise. */
export function makeLoanOffer(world: World, club: Club): TransferOffer {
  const player = world.players[world.career!.playerId]!;
  const rng = createRng(`${world.seed}:loan:${club.id}:${world.date.season}:${world.date.week}`);
  const L = M.loans;
  const offer = newOffer(world, 'loan', club, true);
  const steps = Math.round((L.wageShare[1] - L.wageShare[0]) / 0.05);
  offer.loan = {
    wageShare: Math.round((L.wageShare[0] + rng.int(0, steps) * 0.05) * 100) / 100,
    purchaseOption:
      rng.next() < L.purchaseOptionChance
        ? fee(marketValue(world, player) * L.purchaseOptionFactor)
        : null,
    role: deservedRole(world, club, player),
  };
  postMessage(world, 'loan-offer', { club: club.name, role: offer.loan.role }, offer.id);
  return offer;
}

/** Pre-contract talks with a club, for a free move when the current contract expires. */
export function makePreContractOffer(world: World, club: Club, confidence: number): TransferOffer {
  const offer = newOffer(world, 'pre-contract', club, true);
  openTerms(world, offer, club, confidence);
  postMessage(world, 'pre-contract-offer', { club: club.name }, offer.id);
  return offer;
}

/** Renewal talks with the current club. */
export function makeRenewalOffer(world: World, improved: boolean, weekly: boolean): TransferOffer {
  const club = world.clubs[careerContract(world).clubId]!;
  const offer = newOffer(world, 'renewal', club, weekly);
  openTerms(world, offer, club, 70);
  postMessage(
    world,
    improved ? 'renewal-improved' : 'renewal-offer',
    { club: club.name },
    offer.id,
  );
  return offer;
}

/** A loan club taking up its purchase option offers a permanent move at the agreed fee. */
export function makePurchaseOffer(world: World, club: Club, amount: number): TransferOffer {
  const offer = newOffer(world, 'transfer', club, false);
  offer.bids = [amount];
  offer.fee = amount;
  openTerms(world, offer, club, 80);
  postMessage(world, 'loan-purchase', { club: club.name, fee: amount }, offer.id);
  return offer;
}

function finish(world: World, offer: TransferOffer, terms: ContractTerms | null): void {
  if (offer.kind === 'loan') startLoan(world, offer);
  else if (offer.kind === 'renewal') signRenewal(world, offer, terms!);
  else if (offer.kind === 'pre-contract') {
    offer.status = 'agreed';
    postMessage(world, 'pre-contract-agreed', {
      club: world.clubs[offer.clubId]!.name,
      season: world.date.season + 1,
    });
  } else executeTransfer(world, offer, terms!);
}

function assertOpen(world: World, offer: TransferOffer): void {
  if (offer.status !== 'terms') throw new Error('This offer is no longer open');
  if (compareDates(offer.expires, world.date) < 0) throw new Error('This offer has expired');
  if (offer.kind === 'transfer' || offer.kind === 'loan')
    if (!windowState(world).open) throw new Error('The transfer window is closed');
}

/** Accept the club's latest terms (or a loan) and complete the deal. */
export function acceptTerms(world: World, offerId: string): void {
  const offer = offerById(world, offerId);
  assertOpen(world, offer);
  if (offer.kind === 'loan') return finish(world, offer, null);
  const negotiation = world.negotiations[offer.negotiationId!]!;
  const terms = negotiation.rounds.filter((round) => round.actor === 'club').at(-1)!.terms;
  negotiation.status = 'accepted';
  finish(world, offer, terms);
}

export function declineOffer(world: World, offerId: string): void {
  const offer = offerById(world, offerId);
  if (offer.status !== 'terms') throw new Error('This offer is no longer open');
  offer.status = 'declined';
  if (offer.negotiationId) world.negotiations[offer.negotiationId]!.status = 'declined';
  coolInterest(world, offer.clubId);
}

function coolInterest(world: World, clubId: string): void {
  for (const interest of world.scouting)
    if (interest.clubId === clubId) {
      interest.stage = 'scouting';
      interest.confidence = Math.min(interest.confidence, M.scouting.offerAt - 10);
      interest.lastOffer = today(world);
    }
}

export function validTerms(terms: ContractTerms): boolean {
  return (
    Number.isSafeInteger(terms.weeklyWage) &&
    terms.weeklyWage >= CONFIG.world.generation.wageFloor &&
    terms.weeklyWage <= 10_000_000 &&
    Number.isSafeInteger(terms.years) &&
    terms.years >= 1 &&
    terms.years <= N.maximumYears &&
    ['key', 'rotation', 'backup', 'youth'].includes(terms.role) &&
    (terms.releaseClause === null ||
      (Number.isSafeInteger(terms.releaseClause) && terms.releaseClause > 0)) &&
    Number.isSafeInteger(terms.signingBonus) &&
    terms.signingBonus >= 0
  );
}

export type CounterReason = 'wage' | 'role' | 'years' | 'clause' | 'no-clause' | 'bonus';
/** Which of the player's terms the club cannot meet, against its private limits. */
export function termsGaps(negotiation: Negotiation, terms: ContractTerms): CounterReason[] {
  const L = negotiation.limits;
  const reasons: CounterReason[] = [];
  if (terms.weeklyWage > L.maxWage) reasons.push('wage');
  if (ROLE_RANK[terms.role] > ROLE_RANK[L.bestRole]) reasons.push('role');
  if (terms.years < L.years[0] || terms.years > L.years[1]) reasons.push('years');
  if (terms.releaseClause !== null) {
    if (L.minimumClause === null) reasons.push('no-clause');
    else if (terms.releaseClause < L.minimumClause) reasons.push('clause');
  }
  if (terms.signingBonus > L.maxSigningBonus) reasons.push('bonus');
  return reasons;
}

export type CounterResult = 'accept' | 'counter' | 'walk-away';
/**
 * The player's counter-offer. The club accepts terms within its limits, walks away from
 * demands far above them or when its patience runs out, and otherwise meets the player
 * halfway on each item it cannot accept. Deterministic, so the reasons can be shown.
 */
export function counterOffer(world: World, offerId: string, terms: ContractTerms): CounterResult {
  const offer = offerById(world, offerId);
  assertOpen(world, offer);
  if (offer.kind === 'loan' || !offer.negotiationId) throw new Error('Loans have fixed terms');
  if (!validTerms(terms)) throw new Error('Invalid terms');
  const negotiation = world.negotiations[offer.negotiationId]!;
  const reasons = termsGaps(negotiation, terms);
  const round: NegotiationRound = {
    actor: 'player',
    date: today(world),
    terms: { ...terms },
    reasons,
  };
  negotiation.rounds.push(round);
  if (!reasons.length) {
    round.response = 'accept';
    negotiation.status = 'accepted';
    negotiation.rounds.push({ actor: 'club', date: today(world), terms: { ...terms } });
    finish(world, offer, terms);
    return 'accept';
  }
  const L = negotiation.limits;
  if (negotiation.patience <= 0 || terms.weeklyWage > L.maxWage * N.walkAwayWage) {
    round.response = 'walk-away';
    negotiation.status = 'collapsed';
    offer.status = 'collapsed';
    coolInterest(world, offer.clubId);
    return 'walk-away';
  }
  round.response = 'counter';
  negotiation.patience--;
  const last = negotiation.rounds.filter((r) => r.actor === 'club').at(-1)!.terms;
  const clamp = (value: number, [low, high]: [number, number]) =>
    Math.max(low, Math.min(high, value));
  negotiation.rounds.push({
    actor: 'club',
    date: today(world),
    terms: {
      weeklyWage: reasons.includes('wage')
        ? Math.min(L.maxWage, Math.round((last.weeklyWage + terms.weeklyWage) / 2))
        : terms.weeklyWage,
      role: reasons.includes('role') ? L.bestRole : terms.role,
      years: clamp(terms.years, L.years),
      // No clause suits the club; one it allows is held at its minimum.
      releaseClause:
        terms.releaseClause === null || L.minimumClause === null
          ? null
          : Math.max(L.minimumClause, terms.releaseClause),
      signingBonus: reasons.includes('bonus')
        ? Math.min(L.maxSigningBonus, Math.round((last.signingBonus + terms.signingBonus) / 2))
        : terms.signingBonus,
    },
  });
  return 'counter';
}

/** Offers past their date lapse; the clubs' interest cools until the next window. */
export function expireOffers(world: World): void {
  for (const offer of world.offers) {
    // Runs at the end of a week: offers whose last week this is lapse now.
    if (
      offer.status !== 'terms' ||
      offer.expires.season > world.date.season ||
      (offer.expires.season === world.date.season && offer.expires.week > world.date.week)
    )
      continue;
    offer.status = 'expired';
    if (offer.negotiationId) world.negotiations[offer.negotiationId]!.status = 'expired';
    coolInterest(world, offer.clubId);
    postMessage(world, 'offer-expired', { club: world.clubs[offer.clubId]!.name });
  }
}

/** Whether a club already tried during the current window (or recently, outside windows). */
export function triedRecently(world: World, interest: ScoutingInterest): boolean {
  if (!interest.lastOffer) return false;
  const window = transferWindows(world).find(
    ([from, to]) => world.date.week >= from && world.date.week <= to,
  );
  if (window && interest.lastOffer.season === world.date.season)
    return interest.lastOffer.week >= window[0];
  return compareDates(addWeeks(world, interest.lastOffer, 8), world.date) > 0;
}
