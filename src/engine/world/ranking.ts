import type { Standing, World } from '../../model/domain';
import { hashSeed } from '../rng';
import { emptyStanding } from './schedule';

export function rankStandings(world: World, rows: Standing[], fixtureIds?: string[]): Standing[] {
  if (!rows.length) return [];
  const club = world.clubs[rows[0]!.clubId]!;
  const country = world.countries[club.countryId]!;
  const league = world.leagues[club.leagueId];
  if (!fixtureIds) {
    const phase = Object.values(world.pyramid?.phases ?? {}).find(
      (candidate) =>
        candidate.clubIds.length === rows.length &&
        candidate.clubIds.every((id) => rows.some((row) => row.clubId === id)),
    );
    fixtureIds =
      phase?.fixtureIds ??
      (rows.every((row) => world.clubs[row.clubId]!.leagueId === club.leagueId)
        ? (league?.fixtureIds ?? [])
        : []);
  }
  const groups = new Map<number, Standing[]>();
  const away = new Map(rows.map((row) => [row.clubId, { goals: 0, wins: 0, homeLosses: 0 }]));
  for (const id of fixtureIds) {
    const fixture = world.fixtures[id]!;
    const result = world.results[id];
    const record = away.get(fixture.awayId);
    const homeRecord = away.get(fixture.homeId);
    if (result && homeRecord) homeRecord.homeLosses += Number(result.score[0] < result.score[1]);
    if (result && record) {
      record.goals += result.score[1];
      record.wins += Number(result.score[1] > result.score[0]);
    }
  }
  for (const row of rows) groups.set(row.points, [...(groups.get(row.points) ?? []), row]);
  const minis = new Map<
    number,
    { rows: Map<string, Standing>; awayGoals: Map<string, number>; complete: boolean }
  >();
  for (const [points, group] of groups) {
    const mini = new Map(group.map((row) => [row.clubId, emptyStanding(row.clubId)]));
    const awayGoals = new Map(group.map((row) => [row.clubId, 0]));
    const meetings = new Map<string, number>();
    for (const id of fixtureIds) {
      const fixture = world.fixtures[id]!;
      const result = world.results[id];
      if (!result || !mini.has(fixture.homeId) || !mini.has(fixture.awayId)) continue;
      const pair = [fixture.homeId, fixture.awayId].sort().join('|');
      meetings.set(pair, (meetings.get(pair) ?? 0) + 1);
      awayGoals.set(fixture.awayId, awayGoals.get(fixture.awayId)! + result.score[1]);
      for (const [clubId, scored, conceded] of [
        [fixture.homeId, result.score[0], result.score[1]],
        [fixture.awayId, result.score[1], result.score[0]],
      ] as const) {
        const row = mini.get(clubId)!;
        row.played++;
        row.goalsFor += scored;
        row.goalsAgainst += conceded;
        row.points += scored > conceded ? 3 : scored === conceded ? 1 : 0;
      }
    }
    const complete =
      group.length > 1 &&
      group.every((a) =>
        group.every(
          (b) =>
            a.clubId === b.clubId ||
            (meetings.get([a.clubId, b.clubId].sort().join('|')) ?? 0) >= 2,
        ),
      );
    minis.set(points, { rows: mini, awayGoals, complete });
  }
  const difference = (row: Standing) => row.goalsFor - row.goalsAgainst;
  const ranked = [...rows].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    const mini = minis.get(a.points)!;
    const x = mini.rows.get(a.clubId)!;
    const y = mini.rows.get(b.clubId)!;
    const miniDifference = mini.complete ? difference(y) - difference(x) : 0;
    const h2h = mini.complete ? y.points - x.points || miniDifference : 0;
    const overall = difference(b) - difference(a);
    let order: number;
    if (country.counterpart === 'France' && league && league.tier <= 2)
      order =
        overall ||
        h2h ||
        b.goalsFor - a.goalsFor ||
        b.won - a.won ||
        away.get(b.clubId)!.wins - away.get(a.clubId)!.wins;
    else if (country.counterpart === 'Germany' && league?.tier === 4 && league.region === 'Bavaria')
      order =
        h2h ||
        overall ||
        b.goalsFor - a.goalsFor ||
        b.won - a.won ||
        away.get(b.clubId)!.goals - away.get(a.clubId)!.goals;
    else if (country.counterpart === 'Germany')
      order =
        overall ||
        b.goalsFor - a.goalsFor ||
        miniDifference ||
        (mini.complete
          ? mini.awayGoals.get(b.clubId)! - mini.awayGoals.get(a.clubId)! ||
            away.get(b.clubId)!.goals - away.get(a.clubId)!.goals
          : 0);
    else if (country.counterpart === 'England')
      order =
        overall ||
        b.goalsFor - a.goalsFor ||
        (league?.tier === 1
          ? h2h ||
            (mini.complete ? mini.awayGoals.get(b.clubId)! - mini.awayGoals.get(a.clubId)! : 0)
          : b.won - a.won);
    else if (country.counterpart === 'Portugal')
      order = h2h || overall || b.won - a.won || b.goalsFor - a.goalsFor;
    else if (country.counterpart === 'Spain')
      order = (mini.rows.size === 2 ? miniDifference : h2h) || overall || b.goalsFor - a.goalsFor;
    else if (country.counterpart === 'Italy' && league?.tier === 3)
      order =
        h2h ||
        overall ||
        b.goalsFor - a.goalsFor ||
        a.goalsAgainst - b.goalsAgainst ||
        b.won - a.won ||
        a.lost - b.lost ||
        away.get(b.clubId)!.wins - away.get(a.clubId)!.wins ||
        away.get(a.clubId)!.homeLosses - away.get(b.clubId)!.homeLosses;
    else order = h2h || overall || b.goalsFor - a.goalsFor;
    // Card totals are outside this weekly engine: equal fair-play records and
    // otherwise inseparable positions use a reproducible seasonal lot.
    return (
      order ||
      hashSeed(`${world.seed}:${world.date.season}:table-lot:${a.clubId}`) -
        hashSeed(`${world.seed}:${world.date.season}:table-lot:${b.clubId}`) ||
      a.clubId.localeCompare(b.clubId)
    );
  });
  // Sporting deciders change rank without inventing regular-season points.
  for (const tie of Object.values(world.pyramid?.ties ?? {})) {
    if (
      !tie.winnerId ||
      !/:(serie-a-(championship|survival)|serie-d-(boundary|championship)-\d+)$/.test(tie.id)
    )
      continue;
    const winnerIndex = ranked.findIndex((row) => row.clubId === tie.winnerId);
    const loserIndex = ranked.findIndex(
      (row) => tie.clubIds.includes(row.clubId) && row.clubId !== tie.winnerId,
    );
    if (
      winnerIndex > loserIndex &&
      loserIndex >= 0 &&
      ranked[winnerIndex]!.points === ranked[loserIndex]!.points
    )
      [ranked[winnerIndex], ranked[loserIndex]] = [ranked[loserIndex]!, ranked[winnerIndex]!];
  }
  return ranked;
}
