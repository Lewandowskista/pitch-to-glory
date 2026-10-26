/**
 * Commentary and reactions (release 1.0, step 5.5; review findings M8 and M21): match-22 lines
 * with more variants, used without repeats within a match and by context; misses named as the
 * pitch draws them; routine passes folded into one feed row a spell; touchline reactions that
 * follow the match story. Match-21 keeps its keys (the outcome snapshot pins its sessions).
 */
import { describe, expect, it } from 'vitest';
import type { MatchEvent, Position } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  NARRATION_FAMILIES,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import {
  COMMENTARY_VARIANTS,
  CONTEXTS,
  NARRATION_VARIANTS_22,
  commentaryVariants,
  cycledVariant,
  narrationVariants,
} from '../src/engine/match/commentary';
import { CONFIG } from '../src/engine/config';
import { hasCommentaryLabel, spellCopy } from '../src/i18n/commentary';
import { hasNarrationLabel } from '../src/i18n/narration';
import { hasReportLabel } from '../src/i18n/matchReport';
import { buildFeed, isRoutine } from '../src/screens/match/feed';
import { feedLines } from '../src/screens/match/lines';
import { reactionKey, reactionStory } from '../src/screens/match/reportData';
import { onEngine, playOut, type Engine } from './support/engines';

const world = generateWorld('match-commentary', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
function setupFor(position: Position, index: number): MatchSetup {
  const [home, away] = index % 2 ? [clubs[1]!, clubs[0]!] : [clubs[0]!, clubs[1]!];
  const club = index % 2 ? clubs[1]! : clubs[0]!;
  const ids = club.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
  return createMatchSetup(world, home.id, away.id, ids[index % ids.length]!, `lines:${index}`);
}
const POSITIONS: Position[] = ['ST', 'CM', 'CB', 'GK'];
function played(engine: Engine): MatchSession[] {
  return POSITIONS.flatMap((position, p) =>
    [0, 1, 2].map((index) =>
      playOut(createMatchSession(onEngine(setupFor(position, p * 3 + index), engine), tactics)),
    ),
  );
}
const current = played('match-22');
const previous = played('match-21');
const familyOf = (key: string, prefix: string) => key.slice(prefix.length, key.lastIndexOf('.'));
const feed = (session: MatchSession) => {
  const lines = feedLines(session);
  return buildFeed(session.state.match.events, lines.text, () => undefined, [], {
    spell: lines.spell,
  });
};

describe('commentary copy', () => {
  it('has a line for every variant the engine can pick, and no more', () => {
    for (const [family, count] of Object.entries(COMMENTARY_VARIANTS)) {
      for (let variant = 0; variant < count; variant++)
        expect(hasCommentaryLabel(`match.commentary.${family}.${variant}`), family).toBe(true);
      expect(hasCommentaryLabel(`match.commentary.${family}.${count}`), family).toBe(false);
    }
    for (const contexts of Object.values(CONTEXTS))
      for (const { family } of contexts) expect(COMMENTARY_VARIANTS[family], family).toBeDefined();
    for (const family of NARRATION_FAMILIES) {
      const count = narrationVariants(family);
      for (let variant = 0; variant < count; variant++)
        expect(hasNarrationLabel(`match.narration.${family}.${variant}`), family).toBe(true);
      expect(hasNarrationLabel(`match.narration.${family}.${count}`), family).toBe(false);
    }
    for (const family of Object.keys(NARRATION_VARIANTS_22))
      expect(NARRATION_FAMILIES as readonly string[]).toContain(family);
  });
  it('gives at least eight variants to the lines a player sees most', () => {
    for (const family of [
      'attempt',
      'attempt-held',
      'attempt-parried',
      'attempt-wide',
      'attempt-over',
      'attempt-blocked',
      'chance',
      'counter',
      'card',
      'change',
      'halftime-lead',
      'pass.success',
      'through.success',
      'cross.success',
      'shot.failure',
      'placed.failure',
      'parry.success',
      'catch.success',
      'line.success',
      'block.success',
      'corner.success',
      'tackle.success',
    ])
      expect(commentaryVariants(family), family).toBeGreaterThanOrEqual(8);
    expect(spellCopy.one.length + spellCopy.several.length).toBeGreaterThanOrEqual(16);
    expect(spellCopy.mixed.length).toBeGreaterThanOrEqual(8);
  });
});

describe('picking a line (match-22)', () => {
  it('uses every variant once before any repeats, never twice in a row', () => {
    for (const count of [2, 3, 4, 8, 12]) {
      for (const stream of ['a', 'b', 'c']) {
        const picks = Array.from({ length: count * 3 }, (_, uses) =>
          cycledVariant(stream, count, uses),
        );
        for (let cycle = 0; cycle < 3; cycle++)
          expect(new Set(picks.slice(cycle * count, (cycle + 1) * count)).size).toBe(count);
        for (let index = 1; index < picks.length; index++)
          expect(picks[index]).not.toBe(picks[index - 1]);
        expect(cycledVariant(stream, count, 5)).toBe(picks[5]);
      }
    }
  });
  it('repeats no line of a family within a match until the family has used them all', () => {
    for (const session of current) {
      const seen = new Map<string, string[]>();
      const note = (family: string, key: string) =>
        seen.set(family, [...(seen.get(family) ?? []), key]);
      for (const event of session.state.match.events)
        note(`c:${familyOf(event.commentaryKey, 'match.commentary.')}`, event.commentaryKey);
      for (const line of session.state.narration)
        note(`n:${familyOf(line.key, 'match.narration.')}`, line.key);
      for (const [family, keys] of seen) {
        const name = family.slice(2);
        const count = family.startsWith('c:') ? commentaryVariants(name) : narrationVariants(name);
        const first = keys.slice(0, count);
        expect(new Set(first).size, family).toBe(first.length);
      }
    }
  });
  it('names how a shot outside the player’s choices was missed, and keeps match-21’s keys', () => {
    let missed = 0;
    for (const session of current) {
      const events = session.state.match.events;
      events.forEach((event, index) => {
        if (!event.commentaryKey.startsWith('match.commentary.attempt-')) return;
        missed++;
        expect(event.kind).toBe('shot');
        // A missed shot is never followed by its goal.
        const next = events[index + 1];
        expect(next?.kind === 'goal' && next.playerId === event.playerId).toBe(false);
      });
    }
    expect(missed).toBeGreaterThan(current.length * 5);
    for (const session of previous) {
      for (const event of session.state.match.events) {
        expect(event.commentaryKey).not.toMatch(/attempt-|card-|change-|halftime-|applauded/);
        const variant = Number(event.commentaryKey.split('.').pop());
        if (!Number.isNaN(variant)) expect(variant).toBeLessThan(CONFIG.match.commentaryVariants);
      }
      for (const line of session.state.narration)
        expect(Number(line.key.split('.').pop())).toBeLessThan(4);
    }
  });
  it('names each missed shot as its result has it (step 5.3 changed the results)', () => {
    const results: Record<string, string> = {
      held: 'saved',
      'held-late': 'saved',
      parried: 'saved',
      wide: 'off-target',
      'wide-late': 'off-target',
      over: 'off-target',
      blocked: 'blocked',
      woodwork: 'woodwork',
    };
    for (const session of current)
      for (const event of session.state.match.events) {
        const family = event.commentaryKey.split('.')[2]!;
        if (event.kind === 'shot' && family.startsWith('attempt-'))
          expect(event.shotResult, family).toBe(results[family.slice('attempt-'.length)]);
      }
    for (const session of previous)
      expect(session.state.match.events.some((event) => event.shotResult)).toBe(false);
  });
});

describe('the live feed (step 5.5)', () => {
  it('fills every name, and folds routine passes and scored shots', () => {
    for (const session of [...current, ...previous]) {
      const rows = feed(session);
      const events = session.state.match.events;
      const routine = events.filter(isRoutine);
      const spells = rows.filter((row) => row.spell);
      expect(rows.some((row) => row.event && isRoutine(row.event))).toBe(false);
      expect(spells.reduce((sum, row) => sum + row.spell!.events.length, 0)).toBe(routine.length);
      for (const row of rows) expect(row.text, row.template).not.toMatch(/[{}]/);
      // A goal tells its own shot: no row for a shot that went in (outside the player's moments).
      events.forEach((event, index) => {
        const next = events[index + 1];
        if (event.kind === 'shot' && !event.outcome && next?.kind === 'goal')
          expect(rows.some((row) => row.id === event.id)).toBe(false);
      });
    }
  });
  it('keeps any sentence to three a match', () => {
    for (const session of current) {
      const counts = new Map<string, number>();
      for (const row of feed(session))
        counts.set(row.template!, (counts.get(row.template!) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    }
  });
  it('groups a spell of passes into one row, at its last pass', () => {
    const pass = (id: string, minute: number, success = true): MatchEvent => ({
      id,
      minute,
      kind: 'pass',
      playerId: 'p',
      teamId: 'home',
      point: { x: 50, y: 50 },
      commentaryKey: 'match.commentary.routine.success.0',
      outcome: {
        input: { momentId: `routine:${minute}`, choiceId: 'pass' },
        success,
        roll: 0.2,
        probability: 0.8,
        factors: [],
      },
    });
    const other = (id: string, minute: number, kind: MatchEvent['kind']): MatchEvent => ({
      ...pass(id, minute),
      kind,
      playerId: kind === 'goal' || kind === 'shot' ? 's' : 'p',
      commentaryKey: id,
      outcome: null,
    });
    const rows = buildFeed(
      [
        pass('a', 1),
        pass('b', 2, false),
        pass('c', 4),
        other('shot', 5, 'shot'),
        pass('d', 6),
        other('s2', 8, 'shot'),
        other('g', 8, 'goal'),
      ],
      (event) => event.commentaryKey,
      () => undefined,
      [{ id: 'n', minute: 8, text: 'Build-up', eventId: 's2' }],
      { spell: (spell) => ({ text: `${spell.events.length}/${spell.lost}` }) },
    );
    expect(rows.map((row) => [row.id, row.text])).toEqual([
      ['g', 'g'],
      ['line:n', 'Build-up'],
      ['spell:d', '1/0'],
      ['shot', 'shot'],
      ['spell:a', '3/1'],
    ]);
    expect(rows[4]!.minute).toBe(4);
  });
});

describe('touchline reactions (step 5.5)', () => {
  const base = current.find((session) => !session.state.sentOff && !session.state.substituted)!;
  const own = base.setup.players[base.setup.selectedPlayerId]!.clubId!;
  const them = own === base.setup.home.id ? base.setup.away.id : base.setup.home.id;
  const goal = (team: string, minute: number): MatchEvent => ({
    id: `goal:${team}:${minute}`,
    minute,
    kind: 'goal',
    playerId: null,
    teamId: team,
    point: { x: 50, y: 50 },
    commentaryKey: 'match.commentary.goal.0',
    outcome: null,
  });
  const story = (...goals: MatchEvent[]) =>
    reactionStory({
      ...base,
      state: { ...base.state, match: { ...base.state.match, events: goals } },
    });
  it('reads the story of the match from its goals', () => {
    expect(story(goal(them, 10), goal(own, 50), goal(own, 70))).toBe('comeback');
    expect(story(goal(own, 10), goal(them, 50), goal(own, 88))).toBe('late-winner');
    expect(story(goal(them, 30), goal(own, 89))).toBe('late-equaliser');
    expect(story(goal(own, 30), goal(them, 60), goal(them, 87))).toBe('late-defeat');
    expect(story(goal(them, 5), goal(them, 20), goal(them, 60))).toBe('heavy-defeat');
    expect(story(goal(own, 5), goal(own, 20), goal(own, 60))).toBe('thrashing');
    expect(story(goal(own, 30), goal(own, 60))).toBe(
      ['GK', 'CB', 'LB', 'RB'].includes(
        base.setup.players[base.setup.selectedPlayerId]!.primaryPosition,
      )
        ? 'clean-sheet'
        : undefined,
    );
    expect(story(goal(own, 30), goal(them, 60))).toBeUndefined();
  });
  it('has lines for every story, and quotes the engine’s key otherwise', () => {
    for (const kind of [
      'late-winner',
      'comeback',
      'late-equaliser',
      'late-defeat',
      'heavy-defeat',
      'thrashing',
      'clean-sheet',
    ]) {
      expect(hasReportLabel(`match.reaction.fans.story.${kind}`)).toBe(true);
      for (const tone of ['good', 'poor'])
        expect(hasReportLabel(`match.reaction.manager.story.${kind}.${tone}`)).toBe(true);
    }
    for (const session of current) {
      const kind = reactionStory(session);
      const manager = reactionKey(session, 'manager');
      expect(hasReportLabel(manager)).toBe(true);
      if (session.state.sentOff || !kind) expect(manager).toBe(session.state.managerReactionKey);
      else expect(manager).toContain(`.story.${kind}.`);
    }
  });
});

describe('the most frequent lines stay fresh over a season', () => {
  it('replays a commentary key exactly from the session', () => {
    const session = current[0]!;
    const replayed = playOut(createMatchSession(session.setup, tactics));
    expect(replayed.state.match.events.map((e) => e.commentaryKey)).toEqual(
      session.state.match.events.map((e) => e.commentaryKey),
    );
    // The headless player and an explicit command loop agree.
    let again = createMatchSession(session.setup, tactics);
    while (again.state.match.status !== 'finished')
      again = applyMatchCommand(again, autoPlayCommand(again));
    expect(again.state.narration.map((line) => line.key)).toEqual(
      session.state.narration.map((line) => line.key),
    );
  });
});
