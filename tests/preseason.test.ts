import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import {
  ambitionOffers,
  applyPreseason,
  lateStepBlocked,
  preseasonBrief,
  preseasonDue,
  preseasonSeasonEnd,
} from '../src/engine/career/preseason';
import { careerContract, relationshipValue } from '../src/engine/career/market/rules';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 5, step 5.3: a preseason briefing with the player's ambition for the season,
 * and from 31 one late-career step a season.
 */
const P = CONFIG.career.preseason;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
let career: World;
beforeAll(() => {
  const base = generateWorld('preseason-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'preseason-tests')[0]!;
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
      position: 'ST',
      foot: 'right',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'preseason-tests',
  );
}, 120000);
const me = (world: World) => world.players[world.career!.playerId]!;
/** The career at 33, with a key role. */
const veteran = () => {
  const world = clone(career);
  me(world).birthSeason = world.date.season - 33;
  world.contracts[careerContract(world).id]!.role = 'key';
  return world;
};

describe('preseason', () => {
  it('is due early in the season until the briefing is done', () => {
    const world = clone(career);
    expect(preseasonDue(world)).toBe(true);
    const done = applyPreseason(world, { type: 'done' });
    expect(preseasonDue(done)).toBe(false);
    const late = clone(career);
    late.date = { ...late.date, week: P.weeks + 1 };
    expect(preseasonDue(late)).toBe(false);
    valid(done);
  });

  it('briefs the manager’s expectations and the competition for a place', () => {
    const brief = preseasonBrief(clone(career));
    expect(brief.expectedPlace).toBeGreaterThanOrEqual(1);
    expect(brief.expectedPlace).toBeLessThanOrEqual(brief.leagueSize);
    expect(brief.startChance).toBeGreaterThan(0);
    expect(brief.ambitions.map((a) => a.kind)).toEqual(['place', 'output', 'growth']);
    // No late-career steps for a 17-year-old.
    expect(brief.late).toEqual([]);
  });

  it('sets one ambition, judged at the season’s end', () => {
    const world = applyPreseason(clone(career), { type: 'ambition', kind: 'place' });
    const ambition = world.career!.preseason!.ambition!;
    expect(ambition.kind).toBe('place');
    expect(() => applyPreseason(world, { type: 'ambition', kind: 'growth' })).toThrow();
    const xp = world.career!.xp;
    // Met: enough starts this season.
    const met = clone(world);
    for (let index = 0; index < ambition.target; index++)
      met.career!.matches.push({
        ...(met.career!.matches[0] ?? ({} as never)),
        fixtureId: `fixture:test:${index}`,
        season: met.date.season,
        week: 1,
        minutes: 90,
        goals: 0,
        assists: 0,
        rating: 7,
      } as never);
    preseasonSeasonEnd(met);
    expect(met.career!.preseason!.ambition!.met).toBe(true);
    expect(met.career!.xp).toBe(xp + P.reward.xp);
    expect(met.inbox.at(-1)?.subjectKey).toBe('season-ambition-met');
    // Missed: no starts.
    const missed = clone(world);
    const morale = me(missed).morale;
    preseasonSeasonEnd(missed);
    expect(missed.career!.preseason!.ambition!.met).toBe(false);
    expect(me(missed).morale).toBe(Math.max(0, morale + P.penalty));
    // Judged once.
    preseasonSeasonEnd(missed);
    expect(missed.inbox.filter((m) => m.subjectKey === 'season-ambition-missed')).toHaveLength(1);
    valid(missed);
  });

  it('sets a veteran’s growth ambition to holding their level', () => {
    const offers = ambitionOffers(veteran());
    const growth = offers.find((offer) => offer.kind === 'growth')!;
    expect(growth.target).toBe(growth.baseline);
  });

  it('offers a veteran one late-career step a season', () => {
    const world = veteran();
    expect(lateStepBlocked(clone(career), 'smaller-role')).toBe('age');
    const trust = relationshipValue(world, 'manager', world.clubs[me(world).clubId!]!.managerId);
    const smaller = applyPreseason(world, { type: 'late', step: 'smaller-role' });
    expect(careerContract(smaller).role).toBe('rotation');
    expect(
      relationshipValue(smaller, 'manager', smaller.clubs[me(smaller).clubId!]!.managerId),
    ).toBeGreaterThan(trust);
    expect(lateStepBlocked(smaller, 'new-position')).toBe('taken');
    expect(() => applyPreseason(smaller, { type: 'late', step: 'new-position' })).toThrow();
    valid(smaller);
  });

  it('retrains a striker as an attacking midfielder', () => {
    const world = applyPreseason(veteran(), { type: 'late', step: 'new-position' });
    const am = me(world).secondaryPositions.find((entry) => entry.position === 'AM')!;
    expect(am.familiarity).toBeGreaterThanOrEqual(P.retrain);
    expect(world.career!.training.sessions.at(-1)!.focus).toBe('position:AM');
    valid(world);
  });

  it('finds clubs closer to home, who start scouting', () => {
    const world = veteran();
    expect(lateStepBlocked(world, 'closer-to-home')).toBeNull();
    const next = applyPreseason(world, { type: 'late', step: 'closer-to-home' });
    const home = next.scouting.filter((entry) => entry.id.startsWith('scouting:home:'));
    expect(home.length).toBeGreaterThan(0);
    for (const entry of home)
      expect(next.clubs[entry.clubId]!.countryId).toBe(me(next).nationalityId);
    valid(next);
  });
});
