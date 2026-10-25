import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  applyMarketAction,
  bridgeWage,
  careerContract,
  contractAskState,
  contractExpiring,
  makeRenewalOffer,
  marketRollover,
  marketSeasonEnd,
} from '../src/engine/career/market';
import { hubPriorities } from '../src/screens/career/agenda';
import { validateWorld } from '../src/persistence/worldSchema';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft: CareerDraft = {
  name: 'Robin Vale',
  avatar: {
    face: 1,
    skin: 2,
    hair: 3,
    hairColor: 4,
    facialHair: 0,
    eyebrows: 1,
    eyes: 2,
    accessory: 3,
  },
  nationalityId: 'country:0',
  position: 'ST',
  foot: 'left',
  age: 17,
  archetype: 'finisher',
};

let season: World;
beforeAll(() => {
  const base = generateWorld('expiry-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'expiry-tests')[0]!;
  season = createCareer(base, draft, trial.id, 'expiry-tests');
  while (season.phase === 'active')
    season = advanceCareerWeek(season, { inPlace: true, autoPlay: true }).world;
}, 300000);

const me = (world: World) => world.players[world.career!.playerId]!;
/** The season is over, the contract ends with it and the club's option is already used. */
function expiring(input: World, interested: number): World {
  const world = clone(input);
  const contract = careerContract(world);
  contract.end = { ...contract.end, season: world.date.season };
  contract.optionTaken = true;
  // Start from no talks at all, so only the season's end opens any.
  world.offers = [];
  world.negotiations = {};
  world.scouting = [];
  const clubs = Object.values(world.clubs)
    .filter((club) => club.id !== contract.clubId && club.playerIds.length > 0)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, interested);
  for (const [index, club] of clubs.entries())
    world.scouting.push({
      id: `interest:test:${index}`,
      clubId: club.id,
      playerId: me(world).id,
      kind: 'transfer',
      started: { ...world.date, week: 1 },
      weeksObserved: 10,
      confidence: 80,
      stage: 'offer',
      lastOffer: null,
    });
  return world;
}

describe('contract expiry', () => {
  it('never moves the player without an accepted deal', () => {
    const world = expiring(season, 3);
    const clubId = careerContract(world).clubId;
    expect(contractExpiring(world)).toBe(true);
    const wage = bridgeWage(world);
    marketSeasonEnd(world);
    const talks = world.offers.filter((o) => o.kind === 'pre-contract' && o.status === 'terms');
    expect(talks).toHaveLength(3);
    expect(world.inbox.at(-1)!.subjectKey).toBe('contract-decision');
    // The hub asks for the decision.
    expect(hubPriorities(world, null).some((item) => item.kind === 'contract')).toBe(true);
    // Nothing accepted: the player stays on the bridge deal, and the talks lapse.
    const next = startNextSeason(world);
    expect(me(next).clubId).toBe(clubId);
    const contract = careerContract(next);
    expect(contract.end.season).toBe(next.date.season);
    expect(contract.weeklyWage).toBe(wage);
    expect(next.offers.every((o) => o.status !== 'terms' && o.status !== 'agreed')).toBe(true);
    expect(next.career!.market.moves.at(-1)!.kind).toBe('extension');
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);

  it('moves the player on a free when they accept a club’s terms', () => {
    const world = expiring(season, 2);
    marketSeasonEnd(world);
    const offer = world.offers.find((o) => o.kind === 'pre-contract' && o.status === 'terms')!;
    const { world: agreed } = applyMarketAction(world, { type: 'accept', offerId: offer.id });
    expect(agreed.offers.find((o) => o.id === offer.id)!.status).toBe('agreed');
    expect(contractExpiring(agreed)).toBe(false);
    expect(hubPriorities(agreed, null).some((item) => item.kind === 'contract')).toBe(false);
    const next = startNextSeason(agreed);
    expect(me(next).clubId).toBe(offer.clubId);
  }, 120000);

  it('stays playable for an older player nobody wants', () => {
    const world = expiring(season, 0);
    me(world).birthSeason = world.date.season - 35;
    marketSeasonEnd(world);
    expect(world.offers).toHaveLength(0);
    expect(world.inbox.at(-1)!.subjectKey).toBe('contract-decision');
    const next = startNextSeason(world);
    expect(next.career).toBeDefined();
    expect(me(next).clubId).toBe(careerContract(world).clubId);
  }, 120000);

  it('leaves a first expiry to the club option, with no decision to make', () => {
    const world = expiring(season, 3);
    careerContract(world).optionTaken = false;
    expect(contractExpiring(world)).toBe(false);
    marketSeasonEnd(world);
    expect(world.offers).toHaveLength(0);
    const next = startNextSeason(world);
    expect(careerContract(next).optionTaken).toBe(true);
    expect(me(next).clubId).toBe(careerContract(world).clubId);
  }, 120000);
});

describe('a pre-contract against a renewal (0.9.1)', () => {
  /** An expiring contract at the season's end, with free-move and renewal talks both open. */
  function bothOpen() {
    const world = expiring(season, 2);
    marketSeasonEnd(world);
    const free = world.offers.find((o) => o.kind === 'pre-contract' && o.status === 'terms')!;
    const renewal = makeRenewalOffer(world, false, false);
    return { world, free, renewal, home: careerContract(world).clubId };
  }
  const status = (world: World, id: string) => world.offers.find((o) => o.id === id)!.status;
  const moves = (world: World) => world.career!.market.moves.map((move) => move.kind);

  it('closes renewal talks once a free move is agreed', () => {
    const { world, free, renewal } = bothOpen();
    const { world: agreed } = applyMarketAction(world, { type: 'accept', offerId: free.id });
    expect(status(agreed, free.id)).toBe('agreed');
    expect(status(agreed, renewal.id)).toBe('expired');
    expect(agreed.negotiations[renewal.negotiationId!]!.status).toBe('expired');
    expect(contractAskState(agreed)).toBe('pre-contract');
    expect(() => applyMarketAction(agreed, { type: 'accept', offerId: renewal.id })).toThrow();
    expect(() => applyMarketAction(agreed, { type: 'ask-contract' })).toThrow();
    const next = startNextSeason(agreed);
    expect(me(next).clubId).toBe(free.clubId);
    expect(moves(next)).toContain('pre-contract');
    expect(moves(next)).not.toContain('renewal');
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);

  it('keeps a renewal signed first and closes the free-move talks', () => {
    const { world, free, renewal, home } = bothOpen();
    const { world: signed } = applyMarketAction(world, { type: 'accept', offerId: renewal.id });
    expect(status(signed, free.id)).toBe('expired');
    expect(() => applyMarketAction(signed, { type: 'accept', offerId: free.id })).toThrow();
    const end = careerContract(signed).end.season;
    expect(end).toBeGreaterThan(signed.date.season);
    const next = startNextSeason(signed);
    expect(me(next).clubId).toBe(home);
    expect(careerContract(next).end.season).toBe(end);
    expect(moves(next)).not.toContain('pre-contract');
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);

  it('lets a renewal signed beside an agreed free move cancel it, paying loyalty once', () => {
    const { world, free, renewal, home } = bothOpen();
    const { world: agreed } = applyMarketAction(world, { type: 'accept', offerId: free.id });
    // Renewal talks still open beside the agreement, as a save from before 0.9.1 can hold.
    agreed.offers.find((o) => o.id === renewal.id)!.status = 'terms';
    agreed.negotiations[renewal.negotiationId!]!.status = 'open';
    const loyalty = careerContract(agreed).loyaltyBonus;
    const earned = agreed.career!.market.finances.lifetimeEarnings;
    expect(loyalty).toBeGreaterThan(0);
    const { world: signed } = applyMarketAction(agreed, { type: 'accept', offerId: renewal.id });
    expect(status(signed, free.id)).toBe('collapsed');
    expect(contractAskState(signed)).not.toBe('pre-contract');
    expect(signed.career!.market.finances.lifetimeEarnings).toBeGreaterThanOrEqual(
      earned + loyalty,
    );
    // The season's end keeps the renewal and pays nothing more.
    const rolled = clone(signed);
    rolled.date = { season: rolled.date.season + 1, week: 1, day: 1 };
    const contract = careerContract(rolled);
    marketRollover(rolled);
    expect(me(rolled).clubId).toBe(home);
    expect(careerContract(rolled)).toEqual(contract);
    expect(rolled.career!.market.finances.lifetimeEarnings).toBe(
      signed.career!.market.finances.lifetimeEarnings,
    );
    expect(moves(rolled)).toEqual(moves(signed));
    const next = startNextSeason(signed);
    expect(me(next).clubId).toBe(home);
    expect(moves(next)).not.toContain('pre-contract');
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);

  it('lets the season’s end keep a renewal even beside an agreed free move', () => {
    const { world, free, renewal, home } = bothOpen();
    // Signed and agreed both, as a save from before 0.9.1 can hold.
    const { world: signed } = applyMarketAction(world, { type: 'accept', offerId: renewal.id });
    signed.offers.find((o) => o.id === free.id)!.status = 'agreed';
    signed.negotiations[free.negotiationId!]!.status = 'accepted';
    const earned = signed.career!.market.finances.lifetimeEarnings;
    const rolled = clone(signed);
    rolled.date = { season: rolled.date.season + 1, week: 1, day: 1 };
    marketRollover(rolled);
    expect(me(rolled).clubId).toBe(home);
    expect(status(rolled, free.id)).toBe('collapsed');
    expect(rolled.career!.market.finances.lifetimeEarnings).toBe(earned);
    expect(moves(rolled)).toEqual(moves(signed));
  }, 120000);
});
