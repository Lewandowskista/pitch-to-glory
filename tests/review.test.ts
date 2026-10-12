import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { gradeFor, seasonReview } from '../src/engine/career/review';

const draft: CareerDraft = {
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
};
let start: World;
let complete: World;
beforeAll(() => {
  const base = generateWorld('review-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'review-tests')[0]!;
  start = createCareer(base, draft, trial.id, 'review-tests');
  let world = structuredClone(start);
  for (let guard = 0; guard < 80 && world.phase === 'active'; guard++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  complete = world;
}, 120000);
const clone = (world: World): World => structuredClone(world);

describe('the end-of-season review', () => {
  it('appears only once the season is complete', () => {
    expect(seasonReview(start)).toBeNull();
    expect(complete.phase).toBe('complete');
    expect(seasonReview(complete)).not.toBeNull();
  });

  it('reads the season from the career and the archived tables', () => {
    const review = seasonReview(complete)!;
    const matches = complete.career!.matches.filter((m) => m.season === review.season);
    expect(review.line.apps).toBe(matches.length);
    expect(review.line.goals).toBe(matches.reduce((sum, m) => sum + m.goals, 0));
    expect(review.share).toBeGreaterThan(0);
    expect(review.share).toBeLessThanOrEqual(1);
    expect(review.league).not.toBeNull();
    const table = complete.history.at(-1)!.tables[review.league!.id]!;
    expect(table[review.league!.rank - 1]!.clubId).toBe(review.clubId);
    expect(review.previous).toBeNull();
    expect(review.score).toBeGreaterThanOrEqual(0);
    expect(review.score).toBeLessThanOrEqual(100);
    expect(review.grade).toBe(gradeFor(review.score));
  });

  it('celebrates a title and grades it higher than the same season without it', () => {
    const plain = seasonReview(complete)!;
    const won = clone(complete);
    const club = won.clubs[plain.clubId]!;
    won.history.at(-1)!.champions[club.leagueId] = plain.clubId;
    const review = seasonReview(won)!;
    expect(review.outcome).toBe('champions');
    // The title adds the club-success weight to a season that had no outcome of its own.
    const W = CONFIG.career.review.weights.clubSuccess;
    if (plain.outcome === null) expect(review.score).toBe(Math.min(100, plain.score + W));
  });

  it('grades by bands', () => {
    const G = CONFIG.career.review.grades;
    expect(gradeFor(100)).toBe('A+');
    expect(gradeFor(G.A)).toBe('A');
    expect(gradeFor(G.B)).toBe('B');
    expect(gradeFor(G.C)).toBe('C');
    expect(gradeFor(G.D)).toBe('D');
    expect(gradeFor(0)).toBe('E');
  });
});
