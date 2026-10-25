import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { startNextSeason } from '../src/engine/world/simulate';
import { advanceCareerWeek } from '../src/engine/career/season';
import { acceptGoal } from '../src/engine/career/coaching';
import { acceptPromise, currentPromise, promiseWeek } from '../src/engine/career/stories/promise';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalCareer } from './support/world';

/** The manager's promise across a whole national season (the slow project). */
describe('a promise over a national season', () => {
  it('is settled by the season’s end and leaves a valid world', () => {
    const offered = acceptGoal(nationalCareer());
    promiseWeek(offered);
    let world: World = acceptPromise(offered);
    expect(currentPromise(world)!.status).toBe('active');
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const next = startNextSeason(world);
    expect(next.career!.social.promises!.length).toBeGreaterThan(0);
    for (const promise of next.career!.social.promises!)
      expect(['achieved', 'missed', 'cancelled']).toContain(promise.status);
    expect(() => validateWorld(JSON.parse(JSON.stringify(next)) as World)).not.toThrow();
  }, 300000);
});
