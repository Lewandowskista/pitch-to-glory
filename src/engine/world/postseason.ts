import type {
  League,
  LeaguePhase,
  Movement,
  PostseasonTie,
  Standing,
  Tier,
  World,
} from '../../model/domain';
import { createRng } from '../rng';
import { createLeagueFixtures, emptyStanding } from './schedule';
import { rankStandings } from './ranking';

export type TieInput = Pick<
  PostseasonTie,
  | 'id'
  | 'countryId'
  | 'name'
  | 'kind'
  | 'sourceLeagueIds'
  | 'targetDivisionId'
  | 'round'
  | 'clubIds'
  | 'legs'
  | 'drawRule'
  | 'higherRankedId'
> & { firstHomeId?: string; startWeek?: number; neutral?: boolean };

export function createPostseasonTie(world: World, input: TieInput): PostseasonTie {
  const previous = world.pyramid!.ties[input.id];
  if (previous) return previous;
  const firstHome = input.firstHomeId ?? input.clubIds[0];
  const other = input.clubIds.find((id) => id !== firstHome)!;
  const fixtures = Array.from({ length: input.legs }, (_, index) => ({
    id: `${input.id}:leg:${index + 1}`,
    competitionId: input.id,
    date: {
      season: world.date.season,
      week: (input.startWeek ?? world.date.week + 1) + index,
      day: 3,
    },
    homeId: index ? other : firstHome,
    awayId: index ? firstHome : other,
    matchId: null,
    tieId: input.id,
    ...(input.neutral ? { neutral: true } : {}),
  }));
  for (const fixture of fixtures) world.fixtures[fixture.id] = fixture;
  const tie: PostseasonTie = {
    id: input.id,
    countryId: input.countryId,
    name: input.name,
    kind: input.kind,
    sourceLeagueIds: input.sourceLeagueIds,
    targetDivisionId: input.targetDivisionId,
    round: input.round,
    clubIds: input.clubIds,
    fixtureIds: fixtures.map((fixture) => fixture.id),
    legs: input.legs,
    aggregate: [0, 0],
    drawRule: input.drawRule,
    higherRankedId: input.higherRankedId,
    winnerId: null,
    resolution: null,
    status: 'active',
  };
  world.pyramid!.ties[tie.id] = tie;
  if (input.neutral) tie.neutral = true;
  return tie;
}

export function resolvePostseasonTie(world: World, tie: PostseasonTie): void {
  const aggregate: [number, number] = [0, 0];
  for (const id of tie.fixtureIds) {
    const fixture = world.fixtures[id]!;
    const result = world.results[id];
    if (!result) continue;
    const homeIndex = tie.clubIds.indexOf(fixture.homeId);
    aggregate[homeIndex as 0 | 1] += result.score[0];
    aggregate[(1 - homeIndex) as 0 | 1] += result.score[1];
  }
  tie.aggregate = aggregate;
  if (!tie.fixtureIds.every((id) => world.results[id])) return;
  const finalFixture = world.fixtures[tie.fixtureIds.at(-1)!]!;
  const finalResult = world.results[finalFixture.id]!;
  if (aggregate[0] !== aggregate[1]) {
    tie.winnerId = tie.clubIds[aggregate[0] > aggregate[1] ? 0 : 1];
    tie.resolution = finalResult.extraTime ? 'extra-time' : 'aggregate';
  } else if (
    tie.higherRankedId &&
    ['higher-rank', 'higher-rank-after-extra-time'].includes(tie.drawRule)
  ) {
    tie.winnerId = tie.higherRankedId;
    tie.resolution = 'higher-rank';
  } else if (finalResult.penalties) {
    tie.winnerId =
      finalResult.penalties[0] > finalResult.penalties[1]
        ? finalFixture.homeId
        : finalFixture.awayId;
    tie.resolution = 'penalties';
  } else throw new Error(`Completed tie ${tie.id} requires a deciding result`);
  tie.status = 'complete';
}

export function portugueseSurvivalBonus(rank: number, points: number): number {
  if (rank < 5 || rank > 10 || !Number.isInteger(points) || points < 0)
    throw new RangeError('Invalid Liga 3 survival entrant');
  if (points < 10) return 0;
  return 11 - rank + (points < 15 ? 0 : Math.min(4, Math.floor((points - 10) / 5)));
}

export function createLeaguePhase(
  world: World,
  input: Omit<LeaguePhase, 'fixtureIds' | 'standings' | 'status'>,
): LeaguePhase {
  if (world.pyramid!.phases[input.id]) return world.pyramid!.phases[input.id]!;
  const fixtures = createLeagueFixtures(input.clubIds, input.id, world.date.season, {
    cycles: 2,
    startWeek: world.date.week + 1,
  });
  for (const fixture of fixtures) world.fixtures[fixture.id] = { ...fixture, phaseId: input.id };
  const phase: LeaguePhase = {
    ...input,
    standings: input.clubIds.map((id) => ({
      ...emptyStanding(id),
      points: input.initialPoints[id] ?? 0,
    })),
    fixtureIds: fixtures.map((fixture) => fixture.id),
    status: 'active',
  };
  world.pyramid!.phases[phase.id] = phase;
  return phase;
}

export function leaguesAt(world: World, countryId: string, tier: Tier): League[] {
  return world.countries[countryId]!.leagueIds.map((id) => world.leagues[id]!).filter(
    (league) => league.tier === tier,
  );
}
export function regularComplete(world: World, leagues: League[]): boolean {
  return leagues.every((league) => league.fixtureIds.every((id) => world.results[id]));
}
export function eligibleTable(
  world: World,
  league: League,
  targetTier: Tier = Math.max(1, league.tier - 1) as Tier,
): Standing[] {
  return rankStandings(world, league.standings).filter((row) => {
    const parent = world.clubs[row.clubId]!.identity?.reserveParentId;
    if (!parent) return true;
    const counterpart = world.countries[league.countryId]!.counterpart;
    if (
      (counterpart === 'France' && targetTier <= 3) ||
      (counterpart === 'Germany' && targetTier <= 2) ||
      (counterpart === 'Portugal' && targetTier === 1)
    )
      return false;
    const parentClub = world.clubs[parent];
    const parentDestination =
      world.pyramid!.movements.find((movement) => movement.clubId === parent)?.toLeagueId ??
      parentClub?.leagueId;
    return Boolean(
      parentClub &&
      parentDestination &&
      world.leagues[parentDestination] &&
      world.leagues[parentDestination]!.tier < targetTier,
    );
  });
}
export function eligiblePhaseTable(world: World, phase: LeaguePhase, targetTier: Tier): Standing[] {
  const source = world.leagues[phase.sourceLeagueIds[0]!]!;
  return eligibleTable(
    world,
    { ...source, clubIds: phase.clubIds, standings: phase.standings },
    targetTier,
  );
}
export function recordMovement(
  world: World,
  clubId: string,
  targetTier: Tier | null,
  reason: Movement['reason'] = 'automatic',
): void {
  if (world.pyramid!.movements.some((movement) => movement.clubId === clubId)) return;
  const club = world.clubs[clubId]!;
  const target =
    targetTier === null
      ? `feeder:${club.countryId.split(':')[1]}:${club.identity!.region}`
      : (leaguesAt(world, club.countryId, targetTier).find(
          (league) => league.region === club.identity?.region,
        ) ?? leaguesAt(world, club.countryId, targetTier)[0])!.id;
  world.pyramid!.movements.push({
    clubId,
    fromLeagueId: club.leagueId,
    toLeagueId: target,
    reason,
  });
}
export function once(world: World, key: string, ready: boolean, action: () => void): boolean {
  if (world.pyramid!.completedSteps.includes(key)) return true;
  if (!ready) return false;
  action();
  world.pyramid!.completedSteps.push(key);
  return true;
}
export function tieWinner(world: World, id: string): string | null {
  return world.pyramid!.ties[id]?.winnerId ?? null;
}
export function makeTie(
  world: World,
  key: string,
  countryId: string,
  clubs: [string, string],
  options: {
    legs?: 1 | 2;
    drawRule?: PostseasonTie['drawRule'];
    higher?: string | null;
    firstHome?: string;
    kind?: PostseasonTie['kind'];
    round?: number;
    targetTier?: Tier;
    neutral?: boolean;
  } = {},
): PostseasonTie {
  return createPostseasonTie(world, {
    id: `${countryId}:${world.date.season}:${key}`,
    countryId,
    name: key.replaceAll('-', ' '),
    kind: options.kind ?? 'promotion',
    sourceLeagueIds: [...new Set(clubs.map((id) => world.clubs[id]!.leagueId))],
    targetDivisionId: options.targetTier
      ? `${world.countries[countryId]!.counterpart!.toLowerCase()}:${options.targetTier}`
      : null,
    round: options.round ?? 1,
    clubIds: clubs,
    legs: options.legs ?? 2,
    drawRule: options.drawRule ?? 'extra-time-penalties',
    higherRankedId: options.higher ?? null,
    firstHomeId: options.firstHome ?? clubs[0],
    neutral: options.neutral,
  });
}
export function tieId(world: World, countryId: string, key: string): string {
  return `${countryId}:${world.date.season}:${key}`;
}
export function winner(world: World, countryId: string, key: string): string | null {
  return tieWinner(world, tieId(world, countryId, key));
}
export function barrage(
  world: World,
  countryId: string,
  key: string,
  upper: string,
  lower: string,
  upperTier: Tier,
): boolean {
  const tie = makeTie(world, key, countryId, [lower, upper], {
    firstHome: lower,
    targetTier: upperTier,
  });
  if (!tie.winnerId) return false;
  if (tie.winnerId === lower) {
    recordMovement(world, lower, upperTier, 'playoff');
    recordMovement(world, upper, (upperTier + 1) as Tier, 'playoff');
  }
  return true;
}
export function seededShuffle(world: World, key: string, clubs: string[]): string[] {
  const rng = createRng(`${world.seed}:${world.date.season}:draw:${key}`);
  const result = [...clubs];
  for (let index = result.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
