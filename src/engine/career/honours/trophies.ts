import type { Id, Tournament, Trophy, World } from '../../../model/domain';

/** A trophy's name: the title as decided, or (for older trophies) its competition's name. */
export function trophyName(world: World, trophy: Trophy): string {
  return (
    trophy.name ??
    world.leagues[trophy.competitionId]?.name ??
    world.competitions[trophy.competitionId]?.name ??
    trophy.competitionId
  );
}

/**
 * A player's part in a stored tournament. A tournament records only "the career player's" part,
 * so it belongs to whichever career was playing when it was held. A tournament is held after a
 * season and carries the next season's year, so a career's own are those after the season it
 * started and after the one in which the career before it retired (a parent's last tournament is
 * never the child's), up to the one after the season it retired.
 */
export function tournamentPart(
  world: World,
  playerId: Id,
  tournament: Tournament,
): Tournament['career'] {
  const legacy = world.legacies.find((entry) => entry.playerId === playerId);
  const current = world.career?.playerId === playerId ? world.career : null;
  if (!current && !legacy) return null;
  const started = current?.startSeason ?? legacy!.startSeason;
  const end = current ? Infinity : legacy!.retiredAt.season + 1;
  const start = Math.max(
    started,
    ...world.legacies
      .filter((entry) => entry.playerId !== playerId && entry.retiredAt.season <= started)
      .map((entry) => entry.retiredAt.season + 1),
  );
  return tournament.year > start && tournament.year <= end ? tournament.career : null;
}
