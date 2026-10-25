/**
 * Team selection in a world: each club's formation and its eleven. Every world selects
 * formation-aware elevens: new worlds from the start, worlds saved before (`selectionVersion`
 * absent) from when they are loaded (world/rules.ts, docs/COMPATIBILITY.md).
 */
import type { Club, Id, Player, World } from '../../model/domain';
import { formationOf, type Formation } from './formations';
import { selectLineup, type LineupChoice } from './lineup';

/** The club manager's formation (4-3-3 for an unknown one). */
export const clubFormation = (world: World, club: Club): Formation =>
  formationOf(world.managers[club.managerId]?.preferredFormation);

/** The eleven a club fields, in slot order. */
export function clubLineup(
  world: World,
  club: Club,
  options: { exclude?: readonly Id[]; seed?: string; rotation?: number } = {},
): LineupChoice {
  return selectLineup(club.playerIds, world.players, clubFormation(world, club), options);
}
/** The players a club fields. */
export function clubStarters(
  world: World,
  club: Club,
  options: { exclude?: readonly Id[] } = {},
): Player[] {
  return clubLineup(world, club, options).starterIds.map((id) => world.players[id]!);
}
