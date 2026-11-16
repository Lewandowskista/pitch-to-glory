import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { startNextSeason } from '../src/engine/world/simulate';
import { advanceCareerWeek } from '../src/engine/career/season';
import { qualifiedNations, qualifyingStandings } from '../src/engine/career/honours/international';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalCareerSeason } from './support/world';

/**
 * Review phase 3, step 3.3: in the season before a tournament, twenty-four nations play home
 * and away in six groups; the table decides who goes.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const finish = (input: World) => {
  let world = input;
  while (world.phase === 'active')
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  return world;
};

let opened: World;
let played: World;
// The season after the shared national career's first, played (the slow project).
beforeAll(async () => {
  opened = startNextSeason(await nationalCareerSeason());
  played = finish(clone(opened));
}, 600000);

describe('qualification over a national season', () => {
  it('plays two matchdays a window and qualifies sixteen nations by the table', () => {
    const qualifying = played.international!.qualifying!;
    expect(qualifying.played).toBe(6);
    expect(qualifying.fixtures.every((fixture) => fixture.score)).toBe(true);
    const qualified = qualifying.qualified!;
    expect(qualified).toEqual(qualifiedNations(qualifying));
    expect(new Set(qualified).size).toBe(16);
    for (const group of qualifying.groups) {
      const table = qualifyingStandings(qualifying, group);
      expect(table.every((row) => row.played === 6)).toBe(true);
      expect(qualified).toContain(table[0]!.nationId);
      expect(qualified).toContain(table[1]!.nationId);
      expect(qualified).not.toContain(table[3]!.nationId);
    }
    valid(played);
  });

  it('sends the qualifiers to the tournament', () => {
    const live = played.international!.live!;
    expect(live.year).toBe(played.international!.qualifying!.year);
    expect([...live.groups.flat()].sort()).toEqual(
      [...played.international!.qualifying!.qualified!].sort(),
    );
    // The career player's nation is in it only if it qualified.
    const own = played.international!.nations.find((n) => n.countryId === 'country:0')!;
    expect(live.careerNationId === own.id).toBe(
      played.international!.qualifying!.qualified!.includes(own.id),
    );
  });

  it('plays the career player’s qualifiers as their nation’s fixtures, with the same scores', () => {
    // A career player good enough for the senior side from the first window.
    const world = clone(opened);
    const player = world.players[world.career!.playerId]!;
    for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[])
      player.attributes[key] = 95;
    const done = finish(world);
    const qualifying = done.international!.qualifying!;
    const own = done.international!.matches.filter(
      (match) =>
        match.kind === 'qualifier' &&
        match.level === 'senior' &&
        match.date.season === done.date.season,
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.some((match) => match.career)).toBe(true);
    for (const match of own) {
      const fixture = qualifying.fixtures.find(
        (entry) => entry.homeId === match.homeId && entry.awayId === match.awayId,
      )!;
      expect(fixture.score).toEqual(match.score);
    }
    // Called up, they play their nation's qualifiers, not friendlies against anyone.
    expect(own.length).toBeLessThanOrEqual(6);
    valid(done);
  }, 300000);

  it('tells the story of a capped player’s campaign', () => {
    const world = clone(opened);
    world.career!.honours.caps.senior = Math.max(1, world.career!.honours.caps.senior);
    const done = finish(world);
    const entry = done.chronicle.find((item) => item.kind === 'qualifying');
    expect(entry).toBeDefined();
    const own = done.international!.nations.find((n) => n.countryId === 'country:0')!;
    expect(entry!.params.outcome).toBe(
      done.international!.qualifying!.qualified!.includes(own.id) ? 'qualified' : 'missed',
    );
    expect(
      done.inbox.some((message) =>
        ['qualified', 'missed-qualification'].includes(message.subjectKey),
      ),
    ).toBe(true);
  }, 300000);
});
