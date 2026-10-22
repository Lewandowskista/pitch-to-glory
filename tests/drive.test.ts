import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { careerDrive, driveKind } from '../src/engine/career/social/drive';
import { moraleParts } from '../src/engine/career/social/week';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 4, step 4.2: a revealed ambition becomes a stated preference (top-division
 * football by 24, regular football, or roots at one club) that moves morale.
 */
const D = CONFIG.career.social.morale.drive;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
let career: World;
beforeAll(() => {
  const base = generateWorld('drive-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'drive-tests')[0]!;
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
    'drive-tests',
  );
  for (let week = 0; week < 6; week++)
    career = advanceCareerWeek(career, { inPlace: true, autoPlay: true }).world;
}, 120000);

const me = (world: World) => world.players[world.career!.playerId]!;
/** The world with the player's ambition set and revealed. */
function wanting(ambition: number, revealed = true): World {
  const world = clone(career);
  me(world).hidden.ambition = ambition;
  me(world).hidden.revealed = revealed ? ['ambition'] : [];
  return world;
}

describe('ambition as a stated preference', () => {
  it('stays silent until the ambition is revealed', () => {
    const world = wanting(90, false);
    expect(careerDrive(world)).toBeNull();
    expect(moraleParts(world).ambition).toBe(0);
  });

  it('reads high, middling and low ambition as summit, regular football and roots', () => {
    expect(driveKind(D.summit.from)).toBe('summit');
    expect(driveKind(D.summit.from - 1)).toBe('starter');
    expect(driveKind(D.starter.from)).toBe('starter');
    expect(driveKind(D.starter.from - 1)).toBe('roots');
  });

  it('wants top-division football, growing restless past the age without it', () => {
    const world = wanting(90);
    const club = world.clubs[me(world).clubId!]!;
    const tier = world.leagues[club.leagueId]!.tier;
    expect(tier).toBeGreaterThan(1);
    // Young: patient.
    expect(careerDrive(world)!.value).toBe(0);
    // Two seasons past the age: unhappy, to the limit later.
    me(world).birthSeason = world.date.season - (D.summit.age + 2);
    expect(careerDrive(world)!.value).toBe(2 * D.summit.behind);
    me(world).birthSeason = world.date.season - (D.summit.age + 10);
    expect(careerDrive(world)!.value).toBe(-D.summit.limit);
    expect(moraleParts(world).ambition).toBe(-D.summit.limit);
    // In a top division: content.
    const top = Object.values(world.leagues).find((league) => league.tier === 1)!;
    club.leagueId = top.id;
    expect(careerDrive(world)).toMatchObject({ met: true, value: D.summit.met });
  });

  it('wants to be a regular, whatever the role', () => {
    const world = wanting(55);
    const selection = world.career!.market.selection;
    Object.assign(selection, { selected: 9, dropped: 1 });
    expect(careerDrive(world)!.value).toBe(D.starter.met);
    Object.assign(selection, { selected: 2, dropped: 8 });
    expect(careerDrive(world)!.value).toBe(D.starter.missed);
    Object.assign(selection, { selected: 1, dropped: 1 });
    expect(careerDrive(world)!.value).toBe(0);
  });

  it('values roots: settled after seasons at a club, unsettled by a move', () => {
    const world = wanting(20);
    // The first season at the club the career started at is not a move.
    expect(careerDrive(world)!.value).toBe(0);
    world.career!.startSeason = world.date.season - D.roots.settled;
    expect(careerDrive(world)!.value).toBe(D.roots.met);
    world.career!.market.moves.push({
      ...(world.career!.market.moves[0] ?? {}),
      kind: 'transfer',
      toClubId: me(world).clubId!,
      date: { ...world.date },
    } as never);
    expect(careerDrive(world)!.value).toBe(D.roots.moved);
  });

  it('keeps old morale records valid without the part', () => {
    const world = wanting(90);
    world.career!.social.morale = {
      target: 60,
      parts: { ...moraleParts(world) },
    };
    expect(() => validateWorld(clone(world))).not.toThrow();
    delete world.career!.social.morale.parts.ambition;
    expect(() => validateWorld(clone(world))).not.toThrow();
  });
});
