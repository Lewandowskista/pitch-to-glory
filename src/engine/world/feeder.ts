import type { Club, World } from '../../model/domain';
import { createRng } from '../rng';
import { generateCrest } from '../assets/crest';
import { generateKits } from '../assets/kit';
import { generateManager, generatePlayer } from './generate';
import { nationalCityName, nationalClubName, nationalStadiumName } from './names';
import { POSITIONS } from './catalog';

/**
 * A club dormant below the simulated frontier in this region, not already involved in this
 * season's movement or ties. Reusing departed clubs keeps the club count bounded; without it
 * every departure created a new 22-player club and the world grew without limit.
 */
// Clubs handed out earlier in the same simulated week, before a movement or tie records
// them (Bavaria creates both survival challengers before drawing their ties). Scoped to
// one week, which always runs as a single uninterrupted step, so a world resumed from a
// save makes exactly the same choices.
const handedOut = new WeakMap<World, { week: string; ids: Set<string> }>();
function recentlyHandedOut(world: World): Set<string> {
  const week = `${world.date.season}:${world.date.week}`;
  let recent = handedOut.get(world);
  if (recent?.week !== week) {
    recent = { week, ids: new Set() };
    handedOut.set(world, recent);
  }
  return recent.ids;
}
function dormantClub(world: World, countryId: string, region: string): Club | undefined {
  const recent = recentlyHandedOut(world);
  const claimed = new Set([
    ...recent,
    ...world.pyramid!.movements.map((movement) => movement.clubId),
    ...Object.values(world.pyramid!.ties).flatMap((tie) => tie.clubIds),
  ]);
  const club = Object.values(world.clubs)
    .filter(
      (club) =>
        club.countryId === countryId &&
        !world.leagues[club.leagueId] &&
        club.identity?.region === region &&
        !club.identity.reserveParentId &&
        !claimed.has(club.id),
    )
    .sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1))[0];
  if (club) recent.add(club.id);
  return club;
}
export function createFeederClub(world: World, countryId: string, region: string): Club {
  const returning = dormantClub(world, countryId, region);
  if (returning) {
    returning.identity!.status = 'semi-professional';
    return returning;
  }
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
  // A new club is also non-league until admitted; never hand it out again this week.
  recentlyHandedOut(world).add(id);
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
