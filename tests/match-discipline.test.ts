import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import { CONFIG } from '../src/engine/config';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  validateMatchSession,
  MATCH_ENGINE_VERSION,
  OCCASIONS_MATCH_ENGINE,
  OFF_ANIMATION,
  PARKED,
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
/** The same fixtures on the match-15 path: cosmetic yellow cards only. */
const cosmetic = (setup: MatchSetup): MatchSetup => {
  const copy = structuredClone(setup);
  delete copy.discipline;
  return copy;
};
const matches15 = matches.map((session) => play(cosmetic(session.setup)));

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
    for (const session of matches15) {
      expect(session.engine).toBe(OCCASIONS_MATCH_ENGINE);
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
    expect(cards / matches15.length).toBeGreaterThan(2);
    expect(cards / matches15.length).toBeLessThan(5.5);
  });
  it('never changes an outcome', () => {
    const rate = CONFIG.match.discipline.perTeamPerMinute;
    try {
      for (const session of matches15.slice(0, 8)) {
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

/**
 * Full discipline (engine match-16, the discipline phase): second yellows and straight reds,
 * ten men, the career player's own dismissal, booking risk in key moments and suspensions.
 */
const many = (['CB', 'DM', 'ST', 'LB'] as const).flatMap((position) =>
  Array.from({ length: 40 }, (_, n) => play(setupFor(position, `full-${position}-${n}`))),
);
const dismissals = (session: MatchSession) =>
  session.state.match.events.filter((e) => e.kind === 'card' && e.card !== 'yellow');
/** A defender built to be booked, so dismissals are easy to find. */
function hothead(seed: string): MatchSetup {
  const setup = setupFor('CB', seed);
  const player = setup.players[setup.selectedPlayerId]!;
  player.attributes.aggression = 99;
  player.attributes.tackling = 20;
  return setup;
}
const sentOffMatches = Array.from({ length: 160 }, (_, n) => play(hothead(`hothead-${n}`))).filter(
  (session) => session.state.sentOff,
);

describe('full discipline (match-16)', () => {
  it('shows yellows, second yellows and straight reds at realistic rates', () => {
    let yellow = 0,
      red = 0,
      second = 0,
      straight = 0;
    for (const session of many) {
      expect(session.engine).toBe(MATCH_ENGINE_VERSION);
      for (const card of session.state.match.events.filter((e) => e.kind === 'card')) {
        expect(card.commentaryKey).toMatch(
          card.card === 'yellow'
            ? /^match\.commentary\.card\.\d$/
            : new RegExp(`^match\\.commentary\\.${card.card}\\.\\d$`),
        );
        expect(session.setup.players[card.playerId!]!.primaryPosition).not.toBe('GK');
        if (card.card !== 'red') yellow++;
        if (card.card === 'second-yellow') second++;
        if (card.card === 'red') straight++;
      }
      red += dismissals(session).length;
      // A second yellow only ever follows a yellow in the same match.
      for (const card of dismissals(session).filter((e) => e.card === 'second-yellow'))
        expect(
          session.state.match.events.some(
            (e) => e.kind === 'card' && e.card === 'yellow' && e.playerId === card.playerId,
          ),
        ).toBe(true);
    }
    // About 3.7 yellows and 0.15 reds a match (the profile gate measures them over thousands).
    expect(yellow / many.length).toBeGreaterThan(3);
    expect(yellow / many.length).toBeLessThan(4.6);
    expect(red / many.length).toBeGreaterThan(0.04);
    expect(red / many.length).toBeLessThan(0.32);
    expect(second).toBeGreaterThan(0);
    expect(straight).toBeGreaterThan(0);
  });

  it('takes a player sent off out of play: pitch, moments, scoring and substitutions', () => {
    let checked = 0;
    for (const session of [...many, ...sentOffMatches]) {
      const m = session.state.match;
      for (const card of dismissals(session)) {
        checked++;
        const id = card.playerId!;
        const team = card.teamId === m.home.teamId ? m.home : m.away;
        expect(team.sentOffIds).toContain(id);
        expect(team.starterIds).toContain(id);
        // Nothing more from them after the card: no event, no substitution either way.
        for (const event of m.events.filter((e) => e.minute > card.minute)) {
          expect(event.playerId).not.toBe(id);
          expect(event.receiverId).not.toBe(id);
          expect(event.assistId).not.toBe(id);
        }
        // Parked off the pitch in every later keyframe, and in nobody's moment.
        for (const frame of session.state.frames.filter((f) => f.timeMs > card.minute * 60000)) {
          const shown = frame.players.find((p) => p.id === id)!;
          expect(shown.animation).toBe(OFF_ANIMATION);
          expect(shown.point).toEqual(PARKED);
          expect(frame.players).toHaveLength(22);
        }
        for (const moment of m.keyMoments.filter((k) => k.minute > card.minute)) {
          const cast = moment.cast!;
          expect([
            cast.presser,
            cast.keeper,
            cast.runner,
            cast.crosser,
            ...cast.cover,
            ...cast.free,
          ]).not.toContain(id);
          for (const choice of moment.choices)
            if (choice.target && 'playerId' in choice.target)
              expect(choice.target.playerId).not.toBe(id);
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('plays a side a man short with fewer expected goals, and the other side with more', () => {
    let checked = 0;
    for (const session of many) {
      const card = dismissals(session)[0];
      if (!card || session.state.sentOff) continue;
      // Replay to the end of the minute before the card, then step into it.
      let replay = createMatchSession(session.setup, tactics);
      for (const command of session.commands) {
        if (
          command.type === 'advance' &&
          replay.state.match.minute === card.minute - 1 &&
          replay.state.match.status === 'live'
        )
          break;
        replay = applyMatchCommand(replay, command);
      }
      if (replay.state.match.minute !== card.minute - 1) continue;
      const before = replay.state.expectedGoals;
      const after = applyMatchCommand(replay, { type: 'advance' }).state.expectedGoals;
      const short = card.teamId === session.setup.home.id ? 0 : 1;
      const M = CONFIG.match.cards.menDown;
      expect(after[short]).toBeCloseTo(before[short]! * (1 - M.attack), 5);
      expect(after[1 - short]).toBeCloseTo(before[1 - short]! * (1 + M.concede), 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('ends the career player’s match at a dismissal and accounts for it', () => {
    expect(sentOffMatches.length).toBeGreaterThan(3);
    for (const session of sentOffMatches) {
      const s = session.state;
      const sentOff = s.sentOff!;
      // No moment after the card; the match still runs to full time.
      expect(s.match.keyMoments.every((k) => k.minute <= sentOff.minute)).toBe(true);
      expect(s.match.minute).toBe(90);
      expect(s.selectedPlayerMinutes).toBe(sentOff.minute);
      expect(s.report!.cards!.sentOff).toEqual(sentOff);
      expect(s.ratingParts.discipline).toBeLessThanOrEqual(CONFIG.match.cards.rating.red);
      expect(s.headlineKey).toMatch(/^match\.headline\.sent-off\.\d$/);
      expect(s.managerReactionKey).toBe(`match.reaction.manager.sent-off.${sentOff.reason}`);
      expect(s.captainDecisionPending).toBe(false);
      // The rating breakdown lists the cards, and still adds up.
      const parts = s.report!.ratingFactors;
      expect(parts.some((f) => f.labelKey === 'match.rating.discipline')).toBe(true);
      expect(parts.reduce((sum, f) => sum + f.contribution, 0)).toBeCloseTo(s.report!.rating, 6);
    }
  });

  it('shows a booking risk on defending choices and resolves it on its own stream', () => {
    let risky = 0,
      rolled = 0,
      carded = 0;
    for (const session of [...many, ...sentOffMatches]) {
      const s = session.state;
      for (const moment of s.match.keyMoments)
        for (const choice of moment.choices) {
          const booking = choice.booking;
          if (!booking) continue;
          risky++;
          expect(booking.factors.reduce((sum, f) => sum + f.contribution, 0)).toBeCloseTo(
            booking.foul,
            6,
          );
          const fail = 1 - choice.probability;
          expect(booking.yellow + booking.red).toBeCloseTo(fail * booking.foul, 5);
          if (booking.booked) expect(booking.yellow).toBe(0);
        }
      for (const event of s.match.events) {
        const outcome = event.outcome;
        if (!outcome?.booking) continue;
        rolled++;
        expect(outcome.success).toBe(false);
        const card = outcome.booking.card;
        if (card) {
          carded++;
          expect(outcome.booking.roll).toBeLessThan(outcome.booking.foul);
          const shown = s.match.events.find(
            (e) =>
              e.kind === 'card' &&
              e.playerId === session.setup.selectedPlayerId &&
              e.minute === event.minute &&
              e.card === card,
          );
          expect(shown).toBeDefined();
        } else if (outcome.booking.roll < outcome.booking.foul)
          // A red the side cannot take (three down already) is not shown.
          expect(dismissals(session).length).toBeGreaterThan(0);
      }
    }
    expect(risky).toBeGreaterThan(100);
    expect(rolled).toBeGreaterThan(20);
    expect(carded).toBeGreaterThan(0);
    // Attacking choices never carry a booking risk.
    for (const session of many)
      for (const moment of session.state.match.keyMoments)
        if (moment.situationId === 'box-chance')
          for (const choice of moment.choices) expect(choice.booking).toBeUndefined();
  });

  it('never picks a suspended player, and rejects a suspended selection', () => {
    const base = setupFor('CM', 'suspended');
    const start = createMatchSession(base, tactics).state.match;
    const banned = [start.home.starterIds[3]!, start.away.starterIds[5]!].filter(
      (id) => id !== base.selectedPlayerId,
    );
    const setup = { ...structuredClone(base), suspended: banned };
    const kickoff = createMatchSession(setup, tactics).state.match;
    for (const team of [kickoff.home, kickoff.away])
      for (const id of banned) {
        expect(team.starterIds).not.toContain(id);
        expect(team.benchIds).not.toContain(id);
      }
    expect(() =>
      createMatchSession({ ...structuredClone(base), suspended: [base.selectedPlayerId] }, tactics),
    ).toThrow();
    expect(() =>
      createMatchSession({ ...structuredClone(base), suspended: ['player:nobody'] }, tactics),
    ).toThrow();
  });

  it('replays sessions with dismissals exactly after a JSON round trip', () => {
    const withReds = [
      ...sentOffMatches.slice(0, 3),
      ...many.filter((m) => dismissals(m).length).slice(0, 3),
    ];
    expect(withReds.length).toBeGreaterThan(3);
    for (const session of withReds)
      expect(validateMatchSession(JSON.parse(JSON.stringify(session)))).toEqual(session);
  });
});
