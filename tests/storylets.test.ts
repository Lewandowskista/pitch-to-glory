import { beforeAll, describe, expect, it } from 'vitest';
import type { StoryState, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  answerStory,
  offeredStory,
  storiesWeek,
  STORYLETS,
} from '../src/engine/career/stories/storylets';
import { STORY_CHOICES } from '../src/engine/career/stories/storyChoices';
import { today } from '../src/engine/career/market/rules';
import { careerMatchSetup } from '../src/engine/career/matches';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { createMatchSession } from '../src/engine/match';
import { defaultTactics } from '../src/engine/career/matches';
import { validateWorld } from '../src/persistence/worldSchema';
import { storyletsText } from '../src/i18n/storylets';
import { messageText } from '../src/screens/career/marketUi';
import { chronicleSentence } from '../src/screens/career/honoursUi';
import { storyChoice, storyEnding, storyScene, storyTitle } from '../src/screens/career/storyText';

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
  const base = generateWorld('story-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'story-tests')[0]!;
  start = createCareer(base, draft, trial.id, 'story-tests');
  // An established player, old enough for the senior stories.
  const own = start.players[start.career!.playerId]!;
  own.birthSeason = start.date.season - 25;
}, 60000);
const clone = (world: World): World => structuredClone(world);
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const noBraces = (text: string) => expect(text).not.toMatch(/[{}]/);

/** A world with one story of the kind offered, with plausible parameters. */
function offered(kind: StoryState['kind']): World {
  const world = clone(start);
  const own = world.players[world.career!.playerId]!;
  const club = world.clubs[own.clubId!]!;
  const mate = world.players[club.playerIds.find((id) => id !== own.id)!]!;
  const other = Object.values(world.clubs).find((entry) => entry.id !== club.id)!;
  const fixture = Object.values(world.fixtures).find(
    (entry) => entry.homeId === club.id || entry.awayId === club.id,
  )!;
  const now = today(world);
  world.career!.stories = [
    {
      id: `story:${kind}:${now.season}:${now.week}`,
      version: 1,
      kind,
      started: now,
      respondBy: { ...now, day: 7 },
      params: {
        teammate: mate.name,
        teammateId: mate.id,
        club: other.name,
        clubId: other.id,
        manager: 'A. Manager',
        rival: 'R. Rival',
        goals: 0,
        rivalGoals: 0,
        weeks: 8,
        city: club.city,
        fixtureId: fixture.id,
      },
      status: 'offered',
      choice: null,
      resolveAt: null,
      outcome: null,
    },
  ];
  return world;
}

describe('story arcs', () => {
  it('keep the save catalogue in step with the stories, with copy for every line', () => {
    expect(Object.keys(STORY_CHOICES).sort()).toEqual(STORYLETS.map((s) => s.kind).sort());
    for (const def of STORYLETS) {
      expect(STORY_CHOICES[def.kind]).toEqual(def.choices.map((choice) => choice.id));
      expect(def.choices.map((choice) => choice.id)).toContain(def.lapse);
      const copy = storyletsText.stories[def.kind]!;
      expect(copy.title).toBeTruthy();
      for (const choice of def.choices) {
        expect(copy.choices[choice.id]).toBeTruthy();
        // A choice settled at once ends with its own line.
        if (!choice.followUp) expect(copy.outcomes[choice.id]).toBeTruthy();
      }
    }
  });

  it('play every choice of every story to its end, once, leaving the input untouched', () => {
    for (const def of STORYLETS)
      for (const choice of def.choices) {
        const before = offered(def.kind);
        const snapshot = JSON.stringify(before);
        const story = before.career!.stories![0]!;
        let world = answerStory(before, story.id, choice.id);
        expect(JSON.stringify(before)).toBe(snapshot);
        let state = world.career!.stories![0]!;
        expect(state.choice).toBe(choice.id);
        expect(() => answerStory(world, story.id, choice.id)).toThrow();
        if (state.status === 'waiting') {
          // The follow-up resolves when due, by what happened since.
          world = clone(world);
          world.career!.stories![0]!.resolveAt = today(world);
          storiesWeek(world);
          state = world.career!.stories![0]!;
        }
        expect(state.status).toBe('resolved');
        const ending = storyEnding(def.kind, state.outcome!, state.params);
        expect(ending.length).toBeGreaterThan(0);
        noBraces(ending);
        noBraces(storyScene(def.kind, state.params));
        noBraces(storyChoice(def.kind, choice.id, state.params));
        for (const message of world.inbox.filter((m) => m.subjectKey.startsWith('story-'))) {
          const text = messageText(message);
          noBraces(text.subject);
          noBraces(text.body);
          expect(text.subject).toContain(storyTitle(def.kind));
        }
        for (const entry of world.chronicle.filter((e) => e.kind === 'story'))
          noBraces(chronicleSentence(world, entry));
        valid(world);
      }
  });

  it('take the default choice when unanswered', () => {
    const def = STORYLETS.find((entry) => entry.kind === 'homecoming')!;
    const world = offered(def.kind);
    world.career!.stories![0]!.respondBy = { ...today(world), week: world.date.week - 1 };
    storiesWeek(world);
    expect(world.career!.stories![0]!.choice).toBe(def.lapse);
  });

  it('come up as the season is played, one at a time', () => {
    let world = clone(start);
    let seen = 0;
    for (let week = 0; week < 30 && world.phase === 'active'; week++) {
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
      const open = (world.career!.stories ?? []).filter((s) => s.status !== 'resolved');
      expect(open.length).toBeLessThanOrEqual(1);
      const story = offeredStory(world);
      if (story) {
        seen++;
        world = answerStory(
          world,
          story.id,
          STORYLETS.find((d) => d.kind === story.kind)!.choices[0]!.id,
        );
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2);
    expect(world.career!.stories!.some((s) => s.status === 'resolved')).toBe(true);
    valid(world);
  }, 120000);

  it('give a captain the armband in every match', () => {
    let world = clone(start);
    for (let guard = 0; guard < 8 && !pendingCareerFixture(world); guard++)
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const fixture = pendingCareerFixture(world)!;
    world.career!.captaincy = {
      clubId: world.players[world.career!.playerId]!.clubId!,
      since: today(world),
    };
    const setup = careerMatchSetup(world, fixture);
    expect(setup.captain).toBe(true);
    expect(createMatchSession(setup, defaultTactics(world)).state.captain).toBe(true);
    valid(world);
    // Without the captaincy, nothing changes.
    world.career!.captaincy = null;
    expect(careerMatchSetup(world, fixture).captain).toBeUndefined();
  }, 60000);
});
