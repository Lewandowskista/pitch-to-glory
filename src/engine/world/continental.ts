import type { Club, Competition, Fixture, Standing, World } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng } from '../rng';
import { CONTINENTAL } from './identities/continental';
import { emptyStanding, sortStandings } from './schedule';

/**
 * Continental cups for national worlds (milestone 8): a Champions Cup and a second-tier
 * Shield, each with 32 clubs in eight groups of four (home and away), then single-leg
 * knockouts from the round of 16 to a neutral final. Qualification comes from last season's
 * top-division tables (or reputation when a world is generated). Group tables are derived
 * from results, so nothing beyond the fixtures needs storing.
 */
const C = CONFIG.world.continental;
export const CONTINENTAL_IDS = ['continental:champions', 'continental:shield'] as const;
export type ContinentalId = (typeof CONTINENTAL_IDS)[number];
const KNOCKOUT_NAMES = ['round-of-16', 'quarter-finals', 'semi-finals', 'final'];

export const isContinental = (competition: Pick<Competition, 'kind'> | undefined) =>
  competition?.kind === 'champions' || competition?.kind === 'continental';
export const hasContinental = (world: World) =>
  CONTINENTAL_IDS.every((id) => isContinental(world.competitions[id]));

/** Whether a fixture must produce a winner: a domestic cup tie or a continental knockout. */
export function isKnockoutFixture(world: World, fixture: Fixture): boolean {
  const competition = world.competitions[fixture.competitionId];
  if (!competition) return false;
  if (competition.format === 'knockout') return true;
  return isContinental(competition) && !competition.stages[0]?.fixtureIds.includes(fixture.id);
}

function names(world: World): Record<ContinentalId, string> {
  return world.identityVersion === 2
    ? {
        'continental:champions': CONTINENTAL.champions.name,
        'continental:shield': CONTINENTAL.second.name,
      }
    : {
        'continental:champions': 'Continental Champions Cup',
        'continental:shield': 'Continental Shield',
      };
}

/**
 * The clubs that qualify: each country's top-division ranking (last season's final table,
 * or reputation for a new world) fills its Champions Cup places, then its Shield places.
 */
export function continentalQualifiers(
  world: World,
  fromTables: boolean,
): Record<ContinentalId, string[]> {
  const result: Record<ContinentalId, string[]> = {
    'continental:champions': [],
    'continental:shield': [],
  };
  const summary = fromTables ? world.history.at(-1) : undefined;
  for (const country of Object.values(world.countries)) {
    const counterpart = country.counterpart as keyof typeof C.champions | undefined;
    if (!counterpart || !(counterpart in C.champions)) continue;
    const top = country.leagueIds
      .map((id) => world.leagues[id]!)
      .find((league) => league.tier === 1);
    if (!top) continue;
    const table = summary?.tables[top.id];
    // A club relegated since the table was drawn still qualifies, as in real football.
    const ranked = table
      ? table.map((row) => row.clubId)
      : [...top.clubIds].sort(
          (a, b) => world.clubs[b]!.reputation - world.clubs[a]!.reputation || (a < b ? -1 : 1),
        );
    const eligible = ranked.filter(
      (id) => world.clubs[id] && !world.clubs[id]!.identity?.reserveParentId,
    );
    const champions = C.champions[counterpart];
    result['continental:champions'].push(...eligible.slice(0, champions));
    result['continental:shield'].push(
      ...eligible.slice(champions, champions + C.shield[counterpart]),
    );
  }
  return result;
}

/** Eight groups of four from four pots by reputation, keeping clubs of a country apart. */
function drawGroups(world: World, cupId: string, clubIds: string[], season: number): string[][] {
  const rng = createRng(`${world.seed}:continental:draw:${cupId}:${season}`);
  const ranked = [...clubIds].sort(
    (a, b) => world.clubs[b]!.reputation - world.clubs[a]!.reputation || (a < b ? -1 : 1),
  );
  const pots = [0, 1, 2, 3].map((pot) => ranked.slice(pot * 8, pot * 8 + 8));
  for (let attempt = 0; attempt < 60; attempt++) {
    const groups: string[][] = Array.from({ length: 8 }, () => []);
    let ok = true;
    for (const pot of pots) {
      const order = [...pot];
      for (let index = order.length - 1; index > 0; index--) {
        const target = rng.int(0, index);
        [order[index], order[target]] = [order[target]!, order[index]!];
      }
      for (const clubId of order) {
        const country = world.clubs[clubId]!.countryId;
        const size = Math.min(...groups.map((group) => group.length));
        const open = groups.filter(
          (group) =>
            group.length === size &&
            (attempt >= 50 || !group.some((id) => world.clubs[id]!.countryId === country)),
        );
        if (!open.length) {
          ok = false;
          break;
        }
        rng.pick(open).push(clubId);
      }
      if (!ok) break;
    }
    if (ok) return groups;
  }
  throw new Error('Could not draw the continental groups');
}

const PAIRS: [number, number][][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [2, 0],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

/** Create a cup for the season: the group draw and its six matchdays. */
export function createContinentalCup(
  world: World,
  cupId: ContinentalId,
  clubIds: string[],
): Competition {
  const season = world.date.season;
  if (clubIds.length !== 32) throw new Error('A continental cup needs 32 clubs');
  const groups = drawGroups(world, cupId, clubIds, season);
  const fixtureIds: string[] = [];
  groups.forEach((group, groupIndex) => {
    for (let matchday = 0; matchday < 6; matchday++) {
      const round = PAIRS[matchday % 3]!;
      round.forEach(([a, b], index) => {
        const [home, away] = matchday < 3 ? [group[a]!, group[b]!] : [group[b]!, group[a]!];
        const id = `${cupId}:${season}:g${groupIndex}:${matchday}:${index}`;
        world.fixtures[id] = {
          id,
          competitionId: cupId,
          date: { season, week: C.groupWeeks[matchday]!, day: C.day },
          homeId: home,
          awayId: away,
          matchId: null,
        };
        fixtureIds.push(id);
      });
    }
  });
  const cup: Competition = {
    id: cupId,
    name: names(world)[cupId],
    kind: cupId === 'continental:champions' ? 'champions' : 'continental',
    format: 'groups-knockout',
    season,
    stages: [{ id: `${cupId}:${season}:groups`, name: 'groups', groups, fixtureIds }],
    winnerId: null,
  };
  world.competitions[cupId] = cup;
  if (!world.season.competitionIds.includes(cupId)) world.season.competitionIds.push(cupId);
  return cup;
}

/** Start the season's continental cups. */
export function startContinental(world: World, fromTables: boolean): void {
  const qualifiers = continentalQualifiers(world, fromTables);
  for (const id of CONTINENTAL_IDS) createContinentalCup(world, id, qualifiers[id]);
}

/** A group's table, derived from its played fixtures. */
export function groupTable(world: World, cup: Competition, groupIndex: number): Standing[] {
  const group = cup.stages[0]!.groups[groupIndex]!;
  const rows = new Map(group.map((id) => [id, emptyStanding(id)]));
  for (const id of cup.stages[0]!.fixtureIds) {
    const fixture = world.fixtures[id];
    const result = world.results[id];
    if (!fixture || !result || !rows.has(fixture.homeId)) continue;
    const [home, away] = result.score;
    for (const [clubId, scored, conceded] of [
      [fixture.homeId, home, away],
      [fixture.awayId, away, home],
    ] as const) {
      const row = rows.get(clubId)!;
      row.played++;
      row.goalsFor += scored;
      row.goalsAgainst += conceded;
      if (scored > conceded) {
        row.won++;
        row.points += 3;
      } else if (scored === conceded) {
        row.drawn++;
        row.points++;
      } else row.lost++;
    }
  }
  return sortStandings([...rows.values()]);
}

function addKnockout(world: World, cup: Competition, clubIds: string[]): void {
  const round = cup.stages.length - 1;
  const fixtureIds: string[] = [];
  const final = clubIds.length === 2;
  for (let index = 0; index < clubIds.length; index += 2) {
    const id = `${cup.id}:${cup.season}:k${round}:${index / 2}`;
    world.fixtures[id] = {
      id,
      competitionId: cup.id,
      date: { season: cup.season, week: C.knockoutWeeks[round]!, day: C.day },
      homeId: clubIds[index]!,
      awayId: clubIds[index + 1]!,
      matchId: null,
      ...(final ? { neutral: true } : {}),
    };
    fixtureIds.push(id);
  }
  cup.stages.push({
    id: `${cup.id}:${cup.season}:${KNOCKOUT_NAMES[round]}`,
    name: KNOCKOUT_NAMES[round]!,
    groups: [[...clubIds]],
    fixtureIds,
  });
}

/**
 * After each week: a finished group stage sends group winners (at home) against runners-up
 * of the neighbouring group; a finished knockout round draws the next in bracket order, and
 * the final's winner lifts the cup.
 */
export function advanceContinental(world: World): void {
  for (const id of CONTINENTAL_IDS) {
    const cup = world.competitions[id];
    if (!cup || !isContinental(cup) || cup.winnerId) continue;
    const stage = cup.stages.at(-1)!;
    if (!stage.fixtureIds.every((fixtureId) => world.results[fixtureId])) continue;
    if (cup.stages.length === 1) {
      const tables = cup.stages[0]!.groups.map((_, index) => groupTable(world, cup, index));
      const draw: string[] = [];
      for (let group = 0; group < 8; group += 2) {
        draw.push(tables[group]![0]!.clubId, tables[group + 1]![1]!.clubId);
        draw.push(tables[group + 1]![0]!.clubId, tables[group]![1]!.clubId);
      }
      addKnockout(world, cup, draw);
      continue;
    }
    const winners = stage.fixtureIds.map((fixtureId) => world.results[fixtureId]!.winnerId!);
    if (winners.length === 1) cup.winnerId = winners[0]!;
    else addKnockout(world, cup, winners);
  }
}

/** The continental cup a club plays in this season, if any. */
export function clubContinental(world: World, club: Club): Competition | undefined {
  return CONTINENTAL_IDS.map((id) => world.competitions[id]).find((cup) =>
    cup?.stages[0]?.groups.some((group) => group.includes(club.id)),
  );
}
