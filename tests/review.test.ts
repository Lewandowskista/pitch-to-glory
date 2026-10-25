import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { gradeFor, seasonReview } from '../src/engine/career/review';
import { format } from '../src/i18n';
import { reviewText as r } from '../src/i18n/review';

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

  it('compares a keeper with the rival by clean sheets and a striker by goals (C15)', () => {
    /** The season as both lines stand: no goals or assists, the same average rating. */
    const shaped = (position: 'GK' | 'ST') => {
      const world = clone(complete);
      const player = world.players[world.career!.playerId]!;
      player.primaryPosition = position;
      const season = world.date.season;
      const matches = world.career!.matches.filter((m) => m.season === season);
      matches.forEach((m, index) => {
        m.goals = 0;
        m.assists = 0;
        m.rating = 7;
        m.cleanSheet = index < 10;
      });
      const rivalry = world.rivalries[0]!;
      const rival = world.players[rivalry.rivalPlayerId]!;
      const start = rivalry.seasonStart;
      rival.stats.appearances = start.appearances + matches.length;
      rival.stats.goals = start.goals;
      rival.stats.assists = start.assists;
      rival.stats.ratingTotal = start.ratingTotal + 7 * matches.length;
      rival.stats.cleanSheets = (start.cleanSheets ?? rival.stats.cleanSheets) + 4;
      return seasonReview(world)!.rival!;
    };
    expect(
      complete.career!.matches.filter((m) => m.season === complete.date.season).length,
    ).toBeGreaterThan(10);
    const keeper = shaped('GK');
    expect(keeper).toMatchObject({
      measure: 'clean-sheets',
      verdict: 'ahead',
      cleanSheets: 10,
      rivalCleanSheets: 4,
      goals: 0,
      rivalGoals: 0,
    });
    const keeperText = format(r.rivalVerdict[keeper.measure][keeper.verdict], {
      ...keeper,
      rival: keeper.name,
    });
    expect(keeperText).toContain('10 clean sheets to 4');
    expect(keeperText).not.toMatch(/[{}]/);
    // The same season for a striker is level: neither scored nor made a goal.
    const striker = shaped('ST');
    expect(striker).toMatchObject({ measure: 'goals', verdict: 'level', goals: 0, rivalGoals: 0 });
    const strikerText = format(r.rivalVerdict[striker.measure][striker.verdict], {
      ...striker,
      rival: striker.name,
    });
    expect(strikerText).toContain('0 goals and 0 assists');
    expect(strikerText).not.toMatch(/[{}]/);
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
