import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { lifecycleWeeks, simulateWeek } from '../src/engine/world/simulate';
import {
  archiveAndPrune,
  fillSquads,
  retirementProbability,
  seasonalSquadReview,
} from '../src/engine/world/lifecycle';
import { createFeederClub } from '../src/engine/world/feeder';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalWorld } from './support/world';

const L = CONFIG.world.lifecycle;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;

describe('squad lifecycle', () => {
  it('ramps retirement with age and forces it at the limit', () => {
    expect(retirementProbability(28)).toBe(0);
    expect(retirementProbability(34)).toBeLessThan(retirementProbability(37));
    expect(retirementProbability(L.forcedRetirementAge)).toBe(1);
  });

  // The rule is the same in every format; a compact world reaches its intake week in a third of
  // the time (the national world's lifecycle over two seasons: tests/lifecycle.slow.test.ts).
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
    const world = nationalWorld();
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
    const world = nationalWorld();
    const reference = Object.values(world.players)[5]!;
    world.players['veteran-free'] = {
      ...structuredClone(reference),
      id: 'veteran-free',
      birthSeason: world.date.season - 31,
      clubId: null,
      contractId: null,
      releasedSeason: world.date.season - 1,
    };
    world.date.week = lifecycleWeeks(world).intake;
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
});
