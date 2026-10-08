import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import {
  addXp,
  attributeCost,
  levelForXp,
  levelProgress,
  xpForLevel,
  xpToNext,
} from '../src/engine/career/progression';
import { careerWeek } from '../src/engine/career/training';
import { careerCap } from '../src/engine/ageing';
import { ABILITY_WEIGHTS, playerAbility } from '../src/engine/strength';
import { SKILLS } from '../src/engine/career/catalogue';
import { performanceXp } from '../src/engine/match/rewards';
import { createSave, DEFAULT_SETTINGS, migrateSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * The balance pass (docs/GAME-DESIGN-REVIEW.md, Phase A): one ability scale, a level curve
 * that keeps paying, caps that hold, and development that comes from playing.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft: CareerDraft = {
  name: 'Balance Vale',
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
const base = generateWorld('balance-tests', { format: 'legacy' });
const trial = trialOffers(base, 'country:0', 'balance-tests')[0]!;
const career = createCareer(base, draft, trial.id, 'balance-tests');
const player = (world: World) => world.players[world.career!.playerId]!;

describe('one ability scale', () => {
  it('weights what a position relies on, and scores a flat profile at its plain mean', () => {
    const p = clone(career);
    const me = player(p);
    for (const key of Object.keys(me.attributes) as (keyof typeof me.attributes)[])
      me.attributes[key] = 40;
    expect(playerAbility(me)).toBeCloseTo(40, 10);
    const weights = ABILITY_WEIGHTS.ST;
    const total =
      Object.values(me.attributes).length -
      Object.keys(weights).length +
      Object.values(weights).reduce((sum, w) => sum + w, 0);
    me.attributes.finishing = 70;
    expect(playerAbility(me)).toBeCloseTo(40 + (30 * weights.finishing!) / total, 10);
    me.attributes.finishing = 40;
    me.attributes.setPieces = 70;
    expect(playerAbility(me)).toBeCloseTo(40 + 30 / total, 10);
  });
  it('sums every position to the same weight, so positions compare on one scale', () => {
    const sums = Object.entries(ABILITY_WEIGHTS)
      .filter(([position]) => position !== 'GK')
      .map(
        ([, weights]) =>
          Object.values(weights).reduce((sum, w) => sum + w, 0) - Object.keys(weights).length,
      );
    expect(new Set(sums).size).toBe(1);
  });
});

describe('the level curve', () => {
  it('keeps levels coming late in a career and makes the top level reachable', () => {
    // Season one still gives a handful of levels; a 100,000 XP career passes level 80.
    expect(levelForXp(4500)).toBeGreaterThanOrEqual(8);
    expect(levelForXp(100_000)).toBeGreaterThanOrEqual(80);
    expect(xpForLevel(CONFIG.career.maximumLevel)).toBeLessThan(160_000);
  });
  it('records where the level began, so the curve can change without taking a level', () => {
    const record = structuredClone(career.career!);
    expect(record.levelXp).toBe(0);
    addXp(record, xpToNext(1) + 10);
    expect(record.level).toBe(2);
    expect(record.levelXp).toBe(xpToNext(1));
    expect(levelProgress(record)).toEqual({ into: 10, needed: xpToNext(2) });
    // A career from the old curve: level 20 at 10,127 XP, no levelXp yet.
    const old = clone(career);
    old.career!.level = 20;
    old.career!.xp = 10_127;
    old.career!.levelXp = 10_127;
    const save = {
      ...createSave(1, 'Old', {
        kind: 'world',
        world: old,
        gallery: { seed: 'balance-tests', generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
      schemaVersion: 16,
    };
    const raw = JSON.parse(JSON.stringify(save)) as { payload: { world: World } };
    delete raw.payload.world.career!.levelXp;
    const migrated = migrateSave(raw);
    expect(migrated.schemaVersion).toBe(17);
    expect(migrated.payload.kind).toBe('world');
    const world = (migrated.payload as { world: World }).world;
    expect(world.career!.level).toBe(20);
    expect(world.career!.levelXp).toBe(10_127);
    // The next level is one full step away, not already earned or lost.
    expect(levelProgress(world.career!)).toEqual({ into: 0, needed: xpToNext(20) });
    expect(addXp(world.career!, xpToNext(20) - 1)).toBe(0);
    expect(addXp(world.career!, 1)).toBe(1);
    expect(() => validateWorld(clone(world))).not.toThrow();
  });
  it('prices skill tiers so points keep an opportunity cost', () => {
    const tiers = new Map(SKILLS.map((skill) => [skill.tier, skill]));
    expect(tiers.get(1)).toMatchObject({ pointCost: 2, minimumLevel: 1 });
    expect(tiers.get(4)).toMatchObject({ pointCost: 5, minimumLevel: 25 });
    const outfield = SKILLS.filter((skill) => skill.for !== 'keeper').reduce(
      (sum, skill) => sum + skill.pointCost,
      0,
    );
    expect(outfield).toBeGreaterThan(100);
  });
});

describe('soft caps that hold', () => {
  it('charges more for every step beyond the cap and stops twelve past it before 24', () => {
    const world = clone(career);
    world.career!.attributePoints = 999;
    const me = player(world);
    const age = world.date.season - me.birthSeason;
    const cap = careerCap(me, 'finishing', age);
    const C = CONFIG.career.costs;
    me.attributes.finishing = cap - 1;
    expect(attributeCost(world, 'finishing')).toBe(C.belowCap);
    me.attributes.finishing = cap + C.capMargin;
    expect(attributeCost(world, 'finishing')).toBe(C.beyondCap);
    me.attributes.finishing = cap + C.capMargin + C.beyondCapStep;
    expect(attributeCost(world, 'finishing')).toBe(C.beyondCap + 1);
    me.attributes.finishing = cap + C.hardCapMargin;
    expect(attributeCost(world, 'finishing')).toBeNull();
    me.birthSeason -= C.hardCapAge - age;
    expect(attributeCost(world, 'finishing')).not.toBeNull();
  });
});

describe('development from playing', () => {
  const weeks = (world: World, count: number, minutes: number) => {
    world.career!.matches = Array.from({ length: 8 }, (_, index) => ({
      fixtureId: `fixture:${index}`,
      season: world.date.season,
      week: index + 1,
      competitionId: 'league:0:1',
      opponentId: 'club:0:1',
      home: true,
      score: [1, 0] as [number, number],
      result: 'win' as const,
      minutes,
      rating: 7,
      goals: 0,
      assists: 0,
      cleanSheet: true,
      xp: 100,
      auto: true,
    }));
    const start = JSON.stringify(player(world).attributes);
    let improved = 0;
    for (let week = 0; week < count; week++) {
      world.date.week = 10 + week;
      careerWeek(world);
      improved += world.career!.lastTraining!.improved.length;
    }
    return { improved, changed: JSON.stringify(player(world).attributes) !== start };
  };
  it('moves attributes below their cap toward it, faster for a player who plays', () => {
    const playing = clone(career);
    const benched = clone(career);
    // Rest and recovery only: no training gains to confuse the measure.
    for (const world of [playing, benched])
      world.career!.training = {
        sessions: [
          { focus: 'recovery', intensity: 'low' },
          { focus: 'recovery', intensity: 'low' },
          { focus: 'recovery', intensity: 'low' },
        ],
        extra: null,
      };
    const full = weeks(playing, 40, 90);
    const none = weeks(benched, 40, 0);
    expect(full.changed).toBe(true);
    expect(full.improved).toBeGreaterThan(none.improved);
    const me = player(playing);
    const age = playing.date.season - me.birthSeason;
    for (const [key, value] of Object.entries(me.attributes))
      expect(value).toBeLessThanOrEqual(
        Math.max(
          careerCap(me, key as keyof typeof me.attributes, age),
          career.players[me.id]!.attributes[key as keyof typeof me.attributes],
        ),
      );
  });
});

describe('XP that rewards performance', () => {
  it('pays a great game several times a poor one', () => {
    const poor = performanceXp({ minutes: 90, rating: 5, goals: 0, assists: 0, objectives: 0 });
    const great = performanceXp({ minutes: 90, rating: 8.5, goals: 2, assists: 1, objectives: 1 });
    expect(great / poor).toBeGreaterThan(5);
  });
});
