import type { Trophy, World } from '../../../model/domain';

/** A trophy's name: the title as decided, or (for older trophies) its competition's name. */
export function trophyName(world: World, trophy: Trophy): string {
  return (
    trophy.name ??
    world.leagues[trophy.competitionId]?.name ??
    world.competitions[trophy.competitionId]?.name ??
    trophy.competitionId
  );
}
