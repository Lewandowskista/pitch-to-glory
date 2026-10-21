import type { Fixture, Objective, World } from '../../model/domain';
import { objectivesFor } from '../match/objectives';
import { clubFormation, usesFormations } from '../selection/world';
import { slotPosition } from '../selection/lineup';

/** The seed a career fixture's match is played from, so a replay is identical. */
export const careerMatchSeed = (world: Pick<World, 'seed'>, fixture: Pick<Fixture, 'id'>) =>
  `${world.seed}:career:${fixture.id}`;

/**
 * The personal objectives the career player will be set in a fixture (engine match-15,
 * decision 3), known before matchday: the same draw kickoff makes, from the fixture's seed and
 * the position they will play (the slot they start in, match-17). Null without a career player, and in worlds on the earlier selection
 * rules, whose engine still draws objectives at kickoff.
 */
export function previewObjectives(world: World, fixture: Fixture): Objective[] | null {
  const player = world.career ? world.players[world.career.playerId] : undefined;
  const club = player?.clubId ? world.clubs[player.clubId] : undefined;
  if (!player || !club || !usesFormations(world)) return null;
  // The slot kickoff will give them in their manager's shape (match-17).
  const position = slotPosition(player, clubFormation(world, club));
  return objectivesFor(careerMatchSeed(world, fixture), player, position);
}
