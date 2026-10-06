import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  applyLifestyleAction,
  assetWeek,
  availability,
  celebrationFame,
  challengeDone,
  challengePeriods,
  challengeProgress,
  COSMETIC_BY_ID,
  fameLevel,
  fameProgress,
  lifestyleMorale,
  makeSponsorOffer,
  obligationMet,
  sponsorRollover,
  sponsorWeek,
  weeklyUpkeep,
} from '../src/engine/career/lifestyle';
import { moraleParts } from '../src/engine/career/social';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

const L = CONFIG.career.lifestyle;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
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
let career: World;
beforeAll(() => {
  const base = generateWorld('lifestyle-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'lifestyle-tests')[0]!;
  career = createCareer(base, draft, trial.id, 'lifestyle-tests');
});
const famous = (fame: number) => {
  const world = clone(career);
  world.career!.fame = fame;
  return world;
};

describe('fame', () => {
  it('maps fame to ten levels with progress to the next', () => {
    expect(fameLevel(0)).toBe(1);
    expect(fameLevel(L.fameLevels[1])).toBe(2);
    expect(fameLevel(10_000)).toBe(10);
    expect(fameProgress(L.fameLevels[1] + 5)).toEqual({
      level: 2,
      into: 5,
      needed: L.fameLevels[2] - L.fameLevels[1],
    });
    expect(fameProgress(10_000).needed).toBe(0);
  });
  it('adds fame for the signature celebration only in big matches', () => {
    const world = clone(career);
    expect(celebrationFame(world, 2, 1)).toBe(0);
    expect(celebrationFame(world, 2, L.bigMatchImportance)).toBe(2 * L.signatureFame);
    expect(world.career!.style.signatureUses).toBe(2);
    world.career!.style.equipped.celebration = null;
    expect(celebrationFame(world, 1, 1.5)).toBe(0);
  });
});

describe('wardrobe', () => {
  it('keeps the created look, gates the rest by fame or tokens, and never by money', () => {
    const world = clone(career);
    expect(world.career!.style.owned).toContain(`hair:${draft.avatar.hair}`);
    expect(() =>
      applyLifestyleAction(world, { type: 'wardrobe', change: { slot: 'hair', value: 7 } }),
    ).toThrow();
    expect(() => applyLifestyleAction(world, { type: 'buy-cosmetic', id: 'hair:7' })).toThrow();
    world.career!.style.tokens = 100;
    const bought = applyLifestyleAction(world, { type: 'buy-cosmetic', id: 'hair:7' });
    expect(bought.career!.style.tokens).toBe(100 - COSMETIC_BY_ID['hair:7']!.tokens!);
    const styled = applyLifestyleAction(bought, {
      type: 'wardrobe',
      change: { slot: 'hair', value: 7 },
    });
    expect(styled.players[styled.career!.playerId]!.avatar.hair).toBe(7);
    // The input world and unrelated players are untouched.
    expect(world.players[world.career!.playerId]!.avatar.hair).toBe(draft.avatar.hair);
    const star = famous(L.fameLevels[7]);
    expect(availability(star, COSMETIC_BY_ID['celebration:backflip']!)).toBe('fame');
    valid(styled);
  });
  it('lets sponsor boots be worn only while the sponsor is active', () => {
    const world = famous(L.fameLevels[1]);
    expect(availability(world, COSMETIC_BY_ID['boots:strider']!)).toBe('locked');
    world.sponsorships.push({
      id: 'sponsor:test',
      brandId: 'brand:strider',
      category: 'boots',
      status: 'offered',
      offered: { ...world.date },
      expires: { ...world.date, week: world.date.week + 2 },
      start: null,
      endSeason: world.date.season,
      weeklyFee: 50,
      bonus: 400,
      obligations: [
        { kind: 'starts', target: 1 },
        { kind: 'boots', target: 1 },
      ],
      baseline: null,
    });
    const signed = applyLifestyleAction(world, { type: 'accept-sponsor', id: 'sponsor:test' });
    expect(signed.career!.style.equipped.boots).toBe('boots:strider');
    valid(signed);
    // Changing boots breaks the deal at the next weekly check, and the boots come off.
    const changed = applyLifestyleAction(signed, {
      type: 'wardrobe',
      change: { slot: 'boots', id: 'boots:classic' },
    });
    sponsorWeek(changed, createRng('breach'));
    expect(changed.sponsorships[0]!.status).toBe('ended');
    valid(changed);
  });
});

describe('sponsorships', () => {
  it('offers deals with obligations that suit the position, and pays weekly fees', () => {
    const world = famous(L.fameLevels[3]);
    const deal = makeSponsorOffer(world, createRng('offer'))!;
    expect(deal).not.toBeNull();
    expect(deal.obligations.map((o) => o.kind)).toContain('starts');
    expect(deal.obligations.map((o) => o.kind)).toContain('goals');
    const signed = applyLifestyleAction(world, { type: 'accept-sponsor', id: deal.id });
    const cash = signed.career!.market.finances.cash;
    const deals = signed.sponsorships.filter((d) => d.status === 'active');
    sponsorWeek(signed, createRng('pay'));
    const paid = deals
      .filter((d) => d.status === 'active')
      .reduce((sum, d) => sum + d.weeklyFee, 0);
    expect(signed.career!.market.finances.cash).toBeGreaterThanOrEqual(cash + paid - deals.length);
  });
  it('rewards met obligations at season end and drops failed deals', () => {
    const world = famous(L.fameLevels[3]);
    const deal = makeSponsorOffer(world, createRng('judge'))!;
    const signed = applyLifestyleAction(world, { type: 'accept-sponsor', id: deal.id });
    const active = signed.sponsorships.find((d) => d.id === deal.id)!;
    // Meet everything by fiat, then move into the next season.
    active.obligations = [{ kind: 'image', target: 0 }];
    signed.date = { ...signed.date, season: signed.date.season + 1 };
    const fame = signed.career!.fame;
    sponsorRollover(signed);
    expect(active.status).toBe('completed');
    expect(signed.career!.fame).toBe(fame + L.sponsor.completedFame);
    const failing = applyLifestyleAction(world, { type: 'accept-sponsor', id: deal.id });
    const failed = failing.sponsorships.find((d) => d.id === deal.id)!;
    failed.obligations = [{ kind: 'starts', target: 99 }];
    expect(obligationMet(failing, failed, failed.obligations[0]!)).toBe(false);
    failing.date = { ...failing.date, season: failing.date.season + 1 };
    sponsorRollover(failing);
    expect(failed.status).toBe('ended');
  });
  it('limits the number of deals by fame level', () => {
    const world = famous(L.fameLevels[1]);
    const first = makeSponsorOffer(world, createRng('first'))!;
    const signed = applyLifestyleAction(world, { type: 'accept-sponsor', id: first.id });
    const second = makeSponsorOffer(signed, createRng('second'));
    if (second)
      expect(() =>
        applyLifestyleAction(signed, { type: 'accept-sponsor', id: second.id }),
      ).toThrow();
  });
});

describe('lifestyle', () => {
  it('buys within fame and savings, charges upkeep, and sells to cover a shortfall', () => {
    const world = famous(0);
    world.career!.market.finances.cash = 10_000;
    expect(() => applyLifestyleAction(world, { type: 'buy-asset', itemId: 'car:coupe' })).toThrow();
    const bought = applyLifestyleAction(world, { type: 'buy-asset', itemId: 'house:flat' });
    expect(bought.career!.market.finances.cash).toBe(4_000);
    expect(weeklyUpkeep(bought)).toBe(50);
    expect(lifestyleMorale(bought)).toBeGreaterThan(0);
    expect(moraleParts(bought).lifestyle).toBe(lifestyleMorale(bought));
    bought.career!.market.finances.cash = 10;
    assetWeek(bought);
    expect(bought.career!.style.assets).toHaveLength(0);
    expect(bought.career!.market.finances.cash).toBe(Math.round(6_000 * L.resale) + 10);
    expect(bought.inbox.at(-1)!.subjectKey).toBe('asset-sold');
    valid(bought);
  });
  it('grows investments deterministically and sells them at their value', () => {
    const world = famous(L.fameLevels[4]);
    world.career!.market.finances.cash = 20_000;
    const invested = applyLifestyleAction(world, {
      type: 'buy-asset',
      itemId: 'invest:startup',
      amount: 10_000,
    });
    const again = clone(invested);
    for (let week = 0; week < 4; week++) {
      assetWeek(invested);
      assetWeek(again);
    }
    expect(invested.career!.style.assets[0]!.value).toBe(again.career!.style.assets[0]!.value);
    const value = invested.career!.style.assets[0]!.value;
    const cash = invested.career!.market.finances.cash;
    const sold = applyLifestyleAction(invested, {
      type: 'sell-asset',
      assetId: invested.career!.style.assets[0]!.id,
    });
    expect(sold.career!.market.finances.cash).toBe(cash + value);
  });
});

describe('challenges', () => {
  it('follows the real calendar with ISO weeks', () => {
    expect(challengePeriods('2026-10-06')).toEqual({ daily: '2026-10-06', weekly: '2026-W41' });
    expect(challengePeriods('2021-01-01').weekly).toBe('2020-W53');
    expect(() => challengePeriods('06/10/2026')).toThrow();
  });
  it('issues seeded sets, measures progress from issue, and pays cosmetic rewards once', () => {
    const world = applyLifestyleAction(clone(career), {
      type: 'refresh-challenges',
      date: '2026-10-06',
    });
    expect(world.challenges.filter((c) => c.cadence === 'daily')).toHaveLength(L.challenges.daily);
    expect(world.challenges.filter((c) => c.cadence === 'weekly')).toHaveLength(
      L.challenges.weekly,
    );
    const same = applyLifestyleAction(clone(career), {
      type: 'refresh-challenges',
      date: '2026-10-06',
    });
    expect(same.challenges).toEqual(world.challenges);
    // Nothing new on the same day: the same world comes back.
    expect(applyLifestyleAction(world, { type: 'refresh-challenges', date: '2026-10-06' })).toBe(
      world,
    );
    let played = world;
    for (let week = 0; week < 10; week++)
      played = advanceCareerWeek(played, { inPlace: true, autoPlay: true }).world;
    const done = played.challenges.find((c) => challengeDone(played, c))!;
    expect(done).toBeDefined();
    expect(challengeProgress(played, done)).toBe(done.target);
    const tokens = played.career!.style.tokens;
    const claimed = applyLifestyleAction(played, { type: 'claim-challenge', id: done.id });
    expect(claimed.career!.style.tokens).toBe(tokens + done.rewardTokens);
    expect(() => applyLifestyleAction(claimed, { type: 'claim-challenge', id: done.id })).toThrow();
    // A new day replaces the daily set but keeps the week's.
    const tomorrow = applyLifestyleAction(claimed, {
      type: 'refresh-challenges',
      date: '2026-10-07',
    });
    expect(
      tomorrow.challenges
        .filter((c) => c.cadence === 'daily')
        .every((c) => c.period === '2026-10-07'),
    ).toBe(true);
    expect(tomorrow.challenges.filter((c) => c.cadence === 'weekly')).toEqual(
      claimed.challenges.filter((c) => c.cadence === 'weekly'),
    );
    valid(tomorrow);
  }, 60000);
  it('gives defenders clean-sheet challenges instead of goals', () => {
    const base = generateWorld('lifestyle-keeper', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'keeper')[0]!;
    const keeper = createCareer(
      base,
      { ...draft, position: 'GK', archetype: 'shot-stopper' },
      trial.id,
      'keeper',
    );
    for (const date of ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']) {
      const world = applyLifestyleAction(keeper, { type: 'refresh-challenges', date });
      expect(world.challenges.some((c) => c.kind === 'goals' || c.kind === 'assists')).toBe(false);
    }
  });
});

describe('lifestyle saves', () => {
  it('round trips and rejects forged lifestyle records', () => {
    const world = applyLifestyleAction(clone(career), {
      type: 'refresh-challenges',
      date: '2026-10-06',
    });
    world.career!.market.finances.cash = 5_000;
    const owned = applyLifestyleAction(world, { type: 'buy-asset', itemId: 'car:hatch' });
    const payload = {
      kind: 'world' as const,
      world: owned,
      gallery: { seed: 'l', generation: 0 },
      settings: DEFAULT_SETTINGS,
    };
    const save = createSave(1, 'Lifestyle', payload);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const forge = (change: (w: World) => void) => {
      const forged = clone(owned);
      change(forged);
      return () => createSave(1, 'Forged', { ...payload, world: forged });
    };
    expect(forge((w) => (w.career!.style.equipped.boots = 'boots:strider'))).toThrow();
    expect(forge((w) => w.career!.style.owned.push('hair:99'))).toThrow();
    expect(forge((w) => (w.career!.style.tokens = -5))).toThrow();
    expect(forge((w) => (w.career!.style.assets[0]!.kind = 'house'))).toThrow();
    const plain = generateWorld('lifestyle-plain', { format: 'legacy' });
    plain.challenges.push(clone(owned).challenges[0]!);
    expect(() => createSave(1, 'Plain', { ...payload, world: plain })).toThrow();
  });
  it('migrates a schema-10 career by adding its style', () => {
    const world = simulateWeek(clone(career), { allowCareerFixture: true });
    delete (world.career as Partial<NonNullable<World['career']>>).style;
    delete (world.career!.social.morale!.parts as Partial<Record<string, number>>).lifestyle;
    const migrated = migrateSave({
      format: 'pitch-to-glory',
      schemaVersion: 10,
      engineVersion: 'old',
      slot: 1,
      name: 'Old career',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      revision: 1,
      payload: {
        kind: 'world',
        world,
        gallery: { seed: 'l', generation: 0 },
        settings: DEFAULT_SETTINGS,
      },
    });
    const next = (migrated.payload as { world: World }).world;
    expect(next.career!.style.equipped.boots).toBe('boots:classic');
    expect(next.career!.social.morale!.parts.lifestyle).toBe(0);
  });
  it('plays through a season rollover with lifestyle records intact', () => {
    let world = famous(L.fameLevels[2]);
    world.career!.market.finances.cash = 20_000;
    world = applyLifestyleAction(world, { type: 'buy-asset', itemId: 'house:flat' });
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const next = startNextSeason(world);
    expect(next.sponsorships.every((d) => d.status !== 'offered')).toBe(true);
    valid(next);
  }, 120000);
});
