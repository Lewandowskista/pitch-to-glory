import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { continueStops, pendingDecisions } from '../src/engine/career/pending';
import { applySocialAction } from '../src/engine/career/social';
import { ROUTINE_PRESS } from '../src/engine/career/social/media';
import { runWorldJob } from '../src/workers/run';
import type { WorkerResponse } from '../src/workers/protocol';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 5, step 5.1: Continue stops for every decision that is due, or that arrives,
 * before it can lapse.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
let career: World;
beforeAll(() => {
  const base = generateWorld('continue-stops', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'continue-stops')[0]!;
  career = createCareer(
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
      position: 'CM',
      foot: 'right',
      age: 17,
      archetype: 'box-to-box',
    },
    trial.id,
    'continue-stops',
  );
  for (let week = 0; week < 4; week++)
    career = advanceCareerWeek(career, { inPlace: true, autoPlay: true }).world;
}, 120000);

/** One press of Continue with the worker's own loop; the world it stops in. */
async function pressContinue(world: World): Promise<World> {
  let last = world;
  const events: WorkerResponse[] = [];
  await runWorldJob(
    { requestId: 'continue', type: 'simulate-to-match', world },
    {
      emit: (event) => {
        events.push(event);
        if (event.type === 'checkpoint') last = event.world;
      },
      checkpoint: async () => {},
      cancelled: () => false,
      yieldControl: async () => {},
    },
    {
      generate: () => world,
      week: (w, autoPlay) => advanceCareerWeek(w, { inPlace: true, autoPlay }),
      nextSeason: (w) => w,
      commit: () => {
        throw new Error('Not used');
      },
      tournament: (w) => ({ world: w, pendingFixtureId: null }),
      createCareer: (w) => w,
      pending: (w) => pendingDecisions(w).map((item) => item.id),
      continueStops,
    },
  );
  return last;
}

describe('Continue stops for decisions', () => {
  it('stops for a story, a press question and a sponsor offer during an injury break', async () => {
    let world = clone(career);
    const me = world.players[world.career!.playerId]!;
    // Six weeks out, the recovery already chosen: nothing else would stop Continue.
    world.career!.injury = {
      id: 'injury:test',
      playerId: me.id,
      kind: 'hamstring-strain',
      started: { ...world.date },
      weeksRemaining: 6,
      severity: 2,
      reinjuryRisk: 0,
      recovery: 'rehab',
      careerThreatening: false,
      cause: 'training',
    };
    me.injuryId = 'injury:test';
    const week = world.date.week;
    const at = (weeks: number) => ({ season: world.date.season, week: week + weeks, day: 7 });
    world.media.push({
      id: 'media:test-press',
      date: { ...world.date },
      kind: 'press',
      author: 'journalist',
      authorName: 'The Ledger',
      textKey: 'rumour',
      params: { suitor: 'Elmfield', variant: 0 },
      sentiment: 0,
      likes: 0,
      choices: [
        {
          id: 'rumour:team',
          tone: 'team',
          labelKey: 'rumour.team',
          effects: { fame: 0, trust: 1, mood: 0, fans: 0, cliques: {}, rival: 0 },
        },
      ],
      answer: null,
      expires: at(2),
    });
    world.sponsorships.push({
      id: 'sponsor:test',
      brandId: 'brand:fizzwell',
      category: 'drinks',
      status: 'offered',
      offered: { ...world.date },
      expires: at(3),
      start: null,
      endSeason: world.date.season,
      weeklyFee: 500,
      bonus: 5000,
      obligations: [{ kind: 'starts', target: 5 }],
      baseline: null,
    });
    world.career!.stories = [
      ...(world.career!.stories ?? []).filter((story) => story.status !== 'offered'),
      {
        id: `story:night-out:${world.date.season}:${week}`,
        version: 1,
        kind: 'night-out',
        started: { ...world.date },
        respondBy: at(5),
        params: {},
        status: 'offered',
        choice: null,
        resolveAt: null,
        outcome: null,
      },
    ];
    const deadlines: Record<string, number> = {
      'press:media:test-press': week + 2,
      'sponsor:sponsor:test': week + 3,
      [`story:story:night-out:${world.date.season}:${week}`]: week + 5,
    };
    // Press Continue until the break is over, answering nothing: each decision must have been
    // waiting at a stop no later than its last week.
    const seen = new Map<string, number>();
    for (let press = 0; press < 10 && world.date.week < week + 7; press++) {
      world = await pressContinue(world);
      for (const item of pendingDecisions(world))
        if (!seen.has(item.id)) seen.set(item.id, world.date.week);
    }
    for (const [id, last] of Object.entries(deadlines)) {
      expect(seen.has(id), id).toBe(true);
      expect(seen.get(id)!, id).toBeLessThanOrEqual(last);
    }
    expect(() => validateWorld(clone(world))).not.toThrow();
  }, 120000);

  it('answers routine press in a chosen tone, so it never stops Continue', () => {
    const world = applySocialAction(clone(career), { type: 'press-tone', tone: 'humble' });
    expect(world.career!.social.pressTone).toBe('humble');
    expect(ROUTINE_PRESS.has('win')).toBe(true);
    expect(ROUTINE_PRESS.has('rumour')).toBe(false);
    const off = applySocialAction(world, { type: 'press-tone', tone: null });
    expect(off.career!.social.pressTone).toBeUndefined();
    expect(() => validateWorld(clone(world))).not.toThrow();
  });

  it('auto-answers routine questions as they arrive over a season', () => {
    let world = clone(career);
    world.career!.social.pressTone = 'team';
    const before = world.career!.social.answered;
    const from = world.date.week;
    for (let week = 0; week < 12; week++)
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const routine = world.media.filter(
      (item) =>
        item.choices.length && item.date.week >= from && ROUTINE_PRESS.has(item.textKey as never),
    );
    // Answered as they arrived: in the chosen tone where the question offers it.
    for (const item of routine) {
      expect(item.answer, item.textKey).not.toBe('silence');
      if (item.choices.some((choice) => choice.tone === 'team'))
        expect(item.answer).toMatch(/:team$/);
    }
    expect(routine.length).toBeGreaterThan(0);
    expect(world.career!.social.answered).toBeGreaterThan(before);
  }, 120000);
});
