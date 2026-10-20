import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { careerCap } from '../src/engine/ageing';
import { playerAbility } from '../src/engine/strength';
import { getSeasonWeeks } from '../src/engine/world/calendar';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { careerWeek } from '../src/engine/career/training';
import { trainableAttributes } from '../src/engine/career/progression';
import {
  careerSoftCap,
  lateCareer,
  lateRate,
  longevity,
  planConditioning,
} from '../src/engine/career/longevity';
import { retirementState } from '../src/engine/career/honours';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

const L = CONFIG.career.longevity;
const R = CONFIG.career.honours.retirement;
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
  position: 'CB',
  foot: 'right',
  age: 17,
  archetype: 'destroyer',
};

let career: World;
let season: World;
beforeAll(() => {
  const base = generateWorld('longevity-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'longevity-tests')[0]!;
  career = createCareer(base, draft, trial.id, 'longevity-tests');
  season = clone(career);
  while (season.phase === 'active')
    season = advanceCareerWeek(season, { inPlace: true, autoPlay: true }).world;
}, 300000);

/**
 * A veteran at an age, at their prime caps, with average character, no injury and a fixed
 * plan. `fit` adds the conditioning skills, a physical plan and a conditioning history.
 */
function veteran(input: World, age: number, fit: boolean): World {
  const world = clone(input);
  const c = world.career!;
  const player = world.players[c.playerId]!;
  player.birthSeason = world.date.season - age;
  player.potential = 84;
  player.hidden.professionalism = 50;
  player.hidden.injuryProneness = 50;
  for (const key of trainableAttributes(player)) {
    const value = careerCap(player, key, 29);
    if (key in player.attributes) player.attributes[key as 'pace'] = value;
  }
  c.skills = fit
    ? ['engine', 'sprinter', 'powerhouse', 'iron-man', 'second-wind', 'evergreen']
    : [];
  player.traits = [...c.skills];
  c.training = {
    sessions: fit
      ? [
          { focus: 'physical', intensity: 'low' },
          { focus: 'technical', intensity: 'low' },
          { focus: 'recovery', intensity: 'low' },
        ]
      : [
          { focus: 'technical', intensity: 'low' },
          { focus: 'mental', intensity: 'low' },
          { focus: 'technical', intensity: 'low' },
        ],
    extra: null,
  };
  c.conditioning = planConditioning(player, c.training);
  c.injury = null;
  player.injuryId = null;
  return world;
}

/** Run the career player's weekly development for whole seasons, ageing a year each. */
function age(world: World, seasons: number): World {
  for (let index = 0; index < seasons; index++) {
    for (let week = 1; week <= getSeasonWeeks(world); week++) {
      world.date.week = week;
      const c = world.career!;
      // Injuries are a separate system; keep both players available for a fair comparison.
      c.injury = null;
      world.players[c.playerId]!.injuryId = null;
      world.players[c.playerId]!.fatigue = 20;
      careerWeek(world);
    }
    world.date.season++;
  }
  return world;
}
const ability = (world: World) => playerAbility(world.players[world.career!.playerId]!);

describe('longevity', () => {
  it('scores conditioning skills, physical training, physique and character', () => {
    const plain = veteran(career, 30, false);
    const fit = veteran(career, 30, true);
    const a = longevity(plain.career!, plain.players[plain.career!.playerId]!);
    const b = longevity(fit.career!, fit.players[fit.career!.playerId]!);
    expect(a.parts.skills).toBe(0);
    expect(b.parts.skills).toBeCloseTo(0.46, 3);
    expect(b.parts.conditioning).toBeGreaterThan(a.parts.conditioning);
    expect(b.score).toBeGreaterThan(a.score + 0.4);
    // Full longevity postpones the onset by up to three seasons; keepers start later anyway.
    expect(a.onset).toBeGreaterThanOrEqual(L.onsetAge);
    expect(b.onset - a.onset).toBeGreaterThan(1.2);
    expect(b.onset).toBeLessThanOrEqual(L.onsetAge + L.onsetShift);
  });

  it('accelerates decline every late season, gentler with longevity', () => {
    expect(lateRate(0, 0)).toBe(1);
    expect(lateRate(1, 0)).toBeCloseTo(L.rate);
    expect(lateRate(2, 0)).toBeCloseTo(L.rate ** 2);
    expect(lateRate(2, 1)).toBeLessThan(lateRate(2, 0));
    const world = veteran(career, 36, false);
    const player = world.players[world.career!.playerId]!;
    expect(careerSoftCap(world, player, 'pace', 36)).toBeLessThan(careerCap(player, 'pace', 36));
    // Under the original rules the soft cap is the plain age-adjusted cap.
    delete world.career!.developmentRules;
    expect(lateCareer(world, player, 36)).toBeNull();
    expect(careerSoftCap(world, player, 'pace', 36)).toBe(careerCap(player, 'pace', 36));
  });

  it('makes playing on costly, and a conditioned body lasts clearly longer', () => {
    const plain = age(veteran(career, 33, false), 3);
    const fit = age(veteran(career, 33, true), 3);
    const legacyRules = veteran(career, 33, false);
    delete legacyRules.career!.developmentRules;
    const before = ability(veteran(career, 33, false));
    age(legacyRules, 3);
    // At 36 the unconditioned player has fallen well below where the old rules left them.
    expect(ability(plain)).toBeLessThan(ability(legacyRules) - 2);
    expect(ability(plain)).toBeLessThan(before - 6);
    // The conditioned player keeps clearly more.
    expect(ability(fit)).toBeGreaterThan(ability(plain) + 3);
  }, 60000);
});

describe('retirement under late decline', () => {
  it('never forces retirement for decline, only at the forced age', () => {
    const world = veteran(season, 34, false);
    world.career!.honours.peakAbility = 99;
    expect(world.phase).toBe('complete');
    expect(retirementState(world)).toBe('available');
    const next = startNextSeason(world);
    expect(next.career).toBeDefined();
    const old = veteran(season, R.forcedAge - 1, false);
    const retired = startNextSeason(old);
    expect(retired.career).toBeUndefined();
  }, 120000);

  it('adopts the rules with a new season, keeping saved careers valid', () => {
    const world = clone(season);
    delete world.career!.developmentRules;
    delete world.career!.conditioning;
    const save = createSave(1, 'Longevity', {
      kind: 'world',
      world,
      gallery: { seed: 'l', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    const old: unknown = JSON.parse(JSON.stringify({ ...save, schemaVersion: 20 }));
    const migrated = migrateSave(old);
    expect(migrated.schemaVersion).toBe(21);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const next = startNextSeason(world);
    const player = next.players[next.career!.playerId]!;
    expect(next.career!.developmentRules).toBe(2);
    expect(next.career!.conditioning).toBe(planConditioning(player, next.career!.training));
    // Availability starts from the recent appearances, all played; benching was never recorded.
    const recent = world.career!.matches.slice(-CONFIG.career.development.availability.fixtures);
    expect(next.career!.availability!.map((entry) => entry.fixtureId)).toEqual(
      recent.map((match) => match.fixtureId),
    );
    expect(next.career!.availability!.every((entry) => entry.status === 'played')).toBe(true);
    expect(() => validateWorld(clone(next))).not.toThrow();
    const broken = clone(next);
    broken.career!.conditioning = 2;
    expect(() => validateWorld(broken)).toThrow();
  }, 120000);

  it('starts new careers under the late-decline rules', () => {
    expect(career.career!.developmentRules).toBe(2);
    expect(career.career!.conditioning).toBeGreaterThan(0);
  });
});
