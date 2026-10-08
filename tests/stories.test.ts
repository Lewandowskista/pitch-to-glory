import { beforeAll, describe, expect, it } from 'vitest';
import type { Injury, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { getSeasonWeeks } from '../src/engine/world/calendar';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { acceptGoal } from '../src/engine/career/coaching';
import { relationshipValue } from '../src/engine/career/market';
import {
  acceptPromise,
  currentPromise,
  declinePromise,
  promiseMeasure,
  promiseWeek,
  proposal,
} from '../src/engine/career/stories/promise';
import { validateWorld } from '../src/persistence/worldSchema';

/** Phase 6: the manager's six-week development promise, from offer to conclusion. */
const P = CONFIG.career.promise;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
let withGoal: World;
beforeAll(() => {
  const base = generateWorld('stories-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'stories-tests')[0]!;
  const world = createCareer(
    base,
    {
      name: 'Robin Vale',
      avatar: {
        face: 1,
        skin: 2,
        hair: 3,
        hairColor: 4,
        facialHair: 0,
        eyebrows: 1,
        eyes: 2,
        accessory: 3,
      },
      nationalityId: 'country:0',
      position: 'ST',
      foot: 'left',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'stories-tests',
  );
  withGoal = acceptGoal(world);
});
const week = (world: World) => advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
const managerOf = (world: World) =>
  world.clubs[world.players[world.career!.playerId]!.clubId!]!.managerId;
const trust = (world: World) => relationshipValue(world, 'manager', managerOf(world));
const promiseMessages = (world: World) =>
  world.inbox.filter((message) => message.subjectKey.startsWith('promise-'));
/** A world whose manager has just made the offer. */
function offered(): World {
  // The weekly step the simulation runs, at the end of the first week.
  const world = clone(withGoal);
  promiseWeek(world);
  const promise = currentPromise(world)!;
  expect(promise).toMatchObject({
    id: `promise:${world.date.season}`,
    status: 'offered',
    managerId: managerOf(world),
  });
  return world;
}
/** Play on, a week at a time, until the promise concludes. */
function conclude(world: World): World {
  let next = world;
  for (let guard = 0; guard < 10 && currentPromise(next)!.status === 'active'; guard++)
    next = week(next);
  return next;
}

describe('the offer', () => {
  it('comes once a goal is accepted, with a quantified milestone, a message and a deadline', () => {
    const world = offered();
    const promise = currentPromise(world)!;
    expect(promise.target).toBeGreaterThan(0);
    expect(promise.respondBy).toBe(promise.offered.week + P.respondWeeks);
    const messages = promiseMessages(world);
    expect(messages.map((message) => message.subjectKey)).toEqual(['promise-offer']);
    expect(messages[0]!.actionId).toBe(promise.id);
    expect(() => validateWorld(clone(world))).not.toThrow();
    // Never twice in a season, however often the week is processed.
    promiseWeek(world);
    promiseWeek(world);
    expect(world.career!.social.promises).toHaveLength(1);
    expect(promiseMessages(world)).toHaveLength(1);
  });

  it('needs a goal and six weeks of season, and falls back to training without fixtures', () => {
    const noGoal = clone(withGoal);
    noGoal.career!.coaching!.goal = null;
    expect(proposal(noGoal)).toBeNull();
    const late = clone(withGoal);
    late.date.week = getSeasonWeeks(late) - P.weeks + 1;
    expect(proposal(late)).toBeNull();
    late.date.week -= 1;
    expect(proposal(late)).not.toBeNull();
    // A goal about matches, but no fixtures in the window: a training milestone instead.
    const quiet = clone(withGoal);
    quiet.career!.coaching!.goal = {
      ...quiet.career!.coaching!.goal!,
      kind: 'appearances',
      attribute: null,
      baseline: 0,
    };
    quiet.fixtures = {};
    expect(proposal(quiet)).toMatchObject({ kind: 'attribute', target: P.targets.attribute });
  });

  it('can be declined or left to lapse, without penalty', () => {
    const world = offered();
    const before = trust(world);
    const declined = declinePromise(world);
    expect(currentPromise(declined)).toMatchObject({ status: 'cancelled', end: 'declined' });
    expect(currentPromise(world)!.status).toBe('offered');
    expect(trust(declined)).toBe(before);
    expect(promiseMessages(declined)).toHaveLength(1);
    // No second offer this season.
    const after = week(declined);
    expect(after.career!.social.promises).toHaveLength(1);
    let lapsed = offered();
    for (let guard = 0; guard < 4 && currentPromise(lapsed)!.status === 'offered'; guard++)
      lapsed = week(lapsed);
    expect(currentPromise(lapsed)).toMatchObject({ status: 'cancelled', end: 'expired' });
    expect(trust(lapsed)).toBe(before);
  });
});

describe('the milestone', () => {
  it('starts on acceptance and ends as its real progress decides, once', () => {
    const accepted = acceptPromise(offered());
    const start = currentPromise(accepted)!;
    expect(start).toMatchObject({ status: 'active', progress: 0 });
    expect(start.baseline).toBe(promiseMeasure(accepted, start.kind, start.attribute));
    expect(start.deadline).toBe(accepted.date.week + P.weeks - 1);
    const before = trust(accepted);
    const done = conclude(accepted);
    const promise = currentPromise(done)!;
    const reached = promise.progress >= promise.target;
    expect(promise.status).toBe(reached ? 'achieved' : 'missed');
    expect(trust(done)).toBeCloseTo(
      Math.max(0, Math.min(100, before + P.trust[promise.status as 'achieved' | 'missed'])),
      0,
    );
    const entries = done.chronicle.filter((entry) => entry.kind === 'promise');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.params).toMatchObject({ promise: promise.id, outcome: promise.status });
    expect(promiseMessages(done).map((message) => message.subjectKey)).toEqual([
      'promise-offer',
      `promise-${promise.status}`,
    ]);
    // Processing the week again changes nothing.
    const again = clone(done);
    promiseWeek(again);
    promiseWeek(again);
    expect(again.chronicle).toEqual(done.chronicle);
    expect(again.inbox).toEqual(done.inbox);
    expect(trust(again)).toBe(trust(done));
    expect(() => validateWorld(clone(done))).not.toThrow();
  }, 120000);

  it('is achieved as soon as the target is met, and the outcome is deterministic', () => {
    const accepted = acceptPromise(offered());
    const promise = currentPromise(accepted)!;
    // Meet it directly: an attribute milestone moves with the attribute itself.
    promise.kind = 'attribute';
    promise.attribute = 'finishing';
    promise.target = 1;
    const player = accepted.players[accepted.career!.playerId]!;
    promise.baseline = player.attributes.finishing;
    player.attributes.finishing += 1;
    promiseWeek(accepted);
    expect(currentPromise(accepted)).toMatchObject({ status: 'achieved', progress: 1 });
    const first = conclude(acceptPromise(offered()));
    const second = conclude(acceptPromise(offered()));
    expect(currentPromise(second)).toEqual(currentPromise(first));
  }, 120000);

  it('survives a save and reload in the middle exactly', () => {
    let accepted = acceptPromise(offered());
    accepted = week(week(accepted));
    expect(
      currentPromise(accepted)!.status === 'active' ||
        currentPromise(accepted)!.status === 'achieved',
    ).toBe(true);
    expect(() => validateWorld(clone(accepted))).not.toThrow();
    const reloaded = conclude(clone(accepted));
    const continuous = conclude(accepted);
    expect(currentPromise(reloaded)).toEqual(currentPromise(continuous));
    expect(reloaded.chronicle).toEqual(continuous.chronicle);
  }, 120000);

  it('is called off without penalty by a move, a new manager or a long injury', () => {
    const cases: [string, (world: World) => void][] = [
      ['transfer', (world) => (currentPromise(world)!.clubId = 'club:elsewhere')],
      ['manager', (world) => (currentPromise(world)!.managerId = 'manager:former')],
      [
        'injury',
        (world) => {
          world.career!.injury = { id: 'injury:x', weeksRemaining: 20 } as Injury;
        },
      ],
    ];
    for (const [end, change] of cases) {
      const world = acceptPromise(offered());
      const before = trust(world);
      change(world);
      promiseWeek(world);
      expect(currentPromise(world)).toMatchObject({ status: 'cancelled', end });
      expect(trust(world)).toBe(before);
      expect(world.chronicle.some((entry) => entry.kind === 'promise')).toBe(false);
      expect(promiseMessages(world).at(-1)!.subjectKey).toBe('promise-cancelled');
    }
  });

  it('closes quietly at the new season, and the validator allows one open promise', () => {
    let world = acceptPromise(offered());
    world.career!.social.promises!.push({
      ...currentPromise(world)!,
      id: `promise:${world.date.season - 1}`,
      season: world.date.season - 1,
    });
    expect(() => validateWorld(clone(world))).toThrow();
    world.career!.social.promises!.pop();
    while (world.phase === 'active') world = week(world);
    const next = startNextSeason(world);
    for (const promise of next.career!.social.promises!)
      expect(['achieved', 'missed', 'cancelled']).toContain(promise.status);
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);
});
