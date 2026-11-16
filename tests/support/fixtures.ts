/**
 * The shared national test worlds (release 1.0 plan, step 2.1). Production only creates national
 * worlds, so tests start from one too: a full, unmodified national world generated on a fixed
 * seed, and a career created in it at a semi-professional trial club, exactly as a new player
 * would. Built once per source revision by the Vitest global setup (tests/support/setup-worlds.ts)
 * and read by tests through tests/support/world.ts. Engine imports only: the child process that
 * plays the season fixture runs this file with tsx.
 */
import type { World } from '../../src/model/domain';
import { generateWorld } from '../../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../../src/engine/career/create';
import { advanceCareerWeek } from '../../src/engine/career/season';

/** The seed every shared national world is generated from. */
export const NATIONAL_SEED = 'national-tests';
/** The weeks played before the `career-weeks` snapshot (about a fifth of a national season). */
export const SNAPSHOT_WEEKS = 12;
/** The career player of the shared fixtures: an English 17-year-old striker. */
export const TEST_DRAFT: CareerDraft = {
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

export type FixtureName = 'world' | 'career' | 'career-weeks' | 'career-season';
/** The fixtures built synchronously before any test runs. */
export const QUICK_FIXTURES = ['world', 'career'] as const;
/** The fixtures played in a background process while the first tests run. */
export const PLAYED_FIXTURES = ['career-weeks', 'career-season'] as const;

export function buildNationalWorld(): World {
  return generateWorld(NATIONAL_SEED);
}
/** The career at the first trial club its nationality offers (the bottom simulated tier). */
export function buildNationalCareer(world: World = buildNationalWorld()): World {
  const trial = trialOffers(world, TEST_DRAFT.nationalityId, NATIONAL_SEED)[0]!;
  return createCareer(world, TEST_DRAFT, trial.id, NATIONAL_SEED);
}
/**
 * Auto-play the career forward: `onSnapshot` receives the world after `SNAPSHOT_WEEKS` weeks
 * and at the end of the season (phase no longer active), before the rollover.
 */
export function playNationalCareer(
  career: World,
  onSnapshot: (name: (typeof PLAYED_FIXTURES)[number], world: World) => void,
): void {
  let world = JSON.parse(JSON.stringify(career)) as World;
  for (let week = 0; world.phase === 'active'; week++) {
    if (week === SNAPSHOT_WEEKS) onSnapshot('career-weeks', world);
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  }
  onSnapshot('career-season', world);
}
