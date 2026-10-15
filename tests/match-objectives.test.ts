import { describe, expect, it } from 'vitest';
import type { Fixture, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { careerMatchSetup, defaultTactics } from '../src/engine/career/matches';
import { careerMatchSeed, previewObjectives } from '../src/engine/career/objectives';
import { advanceCareerWeek } from '../src/engine/career/season';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import { createMatchSession } from '../src/engine/match';
import { objectivesFor } from '../src/engine/match/objectives';

/**
 * Pre-match objectives on their own stream (engine match-15, decision 3): what the hub shows
 * before matchday is exactly what kickoff sets.
 */
const draft = (overrides: Partial<CareerDraft> = {}): CareerDraft => ({
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
  archetype: 'playmaker',
  ...overrides,
});
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const base = generateWorld('objectives-preview');
const trial = trialOffers(base, 'country:0', 'objectives')[0]!;

/** The career's league fixtures still to play, in order. */
function upcoming(world: World): Fixture[] {
  const clubId = world.players[world.career!.playerId]!.clubId!;
  return Object.values(world.fixtures)
    .filter((f) => (f.homeId === clubId || f.awayId === clubId) && !world.results[f.id])
    .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day)
    .slice(0, 6);
}

describe('objectives preview (match-15)', () => {
  it('equals the objectives set at kickoff, for every position and fixture', () => {
    for (const [position, archetype] of [
      ['CM', 'playmaker'],
      ['ST', 'finisher'],
      ['CB', 'destroyer'],
      ['GK', 'shot-stopper'],
    ] as const) {
      const world = createCareer(base, draft({ position, archetype }), trial.id, 'objectives');
      for (const fixture of upcoming(world)) {
        const preview = previewObjectives(world, fixture)!;
        expect(preview).toHaveLength(2);
        const session = createMatchSession(careerMatchSetup(world, fixture), defaultTactics(world));
        expect(session.state.match.objectives).toEqual(preview);
        // Keyed only by the fixture's seed and the position.
        expect(preview).toEqual(
          objectivesFor(careerMatchSeed(world, fixture), world.players[world.career!.playerId]!),
        );
      }
    }
  });
  it('stays the same through the week before the match, and tactics do not move it', () => {
    let world = clone(createCareer(base, draft(), trial.id, 'objectives-week'));
    const fixture = nextCareerFixture(world)!;
    const before = previewObjectives(world, fixture);
    const session = createMatchSession(careerMatchSetup(world, fixture), {
      ...defaultTactics(world),
      mentality: 'attacking',
      risk: 'high',
    });
    expect(session.state.match.objectives).toEqual(before);
    world = advanceCareerWeek(world, { inPlace: true }).world;
    const later = world.fixtures[fixture.id] && !world.results[fixture.id];
    if (later) expect(previewObjectives(world, fixture)).toEqual(before);
  });
  it('previews nothing in a world on the earlier selection rules', () => {
    const legacy = clone(createCareer(base, draft(), trial.id, 'objectives-legacy'));
    delete legacy.selectionVersion;
    expect(previewObjectives(legacy, upcoming(legacy)[0]!)).toBeNull();
  });
});
