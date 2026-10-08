import { beforeAll, describe, expect, it } from 'vitest';
import type { ChronicleEntry, Moment, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { applyHonoursAction } from '../src/engine/career/honours/actions';
import { trimMoments } from '../src/engine/career/honours/moments';
import { trimAwards } from '../src/engine/career/honours/awards';
import { careerInvariants } from '../src/engine/career/invariants';
import { CONFIG } from '../src/engine/config';

/**
 * Phase 4.1: the invariants the endurance harness checks at every checkpoint hold through an
 * ordinary season, a retirement and a child career, and each one catches the defect it names.
 * The long national runs live in `npm run soak` (scripts/soak-career.ts), not here.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft = (name: string, parentLegacyId?: string): CareerDraft => ({
  name,
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
  ...(parentLegacyId ? { parentLegacyId } : {}),
});
function start(world: World, name: string, parent?: string): World {
  const club = trialOffers(world, 'country:0', `invariants:${name}`)[0]!;
  return createCareer(world, draft(name, parent), club.id, 'invariants');
}
let completed: World;
beforeAll(() => {
  let world = start(generateWorld('invariants', { format: 'legacy' }), 'Robin Vale');
  const historyBefore = world.history.length;
  while (world.phase === 'active') {
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    // Every week, not only at the end of the season.
    expect(careerInvariants(world)).toEqual([]);
  }
  expect(careerInvariants(world, { historyBefore })).toEqual([]);
  completed = world;
}, 120000);

describe('career invariants', () => {
  it('hold across a season, a retirement and the next generation', () => {
    let world = clone(completed);
    // Old enough to retire at this season's end, within the game's rules.
    const player = world.players[world.career!.playerId]!;
    player.birthSeason = world.date.season - CONFIG.career.honours.retirement.optionalAge;
    world = applyHonoursAction(world, { type: 'retire' });
    expect(world.career).toBeUndefined();
    expect(careerInvariants(world)).toEqual([]);
    world = startNextSeason(world);
    world = start(world, 'Sam Vale', world.legacies.at(-1)!.id);
    expect(world.career!.honours.parentLegacyId).toBe(world.legacies.at(-1)!.id);
    expect(careerInvariants(world)).toEqual([]);
    for (let week = 0; week < 4; week++)
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    expect(careerInvariants(world)).toEqual([]);
  }, 60000);

  it('catch each defect they name', () => {
    const broken = (change: (world: World) => void) => {
      const world = clone(completed);
      change(world);
      return careerInvariants(world).join('\n');
    };
    expect(broken((world) => world.career!.matches.push({ ...world.career!.matches[0]! }))).toMatch(
      /recorded twice/,
    );
    expect(broken((world) => (world.career!.market.finances.cash = -1))).toMatch(/cash is -1/);
    expect(broken((world) => (world.career!.matches.at(-1)!.goals += 1))).toMatch(/season goals/);
    expect(
      broken((world) => {
        const fixture = Object.values(world.fixtures).find(
          (entry) => entry.date.season === world.date.season,
        )!;
        delete world.results[fixture.id];
      }),
    ).toMatch(/unresolved|no result/);
    expect(
      broken((world) =>
        world.trophies.push({ ...(world.trophies[0] ?? fakeTrophy(world)) }, fakeTrophy(world)),
      ),
    ).toMatch(/recorded twice/);
    expect(
      broken((world) =>
        world.chronicle.push({
          ...world.chronicle[0]!,
          id: 'chronicle:x',
          momentId: 'moment:gone',
        }),
      ),
    ).toMatch(/missing moment/);
    expect(careerInvariants(clone(completed), { historyBefore: 5 }).join()).toMatch(/history grew/);
  });

  it('keep Chronicle entries pointing only at Moments that still exist', () => {
    const world = clone(completed);
    const playerId = world.career!.playerId;
    const limit = CONFIG.career.honours.moments.limit;
    world.moments = Array.from(
      { length: limit + 2 },
      (_, index) => ({ id: `moment:${index}`, playerId }) as Moment,
    );
    const linked = (id: string): ChronicleEntry => ({
      id: `chronicle:${id}`,
      playerId,
      date: { ...world.date },
      kind: 'moment',
      params: {},
      clubId: null,
      momentId: id,
    });
    world.chronicle = [linked('moment:0'), linked('moment:5')];
    const before = world.chronicle;
    trimMoments(world, playerId);
    expect(world.moments).toHaveLength(limit);
    expect(world.chronicle.map((entry) => entry.momentId)).toEqual([null, 'moment:5']);
    // Shared records are replaced, never edited.
    expect(before[0]!.momentId).toBe('moment:0');
    expect(careerInvariants(world).filter((line) => /moment/.test(line))).toEqual([]);
  });
});

describe('award records', () => {
  it('never drop an award a retired career names, even when it is the oldest', () => {
    const world = clone(completed);
    const player = world.players[world.career!.playerId]!;
    player.birthSeason = world.date.season - CONFIG.career.honours.retirement.optionalAge;
    const retired = applyHonoursAction(world, { type: 'retire' });
    const award = (id: string, winnerIds: string[]) =>
      ({ id, kind: 'month', season: 2026, month: 1, winnerIds }) as World['awards'][number];
    const legacy = retired.legacies.at(-1)!;
    legacy.awardIds = ['award:legacy'];
    retired.awards = [
      award('award:legacy', [legacy.playerId]),
      ...Array.from({ length: CONFIG.career.honours.awards.recordLimit }, (_, index) =>
        award(`award:other:${index}`, ['player:someone']),
      ),
    ];
    trimAwards(retired);
    expect(retired.awards).toHaveLength(CONFIG.career.honours.awards.recordLimit);
    expect(retired.awards[0]!.id).toBe('award:legacy');
    expect(retired.awards.some((entry) => entry.id === 'award:other:0')).toBe(false);
    expect(careerInvariants(retired).filter((line) => /missing award/.test(line))).toEqual([]);
  });
});

function fakeTrophy(world: World): World['trophies'][number] {
  return {
    id: `trophy:${world.date.season}:fake`,
    competitionId: 'fake',
    season: world.date.season,
    clubId: world.players[world.career!.playerId]!.clubId!,
    playerIds: [world.career!.playerId],
  } as World['trophies'][number];
}
