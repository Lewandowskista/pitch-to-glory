/**
 * Team selection in a world: whether it uses formation-aware elevens yet, each club's formation
 * and its eleven. New worlds use formations from the start; worlds saved before adopt them when
 * their next season starts, so results within a season never change rules part-way.
 */
import type { Club, Id, Player, World } from '../../model/domain';
import { CONFIG } from '../config';
import { selectStartingPlayers } from '../strength';
import { formationOf, type Formation } from './formations';
import { selectLineup, type LineupChoice } from './lineup';

export const usesFormations = (world: Pick<World, 'selectionVersion'>): boolean =>
  world.selectionVersion === CONFIG.selection.version;

/** The club manager's formation (4-3-3 for an unknown one). */
export const clubFormation = (world: World, club: Club): Formation =>
  formationOf(world.managers[club.managerId]?.preferredFormation);

/** The eleven a club fields under the world's selection rules, in slot order when it has one. */
export function clubLineup(
  world: World,
  club: Club,
  options: { exclude?: readonly Id[] } = {},
): LineupChoice | null {
  if (!usesFormations(world)) return null;
  return selectLineup(club.playerIds, world.players, clubFormation(world, club), options);
}
/** The players a club fields, under either selection rules. */
export function clubStarters(
  world: World,
  club: Club,
  options: { exclude?: readonly Id[] } = {},
): Player[] {
  const lineup = clubLineup(world, club, options);
  if (lineup) return lineup.starterIds.map((id) => world.players[id]!);
  const excluded = new Set(options.exclude ?? []);
  return selectStartingPlayers(
    club.playerIds.filter((id) => !excluded.has(id)).map((id) => world.players[id]!),
  );
}
