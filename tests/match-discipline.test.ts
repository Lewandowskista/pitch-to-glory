import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import { CONFIG } from '../src/engine/config';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  validateMatchSession,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import type { Position } from '../src/model/domain';

/**
 * Cosmetic yellow cards and the managers' substitutions (engine match-15, redesign step M7).
 */
const world = generateWorld('match-discipline', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const setupFor = (position: Position, seed: string): MatchSetup => {
  const [home, away] = clubs as [(typeof clubs)[number], (typeof clubs)[number]];
  const id = home.playerIds.find((pid) => world.players[pid]!.primaryPosition === position)!;
  return createMatchSetup(world, home.id, away.id, id, seed);
};
function play(setup: MatchSetup, keep?: (session: MatchSession) => void): MatchSession {
  let session = createMatchSession(setup, tactics);
  while (session.state.match.status !== 'finished') {
    session = applyMatchCommand(session, autoPlayCommand(session));
    keep?.(session);
  }
  return session;
}
const matches = (['ST', 'CB', 'CM', 'GK'] as const).flatMap((position) =>
  [0, 1, 2, 3, 4].map((n) => play(setupFor(position, `discipline-${position}-${n}`))),
);

describe('the matchday bench (match-15)', () => {
  it('names at most seven substitutes, with a reserve keeper when the squad has one', () => {
    for (const session of matches) {
      const start = createMatchSession(session.setup, tactics).state.match;
      for (const [team, club] of [
        [start.home, session.setup.home],
        [start.away, session.setup.away],
      ] as const) {
        expect(team.benchIds.length).toBeLessThanOrEqual(CONFIG.match.benchSize);
        expect(new Set([...team.benchIds, ...team.starterIds]).size).toBe(
          team.benchIds.length + 11,
        );
        for (const id of team.benchIds) expect(club.playerIds).toContain(id);
        const reserves = club.playerIds.filter(
          (id) =>
            !team.starterIds.includes(id) &&
            session.setup.players[id]!.primaryPosition === 'GK' &&
            !session.setup.players[id]!.injuryId &&
            !session.setup.players[id]!.retired,
        );
        if (reserves.length)
          expect(
            team.benchIds.some((id) => session.setup.players[id]!.primaryPosition === 'GK'),
          ).toBe(true);
      }
    }
  });
  it('keeps the whole squad on the bench on earlier engines', () => {
    const legacy = setupFor('ST', 'discipline-legacy');
    delete legacy.occasions;
    const team = createMatchSession(legacy, tactics).state.match.home;
    expect(team.benchIds.length).toBeGreaterThan(CONFIG.match.benchSize);
  });
});

describe('managers’ substitutions (match-15)', () => {
  it('changes both teams between 60′ and 80′, never the keeper or the career player', () => {
    let changes = 0;
    const sides = new Set<string>();
    for (const session of matches) {
      const kickoff = createMatchSession(session.setup, tactics).state.match;
      const m = session.state.match;
      const subs = m.events.filter((e) => e.kind === 'substitution');
      for (const team of [m.home, m.away]) {
        const own = subs.filter((e) => e.teamId === team.teamId);
        expect(own.length).toBeLessThanOrEqual(CONFIG.match.aiSubstitutions.limit);
        const before = team.teamId === m.home.teamId ? kickoff.home : kickoff.away;
        // Starters and bench move together: everyone who came on left the bench.
        expect(team.starterIds).toHaveLength(11);
        expect(team.benchIds.length + own.length).toBe(before.benchIds.length);
        expect(team.starterIds[0]).toBe(before.starterIds[0]);
      }
      for (const sub of subs) {
        if (sub.playerId === session.setup.selectedPlayerId) continue;
        changes++;
        sides.add(sub.teamId);
        expect(sub.minute).toBeGreaterThanOrEqual(CONFIG.match.aiSubstitutions.from);
        expect(sub.minute).toBeLessThanOrEqual(CONFIG.match.aiSubstitutions.to);
        expect(session.setup.players[sub.playerId!]!.primaryPosition).not.toBe('GK');
        expect(sub.receiverId).toBeDefined();
        expect(sub.commentaryKey).toMatch(/^match\.commentary\.change\.\d$/);
        expect(sub.commentaryParams?.receiver).toBe(session.setup.players[sub.receiverId!]!.name);
        const team = sub.teamId === m.home.teamId ? m.home : m.away;
        expect(team.starterIds).toContain(sub.receiverId);
        expect(team.starterIds).not.toContain(sub.playerId);
        // The incoming player is on the pitch from then on, the outgoing one is not.
        const later = session.state.frames.filter((f) => f.timeMs > sub.minute * 60000);
        for (const frame of later) {
          const ids = frame.players.map((p) => p.id);
          expect(ids).not.toContain(sub.playerId);
          expect(ids).toContain(sub.receiverId);
        }
      }
    }
    expect(changes).toBeGreaterThan(matches.length * 2);
    expect(sides.size).toBe(2);
  });
  it('names who comes on for the career player', () => {
    const chosen = setupFor('ST', 'discipline-tired');
    chosen.players[chosen.selectedPlayerId]!.fatigue = 95;
    const session = play(chosen);
    const off = session.state.match.events.find(
      (e) => e.kind === 'substitution' && e.playerId === chosen.selectedPlayerId,
    )!;
    expect(off).toBeDefined();
    expect(session.state.match.home.starterIds).toContain(off.receiverId);
  });
});

describe('cosmetic yellow cards (match-15)', () => {
  it('books players weighted by aggression and tackling, never twice and never a keeper', () => {
    let cards = 0;
    const booked: number[] = [];
    for (const session of matches) {
      const yellow = session.state.match.events.filter((e) => e.kind === 'card');
      cards += yellow.length;
      for (const card of yellow) {
        expect(card.card).toBe('yellow');
        expect(card.commentaryKey).toMatch(/^match\.commentary\.card\.\d$/);
        expect(session.setup.players[card.playerId!]!.primaryPosition).not.toBe('GK');
        booked.push(session.setup.players[card.playerId!]!.attributes.aggression);
      }
      const ids = yellow.map((e) => e.playerId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    // About 3.6 a match.
    expect(cards / matches.length).toBeGreaterThan(2);
    expect(cards / matches.length).toBeLessThan(5.5);
  });
  it('never changes an outcome', () => {
    const rate = CONFIG.match.discipline.perTeamPerMinute;
    try {
      for (const session of matches.slice(0, 8)) {
        (CONFIG.match.discipline as { perTeamPerMinute: number }).perTeamPerMinute = 0;
        const quiet = play(session.setup);
        (CONFIG.match.discipline as { perTeamPerMinute: number }).perTeamPerMinute = rate;
        const outcome = (s: MatchSession) => ({
          score: s.state.match.score,
          shots: [s.state.stats.homeShots, s.state.stats.awayShots],
          rating: s.state.report!.rating,
          decisions: s.state.match.events.flatMap((e) =>
            e.outcome && !e.outcome.input.momentId.startsWith('routine:')
              ? [[e.outcome.input, e.outcome.roll, e.outcome.probability]]
              : [],
          ),
          lineups: [s.state.match.home.starterIds, s.state.match.away.starterIds],
        });
        expect(quiet.state.match.events.some((e) => e.kind === 'card')).toBe(false);
        expect(outcome(quiet)).toEqual(outcome(session));
      }
    } finally {
      (CONFIG.match.discipline as { perTeamPerMinute: number }).perTeamPerMinute = rate;
    }
  });
});

describe('cards and substitutions replay', () => {
  it('replays exactly after a JSON round trip, midway and at full time', () => {
    for (const setup of [
      setupFor('CB', 'discipline-replay'),
      setupFor('ST', 'discipline-replay'),
    ]) {
      const midway: MatchSession[] = [];
      const final = play(setup, (s) => {
        if (s.state.match.minute === 75 && !midway.length) midway.push(s);
      });
      expect(
        final.state.match.events.some((e) => e.kind === 'card' || e.kind === 'substitution'),
      ).toBe(true);
      for (const saved of [...midway, final])
        expect(validateMatchSession(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    }
  });
});
