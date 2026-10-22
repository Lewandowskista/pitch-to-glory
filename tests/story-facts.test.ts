import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  addFact,
  captaincyStanding,
  renewalWillingness,
  storyResting,
  trustCeiling,
} from '../src/engine/career/facts';
import { answerStory, STORYLET_BY_KIND } from '../src/engine/career/stories/storylets';
import { relationshipValue } from '../src/engine/career/market/rules';
import { adjustRelationship } from '../src/engine/career/market/records';
import { retireCareer } from '../src/engine/career/honours/retirement';
import { formerTeammates } from '../src/engine/career/honours/retirement';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 5, step 5.2: what the football world remembers changes what it does: how far a
 * manager trusts the player, how willingly a club renews, the captaincy claim, which stories
 * come up, and who becomes a manager in the world to come.
 */
const F = CONFIG.career.facts;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
let career: World;
beforeAll(() => {
  const base = generateWorld('story-facts', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'story-facts')[0]!;
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
    'story-facts',
  );
}, 120000);
const clubOf = (world: World) => world.clubs[world.players[world.career!.playerId]!.clubId!]!;

describe('lasting story facts', () => {
  it('caps a manager’s trust for each grievance, and holds it there week to week', () => {
    let world = clone(career);
    const club = clubOf(world);
    expect(trustCeiling(world, club.managerId)).toBe(100);
    addFact(world, 'public-criticism', { clubId: club.id, managerId: club.managerId });
    addFact(world, 'transfer-request', { clubId: club.id, managerId: club.managerId });
    expect(trustCeiling(world, club.managerId)).toBe(100 - 2 * F.grievance);
    // Recorded once per kind and subject in a season.
    addFact(world, 'public-criticism', { clubId: club.id, managerId: club.managerId });
    expect(world.career!.facts).toHaveLength(2);
    adjustRelationship(world, 'manager', club.managerId, 100);
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const manager = clubOf(world).managerId;
    if (manager === club.managerId)
      expect(relationshipValue(world, 'manager', manager)).toBeLessThanOrEqual(
        100 - 2 * F.grievance,
      );
    valid(world);
  }, 120000);

  it('makes a club keener to renew after loyalty, slower after a request', () => {
    const world = clone(career);
    const club = clubOf(world);
    expect(renewalWillingness(world, club.id)).toBe(1);
    addFact(world, 'declared-loyalty', { clubId: club.id });
    expect(renewalWillingness(world, club.id)).toBe(F.loyalty);
    addFact(world, 'transfer-request', { clubId: club.id, managerId: club.managerId });
    expect(renewalWillingness(world, club.id)).toBe(F.loyalty * F.request);
    // A request is forgiven after its seasons.
    world.date = { ...world.date, season: world.date.season + F.requestSeasons };
    expect(renewalWillingness(world, club.id)).toBe(F.loyalty);
  });

  it('moves the captaincy claim with what the club remembers', () => {
    const world = clone(career);
    const club = clubOf(world);
    addFact(world, 'declared-loyalty', { clubId: club.id });
    addFact(world, 'public-criticism', { clubId: club.id, managerId: club.managerId });
    expect(captaincyStanding(world, club.id, club.managerId)).toBe(
      F.captaincy['declared-loyalty']! + F.captaincy['public-criticism']!,
    );
  });

  it('remembers a story’s choice: declaring loyalty in a transfer saga', () => {
    const world = clone(career);
    const club = clubOf(world);
    world.career!.stories = [
      {
        id: 'story:transfer-saga:test',
        version: 1,
        kind: 'transfer-saga',
        started: { ...world.date },
        respondBy: { ...world.date, day: 7 },
        params: {
          club: 'Elmfield',
          clubId: Object.keys(world.clubs).find((id) => id !== club.id)!,
        },
        status: 'offered',
        choice: null,
        resolveAt: null,
        outcome: null,
      },
    ];
    expect(STORYLET_BY_KIND['transfer-saga'].choices.some((c) => c.id === 'commit')).toBe(true);
    const answered = answerStory(world, 'story:transfer-saga:test', 'commit');
    expect(answered.career!.facts).toEqual([
      expect.objectContaining({ kind: 'declared-loyalty', clubId: club.id }),
    ]);
    expect(renewalWillingness(answered, club.id)).toBe(F.loyalty);
    valid(answered);
  });

  it('rests a story kind for its cooldown of seasons', () => {
    const world = clone(career);
    world.career!.stories = [
      {
        id: 'story:captaincy:test',
        version: 1,
        kind: 'captaincy',
        started: { ...world.date },
        respondBy: { ...world.date, day: 7 },
        params: {},
        status: 'resolved',
        choice: 'support',
        resolveAt: null,
        outcome: 'support',
      },
    ];
    expect(storyResting(world, 'captaincy')).toBe(true);
    world.date = { ...world.date, season: world.date.season + 1 };
    expect(storyResting(world, 'captaincy')).toBe(F.cooldown.captaincy! > 1);
    world.date = { ...world.date, season: world.date.season + 1 };
    expect(storyResting(world, 'captaincy')).toBe(false);
    // A kind without a cooldown rests only for its own season.
    expect(storyResting(world, 'homecoming')).toBe(false);
  });

  it('carries a mentee into the legacy, first in line for a manager’s job', () => {
    const world = clone(career);
    const club = clubOf(world);
    const mentee = club.playerIds.find((id) => id !== world.career!.playerId)!;
    addFact(world, 'mentored', { clubId: club.id, playerId: mentee });
    retireCareer(world);
    const legacy = world.legacies.at(-1)!;
    expect(legacy.menteeIds).toEqual([mentee]);
    valid(world);
    // Retired and old enough, the mentee leads the list of former players who may manage.
    const person = world.players[mentee]!;
    person.retired = true;
    person.birthSeason = world.date.season - 36;
    expect(formerTeammates(world)[0]?.id).toBe(mentee);
  });
});
