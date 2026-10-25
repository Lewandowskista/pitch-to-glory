import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { startNextSeason } from '../src/engine/world/simulate';
import { openQualifying } from '../src/engine/career/honours/international';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalCareerSeason } from './support/world';

/**
 * Review phase 3, step 3.3: in the season before a tournament, twenty-four nations play home
 * and away in six groups; the table decides who goes.
 */
const Q = CONFIG.career.honours.international.qualifying;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();

let first: World;
let opened: World;
// The shared national career after its first season, and the next season it opens
// (tests/support/world.ts). The qualifying season played: tests/qualifying.slow.test.ts.
beforeAll(async () => {
  first = await nationalCareerSeason();
  opened = startNextSeason(first);
}, 300000);

describe('qualification', () => {
  it('has no campaign before an odd season’s tournament-free summer', () => {
    // 2026 is followed by 2027: no tournament, so nothing to qualify for.
    expect(first.date.season % 2).toBe(0);
    expect(first.international!.qualifying ?? null).toBeNull();
  });

  it('opens with the season before a tournament: six seeded groups, home and away', () => {
    const qualifying = opened.international!.qualifying!;
    expect(qualifying.year).toBe(opened.date.season + 1);
    expect(qualifying.tournamentId).toBe(`tournament:${qualifying.year}`);
    expect(qualifying.groups).toHaveLength(Q.groups);
    const members = qualifying.groups.flat();
    expect(new Set(members).size).toBe(24);
    // Every world nation is in it, with eighteen guests of the tournament's kind.
    for (const nation of opened.international!.nations.filter((n) => n.countryId))
      expect(members).toContain(nation.id);
    expect(qualifying.fixtures).toHaveLength(Q.groups * 12);
    for (const group of qualifying.groups)
      for (const a of group)
        for (const b of group)
          if (a !== b)
            expect(
              qualifying.fixtures.filter((f) => f.homeId === a && f.awayId === b),
            ).toHaveLength(1);
    // A world saved before qualification gained its guests, and stays valid.
    expect(opened.international!.nations.length).toBeGreaterThan(26);
    valid(opened);
    // Opening again changes nothing.
    const again = clone(opened);
    expect(openQualifying(again)).toBeNull();
    expect(again.international!.qualifying).toEqual(qualifying);
  });
});
