import type { League, Tier, World } from '../../model/domain';
import { admitFeeder, createFeederClub } from './feeder';
import { rankStandings } from './ranking';
import { germanRegionalZones } from './profiles';

export function resolveReserveDemotions(world: World): void {
  const movements = world.pyramid!.movements;
  const destination = (clubId: string) =>
    movements.find((movement) => movement.clubId === clubId)?.toLeagueId ??
    world.clubs[clubId]!.leagueId;
  const tier = (leagueId: string) => world.leagues[leagueId]?.tier ?? 7;
  for (const reserve of Object.values(world.clubs).filter(
    (club) => club.identity?.reserveParentId,
  )) {
    const parent = reserve.identity!.reserveParentId!;
    const parentTier = tier(destination(parent));
    const currentLeague = world.leagues[reserve.leagueId];
    if (!currentLeague) continue;
    const proposed = movements.find((movement) => movement.clubId === reserve.id);
    const reserveTier = tier(destination(reserve.id));
    const franceAcademyDrop = reserve.identity!.counterpart === 'France' && parentTier > 2;
    if (!franceAcademyDrop && parentTier < reserveTier) continue;
    const targetTier = franceAcademyDrop ? 7 : parentTier + 1;
    const targetLeague =
      Object.values(world.leagues).find(
        (league) =>
          league.countryId === reserve.countryId &&
          league.tier === targetTier &&
          league.region === reserve.identity!.region,
      ) ??
      Object.values(world.leagues).find(
        (league) => league.countryId === reserve.countryId && league.tier === targetTier,
      );
    const targetId =
      targetLeague?.id ?? `feeder:${reserve.countryId.split(':')[1]}:${reserve.identity!.region}`;
    if (proposed?.toLeagueId === targetId) continue;
    if (proposed && tier(proposed.toLeagueId) < currentLeague.tier) {
      const originalTarget = proposed.toLeagueId;
      movements.splice(movements.indexOf(proposed), 1);
      const replacement = rankStandings(world, currentLeague.standings).find(
        (row) =>
          row.clubId !== reserve.id &&
          !world.clubs[row.clubId]!.identity?.reserveParentId &&
          !movements.some((movement) => movement.clubId === row.clubId),
      );
      if (!replacement) throw new Error('No eligible reserve promotion replacement');
      movements.push({
        clubId: replacement.clubId,
        fromLeagueId: currentLeague.id,
        toLeagueId: originalTarget,
        reason: 'automatic',
      });
      if (targetTier <= currentLeague.tier) continue;
    } else if (proposed) movements.splice(movements.indexOf(proposed), 1);
    const reprieve = movements
      .filter(
        (movement) =>
          movement.clubId !== reserve.id &&
          world.leagues[movement.fromLeagueId]?.countryId === reserve.countryId &&
          world.leagues[movement.fromLeagueId]?.tier === currentLeague.tier &&
          tier(movement.toLeagueId) > currentLeague.tier,
      )
      .sort((a, b) => {
        const aLeague = world.leagues[a.fromLeagueId]!;
        const bLeague = world.leagues[b.fromLeagueId]!;
        return (
          rankStandings(world, aLeague.standings).findIndex((row) => row.clubId === a.clubId) -
          rankStandings(world, bLeague.standings).findIndex((row) => row.clubId === b.clubId)
        );
      })[0];
    if (reprieve) movements.splice(movements.indexOf(reprieve), 1);
    movements.push({
      clubId: reserve.id,
      fromLeagueId: reserve.leagueId,
      toLeagueId: targetId,
      reason: 'automatic',
    });
  }
}

export function finalizeNationalMovements(world: World): void {
  resolveReserveDemotions(world);
  for (const country of Object.values(world.countries)) {
    if (country.counterpart === 'Germany') continue;
    const departures = world.pyramid!.movements.filter(
      (movement) =>
        world.clubs[movement.clubId]!.countryId === country.id &&
        !world.leagues[movement.toLeagueId],
    );
    for (const movement of departures) {
      const league = world.leagues[movement.fromLeagueId]!;
      admitFeeder(world, createFeederClub(world, country.id, league.region!).id, league.id);
    }
  }
  const planned = new Map(
    world.pyramid!.movements.map((movement) => [movement.clubId, movement.toLeagueId]),
  );
  for (const country of Object.values(world.countries)) {
    const leagues = country.leagueIds.map((id) => world.leagues[id]!);
    for (const tier of [...new Set(leagues.map((league) => league.tier))]) {
      const groups = leagues.filter((league) => league.tier === tier);
      const pool = Object.values(world.clubs).filter((club) => {
        const id = planned.get(club.id) ?? club.leagueId;
        return world.leagues[id]?.countryId === country.id && world.leagues[id]?.tier === tier;
      });
      const capacity = groups.reduce(
        (sum, league) => sum + (league.nextCapacity ?? league.capacity ?? league.clubIds.length),
        0,
      );
      if (pool.length !== capacity)
        throw new Error(
          `${country.counterpart} tier ${tier} movement mismatch: ${pool.length} clubs for ${capacity} places`,
        );
      if (groups.length < 2) continue;
      const allocated = new Set<string>();
      const allocations = new Map<League, string[]>();
      for (const group of groups) {
        const native = pool
          .filter((club) => club.identity!.region === group.region)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, group.nextCapacity ?? group.capacity ?? group.clubIds.length);
        allocations.set(
          group,
          native.map((club) => club.id),
        );
        for (const club of native) allocated.add(club.id);
      }
      const remaining = pool
        .filter((club) => !allocated.has(club.id))
        .sort(
          (a, b) =>
            b.identity!.latitude - a.identity!.latitude ||
            a.identity!.longitude - b.identity!.longitude ||
            a.id.localeCompare(b.id),
        );
      for (const group of groups) {
        const ids = allocations.get(group)!;
        while (ids.length < (group.nextCapacity ?? group.capacity ?? group.clubIds.length))
          ids.push(remaining.shift()!.id);
        for (const clubId of ids) {
          const existing = world.pyramid!.movements.find((movement) => movement.clubId === clubId);
          if (existing) existing.toLeagueId = group.id;
          else if (world.clubs[clubId]!.leagueId !== group.id)
            world.pyramid!.movements.push({
              clubId,
              fromLeagueId: world.clubs[clubId]!.leagueId,
              toLeagueId: group.id,
              reason: 'regional-allocation',
            });
        }
      }
    }
  }
}

export function resetNationalSeason(world: World): void {
  world.pyramid!.phases = {};
  world.pyramid!.ties = {};
  world.pyramid!.movements = [];
  world.pyramid!.completedSteps = [];
  world.pyramid!.stage = 'regular';
  world.pyramid!.feederClubIds = Object.values(world.clubs)
    .filter((club) => !world.leagues[club.leagueId])
    .map((club) => club.id);
  for (const club of Object.values(world.clubs)) {
    const league = world.leagues[club.leagueId];
    if (league) club.identity!.status = league.status!;
  }
  for (const league of Object.values(world.leagues)) {
    if (league.nextCapacity !== undefined) {
      league.capacity = league.nextCapacity;
      delete league.nextCapacity;
    }
    if (world.countries[league.countryId]!.counterpart === 'Germany' && league.tier === 4)
      league.zones = germanRegionalZones(league.region!, world.date.season);
  }
}
export function frontierTier(world: World, countryId: string): Tier {
  return Math.max(
    ...world.countries[countryId]!.leagueIds.map((id) => world.leagues[id]!.tier),
  ) as Tier;
}
