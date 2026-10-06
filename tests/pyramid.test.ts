import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { createLeagueFixtures } from '../src/engine/world/schedule';
import type { World } from '../src/model/domain';
import { advanceItaly } from '../src/engine/world/italy';
import { advanceGermany } from '../src/engine/world/germany';
import { rankStandings } from '../src/engine/world/ranking';
import { resolvePostseasonTie } from '../src/engine/world/postseason';

function completeCountry(world: World, countryId: string): void {
  for (const league of Object.values(world.leagues).filter(
    (league) => league.countryId === countryId,
  )) {
    for (const [index, row] of league.standings.entries()) {
      row.points = 100 - index;
      row.goalsFor = 100 - index;
    }
    for (const id of league.fixtureIds)
      world.results[id] = {
        fixtureId: id,
        score: [0, 0],
        winnerId: null,
        penalties: null,
        goals: [],
      };
  }
}

describe('national pyramid generation', () => {
  it('defaults to the full national structures and keeps legacy generation explicit', () => {
    const world = generateWorld('national-structures');
    expect(world).toHaveProperty('format', 'national-v1');
    const sizes = Object.values(world.countries).map((country) =>
      country.leagueIds.map((id) => world.leagues[id]!.clubIds.length),
    );
    expect(Object.keys(world.clubs)).toHaveLength(959);
    expect(new Set(Object.values(world.leagues).flatMap((league) => league.clubIds)).size).toBe(
      959,
    );
    expect(sizes).toEqual([
      [20, 24, 24, 24, 24, 24, 24],
      [18, 18, 18, 16, 16, 16],
      [20, 22, 20, 20, 18, 18, 18, 18, 18],
      [18, 18, 20, 18, 18, 18, 18, 19],
      [20, 20, 20, 20, 20, ...Array<number>(9).fill(18)],
      [18, 18, 10, 10, 14, 14, 14, 14],
    ]);
    const regional = Object.values(world.leagues).filter(
      (league) => league.countryId === 'country:3' && league.tier === 4,
    );
    expect(
      regional
        .filter((league) => league.zones![0]!.kind === 'promotion')
        .map((league) => league.region),
    ).toEqual(['Northeast', 'West', 'Southwest']);
    expect(
      regional
        .filter((league) => league.zones![0]!.kind === 'promotion-playoff')
        .map((league) => league.region),
    ).toEqual(['North', 'Bavaria']);
    const legacy = generateWorld('legacy-structures', { format: 'legacy' });
    expect(Object.keys(legacy.clubs)).toHaveLength(192);
    expect(Object.values(legacy.leagues).every((league) => league.clubIds.length === 8)).toBe(true);
  });

  it('schedules national home and away games with odd-group byes', () => {
    for (const size of [14, 17, 18, 20, 22, 24]) {
      const clubIds = Array.from({ length: size }, (_, index) => `club:${index}`);
      const fixtures = createLeagueFixtures(clubIds, 'national-league', 2026, { cycles: 2 });
      expect(fixtures).toHaveLength(size * (size - 1));
      for (const clubId of clubIds) {
        const own = fixtures.filter(
          (fixture) => fixture.homeId === clubId || fixture.awayId === clubId,
        );
        expect(own).toHaveLength(2 * (size - 1));
        expect(new Set(own.map((fixture) => `${fixture.date.week}:${fixture.date.day}`)).size).toBe(
          own.length,
        );
        for (const opponent of clubIds.filter((id) => id !== clubId))
          expect(
            own.filter((fixture) => fixture.homeId === clubId && fixture.awayId === opponent),
          ).toHaveLength(1);
      }
    }
  });
});

describe('postseason aggregate rules', () => {
  it('creates genuine reserve identities with unique parents and shared club colors', () => {
    const world = generateWorld('reserve-identities');
    const crestRecipes = Object.values(world.clubs).map((club) => JSON.stringify(club.crest));
    expect(new Set(crestRecipes).size).toBe(Object.keys(world.clubs).length);
    for (const country of Object.values(world.countries)) {
      const reserves = Object.values(world.clubs).filter(
        (club) => club.countryId === country.id && club.identity?.reserveParentId,
      );
      expect(reserves.length).toBe(
        country.counterpart === 'England'
          ? 0
          : country.counterpart === 'France' || country.counterpart === 'Italy'
            ? 3
            : country.counterpart === 'Germany' || country.counterpart === 'Portugal'
              ? 7 - Number(country.counterpart === 'Germany')
              : 8,
      );
      expect(new Set(reserves.map((club) => club.identity!.reserveParentId)).size).toBe(
        reserves.length,
      );
      for (const reserve of reserves) {
        const parent = world.clubs[reserve.identity!.reserveParentId!]!;
        expect(world.leagues[parent.leagueId]!.tier).toBe(1);
        expect(reserve.city).toBe(parent.city);
        expect(reserve.crest.colors).toEqual(parent.crest.colors);
        expect([reserve.crest.shape, reserve.crest.symbol]).not.toEqual([
          parent.crest.shape,
          parent.crest.symbol,
        ]);
        expect(reserve.kits).toEqual(parent.kits);
        expect(reserve.identity!.region).toBe(parent.identity!.region);
      }
    }
  });

  it('uses extra time for Serie D survival, conditional Serie B penalties, and Serie A deciders', () => {
    const world = generateWorld('italian-draw-rules');
    completeCountry(world, 'country:4');
    const first = world.leagues['league:4:1']!;
    first.standings[1]!.points = first.standings[0]!.points;
    first.standings[17]!.points = first.standings[16]!.points;
    const second = world.leagues['league:4:2']!;
    second.standings[16]!.points = second.standings[15]!.points;
    advanceItaly(world, 'country:4');
    const ties = world.pyramid!.ties;
    expect(ties['country:4:2026:serie-b-survival']!.drawRule).toBe('extra-time-penalties');
    expect(ties['country:4:2026:serie-d-survival-0-0']!.drawRule).toBe(
      'higher-rank-after-extra-time',
    );
    const championship = ties['country:4:2026:serie-a-championship']!;
    const survival = ties['country:4:2026:serie-a-survival']!;
    expect(championship).toMatchObject({ legs: 1, drawRule: 'penalties', kind: 'championship' });
    expect(survival).toMatchObject({ legs: 2, drawRule: 'penalties', kind: 'survival' });
    expect(world.fixtures[survival.fixtureIds[0]!]!.homeId).toBe(first.standings[17]!.clubId);
    expect(
      world.pyramid!.movements.some((movement) => movement.clubId === first.standings[17]!.clubId),
    ).toBe(false);
    const final = world.fixtures[championship.fixtureIds[0]!]!;
    world.results[final.id] = {
      fixtureId: final.id,
      score: [0, 0],
      winnerId: final.awayId,
      penalties: [3, 4],
      goals: [],
    };
    resolvePostseasonTie(world, championship);
    expect(rankStandings(world, first.standings)[0]!.clubId).toBe(final.awayId);
    expect(first.standings[0]!.points).toBe(100);
  });

  it('plays a neutral Serie D decider before assigning a tied direct-drop place', () => {
    const world = generateWorld('serie-d-boundary');
    completeCountry(world, 'country:4');
    const fourth = world.leagues['league:4:4']!;
    fourth.standings[16]!.points = fourth.standings[15]!.points;
    fourth.standings[1]!.points = fourth.standings[0]!.points;
    advanceItaly(world, 'country:4');
    expect(world.pyramid!.movements).toHaveLength(0);
    const tie = world.pyramid!.ties['country:4:2026:serie-d-boundary-0']!;
    const fixture = world.fixtures[tie.fixtureIds[0]!]!;
    expect(fixture.neutral).toBe(true);
    world.results[fixture.id] = {
      fixtureId: fixture.id,
      score: [0, 1],
      winnerId: fixture.awayId,
      penalties: null,
      goals: [],
    };
    resolvePostseasonTie(world, tie);
    const title = world.pyramid!.ties['country:4:2026:serie-d-championship-0']!;
    const titleFixture = world.fixtures[title.fixtureIds[0]!]!;
    expect(titleFixture.neutral).toBe(true);
    world.results[titleFixture.id] = {
      fixtureId: titleFixture.id,
      score: [0, 1],
      winnerId: titleFixture.awayId,
      penalties: null,
      goals: [],
    };
    resolvePostseasonTie(world, title);
    advanceItaly(world, 'country:4');
    expect(
      world.leagues[
        world.pyramid!.movements.find((movement) => movement.clubId === titleFixture.awayId)!
          .toLeagueId
      ]!.tier,
    ).toBe(3);
    expect(
      world.pyramid!.movements.find((movement) => movement.clubId === fixture.homeId)!.toLeagueId,
    ).toMatch(/^feeder:/);
    expect(world.pyramid!.ties['country:4:2026:serie-d-survival-0-0']!.clubIds).toContain(
      fixture.awayId,
    );
  });

  it('caps ordinary West relegations at four and retains incoming overflow in capacity', () => {
    const world = generateWorld('west-overflow');
    completeCountry(world, 'country:3');
    const third = world.leagues['league:3:3']!;
    for (const row of third.standings.slice(-4)) world.clubs[row.clubId]!.identity!.region = 'West';
    advanceGermany(world, 'country:3');
    const promotion = world.pyramid!.ties['country:3:2026:regionalliga-promotion']!;
    promotion.winnerId = promotion.clubIds[0];
    promotion.status = 'complete';
    advanceGermany(world, 'country:3');
    const west = world.leagues['league:3:4:2']!;
    expect(
      world.pyramid!.movements.filter(
        (movement) =>
          movement.fromLeagueId === west.id && movement.toLeagueId.startsWith('feeder:'),
      ),
    ).toHaveLength(4);
    expect(west.nextCapacity).toBe(21);
  });

  it('honors Germany head-to-head away goals and French away wins after prior criteria tie', () => {
    const world = generateWorld('national-deep-tiebreaks');
    for (const countryIndex of [1, 3]) {
      const league = world.leagues[`league:${countryIndex}:1`]!;
      const [a, b, c] = league.clubIds as [string, string, string];
      for (const row of league.standings) {
        row.points = row.clubId === a || row.clubId === b ? 10 : 0;
        row.goalsFor = 10;
        row.goalsAgainst = 10;
        row.won = 3;
      }
      for (const id of league.fixtureIds) {
        const fixture = world.fixtures[id]!;
        let score: [number, number] | null = null;
        if (fixture.homeId === a && fixture.awayId === b)
          score = countryIndex === 3 ? [2, 1] : [0, 0];
        if (fixture.homeId === b && fixture.awayId === a)
          score = countryIndex === 3 ? [1, 0] : [0, 0];
        if (countryIndex === 1 && fixture.homeId === c && fixture.awayId === b) score = [0, 1];
        if (countryIndex === 1 && fixture.homeId === a && fixture.awayId === c) score = [1, 0];
        if (score)
          world.results[id] = { fixtureId: id, score, winnerId: null, penalties: null, goals: [] };
      }
      expect(rankStandings(world, league.standings)[0]!.clubId).toBe(b);
    }
  });
  it('waits for both legs and counts goals in entrant order', async () => {
    const path = '../src/engine/world/postseason';
    const module = await import(path).catch(() => null);
    expect(module, 'postseason engine exists').not.toBeNull();
    const world = generateWorld('tie-test', { format: 'legacy' });
    world.format = 'national-v1';
    world.pyramid = {
      version: 1,
      profiles: {},
      phases: {},
      ties: {},
      movements: [],
      stage: 'postseason',
      completedSteps: [],
      feederClubIds: [],
    };
    const clubs = Object.keys(world.clubs).slice(0, 2) as [string, string];
    const tie = module.createPostseasonTie(world, {
      id: 'test-tie',
      countryId: 'country:0',
      name: 'Promotion final',
      kind: 'promotion',
      sourceLeagueIds: ['league:0:1'],
      targetDivisionId: null,
      round: 1,
      clubIds: clubs,
      legs: 2,
      drawRule: 'extra-time-penalties',
      higherRankedId: clubs[0],
      firstHomeId: clubs[0],
    });
    const first = world.fixtures[tie.fixtureIds[0]!]!;
    world.results[first.id] = {
      fixtureId: first.id,
      score: [4, 0],
      winnerId: first.homeId,
      penalties: null,
      goals: [],
    };
    module.resolvePostseasonTie(world, tie);
    expect(tie.status).toBe('active');
    expect(tie.winnerId).toBeNull();
    const second = world.fixtures[tie.fixtureIds[1]!]!;
    world.results[second.id] = {
      fixtureId: second.id,
      score: [5, 0],
      winnerId: second.homeId,
      penalties: null,
      goals: [],
    };
    module.resolvePostseasonTie(world, tie);
    expect(tie.aggregate).toEqual([4, 5]);
    expect(tie.winnerId).toBe(clubs[1]);
  });

  it('derives the published Portuguese bonus and documents exactly-ten interpretation', async () => {
    const path = '../src/engine/world/postseason';
    const module = await import(path).catch(() => null);
    expect(module).not.toBeNull();
    expect(module.portugueseSurvivalBonus(5, 9)).toBe(0);
    expect(module.portugueseSurvivalBonus(5, 10)).toBe(6);
    expect(module.portugueseSurvivalBonus(6, 14)).toBe(5);
    expect(module.portugueseSurvivalBonus(7, 19)).toBe(5);
    expect(module.portugueseSurvivalBonus(8, 24)).toBe(5);
    expect(module.portugueseSurvivalBonus(9, 29)).toBe(5);
    expect(module.portugueseSurvivalBonus(10, 30)).toBe(5);
  });

  it('excludes a reserve from phase promotion when its parent occupies the target tier', async () => {
    const { eligiblePhaseTable } = await import('../src/engine/world/postseason');
    const { emptyStanding } = await import('../src/engine/world/schedule');
    const world = generateWorld('reserve-phase');
    const source = world.leagues['league:5:3']!;
    const reserve = world.clubs[source.clubIds.at(-1)!]!;
    const parent = world.clubs[reserve.identity!.reserveParentId!]!;
    parent.leagueId = 'league:5:2';
    const field = [reserve.id, ...source.clubIds.filter((id) => id !== reserve.id).slice(0, 3)];
    const phase = {
      id: 'phase:reserve-test',
      countryId: 'country:5',
      divisionId: 'portugal:3',
      name: 'Promotion',
      kind: 'promotion' as const,
      sourceLeagueIds: [source.id],
      clubIds: field,
      fixtureIds: [],
      standings: field.map((id, index) => ({ ...emptyStanding(id), points: 50 - index })),
      initialPoints: {},
      status: 'complete' as const,
    };
    world.pyramid!.phases[phase.id] = phase;
    expect(eligiblePhaseTable(world, phase, 2).map((row) => row.clubId)).toEqual(field.slice(1));
  });

  it('forces a Portuguese B team down and reprieves the best sporting relegation when its parent descends', async () => {
    const { resolveReserveDemotions } = await import('../src/engine/world/movement');
    const world = generateWorld('reserve-drop');
    const second = world.leagues['league:5:2']!;
    const reserve = world.clubs[second.clubIds.at(-1)!]!;
    const parent = world.clubs[reserve.identity!.reserveParentId!]!;
    const reprieved = second.clubIds[0]!;
    second.standings.find((row) => row.clubId === reprieved)!.points = 50;
    world.pyramid!.movements = [
      { clubId: parent.id, fromLeagueId: parent.leagueId, toLeagueId: second.id },
      { clubId: reprieved, fromLeagueId: second.id, toLeagueId: 'league:5:3' },
    ];
    resolveReserveDemotions(world);
    expect(world.pyramid!.movements.some((movement) => movement.clubId === reprieved)).toBe(false);
    const targetId = world.pyramid!.movements.find(
      (movement) => movement.clubId === reserve.id,
    )!.toLeagueId;
    expect(world.leagues[targetId]!.tier).toBe(3);
    expect(world.leagues[targetId]!.region).toBe(reserve.identity!.region);
  });

  it('uses head-to-head points ahead of overall goal difference in Portuguese tables', async () => {
    const { rankStandings } = await import('../src/engine/world/ranking');
    const world = generateWorld('h2h-table');
    const league = world.leagues['league:5:1']!;
    const [a, b] = league.clubIds;
    for (const row of league.standings) {
      row.points = row.clubId === a || row.clubId === b ? 10 : 0;
      row.goalsFor = row.clubId === a ? 20 : 0;
    }
    for (const id of league.fixtureIds) {
      const fixture = world.fixtures[id]!;
      if (
        (fixture.homeId === a && fixture.awayId === b) ||
        (fixture.homeId === b && fixture.awayId === a)
      )
        world.results[id] = {
          fixtureId: id,
          score: fixture.homeId === b ? [1, 0] : [0, 1],
          winnerId: b!,
          penalties: null,
          goals: [],
        };
    }
    expect(rankStandings(world, league.standings)[0]!.clubId).toBe(b);
  });

  it('runs national phases through a deterministic JSON checkpoint and retains separate tables', async () => {
    const { simulateWeek } = await import('../src/engine/world/simulate');
    let world = generateWorld('national-phase-resume');
    for (let week = 1; week <= 19; week++) world = simulateWeek(world);
    expect(Object.values(world.pyramid!.phases)).toHaveLength(3);
    for (const phase of Object.values(world.pyramid!.phases)) {
      expect(phase.standings.every((row) => row.played === 1)).toBe(true);
      expect(phase.fixtureIds.every((id) => world.fixtures[id]!.phaseId === phase.id)).toBe(true);
    }
    expect(simulateWeek(world)).toEqual(simulateWeek(JSON.parse(JSON.stringify(world)) as World));
    const portugal = Object.values(world.leagues).filter(
      (league) => league.countryId === 'country:5' && league.tier === 3,
    );
    expect(portugal.every((league) => league.standings.every((row) => row.played === 18))).toBe(
      true,
    );
  }, 120000);

  it('resolves every national playoff before archive and conserves memberships into another season', async () => {
    const { simulateWeek, startNextSeason } = await import('../src/engine/world/simulate');
    let world = generateWorld('national-full-season');
    const weeks = world.season.end.week;
    for (let index = 0; index < weeks; index++) world = simulateWeek(world);
    expect(world.pyramid!.stage).toBe('resolved');
    expect(
      Object.values(world.pyramid!.ties).every((tie) => tie.status === 'complete' && tie.winnerId),
    ).toBe(true);
    expect(Object.values(world.pyramid!.phases).every((phase) => phase.status === 'complete')).toBe(
      true,
    );
    expect(world.history[0]!.movements).toEqual(world.pyramid!.movements);
    let next = startNextSeason(world);
    expect(next.format).toBe('national-v1');
    expect(next.pyramid!.phases).toEqual({});
    expect(next.pyramid!.ties).toEqual({});
    expect(next.leagues['league:3:4:4']!.zones![0]!.kind).toBe('promotion');
    expect(next.leagues['league:3:4:1']!.zones![0]!.kind).toBe('promotion-playoff');
    for (const league of Object.values(next.leagues)) {
      expect(new Set(league.clubIds).size).toBe(league.clubIds.length);
      for (const clubId of league.clubIds) expect(next.clubs[clubId]!.leagueId).toBe(league.id);
      expect(league.fixtureIds.map((id) => next.fixtures[id]).filter(Boolean)).toHaveLength(
        league.clubIds.length * (league.clubIds.length - 1),
      );
    }
    expect(Object.values(next.competitions).every((cup) => cup.stages.length === 1)).toBe(true);
    for (let index = 0; index < next.season.end.week; index++) next = simulateWeek(next);
    expect(next.history).toHaveLength(2);
    expect(next.pyramid!.stage).toBe('resolved');
    const third = startNextSeason(next);
    expect(third.leagues['league:3:4']!.zones![0]!.kind).toBe('promotion');
    expect(third.leagues['league:3:4:4']!.zones![0]!.kind).toBe('promotion-playoff');
    for (const league of Object.values(third.leagues)) {
      expect(league.clubIds).toHaveLength(league.capacity!);
      expect(new Set(league.clubIds).size).toBe(league.capacity);
      expect(league.fixtureIds).toHaveLength(league.capacity! * (league.capacity! - 1));
    }
  }, 240000);
});
