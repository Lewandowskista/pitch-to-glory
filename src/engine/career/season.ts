import type { World } from '../../model/domain';
import { simulateWeek } from '../world/simulate';
import { pendingCareerFixture } from './fixtures';
import { autoPlayCareerFixture, type CareerMatchOutcome } from './matches';

/**
 * Advance a world by one week, respecting the career player's fixtures. With `autoPlay`, any
 * pending career fixture is played by the headless policy and committed first; without it,
 * the week is not simulated and the pending fixture id is returned so the player can play it.
 */
export function advanceCareerWeek(
  input: World,
  options: { inPlace?: boolean; autoPlay?: boolean } = {},
): { world: World; pendingFixtureId: string | null; outcomes: CareerMatchOutcome[] } {
  let world = input;
  const outcomes: CareerMatchOutcome[] = [];
  for (let pending = pendingCareerFixture(world); pending; pending = pendingCareerFixture(world)) {
    if (!options.autoPlay) return { world, pendingFixtureId: pending.id, outcomes };
    if (world === input && !options.inPlace) world = JSON.parse(JSON.stringify(input)) as World;
    outcomes.push(autoPlayCareerFixture(world, pending));
  }
  return {
    world: simulateWeek(world, { inPlace: options.inPlace || world !== input }),
    pendingFixtureId: null,
    outcomes,
  };
}
