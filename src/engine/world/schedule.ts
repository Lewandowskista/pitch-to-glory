import type { Competition, Fixture, Standing, World } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng } from '../rng';

export function emptyStanding(clubId: string): Standing {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}
export function sortStandings(rows: Standing[]): Standing[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      (a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0),
  );
}
export function createLeagueFixtures(
  clubIds: string[],
  leagueId: string,
  season: number,
  options?: { cycles: 2 | 4; startWeek?: number; day?: number },
): Fixture[] {
  if (
    clubIds.length < 2 ||
    (!options && clubIds.length % 2) ||
    new Set(clubIds).size !== clubIds.length
  )
    throw new RangeError('Distinct clubs are required; legacy schedules require an even count');
  const rotating: (string | null)[] = [...clubIds];
  if (rotating.length % 2) rotating.push(null);
  const fixtures: Fixture[] = [];
  for (let cycle = 0; cycle < (options?.cycles ?? 4); cycle++) {
    const circle = [...rotating];
    for (let round = 0; round < circle.length - 1; round++) {
      const week = cycle * (circle.length - 1) + round + (options?.startWeek ?? 1);
      for (let pairing = 0; pairing < circle.length / 2; pairing++) {
        const a = circle[pairing];
        const b = circle[circle.length - pairing - 1];
        if (!a || !b) continue;
        const flip = options
          ? (round + pairing + Math.floor(cycle / 2) + (cycle % 2)) % 2 === 1
          : (round + pairing + cycle) % 2 === 1;
        fixtures.push({
          id: `${leagueId}:${season}:${week}:${pairing}`,
          competitionId: leagueId,
          date: { season, week, day: options?.day ?? 1 },
          homeId: flip ? b : a,
          awayId: flip ? a : b,
          matchId: null,
        });
      }
      circle.splice(1, 0, circle.pop()!);
    }
  }
  return fixtures;
}

/** Only known participants are scheduled: later rounds are created after their predecessors finish. */
export function addCupRound(world: World, cup: Competition, clubIds: string[]): void {
  const round = cup.stages.length;
  const national = world.format === 'national-v1';
  const week = national ? CONFIG.world.nationalCupWeeks[round] : CONFIG.world.cupWeeks[round];
  if (week === undefined || clubIds.length < 2 || (!national && clubIds.length % 2))
    throw new RangeError('Invalid domestic cup round');
  const draw = [...clubIds];
  const rng = createRng(`${world.seed}:cup:${cup.id}:${cup.season}:${round}`);
  for (let index = draw.length - 1; index > 0; index--) {
    const target = rng.int(0, index);
    [draw[index], draw[target]] = [draw[target]!, draw[index]!];
  }
  const fixtureIds: string[] = [];
  const bracketSize = 2 ** Math.ceil(Math.log2(draw.length));
  const byeClubIds = national && round === 0 ? draw.splice(0, bracketSize - draw.length) : [];
  for (let index = 0; index < draw.length; index += 2) {
    const id = `${cup.id}:${cup.season}:${round}:${index / 2}`;
    fixtureIds.push(id);
    world.fixtures[id] = {
      id,
      competitionId: cup.id,
      date: { season: cup.season, week, day: 4 },
      homeId: draw[index]!,
      awayId: draw[index + 1]!,
      matchId: null,
    };
  }
  cup.stages.push({
    id: `${cup.id}:${cup.season}:round:${round}`,
    name: `round-${round + 1}`,
    groups: [[...byeClubIds, ...draw]],
    fixtureIds,
    ...(national ? { byeClubIds } : {}),
  });
}
