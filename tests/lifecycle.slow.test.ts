import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { validateWorld } from '../src/persistence/worldSchema';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;

/** Moved from tests/lifecycle.test.ts: the slow project (vitest.config.ts). */
describe('squad lifecycle over national seasons', () => {
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
