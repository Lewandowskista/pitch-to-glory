import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { wageFor } from '../src/engine/strength';
import { marketRollover } from '../src/engine/career/market/week';
import { triedRecently } from '../src/engine/career/market/offers';
import { careerContract, relationshipValue } from '../src/engine/career/market/rules';
import { adjustRelationship } from '../src/engine/career/market/records';
import { socialWeek } from '../src/engine/career/social/week';
import { socialMatch } from '../src/engine/career/social/week';
import { answerPress, openPress } from '../src/engine/career/social/media';
import { lifestyleRollover } from '../src/engine/career/lifestyle/week';
import {
  applyLifestyleAction,
  assetWeek,
  priceOf,
  sponsorRollover,
  upkeepOf,
} from '../src/engine/career/lifestyle';
import { assetEffects, LIFESTYLE_BY_ID } from '../src/engine/career/lifestyle/catalogue';
import { injuryFactor } from '../src/engine/career/training';
import { retirementState, awardWeight } from '../src/engine/career/honours/retirement';
import { getSeasonWeeks } from '../src/engine/world/calendar';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Balance pass D (docs/GAME-DESIGN-REVIEW.md): stakes in money and relationships, and
 * content worth spending on.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft: CareerDraft = {
  name: 'Stakes Vale',
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
  foot: 'right',
  age: 17,
  archetype: 'finisher',
};
const base = generateWorld('economy-tests', { format: 'legacy' });
const trial = trialOffers(base, 'country:0', 'economy-tests')[0]!;
const career = createCareer(base, draft, trial.id, 'economy-tests');
const player = (world: World) => world.players[world.career!.playerId]!;
const club = (world: World) => world.clubs[player(world).clubId!]!;
const trust = (world: World) => relationshipValue(world, 'manager', club(world).managerId);
const fans = (world: World) => relationshipValue(world, 'fans', club(world).id);

describe('wages', () => {
  it('pay far more at a giant than a small club for the same player, and span the pyramid', () => {
    expect(wageFor(70, 80) / wageFor(70, 30)).toBeGreaterThan(3);
    expect(wageFor(90, 90) / wageFor(20, 10)).toBeGreaterThan(40);
    expect(wageFor(20, 10)).toBe(CONFIG.world.generation.wageFloor);
  });
});

describe('the market', () => {
  it('lets a declined club wait out its cooldown before bidding again', () => {
    const world = clone(career);
    const interest = {
      id: 'interest:1',
      clubId: 'club:0:1',
      playerId: world.career!.playerId,
      kind: 'transfer' as const,
      started: { ...world.date },
      weeksObserved: 0,
      confidence: 25,
      stage: 'watching' as const,
      lastOffer: { ...world.date },
    };
    expect(triedRecently(world, interest)).toBe(true);
    const later = clone(world);
    later.date.week += CONFIG.career.market.scouting.declineCooldownWeeks + 1;
    if (later.date.week > getSeasonWeeks(later)) {
      later.date.season++;
      later.date.week -= getSeasonWeeks(later);
    }
    expect(triedRecently(later, interest)).toBe(false);
  });
  it('extends an expired contract once, then at the market rate, never below the old wage', () => {
    const world = clone(career);
    const contract = careerContract(world);
    contract.end.season = world.date.season - 1;
    contract.weeklyWage = 10;
    marketRollover(world);
    expect(careerContract(world).optionTaken).toBe(true);
    expect(careerContract(world).end.season).toBe(world.date.season);
    expect(careerContract(world).weeklyWage).toBe(10);
    // The option is spent: with nobody scouting, the club keeps the player at the market rate.
    const again = clone(world);
    careerContract(again).end.season = again.date.season - 1;
    again.scouting = [];
    marketRollover(again);
    expect(careerContract(again).weeklyWage).toBeGreaterThan(10);
    expect(() => validateWorld(clone(again))).not.toThrow();
  });
});

describe('relationships with stakes', () => {
  it('lets trust and affection drift toward a middling level when nothing happens', () => {
    const world = clone(career);
    adjustRelationship(world, 'manager', club(world).managerId, 100);
    adjustRelationship(world, 'fans', club(world).id, 100);
    const before = trust(world);
    socialWeek(world);
    expect(trust(world)).toBeLessThan(before);
    expect(trust(world)).toBeGreaterThan(CONFIG.career.social.relationshipDecay.toward);
    expect(fans(world)).toBeLessThan(100);
  });
  it('judges a confident stance by the next result', () => {
    const world = clone(career);
    const item = openPress(world, createRng('press'), 'win', {});
    const confident = item.choices.find((choice) => choice.tone === 'confident')!;
    const fameBefore = world.career!.fame;
    answerPress(world, item.id, confident.id);
    expect(world.career!.social.stance?.tone).toBe('confident');
    const fameAfterAnswer = world.career!.fame;
    expect(fameAfterAnswer).toBe(fameBefore + confident.effects.fame);
    const fansBefore = fans(world);
    const fixture = Object.values(world.fixtures).find(
      (f) => f.homeId === club(world).id || f.awayId === club(world).id,
    )!;
    socialMatch(
      world,
      {
        fixtureId: fixture.id,
        season: world.date.season,
        week: world.date.week,
        competitionId: fixture.competitionId,
        opponentId: fixture.homeId === club(world).id ? fixture.awayId : fixture.homeId,
        home: true,
        score: [0, 2],
        result: 'loss',
        minutes: 90,
        rating: 6.0,
        goals: 0,
        assists: 0,
        cleanSheet: false,
        xp: 0,
        auto: true,
      },
      fixture,
    );
    const S = CONFIG.career.social.stance.confident.loss;
    expect(world.career!.fame).toBe(Math.max(0, fameAfterAnswer + S.fame));
    expect(fans(world)).toBeCloseTo(Math.max(0, fansBefore + S.fans), 0);
    expect(world.career!.social.stance).toBeUndefined();
  });
});

describe('things worth buying', () => {
  it('prices cars and homes in weeks of wages and charges upkeep from the price', () => {
    const world = clone(career);
    const villa = LIFESTYLE_BY_ID['house:villa']!;
    careerContract(world).weeklyWage = 2_000;
    expect(priceOf(world, villa)).toBe(villa.wageWeeks! * 2_000);
    expect(upkeepOf(world, villa)).toBe(
      Math.round(priceOf(world, villa) / CONFIG.career.lifestyle.upkeepDivisor),
    );
    careerContract(world).weeklyWage = 50;
    expect(priceOf(world, villa)).toBe(villa.cost);
  });
  it('hires staff whose effects reach training, injuries and decisions, and funds a charity the fans notice', () => {
    const world = clone(career);
    world.career!.fame = CONFIG.career.lifestyle.fameLevels[5]!;
    world.career!.market.finances.cash = 1_000_000;
    const physio = LIFESTYLE_BY_ID['staff:physio']!;
    const before = injuryFactor(world.career!, player(world));
    const hired = applyLifestyleAction(world, { type: 'buy-asset', itemId: 'staff:physio' });
    expect(hired.career!.market.finances.cash).toBe(1_000_000 - priceOf(world, physio));
    expect(injuryFactor(hired.career!, player(hired))).toBeCloseTo(before * 0.8, 6);
    expect(() =>
      applyLifestyleAction(hired, { type: 'buy-asset', itemId: 'staff:physio' }),
    ).toThrow();
    const effects = assetEffects([
      { itemId: 'staff:nutritionist' },
      { itemId: 'house:villa' },
      { itemId: 'staff:coach' },
      { itemId: 'staff:analyst' },
      { itemId: 'charity:foundation' },
    ]);
    expect(effects).toEqual({
      injury: 1,
      rest: 5,
      training: 1.15,
      decisionXp: 2,
      fans: 0.4,
      fame: 1,
    });
    const giving = applyLifestyleAction(hired, { type: 'buy-asset', itemId: 'charity:foundation' });
    const fansBefore = fans(giving);
    assetWeek(giving);
    expect(fans(giving)).toBeGreaterThan(fansBefore);
    expect(() => validateWorld(clone(giving))).not.toThrow();
  });
  it('spends an experience at once: fatigue off, morale up, nothing kept', () => {
    const world = clone(career);
    world.career!.market.finances.cash = 100_000;
    player(world).fatigue = 60;
    const moraleBefore = player(world).morale;
    const rested = applyLifestyleAction(world, { type: 'buy-asset', itemId: 'experience:holiday' });
    expect(player(rested).fatigue).toBe(40);
    expect(player(rested).morale).toBeGreaterThan(moraleBefore);
    expect(rested.career!.style.assets).toHaveLength(0);
    expect(rested.inbox.at(-1)!.subjectKey).toBe('experience');
  });
  it('claws back fees from a failed sponsorship and fades fame between seasons', () => {
    const world = clone(career);
    world.career!.market.finances.cash = 50_000;
    world.sponsorships.push({
      id: 'sponsor:test',
      brandId: 'brand:pace',
      category: 'apparel',
      status: 'active',
      offered: { ...world.date },
      expires: { ...world.date },
      start: { ...world.date },
      endSeason: world.date.season - 1,
      weeklyFee: 100,
      bonus: 800,
      obligations: [{ kind: 'goals', target: 999 }],
      baseline: { matches: 0, answered: 0 },
      paid: 2_000,
    });
    sponsorRollover(world);
    expect(world.career!.market.finances.cash).toBe(50_000 - 500);
    expect(world.sponsorships.find((deal) => deal.id === 'sponsor:test')!.status).toBe('ended');
    expect(world.inbox.some((message) => message.subjectKey === 'sponsor-clawback')).toBe(true);
    const famous = clone(career);
    famous.career!.fame = 600;
    lifestyleRollover(famous);
    const F = CONFIG.career.lifestyle.fameDecay;
    expect(famous.career!.fame).toBe(Math.round(F.above + (600 - F.above) * (1 - F.share)));
  });
});

describe('honours with stakes', () => {
  it('forces retirement when ability has fallen well below its peak', () => {
    const world = clone(career);
    const me = player(world);
    me.birthSeason = world.date.season - 34;
    world.career!.honours.peakAbility = 80;
    world.phase = 'complete';
    expect(retirementState(world)).toBe('forced');
    world.career!.honours.peakAbility = 30;
    expect(retirementState(world)).toBe('available');
  });
  it('weighs routine awards below season honours in the Hall of Fame', () => {
    expect(awardWeight('month')).toBeLessThan(awardWeight('golden-boot'));
    expect(awardWeight('team-season')).toBeLessThan(awardWeight('mvp'));
  });
});
