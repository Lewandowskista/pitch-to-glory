/**
 * Legacy compact worlds: the original milestone 2 format (`World.format` absent or 'legacy'),
 * six fictional countries of four eight-club divisions playing 34-week seasons. They stay
 * loadable with their sporting rules frozen (docs/COMPATIBILITY.md, "Legacy worlds"): this
 * module holds the rules only they play, and the choices between them and the national
 * pyramid that the season loop makes. Rule flags (world/rules.ts) and the match engine are
 * shared with national worlds; fictional identities are kept by `identityVersion` being absent.
 */
import type { Club, League, Player, SeasonSummary, Standing, World } from '../../model/domain';
import { CONFIG } from '../config';
import type { Rng } from '../rng';
import { getSeasonWeeks, isNationalWorld } from './calendar';
import { recordEvent as event } from './events';
import { refreshDressingRoom } from './lifecycle';
import { rankStandings } from './ranking';
import { sortStandings } from './schedule';
import { joinSquad } from './squadNumbers';

const BACKGROUND = CONFIG.world.background;

/** Whether a world is a legacy compact world. */
export const isLegacyWorld = (world: World): boolean => !isNationalWorld(world);

/**
 * A league's table: national leagues rank by their country's tie-breakers (`rankStandings`),
 * legacy leagues by points, goal difference and goals (`sortStandings`).
 */
export function leagueTable(
  world: World,
  standings: Standing[],
  fixtureIds?: string[],
): Standing[] {
  return isLegacyWorld(world)
    ? sortStandings(standings)
    : rankStandings(world, standings, fixtureIds);
}

/** A legacy league's movements at the season's end: its promotion and relegation places. */
export function legacyMovements(
  world: World,
  league: League,
  table: readonly Standing[],
): SeasonSummary['movements'] {
  const country = world.countries[league.countryId]!;
  const movements: SeasonSummary['movements'] = [];
  if (league.promotionPlaces)
    for (const row of table.slice(0, league.promotionPlaces))
      movements.push({
        clubId: row.clubId,
        fromLeagueId: league.id,
        toLeagueId: country.leagueIds[league.tier - 2]!,
      });
  if (league.relegationPlaces)
    for (const row of table.slice(-league.relegationPlaces))
      movements.push({
        clubId: row.clubId,
        fromLeagueId: league.id,
        toLeagueId: country.leagueIds[league.tier]!,
      });
  return movements;
}

/** The fixed transfer weeks and academy intake of a legacy season. */
export const legacyLifecycleWeeks = (): { transfer: number[]; intake: number } => ({
  transfer: [...CONFIG.world.transferWeeks],
  intake: CONFIG.world.intakeWeek,
});

/**
 * A legacy transfer window: one zero-fee, same-position exchange per country between clubs
 * within a tier of each other, so squads stay balanced (national worlds run a market instead).
 */
export function exchangeTransfers(world: World, rng: Rng): void {
  for (const country of Object.values(world.countries)) {
    const clubs = country.leagueIds
      .flatMap((id) => world.leagues[id]!.clubIds)
      .map((id) => world.clubs[id]!);
    const careerId = world.career?.playerId;
    const rivalIds = new Set(world.rivalries.map((rivalry) => rivalry.rivalPlayerId));
    const a = rng.pick(clubs);
    // Exchanges happen between clubs of a similar level, never top flight and sixth tier.
    const tier = world.leagues[a.leagueId]!.tier;
    const b = rng.pick(
      clubs.filter(
        (club) => club.id !== a.id && Math.abs(world.leagues[club.leagueId]!.tier - tier) <= 1,
      ),
    );
    // The career player only moves through their own decisions (milestone 5).
    const movable = (club: Club) =>
      club.playerIds.filter((id) => id !== careerId && !rivalIds.has(id));
    const positionsOf = (club: Club) =>
      new Set(movable(club).map((id) => world.players[id]!.primaryPosition));
    const shared = [...positionsOf(a)].filter(
      (position) => position !== 'GK' && positionsOf(b).has(position),
    );
    if (!shared.length) continue;
    const position = rng.pick(
      (['CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'] as const).filter((p) =>
        shared.includes(p),
      ),
    );
    const playerA = rng.pick(
      movable(a)
        .map((id) => world.players[id]!)
        .filter((player) => player.primaryPosition === position),
    );
    const playerB = rng.pick(
      movable(b)
        .map((id) => world.players[id]!)
        .filter((player) => player.primaryPosition === position),
    );
    const move = (player: Player, old: Club, destination: Club) => {
      player.clubId = destination.id;
      const contract = world.contracts[player.contractId!]!;
      contract.clubId = destination.id;
      contract.start = { ...world.date };
      contract.end = {
        season: world.date.season + BACKGROUND.transferContractYears,
        week: getSeasonWeeks(world),
        day: 7,
      };
      old.playerIds = old.playerIds.filter((id) => id !== player.id);
      destination.playerIds.push(player.id);
      joinSquad(world, player, destination);
      event(world, 'transfer', [player.id, old.id, destination.id], {
        name: player.name,
        old: old.name,
        new: destination.name,
        fee: 0,
      });
    };
    move(playerA, a, b);
    move(playerB, b, a);
    refreshDressingRoom(world, a);
    refreshDressingRoom(world, b);
  }
}
