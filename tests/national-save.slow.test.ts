import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { validateWorld } from '../src/persistence/worldSchema';

/** Moved from tests/national-save.test.ts: the slow project (vitest.config.ts). */
describe('national world checkpoints', () => {
  it('validates weekly checkpoints, resolved playoffs, feeder movement and a new season', () => {
    let world = generateWorld('national-checkpoints');
    while (world.phase === 'active') {
      world = simulateWeek(world);
      validateWorld(world);
    }
    expect(Object.keys(world.pyramid!.ties).length).toBeGreaterThan(0);
    expect(Object.keys(world.pyramid!.phases).length).toBeGreaterThan(0);
    const damaged = structuredClone(world);
    Object.values(damaged.pyramid!.ties)[0]!.aggregate = [999, 999];
    expect(() => validateWorld(damaged)).toThrow();
    const archived = structuredClone(world);
    Object.values(archived.history[0]!.ties!)[0]!.winnerId = 'club:missing';
    expect(() => validateWorld(archived)).toThrow();
    const bonus = structuredClone(world);
    const survival = Object.values(bonus.pyramid!.phases).find(
      (phase) => phase.kind === 'survival',
    )!;
    survival.initialPoints[survival.clubIds[0]!]! += 1;
    expect(() => validateWorld(bonus)).toThrow();
    expect(() => validateWorld(startNextSeason(world))).not.toThrow();
  }, 360000);
});
