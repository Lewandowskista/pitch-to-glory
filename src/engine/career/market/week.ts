import type { Club, Fixture, ScoutingInterest, World } from '../../../model/domain';
import { createRng, type Rng } from '../../rng';
import { CONFIG } from '../../config';
import { clubContinental } from '../../world/continental';
import { playerAbility } from '../../strength';
import { getSeasonWeeks } from '../../world/calendar';
import { isActiveClub } from '../../world/dressing';
import {
  activeLoan,
  careerContract,
  careerSelection,
  clubLevel,
  compareDates,
  currentRole,
  deservedRole,
  M,
  marketWage,
  projectedAbility,
  recentRating,
  today,
  transferWindows,
  addWeeks,
} from './rules';
import { ensureClubRelationships, nextId, postMessage } from './records';
import { endLoan, executeTransfer, extendContract, payWeek } from './moves';
import {
  expireOffers,
  makeLoanOffer,
  makePreContractOffer,
  makePurchaseOffer,
  makeRenewalOffer,
  makeTransferBid,
  openOffers,
  triedRecently,
  windowForOffers,
} from './offers';

const S = M.scouting;

/**
 * Fixtures of the career player's club this week that the player is fit for but will not
 * play: not picked by the manager, or not yet registered after a move. The background
 * resolver leaves them out of the XI.
 */
export function benchedCareerFixtures(world: World): Fixture[] {
  const career = world.career;
  if (!career || world.phase === 'complete') return [];
  const player = world.players[career.playerId]!;
  if (!player.clubId || player.injuryId) return [];
  return Object.values(world.fixtures).filter(
    (fixture) =>
      fixture.date.season === world.date.season &&
      fixture.date.week === world.date.week &&
      (fixture.homeId === player.clubId || fixture.awayId === player.clubId) &&
      !world.results[fixture.id] &&
      !careerSelection(world, fixture).selected,
  );
}

/** Performance as scouts read it: 0.1 to 2 from recent ratings. */
function performance(world: World): { factor: number; idle: boolean } {
  const { rating, matches } = recentRating(world);
  return {
    factor: Math.max(0.1, Math.min(2, 0.3 + (rating - S.neutralRating) * 0.9)),
    idle: matches === 0,
  };
}

interface Context {
  rng: Rng;
  club: Club;
  parent: Club;
  ability: number;
  projected: number;
  ownLevel: number;
  visibility: number;
  network: number;
  levels: Map<string, number>;
}
function context(world: World, rng: Rng): Context {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const club = world.clubs[player.clubId!]!;
  const parent = world.clubs[careerContract(world).clubId]!;
  const tier = world.leagues[club.leagueId]?.tier ?? S.visibility.length;
  const agent = career.market.agentId ? world.agents[career.market.agentId] : undefined;
  const levels = new Map<string, number>();
  return {
    rng,
    club,
    parent,
    ability: playerAbility(player),
    projected: projectedAbility(world, player),
    ownLevel: clubLevel(world, parent),
    // Continental football puts a player in front of more scouts (AGENTS.md §8).
    visibility:
      S.visibility[Math.min(S.visibility.length, tier) - 1]! +
      (clubContinental(world, club) ? CONFIG.world.continental.visibility : 0),
    network: agent?.network ?? 0,
    levels,
  };
}
function level(world: World, ctx: Context, club: Club): number {
  let value = ctx.levels.get(club.id);
  if (value === undefined) {
    value = clubLevel(world, club);
    ctx.levels.set(club.id, value);
  }
  return value;
}
/** A club that would buy the player: no smaller than the parent club, and good enough. */
function transferFit(world: World, ctx: Context, club: Club): boolean {
  return (
    club.id !== ctx.parent.id &&
    club.id !== ctx.club.id &&
    isActiveClub(world, club) &&
    !club.identity?.reserveParentId &&
    club.reputation >= ctx.parent.reputation - M.upwardStep &&
    level(world, ctx, club) - S.bandBelow <= ctx.projected &&
    level(world, ctx, club) >= ctx.ownLevel - 2
  );
}
/** A club that would take the player on loan: smaller, domestic, and where they would play. */
function loanFit(world: World, ctx: Context, club: Club): boolean {
  return (
    club.id !== ctx.parent.id &&
    club.id !== ctx.club.id &&
    isActiveClub(world, club) &&
    !club.identity?.reserveParentId &&
    club.countryId === ctx.parent.countryId &&
    club.reputation <= ctx.parent.reputation &&
    level(world, ctx, club) <= ctx.ability + 2 &&
    level(world, ctx, club) >= ctx.ability - 12
  );
}

/** Whether the player is a candidate for a loan: asked for one, or not getting games. */
export function wantsLoan(world: World): boolean {
  const market = world.career!.market;
  if (activeLoan(world, world.career!.playerId)) return false;
  if (market.loanRequest) return true;
  const matchdays = market.selection.selected + market.selection.dropped;
  return (
    ['backup', 'youth'].includes(careerContract(world).role) &&
    market.selection.dropped >= M.loans.droppedMatchdays &&
    market.selection.selected / Math.max(1, matchdays) < M.loans.selectionBelow
  );
}

function addInterest(
  world: World,
  club: Club,
  kind: ScoutingInterest['kind'],
  confidence = 0,
): void {
  world.scouting.push({
    id: nextId(world, 'interest'),
    clubId: club.id,
    playerId: world.career!.playerId,
    kind,
    started: today(world),
    weeksObserved: 0,
    confidence,
    stage: confidence >= S.scoutingAt ? 'scouting' : 'watching',
    lastOffer: null,
  });
}

/** Clubs watch, scout and grow confident in the player, or lose interest. */
function updateScouting(world: World, ctx: Context): void {
  const { factor, idle } = performance(world);
  const networkBonus = 1 + ctx.network / 200;
  const loanWanted = wantsLoan(world);
  world.scouting = world.scouting.filter((interest) => {
    const club = world.clubs[interest.clubId];
    if (!club) return false;
    const fits =
      interest.kind === 'loan'
        ? loanWanted && loanFit(world, ctx, club)
        : transferFit(world, ctx, club);
    interest.weeksObserved++;
    const growth = !fits
      ? -10
      : idle
        ? -S.idleDecay
        : factor * S.gain * networkBonus - S.decay + ctx.rng.int(-S.noise, S.noise);
    interest.confidence = Math.max(0, Math.min(100, Math.round(interest.confidence + growth)));
    const offerAt = interest.kind === 'loan' ? S.loanOfferAt : S.offerAt;
    const weeks = interest.kind === 'loan' ? S.loanWeeks : S.weeks;
    interest.stage =
      interest.confidence >= offerAt && interest.weeksObserved >= weeks
        ? 'offer'
        : interest.confidence >= S.scoutingAt
          ? 'scouting'
          : 'watching';
    return interest.confidence > 0 || interest.weeksObserved < 2;
  });
  const tracked = new Set(world.scouting.map((interest) => interest.clubId));
  const count = (kind: ScoutingInterest['kind']) =>
    world.scouting.filter((interest) => interest.kind === kind).length;
  const clubs = Object.values(world.clubs).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const club of clubs) {
    if (tracked.has(club.id)) continue;
    if (count('transfer') < S.maximumTransfer && transferFit(world, ctx, club)) {
      const abroad = club.countryId !== ctx.parent.countryId;
      const chance =
        S.startChance *
        factor *
        ctx.visibility *
        networkBonus *
        (abroad ? S.foreign * (1 + ctx.network / 150) : 1);
      if (ctx.rng.next() < chance) {
        addInterest(world, club, 'transfer');
        tracked.add(club.id);
      }
    } else if (loanWanted && count('loan') < S.maximumLoan && loanFit(world, ctx, club)) {
      if (ctx.rng.next() < S.startChance * 2) {
        addInterest(world, club, 'loan', 10);
        tracked.add(club.id);
      }
    }
  }
}

/** During a window, clubs that are ready make bids and loan offers. */
function makeOffers(world: World, ctx: Context): void {
  const career = world.career!;
  const loan = activeLoan(world, career.playerId);
  const contract = careerContract(world);
  const window = { open: windowForOffers(world) };
  const winterStart = transferWindows(world)[1]?.[0] ?? getSeasonWeeks(world);
  const finalSeason = contract.end.season === world.date.season;
  const ready = world.scouting
    .filter((interest) => interest.stage === 'offer' && !triedRecently(world, interest))
    .sort((a, b) => b.confidence - a.confidence || (a.id < b.id ? -1 : 1));
  for (const interest of ready) {
    if (openOffers(world).filter((o) => o.kind !== 'renewal').length >= S.maximumOpenOffers) break;
    const club = world.clubs[interest.clubId]!;
    if (world.offers.some((o) => o.clubId === club.id && ['terms', 'agreed'].includes(o.status)))
      continue;
    if (world.offers.some((o) => o.kind === 'pre-contract' && o.status === 'agreed')) break;
    if (interest.kind === 'loan') {
      if (!window.open || loan) continue;
      const chance = career.market.loanRequest ? M.loans.requestedChance : M.loans.chance;
      if (ctx.rng.next() >= chance) continue;
      makeLoanOffer(world, club);
    } else if (finalSeason && world.date.week >= winterStart) {
      if (ctx.rng.next() >= S.offerChance) continue;
      makePreContractOffer(world, club, interest.confidence);
    } else {
      if (!window.open || loan) continue;
      if (ctx.rng.next() >= S.offerChance) continue;
      makeTransferBid(world, club, interest.confidence);
    }
    interest.lastOffer = today(world);
  }
}

/** The club opens renewal talks in a final season, or improves an outgrown contract. */
function renewals(world: World, ctx: Context): void {
  if (activeLoan(world, world.career!.playerId)) return;
  const R = M.renewal;
  const contract = careerContract(world);
  const recent = world.offers.some(
    (o) =>
      o.kind === 'renewal' &&
      (o.status === 'terms' ||
        compareDates(addWeeks(world, o.created, R.askCooldownWeeks * 2), world.date) > 0),
  );
  if (recent) return;
  const weeks = getSeasonWeeks(world);
  const player = world.players[world.career!.playerId]!;
  if (contract.end.season === world.date.season && world.date.week >= R.finalSeasonFrom * weeks) {
    if (ctx.rng.next() < R.chance) makeRenewalOffer(world, false, true);
    return;
  }
  const deserved = deservedRole(world, ctx.parent, player);
  const wage = marketWage(ctx.parent, player, deserved);
  if (wage >= contract.weeklyWage * R.underpaid && ctx.rng.next() < R.improveChance)
    makeRenewalOffer(world, true, true);
}

/** Agents bring clubs to the table and advise on moves and contracts. */
function agentWork(world: World, ctx: Context): void {
  const market = world.career!.market;
  const agent = market.agentId ? world.agents[market.agentId] : undefined;
  if (!agent) return;
  const A = M.agents;
  const pitch =
    A.pitchChance * agent.network * (agent.personality === 'connected' ? A.connectedPitch : 1);
  if (
    ctx.rng.next() < pitch &&
    world.scouting.filter((i) => i.kind === 'transfer').length < S.maximumTransfer
  ) {
    const tracked = new Set(world.scouting.map((interest) => interest.clubId));
    const candidates = Object.values(world.clubs)
      .filter((club) => !tracked.has(club.id) && transferFit(world, ctx, club))
      .sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1))
      .slice(0, 5);
    if (candidates.length) {
      const club = ctx.rng.pick(candidates);
      addInterest(world, club, 'transfer', S.scoutingAt + 5);
      postMessage(world, 'agent-pitch', { agent: agent.name, club: club.name });
    }
  }
  if (
    market.lastAdvice &&
    compareDates(addWeeks(world, market.lastAdvice, A.adviceWeeks), world.date) > 0
  )
    return;
  const player = world.players[world.career!.playerId]!;
  const contract = careerContract(world);
  const underpaid =
    marketWage(ctx.parent, player, deservedRole(world, ctx.parent, player)) >=
    contract.weeklyWage * A.underpaid;
  const bigger = world.scouting.find(
    (interest) =>
      interest.kind === 'transfer' &&
      interest.stage !== 'watching' &&
      world.clubs[interest.clubId]!.reputation >= ctx.parent.reputation + 10,
  );
  if (
    bigger &&
    !market.transferRequest &&
    (agent.personality === 'aggressive' || market.selection.promiseBroken || underpaid)
  ) {
    postMessage(world, 'agent-push', {
      agent: agent.name,
      club: world.clubs[bigger.clubId]!.name,
    });
    market.lastAdvice = today(world);
  } else if (underpaid) {
    postMessage(world, 'agent-renewal', { agent: agent.name });
    market.lastAdvice = today(world);
  }
}

/** Matchdays missed through selection; a broken role promise is flagged once a season. */
function reviewSelection(world: World, benched: readonly Fixture[]): void {
  const market = world.career!.market;
  const selection = market.selection;
  const player = world.players[world.career!.playerId]!;
  const club = world.clubs[player.clubId!]!;
  for (const fixture of benched) {
    if (!careerSelection(world, fixture).registered) continue;
    selection.dropped++;
    // One note when the player falls out of the side, not one per matchday.
    const recent = world.inbox.some(
      (message) =>
        message.subjectKey === 'dropped' &&
        compareDates(addWeeks(world, message.date, 4), world.date) > 0,
    );
    if (recent) continue;
    const opponent = world.clubs[fixture.homeId === club.id ? fixture.awayId : fixture.homeId]!;
    postMessage(world, 'dropped', { club: club.name, opponent: opponent.name });
  }
  const role = currentRole(world);
  const matchdays = selection.selected + selection.dropped;
  if (
    !selection.promiseBroken &&
    (role === 'key' || role === 'rotation') &&
    matchdays >= M.selection.promiseMinimumMatchdays &&
    selection.selected / matchdays < M.selection.promise[role]
  ) {
    selection.promiseBroken = true;
    postMessage(world, 'promise-broken', { club: club.name, role });
  }
}

/**
 * The career player's market week, after the week's fixtures and training: pay day,
 * relationships, playing time, lapsed offers, scouting, offers, renewals and agent advice.
 * Mutates the world, which the caller owns.
 */
export function marketWeek(world: World, benched: readonly Fixture[]): void {
  const rng = createRng(`${world.seed}:market:${world.date.season}:${world.date.week}`);
  ensureClubRelationships(world, true);
  payWeek(world);
  reviewSelection(world, benched);
  expireOffers(world);
  const ctx = context(world, rng);
  updateScouting(world, ctx);
  makeOffers(world, ctx);
  renewals(world, ctx);
  agentWork(world, ctx);
  pruneOffers(world);
}

/** Resolved offers older than two seasons, and their negotiations, are dropped. */
function pruneOffers(world: World): void {
  const keep = (offer: (typeof world.offers)[number]) =>
    ['terms', 'agreed'].includes(offer.status) || offer.created.season >= world.date.season - 1;
  for (const offer of world.offers)
    if (!keep(offer) && offer.negotiationId) delete world.negotiations[offer.negotiationId];
  world.offers = world.offers.filter(keep);
}

/**
 * Season rollover for the career, after the new season's date is set: loans end (a loan
 * club may take up its purchase option), agreed pre-contracts complete, an expired contract
 * is extended by the club's option, and lapsed talks close.
 */
export function marketRollover(world: World): void {
  const career = world.career!;
  const market = career.market;
  const loan = activeLoan(world, career.playerId);
  let purchase: { clubId: string; fee: number } | null = null;
  if (loan) {
    const record = world.career!.matches.filter(
      (m) =>
        m.season === world.date.season - 1 &&
        compareDates({ season: m.season, week: m.week, day: 7 }, loan.start) >= 0,
    );
    const average = record.reduce((sum, m) => sum + m.rating, 0) / Math.max(1, record.length);
    if (
      loan.purchaseOption !== null &&
      record.length >= 5 &&
      average >= M.loans.purchaseRating &&
      world.clubs[loan.destinationClubId] &&
      isActiveClub(world, world.clubs[loan.destinationClubId]!)
    )
      purchase = { clubId: loan.destinationClubId, fee: loan.purchaseOption };
    endLoan(world, loan);
  }
  for (const offer of world.offers) {
    if (offer.status !== 'terms') continue;
    offer.status = 'expired';
    if (offer.negotiationId) world.negotiations[offer.negotiationId]!.status = 'expired';
  }
  const agreed = world.offers.find((o) => o.kind === 'pre-contract' && o.status === 'agreed');
  const contract = careerContract(world);
  if (agreed && world.clubs[agreed.clubId] && isActiveClub(world, world.clubs[agreed.clubId]!)) {
    const terms = world.negotiations[agreed.negotiationId!]!.rounds.filter(
      (round) => round.actor === 'club',
    ).at(-1)!.terms;
    executeTransfer(world, agreed, terms);
  } else if (contract.end.season < world.date.season) {
    if (agreed) agreed.status = 'collapsed';
    extendContract(world);
  }
  market.selection = {
    season: world.date.season,
    selected: 0,
    dropped: 0,
    promiseBroken: false,
  };
  // No fixture has been played yet: whoever the player is registered with, they can play.
  market.registeredFrom = today(world);
  if (purchase) makePurchaseOffer(world, world.clubs[purchase.clubId]!, purchase.fee);
}
