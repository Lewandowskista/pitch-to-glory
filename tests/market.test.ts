import { beforeAll, describe, expect, it } from 'vitest';
import type { Club, ContractTerms, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { advanceCareerWeek } from '../src/engine/career/season';
import { playerAbility } from '../src/engine/strength';
import {
  applyMarketAction,
  agentAvailability,
  benchedCareerFixtures,
  careerContract,
  careerSelection,
  clubLevel,
  makeLoanOffer,
  makePreContractOffer,
  makeTransferBid,
  marketValue,
  marketWage,
  termsGaps,
  transferWindows,
  windowState,
} from '../src/engine/career/market';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

const MK = CONFIG.career.market;
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
let base: World;
let career: World;
beforeAll(() => {
  base = generateWorld('market-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'market-tests')[0]!;
  career = createCareer(base, draft, trial.id, 'market-tests');
});
const player = (world: World) => world.players[world.career!.playerId]!;
const own = (world: World) => world.clubs[player(world).clubId!]!;
/** The career starts in week 1, inside the summer window. */
function inWindow(): World {
  return clone(career);
}
function buyer(world: World): Club {
  const parent = own(world);
  return Object.values(world.clubs)
    .filter((club) => club.id !== parent.id && club.reputation > parent.reputation)
    .sort((a, b) => a.reputation - b.reputation || (a.id < b.id ? -1 : 1))[0]!;
}
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();

describe('market rules', () => {
  it('opens a summer and a winter window scaled to the season', () => {
    expect(transferWindows(career)).toEqual([
      [1, 5],
      [16, 19],
    ]);
    const national = generateWorld('market-windows');
    expect(transferWindows(national)).toEqual([
      [1, 8],
      [29, 33],
    ]);
    expect(windowState(career, 3)).toMatchObject({ open: true, closes: 5 });
    expect(windowState(career, 10)).toMatchObject({ open: false, opens: 16 });
    expect(windowState(career, 30)).toMatchObject({ open: false, opens: null });
  });
  it('values ability exponentially, rewards youthful upside and discounts expiring deals', () => {
    const world = clone(career);
    const p = player(world);
    const before = marketValue(world, p);
    p.attributes.finishing += 10;
    p.attributes.composure += 10;
    expect(marketValue(world, p)).toBeGreaterThan(before);
    const young = marketValue(world, p);
    p.birthSeason -= 15; // 32 years old
    expect(marketValue(world, p)).toBeLessThan(young / 2);
    p.birthSeason += 15;
    world.contracts[p.contractId!]!.end.season = world.date.season;
    expect(marketValue(world, p)).toBeLessThan(young);
  });
  it('pays a key player more than a backup at the same club', () => {
    const club = own(career);
    const p = player(career);
    expect(marketWage(club, p, 'key')).toBeGreaterThan(marketWage(club, p, 'backup'));
  });
});

describe('selection', () => {
  it('is deterministic, guarantees key players and waits for registration', () => {
    const world = clone(career);
    const fixture = Object.values(world.fixtures).find(
      (f) => f.homeId === own(world).id || f.awayId === own(world).id,
    )!;
    expect(careerSelection(world, fixture)).toEqual(careerSelection(clone(world), fixture));
    world.contracts[player(world).contractId!]!.role = 'key';
    expect(careerSelection(world, fixture).probability).toBeGreaterThanOrEqual(
      MK.selection.keyFloor,
    );
    world.career!.market.registeredFrom = { ...world.date, week: world.date.week + 1 };
    expect(careerSelection(world, fixture).selected).toBe(false);
  });
  it('leaves an unpicked player out of the background XI and counts the matchday', () => {
    let world = clone(career);
    // An out-of-form, tired backup is rarely picked.
    world.contracts[player(world).contractId!]!.role = 'backup';
    for (let week = 0; week < 20 && !benchedCareerFixtures(world).length; week++) {
      player(world).form = 0;
      player(world).fatigue = 90;
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    }
    const benched = benchedCareerFixtures(world);
    expect(benched.length).toBeGreaterThan(0);
    expect(pendingCareerFixture(world)?.id).not.toBe(benched[0]!.id);
    const apps = player(world).stats.appearances;
    const dropped = world.career!.market.selection.dropped;
    world = simulateWeek(world, { inPlace: true });
    expect(world.results[benched[0]!.id]).toBeDefined();
    expect(player(world).stats.appearances).toBe(apps);
    expect(world.career!.market.selection.dropped).toBe(dropped + benched.length);
    valid(world);
  }, 60000);
});

describe('transfers and negotiation', () => {
  it('rejects low bids, accepts the asking price and is forced by a release clause', () => {
    const world = inWindow();
    const club = buyer(world);
    club.finances.transferBudget = 1e9;
    const contract = careerContract(world);
    contract.releaseClause = null;
    const accepted = makeTransferBid(world, club, 90)!;
    expect(accepted.status).toBe('terms');
    expect(accepted.fee).toBeGreaterThanOrEqual(
      Math.floor(marketValue(world, player(world)) * MK.askingFactor[contract.role] - 100),
    );
    const poor = buyer(inWindow());
    const second = inWindow();
    second.clubs[poor.id]!.finances.transferBudget = Math.round(
      marketValue(second, player(second)) * 0.7,
    );
    careerContract(second).releaseClause = null;
    expect(makeTransferBid(second, second.clubs[poor.id]!, 50)!.status).toBe('rejected');
    const clause = inWindow();
    careerContract(clause).releaseClause = 1000;
    clause.clubs[poor.id]!.finances.transferBudget = 5000;
    const forced = makeTransferBid(clause, clause.clubs[poor.id]!, 50)!;
    expect(forced).toMatchObject({ status: 'terms', fee: 1000, releaseClauseTriggered: true });
    valid(world);
  });
  it('accepts terms within limits, counters a third of the way beyond them and walks away at last', () => {
    const world = inWindow();
    const club = buyer(world);
    club.finances.transferBudget = 1e9;
    const offer = makeTransferBid(world, club, 75)!;
    const negotiation = world.negotiations[offer.negotiationId!]!;
    const opening = negotiation.rounds[0]!.terms;
    // Above the limit but below the club's hidden walk-away point.
    const greedy: ContractTerms = {
      ...opening,
      weeklyWage: Math.round(negotiation.limits.maxWage * 1.05),
    };
    expect(termsGaps(negotiation, greedy)).toEqual(['wage']);
    const first = applyMarketAction(world, { type: 'counter', offerId: offer.id, terms: greedy });
    expect(first.result).toBe('counter');
    const after = first.world.negotiations[negotiation.id]!;
    const counter = after.rounds.at(-1)!.terms;
    expect(counter.weeklyWage).toBe(
      Math.min(
        negotiation.limits.maxWage,
        Math.round(
          opening.weeklyWage +
            (greedy.weeklyWage - opening.weeklyWage) *
              CONFIG.career.market.negotiation.counterShare,
        ),
      ),
    );
    // The input world is never mutated by an action.
    expect(world.negotiations[negotiation.id]!.rounds).toHaveLength(1);
    let current = first.world;
    let result: string = first.result;
    for (let round = 0; round < 5 && result === 'counter'; round++)
      ({ world: current, result } = applyMarketAction(current, {
        type: 'counter',
        offerId: offer.id,
        terms: greedy,
      }));
    expect(result).toBe('walk-away');
    expect(current.offers.find((o) => o.id === offer.id)!.status).toBe('collapsed');
    valid(current);
  });
  it('completes a transfer: fee, sell-on, registration and a valid world', () => {
    const world = inWindow();
    const club = buyer(world);
    club.finances.transferBudget = 1e9;
    const sellerId = own(world).id;
    const sellerBalance = world.clubs[sellerId]!.finances.balance;
    const offer = makeTransferBid(world, club, 75)!;
    const negotiation = world.negotiations[offer.negotiationId!]!;
    const terms = { ...negotiation.rounds[0]!.terms, weeklyWage: negotiation.limits.maxWage };
    const { world: next, result } = applyMarketAction(world, {
      type: 'counter',
      offerId: offer.id,
      terms,
    });
    expect(result).toBe('accept');
    const moved = player(next);
    expect(moved.clubId).toBe(club.id);
    expect(next.clubs[club.id]!.playerIds).toContain(moved.id);
    expect(next.clubs[sellerId]!.playerIds).not.toContain(moved.id);
    expect(next.clubs[sellerId]!.finances.balance).toBe(sellerBalance + offer.fee);
    const contract = careerContract(next);
    expect(contract).toMatchObject({
      clubId: club.id,
      weeklyWage: terms.weeklyWage,
      role: terms.role,
    });
    expect(contract.sellOnClubId).toBe(sellerId);
    expect(next.career!.market.moves.at(-1)).toMatchObject({ kind: 'transfer', fee: offer.fee });
    expect(next.career!.market.registeredFrom.week).toBe(next.date.week + 1);
    // Unchanged entities are shared, changed ones are copies.
    const untouched = Object.keys(world.players).find((id) => id !== moved.id)!;
    expect(next.players[untouched]).toBe(world.players[untouched]);
    expect(world.players[moved.id]!.clubId).toBe(sellerId);
    valid(next);
  });
  it('gives the agent a read of the limits and a better ceiling', () => {
    const plain = inWindow();
    const club = buyer(plain);
    club.finances.transferBudget = 1e9;
    const alone = makeTransferBid(plain, club, 75)!;
    const represented = inWindow();
    represented.clubs[club.id]!.finances.transferBudget = 1e9;
    const agentId = Object.values(represented.agents).sort(
      (a, b) => a.minimumStanding - b.minimumStanding,
    )[0]!.id;
    const hired = applyMarketAction(represented, { type: 'hire-agent', agentId }).world;
    const withAgent = makeTransferBid(hired, hired.clubs[club.id]!, 75)!;
    const a = plain.negotiations[alone.negotiationId!]!;
    const b = hired.negotiations[withAgent.negotiationId!]!;
    expect(a.agentEstimate).toBeNull();
    expect(b.limits.maxWage).toBeGreaterThan(a.limits.maxWage);
    const error = (100 - hired.agents[agentId]!.negotiation) / MK.negotiation.estimateError;
    expect(Math.abs(b.agentEstimate! / b.limits.maxWage - 1)).toBeLessThanOrEqual(error + 0.01);
  });
});

describe('requests, loans and contracts', () => {
  it('a transfer request costs trust and fans, lowers the asking price and can be withdrawn', () => {
    const world = inWindow();
    const trust = (w: World) =>
      w.relationships.find((r) => r.kind === 'manager' && r.targetId === own(w).managerId)!.value;
    const requested = applyMarketAction(world, { type: 'transfer-request' }).world;
    expect(trust(requested)).toBe(trust(world) + MK.transferRequest.trust);
    const club = buyer(requested);
    requested.clubs[club.id]!.finances.transferBudget = 1e9;
    careerContract(requested).releaseClause = null;
    const offer = makeTransferBid(requested, requested.clubs[club.id]!, 0)!;
    const value = marketValue(requested, player(requested));
    expect(offer.fee).toBeLessThan(value * MK.askingFactor[careerContract(requested).role]);
    const withdrawn = applyMarketAction(requested, { type: 'withdraw-transfer-request' }).world;
    expect(withdrawn.career!.market.transferRequest).toBeNull();
    expect(trust(withdrawn)).toBe(trust(requested) + MK.transferRequest.withdrawTrust);
  });
  it('a loan moves the registration, splits the wage and ends at the season rollover', () => {
    const world = inWindow();
    const parentId = own(world).id;
    const destination = Object.values(world.clubs).find(
      (club) =>
        club.countryId === own(world).countryId &&
        club.id !== parentId &&
        club.leagueId === own(world).leagueId,
    )!;
    const offer = makeLoanOffer(world, destination);
    const loaned = applyMarketAction(world, { type: 'accept', offerId: offer.id }).world;
    expect(player(loaned).clubId).toBe(destination.id);
    expect(careerContract(loaned).clubId).toBe(parentId);
    expect(loaned.loans).toHaveLength(1);
    valid(loaned);
    let done = loaned;
    while (done.phase === 'active')
      done = advanceCareerWeek(done, { inPlace: true, autoPlay: true }).world;
    const next = startNextSeason(done);
    expect(next.loans).toHaveLength(0);
    expect(player(next).clubId).toBe(parentId);
    expect(next.career!.market.moves.map((move) => move.kind)).toContain('loan-return');
    valid(next);
  }, 120000);
  it('refuses a new contract without reason, then renews in the final season', () => {
    const world = clone(career);
    // No reason: the best role already, paid well above the market, years to run.
    const contract = world.contracts[player(world).contractId!]!;
    contract.role = 'key';
    contract.weeklyWage *= 10;
    contract.end.season = world.date.season + 3;
    const refused = applyMarketAction(world, { type: 'ask-contract' });
    expect(refused.result).toBe('refused');
    expect(refused.world.career!.market.renewalAskAfter).not.toBeNull();
    const final = clone(career);
    careerContract(final).end.season = final.date.season;
    const opened = applyMarketAction(final, { type: 'ask-contract' });
    expect(opened.result).toBe('opened');
    const offer = opened.world.offers.find((o) => o.kind === 'renewal')!;
    const cash = opened.world.career!.market.finances.cash;
    const loyalty = careerContract(opened.world).loyaltyBonus;
    const signed = applyMarketAction(opened.world, { type: 'accept', offerId: offer.id }).world;
    expect(careerContract(signed).end.season).toBeGreaterThan(final.date.season);
    expect(signed.career!.market.finances.cash).toBeGreaterThanOrEqual(cash + loyalty);
    valid(signed);
  });
  it('takes up the club option when a contract runs out, or completes an agreed free move', () => {
    let world = clone(career);
    careerContract(world).end.season = world.date.season;
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const option = clone(world);
    const extended = startNextSeason(option);
    expect(careerContract(extended).end.season).toBe(extended.date.season);
    expect(extended.career!.market.moves.at(-1)!.kind).toBe('extension');
    valid(extended);
    const free = clone(world);
    const club = buyer(free);
    const offer = makePreContractOffer(free, club, 80);
    const agreed = applyMarketAction(free, { type: 'accept', offerId: offer.id }).world;
    expect(agreed.offers.find((o) => o.id === offer.id)!.status).toBe('agreed');
    const moved = startNextSeason(agreed);
    expect(player(moved).clubId).toBe(club.id);
    expect(moved.career!.market.moves.at(-1)!.kind).toBe('pre-contract');
    valid(moved);
  }, 120000);
  it('pays wages and bonuses weekly, less the agent commission', () => {
    const world = clone(career);
    const agentId = Object.values(world.agents).sort(
      (a, b) => a.minimumStanding - b.minimumStanding,
    )[0]!.id;
    const hired = applyMarketAction(world, { type: 'hire-agent', agentId }).world;
    expect(agentAvailability(hired, agentId)).toBe('current');
    let next = hired;
    for (let week = 0; week < 3; week++)
      next = advanceCareerWeek(next, { inPlace: true, autoPlay: true }).world;
    const finances = next.career!.market.finances;
    const pay = finances.lastPay!;
    const percent = next.agents[agentId]!.commissionPercent;
    expect(pay.commission).toBe(Math.round(((pay.wage + pay.bonuses) * percent) / 100));
    expect(finances.cash).toBe(finances.lifetimeEarnings - finances.agentFees);
    expect(finances.lifetimeEarnings).toBeGreaterThanOrEqual(careerContract(next).weeklyWage * 3);
  });
  it('agents only take clients with enough standing, and not twice in a few weeks', () => {
    const world = clone(career);
    const top = Object.values(world.agents).sort(
      (a, b) => b.minimumStanding - a.minimumStanding,
    )[0]!;
    expect(agentAvailability(world, top.id)).toBe('standing');
    expect(() => applyMarketAction(world, { type: 'hire-agent', agentId: top.id })).toThrow();
    const cheap = Object.values(world.agents).sort((a, b) => a.minimumStanding - b.minimumStanding);
    const hired = applyMarketAction(world, { type: 'hire-agent', agentId: cheap[0]!.id }).world;
    expect(agentAvailability(hired, cheap[1]!.id)).toBe('cooldown');
  });
});

describe('weekly market', () => {
  it('builds interest over weeks, deterministically, and makes offers only in windows', () => {
    const run = () => {
      let world = clone(career);
      // A player well above the trial club's level draws attention.
      const p = player(world);
      for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[])
        p.attributes[key] = Math.min(99, p.attributes[key] + 25);
      world.contracts[p.contractId!]!.role = 'key';
      const created: number[] = [];
      while (world.phase === 'active') {
        const before = world.offers.length;
        world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
        if (world.offers.length > before) created.push(world.date.week - 1);
      }
      return { world, created };
    };
    const first = run();
    const second = run();
    expect(JSON.stringify(first.world.scouting)).toBe(JSON.stringify(second.world.scouting));
    expect(JSON.stringify(first.world.offers)).toBe(JSON.stringify(second.world.offers));
    expect(first.world.scouting.length).toBeGreaterThan(0);
    const windows = transferWindows(first.world);
    for (const offer of first.world.offers.filter(
      (o) => o.kind === 'transfer' || o.kind === 'loan',
    ))
      expect(
        windows.some(([from, to]) => offer.expires.week >= from && offer.expires.week <= to),
      ).toBe(true);
    valid(first.world);
  }, 120000);
  it('interest favours clubs at or above the player’s level', () => {
    const world = clone(career);
    const p = player(world);
    for (const interest of world.scouting) {
      const club = world.clubs[interest.clubId]!;
      if (interest.kind === 'transfer')
        expect(clubLevel(world, club) - MK.scouting.bandBelow).toBeLessThanOrEqual(
          playerAbility(p) + 20,
        );
    }
  });
});

describe('market saves', () => {
  it('round trips a career with market records and rejects forged ones', () => {
    const world = inWindow();
    const club = buyer(world);
    club.finances.transferBudget = 1e9;
    makeTransferBid(world, club, 75);
    const payload = {
      kind: 'world' as const,
      world,
      gallery: { seed: 'm', generation: 0 },
      settings: DEFAULT_SETTINGS,
    };
    const save = createSave(1, 'Market', payload);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const forge = (change: (w: World) => void) => {
      const forged = clone(world);
      change(forged);
      return () => createSave(1, 'Forged', { ...payload, world: forged });
    };
    expect(forge((w) => (w.career!.market.agentId = 'agent:0'))).toThrow();
    expect(forge((w) => (w.offers[0]!.negotiationId = 'negotiation:missing'))).toThrow();
    expect(forge((w) => (w.inbox[0]!.subjectKey = 'forged'))).toThrow();
    expect(forge((w) => (w.career!.market.finances.agentFees = 5))).toThrow();
    expect(
      forge((w) =>
        w.loans.push({
          id: 'loan:x',
          playerId: w.career!.playerId,
          parentClubId: own(w).id,
          destinationClubId: club.id,
          start: { ...w.date },
          end: { ...w.date },
          wageShare: 0.5,
          purchaseOption: null,
          role: 'key',
        }),
      ),
    ).toThrow();
    const plain = clone(base);
    plain.inbox.push(clone(world).inbox[0]!);
    expect(() => createSave(1, 'Plain', { ...payload, world: plain })).toThrow();
  });
  it('migrates a schema-8 career save by adding the market', () => {
    const world = clone(career);
    delete (world.career as Partial<World['career']>)!.market;
    world.agents = {};
    world.relationships = [];
    const save = {
      format: 'pitch-to-glory',
      schemaVersion: 8,
      engineVersion: 'old',
      slot: 1,
      name: 'Old career',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      revision: 1,
      payload: {
        kind: 'world',
        world,
        gallery: { seed: 'm', generation: 0 },
        settings: DEFAULT_SETTINGS,
      },
    };
    const migrated = migrateSave(save);
    expect(migrated.schemaVersion).toBe(CONFIG.saves.schemaVersion);
    const next = (migrated.payload as { world: World }).world;
    expect(next.career!.market.moves).toEqual([]);
    expect(Object.keys(next.agents)).toHaveLength(MK.agents.pool);
    expect(next.relationships.length).toBe(2);
  });
});
