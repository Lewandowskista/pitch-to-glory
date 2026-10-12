import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { applyHonoursAction } from '../src/engine/career/honours/actions';
import {
  canAnnounceFarewell,
  seasonsAtClub,
  testimonialCheck,
} from '../src/engine/career/honours/retirement';
import { validateWorld } from '../src/persistence/worldSchema';
import { messageText } from '../src/screens/career/marketUi';
import { chronicleSentence } from '../src/screens/career/honoursUi';

const H = CONFIG.career.honours;
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
beforeAll(() => {
  const base = generateWorld('farewell-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'farewell-tests')[0]!;
  start = createCareer(base, draft, trial.id, 'farewell-tests');
}, 60000);
const clone = (world: World): World => structuredClone(world);
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const aged = (input: World, age: number) => {
  const world = clone(input);
  world.players[world.career!.playerId]!.birthSeason = world.date.season - age;
  return world;
};

describe('the farewell season', () => {
  it('can be announced from a season before the optional retirement age, once', () => {
    expect(canAnnounceFarewell(start)).toBe(false);
    const veteran = aged(start, H.retirement.optionalAge);
    expect(canAnnounceFarewell(veteran)).toBe(true);
    const world = applyHonoursAction(veteran, { type: 'farewell' });
    expect(veteran.career!.farewell).toBeUndefined();
    expect(world.career!.farewell).toMatchObject({ season: world.date.season });
    expect(world.career!.fame).toBe(veteran.career!.fame + H.farewell.fame);
    expect(canAnnounceFarewell(world)).toBe(false);
    expect(() => applyHonoursAction(world, { type: 'farewell' })).toThrow();
    const message = world.inbox.at(-1)!;
    expect(message.subjectKey).toBe('farewell');
    expect(messageText(message).body).not.toMatch(/[{}]/);
    expect(chronicleSentence(world, world.chronicle.at(-1)!)).toContain(String(world.date.season));
    valid(world);
  });

  it('ends the career when the season is complete', () => {
    let world = applyHonoursAction(aged(start, H.retirement.optionalAge), { type: 'farewell' });
    for (let guard = 0; guard < 80 && world.phase === 'active'; guard++)
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    expect(world.phase).toBe('complete');
    expect(world.career).toBeDefined();
    const next = startNextSeason(world);
    expect(next.career).toBeUndefined();
    expect(next.legacies.at(-1)!.playerId).toBe(world.career!.playerId);
  }, 120000);
});

describe('the testimonial', () => {
  it('honours long service once per club', () => {
    const world = clone(start);
    expect(seasonsAtClub(world)).toBe(0);
    testimonialCheck(world);
    expect(world.career!.testimonials).toBeUndefined();
    world.career!.startSeason = world.date.season - H.testimonial.seasons;
    expect(seasonsAtClub(world)).toBe(H.testimonial.seasons);
    const fame = world.career!.fame;
    testimonialCheck(world);
    testimonialCheck(world);
    expect(world.career!.testimonials).toEqual([world.players[world.career!.playerId]!.clubId]);
    expect(world.career!.fame).toBe(fame + H.testimonial.fame);
    const message = world.inbox.at(-1)!;
    expect(message.subjectKey).toBe('testimonial');
    expect(messageText(message).body).not.toMatch(/[{}]/);
  });
});
