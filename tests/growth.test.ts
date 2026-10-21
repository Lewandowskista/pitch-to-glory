import { describe, expect, it } from 'vitest';
import type { Player, TrainingPlan, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { GROWTH_SOURCES, growthOf } from '../src/engine/career/growth';
import { developCareer, focusWeights } from '../src/engine/career/training';
import { startNextSeason } from '../src/engine/world/simulate';
import { createRng } from '../src/engine/rng';
import { CONFIG } from '../src/engine/config';
import {
  attributeCost,
  raiseAttribute,
  trainableAttributes,
  unlockSkill,
  attributeValue,
  skillState,
} from '../src/engine/career/progression';
import { SKILLS } from '../src/engine/career/catalogue';
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
  position: 'CM',
  foot: 'right',
  age: 17,
  archetype: 'playmaker',
};
const total = (player: Player) =>
  trainableAttributes(player).reduce((sum, key) => sum + attributeValue(player, key), 0);

describe('growth by source', () => {
  it('accounts for every attribute point a season brings, by where it came from', () => {
    const base = generateWorld('growth-tests', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'growth-tests')[0]!;
    let world = createCareer(base, draft, trial.id, 'growth-tests');
    const id = world.career!.playerId;
    const start = total(world.players[id]!);
    for (let week = 0; week < 12; week++)
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    // Spend points and a skill point as a player would.
    world = clone(world);
    world.career!.attributePoints = 5;
    world.career!.skillPoints = 5;
    const key = trainableAttributes(world.players[id]!).find(
      (k) => attributeCost(world, k) !== null,
    )!;
    world = raiseAttribute(world, key);
    const skill = SKILLS.find(
      (entry) =>
        skillState(world, entry.id) === 'available' &&
        Object.keys(entry.attributeBonuses).length > 0,
    )!;
    world = unlockSkill(world, skill.id);
    const growth = growthOf(world.career!, world.date.season);
    expect(growth.playing).toBeGreaterThan(0);
    expect(growth.points).toBe(1);
    expect(growth.skills).toBeGreaterThan(0);
    const net = growth.playing + growth.training + growth.points + growth.skills - growth.decline;
    // A career-threatening injury's loss is the only other change, and none happened here.
    expect(world.career!.injury?.careerThreatening ?? false).toBe(false);
    expect(total(world.players[id]!) - start).toBe(net);
    expect(GROWTH_SOURCES).toHaveLength(5);
    expect(() => validateWorld(clone(world))).not.toThrow();
  }, 120000);

  it('lets the training plan shape passive growth, the same on average (rules 3)', () => {
    const base = generateWorld('growth-focus', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'growth-focus')[0]!;
    const world = createCareer(base, draft, trial.id, 'growth-focus');
    const player = world.players[world.career!.playerId]!;
    const plan: TrainingPlan = {
      sessions: [
        { focus: 'passing', intensity: 'normal' },
        { focus: 'vision', intensity: 'normal' },
        { focus: 'recovery', intensity: 'low' },
      ],
      extra: null,
    };
    const weights = focusWeights(player, plan);
    const values = [...weights.values()];
    expect(values.reduce((sum, v) => sum + v, 0) / values.length).toBeCloseTo(1, 9);
    expect(weights.get('passing')! / weights.get('finishing')!).toBeCloseTo(
      CONFIG.career.development.focusRatio,
      9,
    );
    // A plan without attribute work changes nothing.
    const rest = focusWeights(player, {
      sessions: plan.sessions.map(() => ({
        focus: 'recovery' as const,
        intensity: 'low' as const,
      })),
      extra: null,
    });
    expect(new Set(rest.values())).toEqual(new Set([1]));
    // Over many weeks the focused attributes grow faster than under rules 2.
    const grow = (rules: 2 | 3) => {
      const copy = clone(world);
      copy.career!.developmentRules = rules;
      copy.career!.training = plan;
      const me = copy.players[copy.career!.playerId]!;
      const before = { passing: me.attributes.passing, vision: me.attributes.vision };
      const rng = createRng('focus-growth');
      for (let week = 0; week < 120; week++) developCareer(copy, me, 18, rng, { improved: [] });
      return me.attributes.passing - before.passing + me.attributes.vision - before.vision;
    };
    expect(grow(3)).toBeGreaterThan(grow(2));
  });

  it('adopts rules 3 at a season start, keeping a rules-2 career’s records', () => {
    const base = generateWorld('growth-adopt', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'growth-adopt')[0]!;
    let world = createCareer(base, draft, trial.id, 'growth-adopt');
    world.career!.developmentRules = 2;
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const availability = clone(world).career!.availability;
    const conditioning = world.career!.conditioning;
    const next = startNextSeason(world);
    expect(next.career!.developmentRules).toBe(3);
    expect(next.career!.availability).toEqual(availability);
    expect(next.career!.conditioning).toBe(conditioning);
  }, 300000);
});
