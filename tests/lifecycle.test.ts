import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import {
  archiveAndPrune,
  fillSquads,
  retirementProbability,
  seasonalSquadReview,
} from '../src/engine/world/lifecycle';
import { createFeederClub } from '../src/engine/world/feeder';
import { validateWorld } from '../src/persistence/worldSchema';

const L = CONFIG.world.lifecycle;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;

describe('squad lifecycle', () => {
  it('ramps retirement with age and forces it at the limit', () => {
    expect(retirementProbability(28)).toBe(0);
    expect(retirementProbability(34)).toBeLessThan(retirementProbability(37));
    expect(retirementProbability(L.forcedRetirementAge)).toBe(1);
  });

  it('renews or releases every expiring contract and keeps squads viable', () => {
    let world = generateWorld('lifecycle-contracts', { format: 'legacy' });
    while (world.date.week < CONFIG.world.intakeWeek)
      world = simulateWeek(world, { inPlace: true });
    for (const contract of Object.values(world.contracts)) contract.end.season = world.date.season;
    world = simulateWeek(world, { inPlace: true });
    for (const club of Object.values(world.clubs)) {
      expect(club.playerIds.length).toBeGreaterThanOrEqual(19);
      expect(club.playerIds.length).toBeLessThanOrEqual(L.squadMaximum);
      for (const id of club.playerIds)
        expect(world.contracts[world.players[id]!.contractId!]!.end.season).toBeGreaterThan(
          world.date.season,
        );
    }
    const released = Object.values(world.players).filter((p) => !p.retired && !p.clubId);
    expect(released.length).toBeGreaterThan(0);
    expect(released.every((p) => p.releasedSeason === world.date.season)).toBe(true);
    expect(world.events.some((event) => event.kind === 'release')).toBe(true);
    expect(() => validateWorld(clone(world))).not.toThrow();
  }, 120000);

  it('signs free agents into squads below target, strongest clubs choosing first', () => {
    const world = generateWorld('lifecycle-signings', { format: 'legacy' });
    const club = Object.values(world.clubs).sort((a, b) => b.reputation - a.reputation)[0]!;
    for (const player of club.playerIds
      .map((id) => world.players[id]!)
      .filter((p) => p.primaryPosition === 'ST')) {
      delete world.contracts[player.contractId!];
      player.contractId = null;
      player.clubId = null;
      player.releasedSeason = world.date.season;
    }
    club.playerIds = club.playerIds.filter((id) => world.players[id]!.clubId === club.id);
    fillSquads(world, createRng('signings'));
    expect(club.playerIds.length).toBeGreaterThanOrEqual(L.squadTarget - 1);
    expect(club.playerIds.every((id) => world.players[id]!.releasedSeason === undefined)).toBe(
      true,
    );
    expect(world.events.some((event) => event.kind === 'signing')).toBe(true);
    expect(() => validateWorld(clone(world))).not.toThrow();
  });

  it('retires free agents nobody signs and archives retirees at rollover', () => {
    const world = generateWorld('lifecycle-archive', { format: 'legacy' });
    const reference = Object.values(world.players)[5]!;
    world.players['veteran-free'] = {
      ...structuredClone(reference),
      id: 'veteran-free',
      birthSeason: world.date.season - 31,
      clubId: null,
      contractId: null,
      releasedSeason: world.date.season - 1,
    };
    world.date.week = CONFIG.world.intakeWeek;
    seasonalSquadReview(world, createRng('free-agents'));
    expect(world.players['veteran-free']!.retired).toBe(true);
    world.events.push({
      id: 'event:old',
      date: { season: world.date.season - 3, week: 1, day: 1 },
      kind: 'trophy',
      entityIds: [],
      params: { name: 'x', competition: 'y' },
    });
    world.managers['manager:orphan'] = {
      ...structuredClone(Object.values(world.managers)[0]!),
      id: 'manager:orphan',
    };
    archiveAndPrune(world, world.date.season);
    expect(world.players['veteran-free']).toBeUndefined();
    expect(world.archive!.players['veteran-free']).toMatchObject({
      retiredSeason: world.date.season,
      name: reference.name,
    });
    expect(Object.values(world.players).some((p) => p.retired)).toBe(false);
    expect(world.events.some((event) => event.id === 'event:old')).toBe(false);
    expect(world.managers['manager:orphan']).toBeUndefined();
  });

  it('reuses dormant clubs for feeder admissions and never hands one out twice', () => {
    const world = generateWorld('lifecycle-feeder');
    const league = Object.values(world.leagues).find(
      (l) => l.countryId === 'country:0' && l.tier === 6,
    )!;
    const region = league.region!;
    const dormantIds = league.clubIds.slice(-2);
    for (const id of dormantIds) {
      const club = world.clubs[id]!;
      club.identity!.region = region;
      club.leagueId = `feeder:0:${region}`;
      league.clubIds = league.clubIds.filter((clubId) => clubId !== id);
    }
    const before = Object.keys(world.clubs).length;
    const first = createFeederClub(world, 'country:0', region);
    const second = createFeederClub(world, 'country:0', region);
    const third = createFeederClub(world, 'country:0', region);
    expect(dormantIds).toContain(first.id);
    expect(dormantIds).toContain(second.id);
    expect(second.id).not.toBe(first.id);
    expect(dormantIds).not.toContain(third.id);
    expect(Object.keys(world.clubs).length - before).toBe(1);
  });

  it('simulates in place exactly as a copied world resumed from JSON mid-season', () => {
    let continuous = generateWorld('lifecycle-resume');
    let resumed = clone(continuous);
    while (continuous.date.week <= 44) continuous = simulateWeek(continuous, { inPlace: true });
    while (resumed.date.week <= 39) resumed = simulateWeek(resumed);
    resumed = clone(resumed);
    while (resumed.date.week <= 44) resumed = simulateWeek(resumed);
    expect(resumed).toEqual(continuous);
    // Eighty-nine national weeks: well over a minute when other suites share the machine.
  }, 300000);

  it('keeps a national world bounded and valid across two seasons', () => {
    let world = generateWorld('lifecycle-national');
    const sizes: number[] = [];
    const dormant: number[] = [];
    for (let season = 0; season < 2; season++) {
      while (world.phase === 'active') world = simulateWeek(world, { inPlace: true });
      world = startNextSeason(world, { inPlace: true });
      expect(() => validateWorld(clone(world))).not.toThrow();
      sizes.push(Object.keys(world.players).length);
      dormant.push(
        Object.values(world.clubs).filter((club) => !world.leagues[club.leagueId]).length,
      );
      for (const club of Object.values(world.clubs).filter((c) => world.leagues[c.leagueId]))
        for (const id of club.playerIds)
          expect(
            world.contracts[world.players[id]!.contractId!]!.end.season,
          ).toBeGreaterThanOrEqual(world.date.season);
    }
    // Departed clubs are reused, so the dormant pool grows far slower than one season's departures.
    expect(dormant[1]! - dormant[0]!).toBeLessThan(dormant[0]! / 2);
    expect(sizes[1]! - sizes[0]!).toBeLessThan(2500);
    expect(Object.keys(world.archive!.players).length).toBeGreaterThan(0);
    expect(world.events.every((event) => event.date.season >= world.date.season - 1)).toBe(true);
  }, 120000);
});
