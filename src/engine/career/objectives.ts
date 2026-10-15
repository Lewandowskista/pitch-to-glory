import type { Fixture, Objective, World } from '../../model/domain';
import { objectivesFor } from '../match/objectives';
import { usesFormations } from '../selection/world';

/** The seed a career fixture's match is played from, so a replay is identical. */
export const careerMatchSeed = (world: Pick<World, 'seed'>, fixture: Pick<Fixture, 'id'>) =>
  `${world.seed}:career:${fixture.id}`;

/**
 * The personal objectives the career player will be set in a fixture (engine match-15,
 * decision 3), known before matchday: the same draw kickoff makes, from the fixture's seed and
 * the player's position. Null without a career player, and in worlds on the earlier selection
 * rules, whose engine still draws objectives at kickoff.
 */
export function previewObjectives(world: World, fixture: Fixture): Objective[] | null {
  const player = world.career ? world.players[world.career.playerId] : undefined;
  if (!player || !usesFormations(world)) return null;
  return objectivesFor(careerMatchSeed(world, fixture), player);
}
