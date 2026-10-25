import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { startNextSeason } from '../src/engine/world/simulate';
import { advanceCareerWeek } from '../src/engine/career/season';
import { acceptGoal, declineGoal, goalOffer, goalProgress } from '../src/engine/career/coaching';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalCareer } from './support/world';

/** Season goals across a whole national season (the slow project). */
function playSeason(input: World): World {
  let world = input;
  while (world.phase === 'active')
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  return world;
}

describe('season goals over a national season', () => {
  it('a goal turned down in the first week is offered again the next season', () => {
    const declined = declineGoal(nationalCareer());
    const next = startNextSeason(playSeason(declined));
    expect(next.career!.coaching!.declinedSeason).toBeNull();
    expect(goalOffer(next)!.season).toBe(next.date.season);
  }, 300000);

  it('a goal accepted in the first week is measured all season and judged at its end', () => {
    const accepted = acceptGoal(nationalCareer());
    const goal = accepted.career!.coaching!.goal!;
    const ended = playSeason(accepted);
    const progress = goalProgress(ended, ended.career!.coaching!.goal!);
    const next = startNextSeason(ended);
    const result = next.career!.coaching!.history.at(-1)!;
    expect(result).toMatchObject({
      kind: goal.kind,
      target: goal.target,
      completed: progress >= goal.target,
    });
    expect(next.career!.coaching!.goal).toBeNull();
    expect(() => validateWorld(JSON.parse(JSON.stringify(next)) as World)).not.toThrow();
  }, 300000);
});
