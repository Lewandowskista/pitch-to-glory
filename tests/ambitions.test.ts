import { beforeAll, describe, expect, it } from 'vitest';
import type { AmbitionId, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  AMBITION_IDS,
  ambitionProgress,
  ambitionsCheck,
  ambitionsFor,
  canChangeAmbitions,
  dreamClubs,
  setAmbitions,
} from '../src/engine/career/honours/ambitions';
import {
  careerHallOfFameScore,
  hallOfFameRank,
  liveHallOfFame,
} from '../src/engine/career/honours/retirement';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';
import { INBOX_KINDS } from '../src/persistence/marketValidation';
import { ambitionsText } from '../src/i18n/ambitions';
import { honoursText } from '../src/i18n/honours';
import { ambitionName } from '../src/screens/career/ambitionText';
import { messageText } from '../src/screens/career/marketUi';
import { chronicleSentence } from '../src/screens/career/honoursUi';

const A = CONFIG.career.honours.ambitions;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const draft = (position: CareerDraft['position']): CareerDraft => ({
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
  archetype: position === 'GK' ? 'shot-stopper' : 'finisher',
});
let striker: World;
let keeper: World;
beforeAll(() => {
  const base = generateWorld('ambition-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'ambition-tests')[0]!;
  striker = createCareer(base, draft('ST'), trial.id, 'ambition-tests');
  keeper = createCareer(base, draft('GK'), trial.id, 'ambition-tests');
}, 60000);
const player = (world: World) => world.players[world.career!.playerId]!;

describe('career ambitions', () => {
  it('offer ambitions that suit the position', () => {
    expect(ambitionsFor('ST')).toContain('goals');
    expect(ambitionsFor('ST')).not.toContain('clean-sheets');
    expect(ambitionsFor('GK')).toContain('clean-sheets');
    expect(ambitionsFor('GK')).not.toContain('goals');
    expect(ambitionsFor('CB')).not.toContain('assists');
    for (const id of AMBITION_IDS) expect(ambitionsText.names[id]).toBeTruthy();
  });

  it('are chosen up to the limit, once a season, with a real dream club', () => {
    expect(canChangeAmbitions(striker)).toBe(true);
    expect(() => setAmbitions(keeper, { ids: ['goals'] })).toThrow();
    expect(() => setAmbitions(striker, { ids: ['dream-club'] })).toThrow();
    expect(() => setAmbitions(striker, { ids: [] })).toThrow();
    const dream = dreamClubs(striker)[0]!;
    expect(dream.id).not.toBe(player(striker).clubId);
    const world = setAmbitions(striker, {
      ids: ['goals', 'caps', 'dream-club', 'golden-ball'],
      dreamClubId: dream.id,
    });
    expect(striker.career!.ambitions).toBeUndefined();
    const list = world.career!.ambitions!.list;
    expect(list.map((entry) => entry.id)).toEqual(['goals', 'caps', 'dream-club']);
    expect(list.find((entry) => entry.id === 'dream-club')!.clubId).toBe(dream.id);
    expect(canChangeAmbitions(world)).toBe(false);
    expect(() => setAmbitions(world, { ids: ['appearances'] })).toThrow();
    valid(world);
    const save = createSave(1, 'Ambitions', {
      kind: 'world',
      world,
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });

  it('reject impossible saved ambitions', () => {
    const world = setAmbitions(striker, { ids: ['goals'] });
    const twice = clone(world);
    twice.career!.ambitions!.list.push({ ...twice.career!.ambitions!.list[0]! });
    expect(() => validateWorld(twice)).toThrow();
    const unknown = clone(world);
    (unknown.career!.ambitions!.list[0] as { id: string }).id = 'world-peace';
    expect(() => validateWorld(unknown)).toThrow();
    const club = clone(world);
    club.career!.ambitions!.list[0]!.clubId = 'club:none';
    expect(() => validateWorld(club)).toThrow();
  });

  it('pay fame and XP once when reached, with a Chronicle entry and a message', () => {
    const dream = dreamClubs(striker)[0]!;
    const world = clone(
      setAmbitions(striker, {
        ids: ['goals', 'dream-club', 'appearances'],
        dreamClubId: dream.id,
      }),
    );
    const goals = world.career!.ambitions!.list.find((entry) => entry.id === 'goals')!;
    expect(ambitionProgress(world, goals)).toMatchObject({
      value: 0,
      target: A.targets.goals,
      met: false,
    });
    const fame = world.career!.fame,
      xp = world.career!.xp;
    player(world).stats.goals = A.targets.goals;
    player(world).clubId = dream.id;
    ambitionsCheck(world);
    const achieved = world.career!.ambitions!.list.filter((entry) => entry.achieved);
    expect(achieved.map((entry) => entry.id).sort()).toEqual(['dream-club', 'goals']);
    expect(world.career!.fame).toBe(fame + 2 * A.reward.fame);
    expect(world.career!.xp).toBe(xp + 2 * A.reward.xp);
    const entries = world.chronicle.filter((entry) => entry.kind === 'ambition');
    expect(entries).toHaveLength(2);
    const messages = world.inbox.filter((message) => message.subjectKey === 'ambition-achieved');
    expect(messages).toHaveLength(2);
    // Read as sentences, with the ambition and the dream club named.
    const texts = entries.map((entry) => chronicleSentence(world, entry));
    expect(texts.join(' ')).toContain(dream.name);
    expect(texts.join(' ')).toContain(String(A.targets.goals));
    for (const message of messages) expect(messageText(message).body).not.toMatch(/[{}]/);
    // Nothing is paid twice, and an achieved ambition stays achieved.
    player(world).clubId = player(striker).clubId;
    ambitionsCheck(world);
    expect(world.career!.fame).toBe(fame + 2 * A.reward.fame);
    expect(world.chronicle.filter((entry) => entry.kind === 'ambition')).toHaveLength(2);
    expect(INBOX_KINDS).toContain('ambition-achieved');
    expect(honoursText.chronicle.entries.ambition).toBeTruthy();
  });

  it('keep achieved ambitions when the others change next season', () => {
    const world = clone(setAmbitions(striker, { ids: ['goals', 'caps'] }));
    player(world).stats.goals = A.targets.goals;
    ambitionsCheck(world);
    world.date = { ...world.date, season: world.date.season + 1 };
    const next = setAmbitions(world, { ids: ['appearances'] });
    const ids = next.career!.ambitions!.list.map((entry) => entry.id);
    expect(ids).toEqual(['goals', 'appearances']);
    expect(next.career!.ambitions!.list[0]!.achieved).not.toBeNull();
  });

  it('rank the career in the Hall of Fame as it stands, naming the next to pass', () => {
    let world = clone(striker);
    // Before anyone has played, every record is level at nothing.
    expect(liveHallOfFame(world).score).toBe(0);
    for (let week = 0; week < 4; week++) world = advanceCareerWeek(world, { autoPlay: true }).world;
    const standing = liveHallOfFame(world);
    expect(standing.score).toBe(careerHallOfFameScore(world));
    expect(standing).toMatchObject(hallOfFameRank(world, standing.score, player(world).id));
    expect(standing.next).not.toBeNull();
    expect(standing.next!.score).toBeGreaterThan(standing.score);
    expect(standing.next!.name.length).toBeGreaterThan(0);
    // A great career climbs.
    player(world).stats.goals = 400;
    player(world).stats.appearances = 600;
    expect(liveHallOfFame(world).rank).toBeLessThan(standing.rank);
    // The Hall of Fame ambition is met once inside the target.
    const set = setAmbitions(world, { ids: ['hall-of-fame'] });
    const ambition = set.career!.ambitions!.list[0]!;
    const progress = ambitionProgress(set, ambition);
    expect(progress.met).toBe(progress.value <= A.targets['hall-of-fame']);
  });

  it('check weekly as the season is played', () => {
    let world = clone(setAmbitions(striker, { ids: ['appearances'] }));
    player(world).stats.appearances = A.targets.appearances - 1;
    for (let week = 0; week < 6 && !world.career!.ambitions!.list[0]!.achieved; week++)
      world = advanceCareerWeek(world, { autoPlay: true }).world;
    // (The appearances were set by hand, so the world is not checked against its records.)
    expect(world.career!.ambitions!.list[0]!.achieved).not.toBeNull();
  }, 60000);

  it('name every ambition in words', () => {
    for (const id of AMBITION_IDS as AmbitionId[])
      expect(ambitionName(id, { club: 'Test FC' })).not.toMatch(/[{}]/);
  });
});
