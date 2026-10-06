import type { Club, World } from '../../model/domain';
import { createRng } from '../rng';
import { generateCrest } from '../assets/crest';
import { generateKits } from '../assets/kit';
import { generateManager, generatePlayer } from './generate';
import { nationalCityName, nationalClubName, nationalStadiumName } from './names';
import { POSITIONS } from './catalog';

export function createFeederClub(world: World, countryId: string, region: string): Club {
  const countryIndex = Number(countryId.split(':')[1]);
  const index = Object.values(world.clubs).filter((club) => club.countryId === countryId).length;
  const id = `club:feeder:${countryIndex}:${world.date.season}:${index}`;
  const rng = createRng(`${world.seed}:${id}`);
  const prototypes = Object.values(world.clubs).filter(
    (club) => club.countryId === countryId && world.leagues[club.leagueId],
  );
  const template = prototypes.sort(
    (a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id),
  )[0]!;
  const counterpart = world.countries[countryId]!.counterpart!;
  const city = nationalCityName(countryIndex, index);
  let name = nationalClubName(city, counterpart, index);
  if (Object.values(world.clubs).some((club) => club.name === name)) name += ` ${1880 + index}`;
  const crest = generateCrest(rng);
  const club: Club = {
    ...(JSON.parse(JSON.stringify(template)) as Club),
    id,
    name,
    city,
    leagueId: `feeder:${countryIndex}:${region}`,
    crest,
    kits: generateKits(rng, crest.colors),
    stadium: {
      ...template.stadium,
      id: `stadium:${id}`,
      name: nationalStadiumName(city, countryIndex),
    },
    identity: { ...template.identity!, region, status: 'semi-professional', reserveParentId: null },
    managerId: `manager:${id}`,
    dressingRoomId: `dressing:${id}`,
    playerIds: [],
  };
  world.clubs[id] = club;
  world.managers[club.managerId] = generateManager(club.managerId, rng, countryIndex);
  for (const [playerIndex, position] of POSITIONS.entries()) {
    const { player, contract } = generatePlayer(
      `player:${id}:${playerIndex}`,
      club,
      position,
      rng.int(17, 31),
      world.date,
      rng,
    );
    world.players[player.id] = player;
    world.contracts[contract.id] = contract;
    club.playerIds.push(player.id);
  }
  world.dressingRooms[club.dressingRoomId] = {
    id: club.dressingRoomId,
    clubId: id,
    leaderIds: [club.playerIds[2]!],
    cliques: [],
    mood: 65,
  };
  world.pyramid!.feederClubIds.push(id);
  return club;
}
export function admitFeeder(world: World, clubId: string, leagueId: string): void {
  if (!world.pyramid!.movements.some((movement) => movement.clubId === clubId))
    world.pyramid!.movements.push({
      clubId,
      fromLeagueId: world.clubs[clubId]!.leagueId,
      toLeagueId: leagueId,
      reason: 'feeder',
    });
}
