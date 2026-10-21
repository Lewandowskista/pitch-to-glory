import { beforeAll, describe, expect, it } from 'vitest';
import type { DecisionSample, Injury, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  acceptGoal,
  adviceDraft,
  coachAdvice,
  declineGoal,
  goalOffer,
  goalProgress,
} from '../src/engine/career/coaching';
import { defaultTrainingPlan } from '../src/engine/career/training';
import { trainableAttributes } from '../src/engine/career/progression';
import { validateWorld } from '../src/persistence/worldSchema';

/** Phase 5.2: advice from recent decisions, safe training choices and season goals. */
const K = CONFIG.career.coaching;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft = (position: CareerDraft['position'], archetype: string): CareerDraft => ({
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
  position,
  foot: 'left',
  age: 17,
  archetype,
});
let striker: World;
let keeper: World;
let played: World;
beforeAll(() => {
  const base = generateWorld('coaching-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'coaching-tests')[0]!;
  striker = createCareer(base, draft('ST', 'finisher'), trial.id, 'coaching-tests');
  keeper = createCareer(base, draft('GK', 'shot-stopper'), trial.id, 'coaching-tests');
  played = clone(striker);
  for (let week = 0; week < 12; week++)
    played = advanceCareerWeek(played, { inPlace: true, autoPlay: true }).world;
}, 120000);
const player = (world: World) => world.players[world.career!.playerId]!;
const samples = (
  family: DecisionSample['family'],
  attributes: string[],
  successes: number,
  attempts: number,
  probability = 0.7,
  /** What the attributes did to the odds, and the value given up (schema 22); absent: older. */
  judged: { attributeEffect: number; regret: number } | null = null,
): DecisionSample[] =>
  Array.from({ length: attempts }, (_, index) => ({
    season: 2026,
    week: 1,
    family,
    success: index < successes,
    probability,
    attributes,
    ...(judged ?? {}),
  }));
/** Decisions where the attributes cost eight points of success chance each. */
const weak = { attributeEffect: -0.08, regret: 0 };
/** Sound decisions: attributes at the match level, the best option taken. */
const sound = { attributeEffect: 0, regret: 0 };
const withRecent = (world: World, recent: DecisionSample[]) => {
  const next = clone(world);
  next.career!.coaching!.recent = recent;
  player(next).fatigue = 10;
  return next;
};

describe('recording decisions', () => {
  it('keeps the latest key-moment decisions and each match’s passes and tackles', () => {
    const coaching = played.career!.coaching!;
    expect(played.career!.matches.length).toBeGreaterThan(3);
    expect(coaching.recent.length).toBeGreaterThan(0);
    expect(coaching.recent.length).toBeLessThanOrEqual(K.recentLimit);
    for (const sample of coaching.recent) {
      expect(['shooting', 'passing', 'dribbling', 'defending', 'goalkeeping']).toContain(
        sample.family,
      );
      expect(sample.probability).toBeGreaterThanOrEqual(0);
      expect(sample.probability).toBeLessThanOrEqual(1);
      expect(sample.attributes.length).toBeLessThanOrEqual(3);
      // What the attributes did and the value given up are recorded for advice.
      expect(typeof sample.attributeEffect).toBe('number');
      expect(sample.regret).toBeGreaterThanOrEqual(0);
    }
    for (const match of played.career!.matches) {
      expect(match.passes![0]).toBeLessThanOrEqual(match.passes![1]);
      expect(match.tackles).toBeGreaterThanOrEqual(0);
    }
    expect(() => validateWorld(clone(played))).not.toThrow();
  });
});

describe('advice', () => {
  it('says it rests on the position when there are too few decisions', () => {
    const world = withRecent(striker, samples('passing', ['passing'], 1, K.minimumDecisions - 1));
    const advice = coachAdvice(world);
    expect(advice.basis).toBe('position');
    const plan = defaultTrainingPlan('ST').sessions.map((session) => session.focus);
    expect(advice.recommendations.map((entry) => entry.focus)).toEqual(
      [...new Set(plan)].slice(0, 2),
    );
    expect(advice.recommendations.every((entry) => entry.reason === 'position')).toBe(true);
  });

  it('points odds the attributes cost to the attribute behind them, deterministically', () => {
    const world = withRecent(striker, [
      ...samples('passing', ['passing', 'vision'], 2, 8, 0.7, weak),
      ...samples('shooting', ['finishing', 'composure'], 4, 6, 0.6, sound),
    ]);
    player(world).attributes.passing = 30;
    const advice = coachAdvice(world);
    expect(advice.basis).toBe('decisions');
    expect(advice.recommendations[0]).toMatchObject({
      focus: 'passing',
      reason: 'decisions',
      family: 'passing',
      attempts: 8,
      cost: 8,
    });
    expect(coachAdvice(world)).toEqual(advice);
    // Shooting's attributes were at the match level: nothing to train there.
    expect(advice.recommendations.some((entry) => entry.family === 'shooting')).toBe(false);
  });

  it('calls misses at sound odds bad luck, never a reason to train (the review’s probe)', () => {
    // Ten correctly chosen 80% actions that worked five times.
    const world = withRecent(striker, samples('shooting', ['finishing'], 5, 10, 0.8, sound));
    player(world).attributes.finishing = 30;
    const advice = coachAdvice(world);
    expect(advice.recommendations.some((entry) => entry.reason === 'decisions')).toBe(false);
    expect(advice.basis).toBe('steady');
    expect(advice.notes).toEqual([
      { kind: 'variance', family: 'shooting', attempts: 10, successes: 5, expected: 8 },
    ]);
  });

  it('notes poor choices as a matter of choosing, not training', () => {
    const world = withRecent(
      striker,
      samples('passing', ['passing'], 6, 10, 0.6, { attributeEffect: 0, regret: 0.05 }),
    );
    const advice = coachAdvice(world);
    expect(advice.recommendations.some((entry) => entry.reason === 'decisions')).toBe(false);
    expect(advice.notes).toContainEqual({
      kind: 'choices',
      family: 'passing',
      attempts: 10,
      regret: 0.05,
    });
  });

  it('uses decisions recorded before schema 22 only to note bad luck', () => {
    const world = withRecent(striker, samples('passing', ['passing'], 1, 10));
    player(world).attributes.passing = 30;
    const advice = coachAdvice(world);
    expect(advice.recommendations.every((entry) => entry.reason === 'position')).toBe(true);
    expect(advice.notes.map((note) => note.kind)).toEqual(['variance']);
  });

  it('never recommends a capped attribute', () => {
    const world = withRecent(striker, samples('passing', ['passing', 'vision'], 2, 10, 0.7, weak));
    player(world).attributes.passing = 99;
    player(world).attributes.vision = 30;
    const advice = coachAdvice(world);
    expect(advice.recommendations[0]).toMatchObject({ focus: 'vision', reason: 'decisions' });
  });

  it('never recommends an attribute a keeper or an outfielder cannot train', () => {
    const world = withRecent(keeper, samples('passing', ['passing', 'vision'], 1, 10));
    player(world).attributes.vision = 30;
    const advice = coachAdvice(world);
    expect(advice.recommendations.map((entry) => entry.focus)).not.toContain('passing');
    for (const entry of advice.recommendations.filter((e) => e.reason === 'decisions'))
      expect(trainableAttributes(player(world))).toContain(entry.focus);
    const outfield = withRecent(striker, samples('goalkeeping', ['handling'], 0, 10));
    expect(coachAdvice(outfield).recommendations.map((entry) => entry.focus)).not.toContain(
      'handling',
    );
  });

  it('puts recovery first when tired, and only recovery when injured', () => {
    const tired = withRecent(striker, samples('passing', ['passing'], 1, 10, 0.7, weak));
    player(tired).attributes.passing = 30;
    player(tired).fatigue = K.fatigue + 5;
    const advice = coachAdvice(tired);
    expect(advice.recommendations[0]).toMatchObject({ focus: 'recovery', reason: 'fatigue' });
    const injured = clone(tired);
    injured.career!.injury = { id: 'injury:x' } as Injury;
    expect(coachAdvice(injured)).toEqual({
      basis: 'recovery',
      sample: 10,
      recommendations: [{ focus: 'recovery', reason: 'injury' }],
      notes: [],
    });
  });

  it('drafts a plan to review and leaves the saved plan alone', () => {
    const world = withRecent(striker, samples('passing', ['passing'], 1, 10, 0.7, weak));
    player(world).attributes.passing = 30;
    const saved = clone(world).career!.training;
    const advice = coachAdvice(world);
    const plan = adviceDraft(world.career!.training, advice);
    expect(plan.sessions[0]).toEqual({ focus: 'passing', intensity: 'normal' });
    expect(plan.sessions.slice(advice.recommendations.length)).toEqual(
      saved.sessions.slice(advice.recommendations.length),
    );
    expect(world.career!.training).toEqual(saved);
    const injured = adviceDraft(saved, {
      basis: 'recovery',
      sample: 0,
      recommendations: [{ focus: 'recovery', reason: 'injury' }],
      notes: [],
    });
    expect(injured.sessions.every((session) => session.focus === 'recovery')).toBe(true);
  });
});

describe('season goals', () => {
  it('offers one role-appropriate goal and keeps it unchanged once accepted', () => {
    const offer = goalOffer(striker)!;
    expect(offer.season).toBe(striker.date.season);
    expect(['attribute', 'appearances']).toContain(offer.kind);
    const keeperOffer = goalOffer(keeper)!;
    expect(['attribute', 'appearances']).toContain(keeperOffer.kind);
    if (keeperOffer.attribute)
      expect(['reflexes', 'handling', 'oneOnOnes']).toContain(keeperOffer.attribute);
    const accepted = acceptGoal(striker);
    const goal = accepted.career!.coaching!.goal!;
    expect(goal).toMatchObject(offer);
    expect(striker.career!.coaching!.goal).toBeNull();
    expect(goalOffer(accepted)).toBeNull();
    // Circumstances change; the accepted goal does not.
    const changed = clone(accepted);
    changed.contracts[player(changed).contractId!]!.role = 'backup';
    expect(changed.career!.coaching!.goal).toEqual(goal);
    expect(goalOffer(changed)).toBeNull();
    expect(() => validateWorld(clone(accepted))).not.toThrow();
  });

  it('can be turned down for the season and is offered again the next', () => {
    const declined = declineGoal(striker);
    expect(goalOffer(declined)).toBeNull();
    expect(declined.career!.coaching!.declinedSeason).toBe(striker.date.season);
    let season = clone(declined);
    while (season.phase === 'active')
      season = advanceCareerWeek(season, { inPlace: true, autoPlay: true }).world;
    const next = startNextSeason(season);
    expect(next.career!.coaching!.declinedSeason).toBeNull();
    expect(goalOffer(next)!.season).toBe(next.date.season);
  }, 120000);

  it('measures progress from finalized records and judges the goal at the new season', () => {
    let world = clone(played);
    world.career!.coaching!.goal = {
      version: 1,
      season: world.date.season,
      kind: 'appearances',
      target: 1,
      attribute: null,
      baseline: 0,
      accepted: { ...world.date },
    };
    const appearances = world.career!.matches.filter(
      (match) => match.season === world.date.season && match.minutes > 0,
    ).length;
    expect(goalProgress(world, world.career!.coaching!.goal!)).toBe(appearances);
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const next = startNextSeason(world);
    const result = next.career!.coaching!.history.at(-1)!;
    expect(result).toMatchObject({ kind: 'appearances', target: 1, completed: true });
    expect(next.career!.coaching!.goal).toBeNull();
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);

  it('loads careers saved before coaching, and records without the new counters', () => {
    const old = clone(played);
    delete old.career!.coaching;
    for (const match of old.career!.matches) {
      delete match.passes;
      delete match.tackles;
    }
    expect(() => validateWorld(clone(old))).not.toThrow();
    // Rested and fit: with no decisions kept, the advice is the position's plan.
    player(old).fatigue = 10;
    expect(
      coachAdvice(old.career!.injury ? { ...old, career: { ...old.career!, injury: null } } : old)
        .basis,
    ).toBe('position');
    expect(goalOffer(old)).not.toBeNull();
    const accepted = acceptGoal(old);
    expect(accepted.career!.coaching!.version).toBe(1);
    expect(() => validateWorld(clone(accepted))).not.toThrow();
  });
});
