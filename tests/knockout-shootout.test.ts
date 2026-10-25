import { describe, expect, it } from 'vitest';
import type { Position, TournamentFixture, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { autoPlayCommand, defaultTactics } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  sessionPenalties,
  validateMatchSession,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import {
  advanceTournament,
  openTournament,
  recordTournamentMatch,
} from '../src/engine/career/honours/international';
import {
  commitTournamentMatch,
  tournamentMatchSetup,
} from '../src/engine/career/honours/nationalMatch';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * 0.9.1 (M1): a level international knockout always has a winner, whether the career player
 * saw it out, was substituted or was sent off. A session the player left before the shootout
 * finishes without one; the commit draws it as the session would have, so the bracket goes on.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A 2026 tournament with the career player's nation through its group, at `stage`. */
function bracket(position: Position, stage: 'quarter' | 'final' = 'quarter') {
  const base = generateWorld(`knockout-${position}`, { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'knockout')[0]!;
  const world = createCareer(
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
      position,
      foot: 'right',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'knockout',
  );
  const live = openTournament(world, 2026)!;
  live.inSquad = true;
  live.starts = true;
  const nation = live.careerNationId!;
  // The career nation wins its group games; every other group game is drawn.
  const win = (fixture: TournamentFixture) => {
    fixture.matchId = `test:${fixture.id}`;
    fixture.score =
      fixture.homeId === nation ? [2, 0] : fixture.awayId === nation ? [0, 2] : [1, 1];
  };
  live.fixtures.forEach(win);
  live.round = 3;
  let pending = advanceTournament(world).pending!;
  while (pending.stage !== stage) {
    win(pending);
    pending = advanceTournament(world).pending!;
  }
  return { world, live, fixture: pending };
}

/**
 * The first seeded session of `setup` that ends level after extra time with the player off
 * the pitch in the way `off` asks.
 */
function levelWithout(
  world: World,
  setup: MatchSetup,
  tweak: (setup: MatchSetup) => void,
  off: (session: MatchSession) => boolean,
): MatchSession {
  for (let index = 0; index < 400; index++) {
    const copy = clone(setup);
    copy.seed = `${setup.seed}:${index}`;
    tweak(copy);
    let session = createMatchSession(copy, defaultTactics(world, copy));
    while (session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    const s = session.state;
    if (s.match.score[0] === s.match.score[1] && off(session)) return session;
  }
  throw new Error('No level session found');
}
const tired = (setup: MatchSetup) => {
  setup.players[setup.selectedPlayerId]!.fatigue = 60;
};
/** A defender built to be booked or taken off (as in match-discipline). */
const hothead = (setup: MatchSetup) => {
  const player = setup.players[setup.selectedPlayerId]!;
  player.attributes.aggression = 99;
  for (const key of ['tackling', 'positioning', 'decisions', 'composure', 'pace'] as const)
    player.attributes[key] = 20;
};
const substituted = (session: MatchSession) => session.state.substituted && !session.state.sentOff;
const sentOff = (session: MatchSession) => Boolean(session.state.sentOff);

/** Commit the session and check the tie has a winner, recorded the same way everywhere. */
function commitLevel(world: World, fixture: TournamentFixture, session: MatchSession) {
  const s = session.state;
  // Extra time was played, but the player was not there for a shootout kick.
  expect(s.regulation).toBeDefined();
  expect(s.shootout).toBeUndefined();
  expect(s.penalties).toBeUndefined();
  const owed = sessionPenalties(session)!;
  expect(Math.abs(owed[0] - owed[1])).toBe(1);
  const outcome = commitTournamentMatch(world, session);
  expect(fixture.penalties).toEqual(owed);
  const match = world.international!.matches.find((m) => m.id === outcome.internationalMatchId)!;
  expect(match.penalties).toEqual(owed);
  const own = fixture.homeId === world.international!.live!.careerNationId ? 0 : 1;
  expect(outcome.final.penalties).toEqual([owed[own], owed[1 - own]]);
  expect(outcome.record.decided).toBe('penalties');
  expect(outcome.record.result).toBe(owed[own]! > owed[1 - own]! ? 'win' : 'loss');
  // The session itself is untouched: it still replays to what was stored.
  expect(() => validateMatchSession(clone(session))).not.toThrow();
  return owed[0] > owed[1] ? fixture.homeId : fixture.awayId;
}
/**
 * The next round is drawn from real nations, the tie's winner among them: waiting for the
 * career player when their nation went through, or played out to the end when it went out.
 */
function expectNextRound(world: World, fixture: TournamentFixture, winnerId: string) {
  const state = world.international!;
  const nations = new Set(state.nations.map((n) => n.id));
  const live = state.live;
  if (live) {
    expect(winnerId).toBe(live.careerNationId);
    expect(live.round).toBe(5);
    const semis = live.fixtures.filter((f) => f.round === 5);
    expect(semis).toHaveLength(2);
    for (const f of semis) expect(nations.has(f.homeId) && nations.has(f.awayId)).toBe(true);
    expect(semis.some((f) => f.homeId === winnerId || f.awayId === winnerId)).toBe(true);
  } else {
    const tournament = state.tournaments.at(-1)!;
    expect(tournament.career!.stage).toBe('quarter');
    expect(nations.has(tournament.winnerId) && nations.has(tournament.runnerUpId)).toBe(true);
    // The knockout rounds (the group games were filled in by hand): four, two and the final.
    const played = state.matches.filter((m) => tournament.matchIds.includes(m.id));
    expect(played).toHaveLength(7);
    for (const m of played) expect(nations.has(m.homeId) && nations.has(m.awayId)).toBe(true);
    // The winner played on in the semi-final.
    expect(
      played.some(
        (m) =>
          m.id !== fixture.matchId && m.kind !== 'group' && [m.homeId, m.awayId].includes(winnerId),
      ),
    ).toBe(true);
  }
  expect(() => validateWorld(clone(world))).not.toThrow();
}

describe('a level international knockout without the career player', () => {
  it('settles the shootout for a tired striker taken off, and the bracket goes on', () => {
    const { world, fixture } = bracket('ST');
    const setup = tournamentMatchSetup(world, fixture);
    const session = levelWithout(world, setup, tired, substituted);
    const winner = commitLevel(world, fixture, session);
    advanceTournament(world);
    expectNextRound(world, fixture, winner);
  }, 60000);

  it('settles it for a struggling defender substituted', () => {
    const { world, fixture } = bracket('CB');
    const setup = tournamentMatchSetup(world, fixture);
    const session = levelWithout(world, setup, hothead, substituted);
    const winner = commitLevel(world, fixture, session);
    advanceTournament(world);
    expectNextRound(world, fixture, winner);
  }, 60000);

  it('settles it for a defender sent off', () => {
    const { world, fixture } = bracket('CB');
    const setup = tournamentMatchSetup(world, fixture);
    const session = levelWithout(world, setup, hothead, sentOff);
    const winner = commitLevel(world, fixture, session);
    advanceTournament(world);
    expectNextRound(world, fixture, winner);
  }, 60000);

  it('crowns a winner when the final is level and the player is off', () => {
    const { world, fixture } = bracket('ST', 'final');
    const setup = tournamentMatchSetup(world, fixture);
    const session = levelWithout(world, setup, tired, substituted);
    const winner = commitLevel(world, fixture, session);
    const { tournament } = advanceTournament(world);
    expect(tournament!.winnerId).toBe(winner);
    expect([fixture.homeId, fixture.awayId]).toContain(tournament!.runnerUpId);
    expect(tournament!.runnerUpId).not.toBe(winner);
    expect(world.international!.live).toBeNull();
    expect(tournament!.career!.stage).toBe(
      winner === tournament!.career!.nationId ? 'winner' : 'final',
    );
    expect(() => validateWorld(clone(world))).not.toThrow();
  }, 60000);

  it('repairs a bracket saved by 0.9.0 with the knockout left level', () => {
    const { world, fixture } = bracket('ST');
    const setup = tournamentMatchSetup(world, fixture);
    const session = levelWithout(world, setup, tired, substituted);
    commitTournamentMatch(world, session);
    // What 0.9.0 stored: the level score and no shootout. It still loads.
    fixture.penalties = null;
    const match = world.international!.matches.find((m) => m.id === fixture.matchId)!;
    match.penalties = null;
    const stored = clone(world);
    expect(() => validateWorld(clone(stored))).not.toThrow();
    // Played on, the tie is settled from the world's seed, the same way every time.
    const again = clone(stored);
    advanceTournament(world);
    advanceTournament(again);
    const settled = world.international!.live!.fixtures.find((f) => f.id === fixture.id)!;
    expect(settled.penalties).not.toBeNull();
    expect(Math.abs(settled.penalties![0] - settled.penalties![1])).toBe(1);
    expect(again.international!.live!.fixtures.find((f) => f.id === fixture.id)!.penalties).toEqual(
      settled.penalties,
    );
    expect(world.international!.matches.find((m) => m.id === fixture.matchId)!.penalties).toEqual(
      settled.penalties,
    );
    const winner = settled.penalties![0] > settled.penalties![1] ? fixture.homeId : fixture.awayId;
    expectNextRound(world, fixture, winner);
  }, 60000);

  it('refuses to record a level knockout without a shootout', () => {
    const { world, fixture } = bracket('ST');
    expect(() =>
      recordTournamentMatch(world, fixture, {
        id: 'test:level',
        date: { ...world.date },
        level: 'senior',
        kind: 'knockout',
        tournamentId: world.international!.live!.id,
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        score: [1, 1],
        penalties: null,
        career: null,
      }),
    ).toThrow();
    expect(fixture.matchId).toBeNull();
  });

  it('keeps the shootout the player took part in', () => {
    const { world, fixture } = bracket('ST');
    const setup = tournamentMatchSetup(world, fixture);
    for (let index = 0; index < 200; index++) {
      const copy = clone(setup);
      copy.seed = `${setup.seed}:kick:${index}`;
      let session = createMatchSession(copy, defaultTactics(world, copy));
      while (session.state.match.status !== 'finished')
        session = applyMatchCommand(session, autoPlayCommand(session));
      if (!session.state.shootout) continue;
      expect(sessionPenalties(session)).toEqual(session.state.penalties);
      commitTournamentMatch(world, session);
      expect(fixture.penalties).toEqual(session.state.penalties);
      return;
    }
    throw new Error('No shootout found');
  }, 60000);
});
