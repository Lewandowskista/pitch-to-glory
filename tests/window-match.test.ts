import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  autoPlayCareerFixture,
  autoPlayCommand,
  defaultTactics,
} from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession } from '../src/engine/match';
import { pendingWindowFixture, windowWeeks } from '../src/engine/career/honours/international';
import { applyHonoursAction } from '../src/engine/career/honours/actions';
import { commitWindowMatch, windowMatchSetup } from '../src/engine/career/honours/nationalMatch';
import { matchSessionFor } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Version 0.9.0: a player who chooses to can play their senior side's window matches in the
 * match engine; the window waits for them, and whatever they leave is simulated with it.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let start: World;
beforeAll(() => {
  const base = generateWorld('window-match', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'window-match')[0]!;
  start = createCareer(
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
      position: 'ST',
      foot: 'right',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'window-match',
  );
  // A senior starter: the best striker the country has.
  const player = start.players[start.career!.playerId]!;
  for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[])
    player.attributes[key] = 95;
}, 300000);

/** Weeks up to the first window, club matches played by the headless policy. */
function toWindow(input: World): { world: World; stopped: string | null } {
  const world = clone(input);
  const window = windowWeeks(world)[0]!;
  while (world.date.week <= window && world.phase === 'active') {
    const step = advanceCareerWeek(world, { inPlace: true });
    if (!step.pendingFixtureId) continue;
    const fixture = world.fixtures[step.pendingFixtureId];
    if (fixture) autoPlayCareerFixture(world, fixture);
    else return { world, stopped: step.pendingFixtureId };
  }
  return { world, stopped: null };
}
const optedIn = () => applyHonoursAction(start, { type: 'play-internationals', on: true });
function play(world: World) {
  const fixture = pendingWindowFixture(world)!;
  const setup = windowMatchSetup(world, fixture);
  let session = createMatchSession(setup, defaultTactics(world, setup));
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, autoPlayCommand(session));
  return { fixture, session };
}

describe('window matches the player plays', () => {
  it('simulates windows as before when the player has not chosen to play them', () => {
    const { world, stopped } = toWindow(start);
    expect(stopped).toBeNull();
    expect(world.international!.window ?? null).toBeNull();
    expect(world.career!.honours.caps.senior).toBeGreaterThan(0);
  }, 300000);

  it('waits on the window week with the nation’s matches, home and away', () => {
    const { world, stopped } = toWindow(optedIn());
    const window = world.international!.window!;
    expect(window.week).toBe(windowWeeks(world)[0]);
    expect(world.date.week).toBe(window.week);
    expect(stopped).toBe(window.fixtures[0]!.id);
    expect(window.fixtures).toHaveLength(2);
    for (const fixture of window.fixtures)
      expect([fixture.homeId, fixture.awayId]).toContain(window.nationId);
    expect(() => validateWorld(clone(world))).not.toThrow();
    // Continue stops again until the match is played or simulated.
    expect(advanceCareerWeek(clone(world)).pendingFixtureId).toBe(window.fixtures[0]!.id);
  }, 300000);

  it('records a played match once, then simulates the rest of the window with the week', () => {
    const { world } = toWindow(optedIn());
    const caps = world.career!.honours.caps.senior;
    const { fixture, session } = play(world);
    // A saved session belongs to this world while the match waits.
    expect(matchSessionFor(world, clone(session))).not.toBeNull();
    const outcome = commitWindowMatch(world, session);
    const match = world.international!.matches.find(
      (entry) => entry.id === outcome.internationalMatchId,
    )!;
    expect(match.score).toEqual(session.state.match.score);
    expect(match.career!.rating).toBe(session.state.report!.rating);
    expect(fixture.matchId).toBe(match.id);
    expect(world.career!.honours.caps.senior).toBe(caps + 1);
    expect(() => commitWindowMatch(world, session)).toThrow();
    expect(() => validateWorld(clone(world))).not.toThrow();
    // The second match waits; the player has it simulated instead.
    const second = pendingWindowFixture(world)!;
    expect(second.id).not.toBe(fixture.id);
    const simulated = applyHonoursAction(world, { type: 'simulate-window' });
    expect(pendingWindowFixture(simulated)).toBeNull();
    // The week's club match came first, so the week is simulated now, the window with it.
    const after = advanceCareerWeek(clone(simulated));
    expect(after.pendingFixtureId).toBeNull();
    expect(after.world.international!.window ?? null).toBeNull();
    expect(after.world.career!.honours.caps.senior).toBeGreaterThanOrEqual(caps + 1);
    expect(after.world.callUps.at(-1)!.played).toBe(true);
    expect(
      after.world.international!.matches.filter((entry) => entry.date.week === world.date.week),
    ).toHaveLength(2);
  }, 300000);

  it('simulates a window already set out when the option is turned off', () => {
    const { world } = toWindow(optedIn());
    const off = applyHonoursAction(world, { type: 'play-internationals', on: false });
    expect(off.career!.honours.playInternationals).toBeUndefined();
    expect(pendingWindowFixture(off)).toBeNull();
    expect(world.international!.window!.simulate).toBe(false);
  }, 300000);
});
