import { beforeAll, describe, expect, it } from 'vitest';
import type { CareerMatchRecord, Injury, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { getSeasonWeeks } from '../src/engine/world/calendar';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { careerContract } from '../src/engine/career/market/rules';
import { developCareer } from '../src/engine/career/training';
import { playingShare } from '../src/engine/career/availability';
import { adjustRelationship } from '../src/engine/career/market/records';

const A = CONFIG.career.development.availability;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
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
  position: 'CM',
  foot: 'right',
  age: 17,
  archetype: 'box-to-box',
};

let career: World;
beforeAll(() => {
  const base = generateWorld('playing-time-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'playing-time-tests')[0]!;
  career = createCareer(base, draft, trial.id, 'playing-time-tests');
}, 120000);

const me = (world: World) => world.players[world.career!.playerId]!;
const entries = (world: World) => world.career!.availability ?? [];
/** Advance real weeks, playing any match the player is picked for, until `count` new fixtures. */
function fixtures(world: World, count: number, each?: (world: World) => void): World {
  const seen = new Set(entries(world).map((entry) => entry.fixtureId));
  let added = 0;
  let guard = 0;
  while (added < count && guard++ < 60) {
    each?.(world);
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    for (const entry of entries(world))
      if (!seen.has(entry.fixtureId)) {
        seen.add(entry.fixtureId);
        added++;
      }
  }
  return world;
}
/** Out of the side: a backup with no form, no trust and heavy legs. */
function drop(world: World): void {
  careerContract(world).role = 'backup';
  me(world).form = 0;
  me(world).fatigue = 90;
  const club = world.clubs[me(world).clubId!]!;
  adjustRelationship(world, 'manager', club.managerId, -100);
}

describe('playing time under development rules 2', () => {
  it('measures minutes over available fixtures: benching lowers it and playing restores it', () => {
    let world = clone(career);
    // A key player, fresh and trusted, plays.
    careerContract(world).role = 'key';
    world.career!.market.registeredFrom = { ...world.date };
    world = fixtures(world, A.fixtures, (w) => {
      me(w).fatigue = 0;
      me(w).form = 90;
    });
    const regular = playingShare(world);
    expect(entries(world).filter((e) => e.status === 'played').length).toBeGreaterThan(4);
    expect(regular).toBeGreaterThan(0.6);
    const appearances = world.career!.matches.length;

    // Dropped for a run of fixtures: the old appearances no longer hold the bonus up.
    world = fixtures(world, A.fixtures, drop);
    const benched = entries(world).slice(-A.fixtures);
    expect(benched.filter((e) => e.status === 'benched').length).toBeGreaterThanOrEqual(6);
    expect(playingShare(world)).toBeLessThan(0.3);
    // The original rules would still count the same last eight appearances.
    expect(world.career!.matches.length - appearances).toBeLessThanOrEqual(2);

    // Back in the side, it recovers.
    careerContract(world).role = 'key';
    const club = world.clubs[me(world).clubId!]!;
    adjustRelationship(world, 'manager', club.managerId, 100);
    world = fixtures(world, A.fixtures, (w) => {
      me(w).fatigue = 0;
      me(w).form = 90;
    });
    expect(playingShare(world)).toBeGreaterThan(0.6);
  }, 120000);

  it('skips injuries and weeks without fixtures', () => {
    let world = clone(career);
    careerContract(world).role = 'key';
    world = fixtures(world, A.fixtures, (w) => {
      me(w).fatigue = 0;
      me(w).form = 90;
    });
    const before = playingShare(world);
    // Injured for several fixtures: recorded, but not counted against the player.
    world = fixtures(world, 4, (w) => {
      const injury: Injury = {
        id: 'injury:test',
        playerId: me(w).id,
        kind: 'hamstring',
        started: { ...w.date },
        weeksRemaining: 10,
        severity: 2,
        reinjuryRisk: 0,
        recovery: 'rehab',
        careerThreatening: false,
        cause: 'training',
      };
      w.career!.injury ??= injury;
      w.career!.injury!.weeksRemaining = 10;
      me(w).injuryId = 'injury:test';
    });
    expect(
      entries(world)
        .slice(-4)
        .every((e) => e.status === 'injured'),
    ).toBe(true);
    expect(playingShare(world)).toBeCloseTo(before, 5);
    // A break with no fixtures leaves the share where it was.
    const idle = clone(world);
    idle.date.week = Math.min(getSeasonWeeks(idle), idle.date.week + 6);
    expect(playingShare(idle)).toBeCloseTo(before, 5);
    // A whole season later, nothing is recent: the neutral fallback applies.
    idle.date.season++;
    expect(playingShare(idle)).toBe(A.fallback);
  }, 120000);

  it('develops a benched player more slowly than one who plays', () => {
    const playing = clone(career);
    const benched = clone(career);
    const fill = (world: World, status: 'played' | 'benched') => {
      world.career!.availability = Array.from({ length: A.fixtures }, (_, index) => ({
        season: world.date.season,
        week: Math.max(1, world.date.week - index),
        fixtureId: `fixture:test:${index}`,
        status,
        minutes: status === 'played' ? 90 : 0,
      }));
    };
    fill(playing, 'played');
    fill(benched, 'benched');
    // The review's probe: the same eight full appearances, long ago, for both.
    for (const world of [playing, benched])
      world.career!.matches = Array.from({ length: 8 }, (_, index) => ({
        ...(world.career!.matches[0] ?? {}),
        fixtureId: `fixture:old:${index}`,
        season: world.date.season - 3,
        week: 10 + index,
        minutes: 90,
      })) as CareerMatchRecord[];
    const grow = (world: World) => {
      const report = { improved: [] as string[] };
      const player = me(world);
      const before = Object.values(player.attributes).reduce((s, v) => s + v, 0);
      const rng = createRng('playing-time-growth');
      for (let index = 0; index < 60; index++) developCareer(world, player, 18, rng, report);
      return Object.values(player.attributes).reduce((s, v) => s + v, 0) - before;
    };
    const played = grow(playing);
    const sat = grow(benched);
    expect(played).toBeGreaterThan(sat);
    expect(sat).toBeGreaterThan(0);
  });
});
