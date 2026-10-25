import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import type { World } from '../src/model/domain';
import { rankStandings } from '../src/engine/world/ranking';
import { decidedTitles } from '../src/engine/world/titles';
import { validateNationalWorld } from '../src/persistence/nationalWorldSchema';

/** Moved from tests/pyramid.test.ts: the slow project (vitest.config.ts). */
describe('national pyramid seasons', () => {
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
  it('waits for Italian deciders before naming a level Serie D group champion', async () => {
    const { simulateWeek } = await import('../src/engine/world/simulate');
    let world = generateWorld('italy-title-timing');
    const italy = Object.values(world.countries).find((c) => c.counterpart === 'Italy')!;
    const leagues = italy.leagueIds.map((id) => world.leagues[id]!);
    const done = (id: string) => world.leagues[id]!.fixtureIds.every((f) => world.results[f]);
    const serieD = leagues.filter((league) => league.tier === 4).map((league) => league.id);
    // Play until a Serie D group has finished while the other Italian leagues have not.
    while (!serieD.some(done)) world = simulateWeek(world);
    expect(leagues.every((league) => done(league.id))).toBe(false);
    const group = world.leagues[serieD.find(done)!]!;
    // Level at the top: only the neutral decider, created later, can name the champion.
    const [first, second] = rankStandings(world, group.standings);
    second!.points = first!.points;
    expect(decidedTitles(world).some((title) => title.competitionId === group.id)).toBe(false);
  }, 240000);
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
    // Portugal's first-phase groups only qualify clubs: the promotion league and the
    // Campeonato final crown the champions, and at least one of them did not win its group.
    const summary = world.history[0]!;
    const key = (suffix: string) => `country:5:${world.date.season}:${suffix}`;
    const liga3 = world.pyramid!.phases[key('liga-3-promotion')]!;
    const final = world.pyramid!.ties[key('campeonato-championship')]!;
    expect(summary.divisionChampions).toEqual({
      'portugal:3': {
        competitionId: liga3.id,
        clubId: rankStandings(world, liga3.standings)[0]!.clubId,
      },
      'portugal:4': { competitionId: final.id, clubId: final.winnerId },
    });
    const groupWinners = (divisionId: string) =>
      Object.values(world.leagues)
        .filter((league) => league.divisionId === divisionId)
        .map((league) => summary.champions[league.id]);
    expect(
      ['portugal:3', 'portugal:4'].some(
        (divisionId) =>
          !groupWinners(divisionId).includes(summary.divisionChampions![divisionId]!.clubId),
      ),
    ).toBe(true);
    const titles = decidedTitles(world);
    for (const league of Object.values(world.leagues).filter((l) =>
      ['portugal:3', 'portugal:4'].includes(l.divisionId ?? ''),
    ))
      expect(titles.some((title) => title.competitionId === league.id)).toBe(false);
    expect(titles.find((title) => title.competitionId === final.id)).toMatchObject({
      clubId: final.winnerId,
      divisionId: 'portugal:4',
    });
    expect(() => validateNationalWorld(JSON.parse(JSON.stringify(world)))).not.toThrow();
    const forged = JSON.parse(JSON.stringify(world)) as World;
    forged.history[0]!.divisionChampions!['portugal:4']!.clubId = final.clubIds.find(
      (id) => id !== final.winnerId,
    )!;
    expect(() => validateNationalWorld(forged)).toThrow();
    let next = startNextSeason(world);
    // A trophy for last season's deciding phase stays valid once the phase is archived.
    next.trophies.push({
      id: `trophy:${world.date.season}:${liga3.id}`,
      competitionId: liga3.id,
      season: world.date.season,
      clubId: summary.divisionChampions!['portugal:3']!.clubId,
      playerIds: [next.clubs[summary.divisionChampions!['portugal:3']!.clubId]!.playerIds[0]!],
      name: 'Liga 3',
    });
    expect(() => validateNationalWorld(JSON.parse(JSON.stringify(next)))).not.toThrow();
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
  }, 360000);
});
