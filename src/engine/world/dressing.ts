import type { Club, World } from '../../model/domain';

/** Clubs below the simulated frontier are dormant: their squads wait to be readmitted. */
export const isActiveClub = (world: World, club: Club): boolean =>
  Boolean(world.leagues[club.leagueId]);

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Leaders are the two best natural leaders in the squad; cliques keep only current members. */
export function refreshDressingRoom(world: World, club: Club): void {
  const dressing = world.dressingRooms[club.dressingRoomId]!;
  dressing.leaderIds = club.playerIds
    .map((id) => world.players[id]!)
    .sort((a, b) => b.attributes.leadership - a.attributes.leadership || byId(a, b))
    .slice(0, 2)
    .map((player) => player.id);
  dressing.cliques = dressing.cliques.map((clique) => ({
    ...clique,
    playerIds: clique.playerIds.filter((id) => club.playerIds.includes(id)),
  }));
}
