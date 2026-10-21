import { describe, expect, it } from 'vitest';
import type { Player, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { GROWTH_SOURCES, growthOf } from '../src/engine/career/growth';
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
});
