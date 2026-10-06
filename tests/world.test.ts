import { describe, expect, it } from 'vitest';
import type { World, Standing } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';

const generationPath = '../src/engine/world/generate';
const simulationPath = '../src/engine/world/simulate';
const schedulingPath = '../src/engine/world/schedule';
async function engine() {
  const available = await import(generationPath).catch(() => null);
  expect(available, 'World generation module is available').not.toBeNull();
  return { ...available, ...(await import(simulationPath)), ...(await import(schedulingPath)) } as {
    generateWorld(seed: string, options: { format: 'legacy' }): World;
    simulateWeek(world: World): World;
    startNextSeason(world: World): World;
    createLeagueFixtures(
      clubs: string[],
      leagueId: string,
      season: number,
    ): World['fixtures'][string][];
    sortStandings(rows: Standing[]): Standing[];
  };
}

function assertSquads(world: World) {
  const lifecycle = CONFIG.world.lifecycle;
  for (const club of Object.values(world.clubs)) {
    expect(club.playerIds.length).toBeGreaterThanOrEqual(19);
    expect(club.playerIds.length).toBeLessThanOrEqual(lifecycle.squadMaximum);
    expect(new Set(club.playerIds).size).toBe(club.playerIds.length);
    expect(
      club.playerIds.filter((id) => world.players[id]!.primaryPosition === 'GK').length,
    ).toBeGreaterThanOrEqual(lifecycle.groupMinimum.GK);
    expect(world.leagues[club.leagueId]!.clubIds).toContain(club.id);
    expect(world.managers[club.managerId]).toBeDefined();
    expect(world.dressingRooms[club.dressingRoomId]!.clubId).toBe(club.id);
    expect(
      world.dressingRooms[club.dressingRoomId]!.leaderIds.every((id) =>
        club.playerIds.includes(id),
      ),
    ).toBe(true);
    for (const id of club.playerIds) {
      const player = world.players[id]!;
      expect(player.clubId).toBe(club.id);
      expect(player.retired).toBe(false);
      expect(world.contracts[player.contractId!]!.clubId).toBe(club.id);
      expect(world.contracts[player.contractId!]!.playerId).toBe(id);
    }
  }
}

describe('seeded world', () => {
  it('generates six complete four-tier pyramids with varied linked people and assets', async () => {
    const { generateWorld } = await engine();
    const world = generateWorld('world-test', { format: 'legacy' });
    expect(world).toEqual(generateWorld('world-test', { format: 'legacy' }));
    expect(world).not.toEqual(generateWorld('different', { format: 'legacy' }));
    expect(Object.values(world.countries).map((country) => country.name)).toEqual([
      'Aldoria',
      'Valmere',
      'Solara',
      'Nordhaven',
      'Belloria',
      'Kestrelia',
    ]);
    expect(Object.keys(world.leagues)).toHaveLength(24);
    expect(Object.keys(world.clubs)).toHaveLength(192);
    expect(Object.keys(world.players)).toHaveLength(4224);
    expect(Object.keys(world.contracts)).toHaveLength(4224);
    expect(world.date).toEqual({ season: 2026, week: 1, day: 1 });
    expect(world.phase).toBe('active');
    expect(
      new Set(Object.values(world.clubs).map((club) => `${club.crest.shape}:${club.crest.symbol}`))
        .size,
    ).toBe(192);
    expect(new Set(Object.values(world.clubs).map((club) => club.name)).size).toBe(192);
    expect(new Set(Object.values(world.players).map((player) => player.name)).size).toBeGreaterThan(
      500,
    );
    for (const player of Object.values(world.players)) {
      for (const value of [
        ...Object.values(player.attributes),
        ...Object.values(player.keeperAttributes),
        player.potential,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(99);
      }
      expect(world.countries[player.nationalityId]).toBeDefined();
      expect(
        player.secondaryPositions.every(
          (position) => position.familiarity >= 0 && position.familiarity <= 100,
        ),
      ).toBe(true);
    }
    expect(Object.keys(world.matches)).toHaveLength(0);
    expect(Object.values(world.competitions)).toHaveLength(6);
    expect(
      Object.values(world.competitions).every(
        (cup) => cup.stages.length === 1 && cup.stages[0]!.fixtureIds.length === 16,
      ),
    ).toBe(true);
    assertSquads(world);
  }, 30000);

  it('schedules four meetings per pair, two home and two away, without weekly conflicts', async () => {
    const { createLeagueFixtures } = await engine();
    const clubs = Array.from({ length: 8 }, (_, index) => `club-${index}`);
    const fixtures = createLeagueFixtures(clubs, 'league-test', 2026);
    expect(fixtures).toHaveLength(112);
    for (const club of clubs) {
      const own = fixtures.filter((fixture) => fixture.homeId === club || fixture.awayId === club);
      expect(own).toHaveLength(28);
      expect(new Set(own.map((fixture) => fixture.date.week)).size).toBe(28);
      for (const opponent of clubs.filter((id) => id !== club)) {
        expect(
          own.filter((fixture) => fixture.homeId === club && fixture.awayId === opponent),
        ).toHaveLength(2);
      }
    }
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
    expect(
      fixtures.every(
        (fixture) =>
          fixture.date.day === 1 &&
          fixture.date.week <= 28 &&
          fixture.competitionId === 'league-test',
      ),
    ).toBe(true);
    expect(() => createLeagueFixtures(['a', 'a'], 'l', 2026)).toThrow();
  });

  it('orders standings by points, goal difference, goals for and stable club id without changing input', async () => {
    const { sortStandings } = await engine();
    const row = (
      clubId: string,
      points: number,
      goalsFor: number,
      goalsAgainst: number,
    ): Standing => ({
      clubId,
      points,
      goalsFor,
      goalsAgainst,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
    });
    const rows = [
      row('z', 5, 5, 2),
      row('c', 7, 2, 1),
      row('b', 5, 5, 2),
      row('a', 5, 6, 3),
      row('d', 5, 5, 1),
    ];
    expect(sortStandings(rows).map((item) => item.clubId)).toEqual(['c', 'd', 'a', 'b', 'z']);
    expect(rows[0]!.clubId).toBe('z');
  });

  it('advances purely and deterministically across JSON save resumes and conserves match totals', async () => {
    const { generateWorld, simulateWeek } = await engine();
    const original = generateWorld('week-test', { format: 'legacy' });
    const snapshot = JSON.stringify(original);
    const week = simulateWeek(original);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(week).toEqual(simulateWeek(JSON.parse(snapshot) as World));
    expect(week.date.week).toBe(2);
    expect(Object.keys(week.results)).toHaveLength(96);
    for (const league of Object.values(week.leagues)) {
      expect(league.standings.reduce((sum, row) => sum + row.played, 0)).toBe(8);
      expect(league.standings.reduce((sum, row) => sum + row.goalsFor - row.goalsAgainst, 0)).toBe(
        0,
      );
      expect(
        league.standings.every(
          (row) =>
            row.points === 3 * row.won + row.drawn && row.played === row.won + row.drawn + row.lost,
        ),
      ).toBe(true);
    }
    expect(Object.values(week.players).some((player) => player.stats.appearances > 0)).toBe(true);
    expect(
      Object.values(week.players).some(
        (player) =>
          JSON.stringify(player.attributes) !==
          JSON.stringify(original.players[player.id]!.attributes),
      ),
    ).toBe(true);
    expect(
      Object.values(week.clubs).some(
        (club) => club.finances.balance !== original.clubs[club.id]!.finances.balance,
      ),
    ).toBe(true);
    assertSquads(week);
  });

  it('completes cups and season, archives tables and applies two-up two-down only on next season', async () => {
    const { generateWorld, simulateWeek, startNextSeason } = await engine();
    let world = generateWorld('season-test', { format: 'legacy' });
    const memberships = Object.fromEntries(
      Object.values(world.leagues).map((league) => [league.id, [...league.clubIds]]),
    );
    const oldManagerIds = new Set(Object.keys(world.managers));
    for (let index = 0; index < 34; index++) {
      if ([7, 11, 17, 23, 30, 33].includes(index))
        expect(simulateWeek(world)).toEqual(
          simulateWeek(JSON.parse(JSON.stringify(world)) as World),
        );
      world = simulateWeek(world);
    }
    expect(world.phase).toBe('complete');
    expect(world.date.week).toBe(35);
    expect(simulateWeek(world)).toEqual(world);
    expect(world.history).toHaveLength(1);
    expect(Object.keys(world.results)).toHaveLength(24 * 112 + 6 * 31);
    expect(world.history[0]!.movements).toHaveLength(72);
    for (const league of Object.values(world.leagues)) {
      expect(league.clubIds).toEqual(memberships[league.id]);
      expect(league.standings.every((row) => row.played === 28)).toBe(true);
      expect(league.standings.reduce((sum, row) => sum + row.goalsFor - row.goalsAgainst, 0)).toBe(
        0,
      );
    }
    for (const cup of Object.values(world.competitions)) {
      expect(cup.winnerId).not.toBeNull();
      expect(cup.stages.map((stage) => stage.fixtureIds.length)).toEqual([16, 8, 4, 2, 1]);
      const all = cup.stages.flatMap((stage) => stage.fixtureIds);
      expect(all.every((id) => world.results[id]!.winnerId !== null)).toBe(true);
      expect(new Set(cup.stages[0]!.groups[0]).size).toBe(32);
      for (let stageIndex = 1; stageIndex < cup.stages.length; stageIndex++) {
        const previousWinners = cup.stages[stageIndex - 1]!.fixtureIds.map(
          (id) => world.results[id]!.winnerId!,
        ).sort();
        expect([...cup.stages[stageIndex]!.groups[0]!].sort()).toEqual(previousWinners);
      }
    }
    expect(world.events.some((event) => event.kind === 'transfer')).toBe(true);
    expect(world.events.filter((event) => event.kind === 'youth-intake')).toHaveLength(384);
    expect(world.events.some((event) => event.kind === 'retirement')).toBe(true);
    expect(Object.keys(world.managers).some((id) => !oldManagerIds.has(id))).toBe(true);
    for (const retired of Object.values(world.players).filter((player) => player.retired)) {
      expect(retired.clubId).toBeNull();
      expect(retired.contractId).toBeNull();
    }
    const allResults = Object.values(world.results);
    const goalCount = allResults.reduce(
      (sum, result) => sum + result.score[0] + result.score[1],
      0,
    );
    expect(allResults.reduce((sum, result) => sum + result.goals.length, 0)).toBe(goalCount);
    expect(Object.values(world.players).reduce((sum, player) => sum + player.stats.goals, 0)).toBe(
      goalCount,
    );
    expect(
      Object.values(world.players).reduce((sum, player) => sum + player.stats.assists, 0),
    ).toBeLessThanOrEqual(goalCount);
    expect(
      Object.values(world.players).reduce((sum, player) => sum + player.stats.appearances, 0),
    ).toBe(allResults.length * 22);
    expect(
      Object.values(world.players).every(
        (player) =>
          player.stats.minutes === player.stats.appearances * 90 &&
          player.stats.cleanSheets <= player.stats.appearances &&
          player.stats.ratingTotal <= player.stats.appearances * 10,
      ),
    ).toBe(true);
    expect(allResults.some((result) => result.penalties)).toBe(true);
    expect(
      world.events.every(
        (event) =>
          typeof event.params.name === 'string' &&
          event.entityIds.every((id) =>
            Boolean(
              world.players[id] ||
              world.clubs[id] ||
              world.managers[id] ||
              world.leagues[id] ||
              world.competitions[id],
            ),
          ),
      ),
    ).toBe(true);
    assertSquads(world);
    const snapshot = JSON.stringify(world);
    const next = startNextSeason(world);
    expect(JSON.stringify(world)).toBe(snapshot);
    expect(next).toEqual(startNextSeason(JSON.parse(snapshot) as World));
    expect(next.date).toEqual({ season: 2027, week: 1, day: 1 });
    expect(next.phase).toBe('active');
    expect(next.history).toEqual(world.history);
    expect(Object.keys(next.results)).toHaveLength(0);
    expect(
      Object.values(next.leagues).every(
        (league) =>
          league.clubIds.length === 8 && league.standings.every((row) => row.played === 0),
      ),
    ).toBe(true);
    for (const movement of world.history[0]!.movements)
      expect(next.clubs[movement.clubId]!.leagueId).toBe(movement.toLeagueId);
    // Retired people leave the live graph for the compact archive at rollover.
    const retired = Object.values(world.players).filter((player) => player.retired);
    expect(retired.length).toBeGreaterThan(0);
    expect(Object.keys(next.players)).toHaveLength(
      Object.keys(world.players).length - retired.length,
    );
    for (const player of retired)
      expect(next.archive!.players[player.id]).toMatchObject({
        name: player.name,
        retiredSeason: world.date.season,
      });
    expect(() => startNextSeason(next)).toThrow();
    assertSquads(next);
  }, 30000);

  it('maintains dressing-room membership during transfer windows', async () => {
    const { generateWorld, simulateWeek } = await engine();
    let world = generateWorld('transfers-test', { format: 'legacy' });
    for (const room of Object.values(world.dressingRooms))
      room.leaderIds = [...world.clubs[room.clubId]!.playerIds];
    const original = world;
    for (let index = 0; index < 8; index++) world = simulateWeek(world);
    expect(world.events.filter((event) => event.kind === 'transfer')).toHaveLength(12);
    for (const changed of world.events.filter((event) => event.kind === 'transfer')) {
      const player = world.players[changed.entityIds[0]!]!;
      expect(player.clubId).not.toBe(original.players[player.id]!.clubId);
    }
    assertSquads(world);
  });

  it('replaces forced retirees at their positions and develops youth while physical ability declines in veterans', async () => {
    const { generateWorld, simulateWeek } = await engine();
    const initial = generateWorld('ageing-test', { format: 'legacy' });
    const club = Object.values(initial.clubs)[0]!;
    const keeperId = club.playerIds[0]!;
    initial.players[keeperId]!.birthSeason = 1980;
    initial.date.week = 31;
    const next = simulateWeek(initial);
    expect(next.players[keeperId]!.retired).toBe(true);
    expect(next.players[keeperId]!.clubId).toBeNull();
    expect(next.players[keeperId]!.contractId).toBeNull();
    expect(
      next.clubs[club.id]!.playerIds.filter((id) => next.players[id]!.primaryPosition === 'GK'),
    ).toHaveLength(2);
    // Development follows age curves, so growth and decline show across seasons, not weeks.
    const { startNextSeason } = await engine();
    let later = next;
    while (later.phase === 'active') later = simulateWeek(later);
    later = startNextSeason(later);
    for (let week = 0; week < 20; week++) later = simulateWeek(later);
    const youthIds = Object.values(initial.players)
      .filter(
        (player) =>
          initial.date.season - player.birthSeason < 22 && later.players[player.id]?.clubId,
      )
      .map((player) => player.id);
    const oldIds = Object.values(initial.players)
      .filter(
        (player) =>
          initial.date.season - player.birthSeason > 30 &&
          initial.date.season - player.birthSeason < 37 &&
          later.players[player.id] &&
          !later.players[player.id]!.retired,
      )
      .map((player) => player.id);
    const aggregate = (
      world: World,
      ids: string[],
      keys: (keyof World['players'][string]['attributes'])[],
    ) =>
      ids.reduce(
        (sum, id) =>
          sum + keys.reduce((total, key) => total + world.players[id]!.attributes[key], 0),
        0,
      );
    expect(aggregate(later, youthIds, ['passing', 'vision'])).toBeGreaterThan(
      aggregate(initial, youthIds, ['passing', 'vision']),
    );
    expect(aggregate(later, oldIds, ['pace', 'acceleration'])).toBeLessThan(
      aggregate(initial, oldIds, ['pace', 'acceleration']),
    );
    for (const player of Object.values(next.players)) {
      expect(
        [...Object.values(player.attributes), ...Object.values(player.keeperAttributes)].every(
          (value) => Number.isInteger(value) && value >= 1 && value <= 99,
        ),
      ).toBe(true);
      expect(
        [player.fatigue, player.fitness, player.form, player.morale].every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 100,
        ),
      ).toBe(true);
    }
    assertSquads(next);
  }, 120000);

  it('continues ageing and retires unattached former squad players', async () => {
    const { generateWorld, simulateWeek } = await engine();
    const world = generateWorld('free-agent-test', { format: 'legacy' });
    const reference = Object.values(world.players)[0]!;
    const freeAgent = {
      ...reference,
      id: 'free-agent-veteran',
      birthSeason: 1980,
      clubId: null,
      contractId: null,
      stats: { ...reference.stats, trophies: [] },
    };
    world.players[freeAgent.id] = freeAgent;
    world.date.week = 31;
    const next = simulateWeek(world);
    expect(next.players[freeAgent.id]!.retired).toBe(true);
    expect(
      next.events.some(
        (event) => event.kind === 'retirement' && event.entityIds.includes(freeAgent.id),
      ),
    ).toBe(true);
    expect(world.players[freeAgent.id]!.retired).toBe(false);
    assertSquads(next);
  });
});
