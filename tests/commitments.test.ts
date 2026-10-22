import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  commitmentBlocked,
  commitmentsWeek,
  suggestCommitments,
} from '../src/engine/career/commitments';
import { obligationProgress } from '../src/engine/career/lifestyle/lifestyle';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 4, step 4.4: up to three weekly commitments outside training, kept every week
 * with the plan, each with its effect; sponsor deals ask for appearances made this way.
 */
const C = CONFIG.career.commitments;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
let career: World;
beforeAll(() => {
  const base = generateWorld('commitment-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'commitment-tests')[0]!;
  career = createCareer(
    base,
    {
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
      archetype: 'box-to-box',
    },
    trial.id,
    'commitment-tests',
  );
}, 120000);
const me = (world: World) => world.players[world.career!.playerId]!;

describe('weekly commitments', () => {
  it('keeps nothing without a plan, and its effects with one', () => {
    const world = clone(career);
    expect(commitmentsWeek(world)).toEqual([]);
    me(world).fatigue = 40;
    me(world).morale = 50;
    world.career!.training.commitments = ['rest', 'family'];
    expect(commitmentsWeek(world)).toEqual(['rest', 'family']);
    expect(me(world).fatigue).toBe(40 + C.rest.fatigue);
    expect(me(world).morale).toBe(50 + C.family.morale);
    expect(world.career!.commitments!.totals).toEqual({ rest: 1, family: 1 });
    expect(world.career!.commitments!.last!.kept).toEqual(['rest', 'family']);
    valid(world);
  });

  it('skips what cannot be kept: mentoring too young, appearances without a sponsor', () => {
    const world = clone(career);
    expect(commitmentBlocked(world, 'mentoring')).toBe('age');
    expect(commitmentBlocked(world, 'sponsor')).toBe('no-sponsor');
    world.career!.training.commitments = ['mentoring', 'sponsor', 'community'];
    expect(commitmentsWeek(world)).toEqual(['community']);
  });

  it('suggests a week that suits the player', () => {
    const world = clone(career);
    me(world).fatigue = 80;
    me(world).morale = 40;
    const week = suggestCommitments(world);
    expect(week.slice(0, 2)).toEqual(['rest', 'family']);
    expect(week.length).toBeLessThanOrEqual(C.slots);
    for (const kind of week) expect(commitmentBlocked(world, kind)).toBeNull();
  });

  it('repeats every simulated week with the plan', () => {
    let world = clone(career);
    world.career!.training.commitments = ['community'];
    for (let week = 0; week < 3; week++)
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    expect(world.career!.commitments!.totals.community).toBe(3);
    valid(world);
  }, 120000);

  it('rejects a forged plan', () => {
    const world = clone(career);
    world.career!.training.commitments = ['rest', 'rest'];
    expect(() => validateWorld(clone(world))).toThrow();
    world.career!.training.commitments = ['rest', 'family', 'community', 'team-social'];
    expect(() => validateWorld(clone(world))).toThrow();
    world.career!.training.commitments = ['nap' as never];
    expect(() => validateWorld(clone(world))).toThrow();
  });

  it('counts sponsor appearances made since a deal began', () => {
    const world = clone(career);
    world.sponsorships.push({
      id: 'sponsor:test',
      brandId: 'brand:0',
      category: 'drinks',
      status: 'active',
      offered: { ...world.date },
      expires: { ...world.date },
      start: { ...world.date },
      endSeason: world.date.season,
      weeklyFee: 1000,
      bonus: 10000,
      obligations: [{ kind: 'appearances', target: 2 }],
      baseline: { matches: 0, answered: 0, appearances: 0 },
    });
    const deal = world.sponsorships.at(-1)!;
    const cash = world.career!.market.finances.cash;
    world.career!.training.commitments = ['sponsor'];
    commitmentsWeek(world);
    commitmentsWeek(world);
    expect(obligationProgress(world, deal, deal.obligations[0]!)).toBe(2);
    expect(world.career!.market.finances.cash).toBe(cash + 2 * 1000 * C.sponsor.feeShare);
  });
});
