import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import {
  applyLifestyleAction,
  challengeCounter,
  challengeDone,
  needsMinutes,
  refreshChallenges,
  sidelined,
} from '../src/engine/career/lifestyle';
import { commitmentsWeek } from '../src/engine/career/commitments';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 5, step 5.4: challenges say when they need match minutes, and a sidelined
 * player can swap one for a goal they can still reach. Rewards stay cosmetic.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
let career: World;
beforeAll(() => {
  const base = generateWorld('sidelined-challenges', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'sidelined-challenges')[0]!;
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
      position: 'ST',
      foot: 'right',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'sidelined-challenges',
  );
  refreshChallenges(career, '2026-10-23');
}, 120000);

/** The world with a weekly challenge set to need minutes, and the player injured. */
function injuredWith(kind: 'goals' | 'play'): { world: World; id: string } {
  const world = clone(career);
  const challenge = world.challenges.find((entry) => entry.cadence === 'weekly')!;
  challenge.kind = kind;
  challenge.target = 3;
  challenge.baseline = challengeCounter(world, kind);
  const me = world.players[world.career!.playerId]!;
  me.injuryId = 'injury:test';
  world.career!.injury = {
    id: 'injury:test',
    playerId: me.id,
    kind: 'hamstring-strain',
    started: { ...world.date },
    weeksRemaining: 4,
    severity: 2,
    reinjuryRisk: 0,
    recovery: 'rehab',
    careerThreatening: false,
    cause: 'training',
  };
  return { world, id: challenge.id };
}

describe('challenges for a sidelined player', () => {
  it('labels the kinds only matches move', () => {
    expect(needsMinutes('goals')).toBe(true);
    expect(needsMinutes('play')).toBe(true);
    expect(needsMinutes('press')).toBe(false);
    expect(needsMinutes('commitments')).toBe(false);
  });

  it('swaps a challenge needing minutes once, for the same reward, while injured', () => {
    const { world, id } = injuredWith('goals');
    expect(sidelined(world)).toBe(true);
    const before = world.challenges.find((entry) => entry.id === id)!;
    const reward = [before.rewardTokens, before.rewardCosmeticId];
    const swapped = applyLifestyleAction(world, { type: 'swap-challenge', id });
    const after = swapped.challenges.find((entry) => entry.id === id)!;
    expect(needsMinutes(after.kind)).toBe(false);
    expect(after.swapped).toBe(true);
    expect([after.rewardTokens, after.rewardCosmeticId]).toEqual(reward);
    expect(() => validateWorld(clone(swapped))).not.toThrow();
    // Once only.
    expect(() => applyLifestyleAction(swapped, { type: 'swap-challenge', id })).toThrow();
  });

  it('can be met off the pitch: weekly commitments count', () => {
    const { world, id } = injuredWith('play');
    const swapped = applyLifestyleAction(world, { type: 'swap-challenge', id });
    const challenge = swapped.challenges.find((entry) => entry.id === id)!;
    expect(challenge.kind).toBe('commitments');
    swapped.career!.training.commitments = ['rest', 'family'];
    for (let week = 0; week < challenge.target; week++) commitmentsWeek(swapped);
    expect(challengeDone(swapped, challenge)).toBe(true);
  });

  it('refuses a swap while the player is fit and in the side', () => {
    const world = clone(career);
    const challenge = world.challenges.find((entry) => entry.cadence === 'weekly')!;
    challenge.kind = 'goals';
    expect(sidelined(world)).toBe(false);
    expect(() =>
      applyLifestyleAction(world, { type: 'swap-challenge', id: challenge.id }),
    ).toThrow();
  });
});
