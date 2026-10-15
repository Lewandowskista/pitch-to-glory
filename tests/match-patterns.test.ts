import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  attacksRightAt,
  createMatchSession,
  createMatchSetup,
  validateMatchSession,
  CUT_FAMILIES,
  NARRATION_FAMILIES,
  NARRATION_VARIANTS,
  OutdatedMatchSessionError,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { FORMATION_SLOTS, formationOf, type SlotRole } from '../src/engine/selection/formations';
import { hasNarrationLabel, narrationFeed, narrationName } from '../src/i18n/narration';
import type { Beat, PatternId, Point, Position, ReplayFrame } from '../src/model/domain';

/**
 * The pattern library and narration (engine match-14, redesign steps M2 and M3): build-up
 * follows recognisable moves (wing play, overlaps, switches, balls in behind, counters,
 * cut-backs, long balls, recycling) whose steps make football sense, and narration turns them
 * into lines that name the right players. Neither may change an outcome (see the outcome
 * snapshot).
 */
const world = generateWorld('match-patterns', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 6);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const PASSES = new Set(['pass', 'cross', 'switch', 'through', 'long', 'cutback']);
const PATTERNS: PatternId[] = [
  'wing-play',
  'overlap',
  'switch',
  'through-ball',
  'counter',
  'cut-back',
  'long-ball',
  'recycle',
];
const WIDE_ROLES: SlotRole[] = [
  'wide-left',
  'wide-right',
  'left-back',
  'right-back',
  'left-mid',
  'right-mid',
];

interface Passage {
  frames: ReplayFrame[];
  minute: number;
  session: MatchSession;
}
function setupAt(position: Position, index: number): MatchSetup {
  const home = clubs[index % clubs.length]!,
    away = clubs[(index + 1) % clubs.length]!;
  const ids = home.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
  return createMatchSetup(
    world,
    home.id,
    away.id,
    ids[index % ids.length]!,
    `patterns-${position}-${index}`,
  );
}
function play(setup: MatchSetup) {
  let session = createMatchSession(setup, tactics);
  const passages: Passage[] = [];
  const midway: MatchSession[] = [];
  while (session.state.match.status !== 'finished') {
    const before = session.state.motion;
    session = applyMatchCommand(session, autoPlayCommand(session));
    if (session.state.motion !== before)
      passages.push({
        frames: session.state.motion.frames,
        minute: session.state.match.minute,
        session,
      });
    if (session.state.match.minute === 30 && midway.length === 0) midway.push(session);
  }
  return { session, passages, midway };
}
const POSITIONS: Position[] = ['ST', 'LW', 'AM', 'CM', 'DM', 'LB', 'CB', 'GK'];
const matches = POSITIONS.flatMap((position) =>
  [0, 1, 2].map((index) => ({ position, ...play(setupAt(position, index)) })),
);
const sideOf = (session: MatchSession, id: string) =>
  session.setup.home.playerIds.includes(id) ? 0 : 1;
function spotOf(side: number, minute: number, point: Point) {
  return attacksRightAt(side, minute)
    ? { d: point.x, w: point.y }
    : { d: 100 - point.x, w: 100 - point.y };
}
const flankOf = (w: number) => (w < 100 / 3 ? 'left' : w > 200 / 3 ? 'right' : 'centre');
/** A player's slot role in the passage's line-ups. */
function roleOf(session: MatchSession, id: string): SlotRole | undefined {
  const m = session.state.match;
  for (const team of [m.home, m.away]) {
    const slot = team.starterIds.indexOf(id);
    if (slot >= 0) return FORMATION_SLOTS[formationOf(team.formation)][slot]?.role;
  }
  return undefined;
}
interface Seen {
  beat: Beat;
  frame: ReplayFrame;
  before: ReplayFrame;
  index: number;
  passage: Passage;
}
function beats(passages: Passage[]): Seen[] {
  const out: Seen[] = [];
  for (const passage of passages)
    passage.frames.forEach((frame, index) => {
      if (index && frame.beat)
        out.push({ beat: frame.beat, frame, before: passage.frames[index - 1]!, index, passage });
    });
  return out;
}
const all = matches.flatMap((match) => beats(match.passages).map((seen) => ({ ...seen, match })));

describe('match patterns', { timeout: 180000 }, () => {
  it('plays every pattern across a sample of matches', () => {
    const counts = new Map<PatternId, number>();
    for (const { beat } of all)
      if (beat.pattern) counts.set(beat.pattern, (counts.get(beat.pattern) ?? 0) + 1);
    for (const pattern of PATTERNS) expect(counts.get(pattern) ?? 0).toBeGreaterThan(10);
  });
  it('crosses in wing play come from a wide player in the final third into the box', () => {
    let crosses = 0;
    for (const { beat, before, frame, passage } of all) {
      if (beat.kind !== 'cross' || !['wing-play', 'overlap', 'switch'].includes(beat.pattern!))
        continue;
      crosses++;
      expect(beat.zone).toBe('final');
      expect(beat.flank).not.toBe('centre');
      expect(WIDE_ROLES).toContain(roleOf(passage.session, beat.actorId));
      const side = sideOf(passage.session, beat.actorId);
      const to = spotOf(side, passage.minute, frame.ball);
      expect(to.d).toBeGreaterThanOrEqual(80);
      expect(Math.abs(to.w - 50)).toBeLessThanOrEqual(25);
      expect(spotOf(side, passage.minute, before.ball).d).toBeGreaterThan(200 / 3);
    }
    expect(crosses).toBeGreaterThan(50);
  });
  it('plays balls in behind forward, beyond the defensive line as it stood', () => {
    let throughs = 0;
    for (const { beat, before, frame, passage } of all) {
      if (beat.kind !== 'through' || !beat.receiverId || !beat.pattern) continue;
      throughs++;
      const side = sideOf(passage.session, beat.actorId);
      const from = spotOf(side, passage.minute, before.ball);
      const to = spotOf(side, passage.minute, frame.ball);
      expect(to.d).toBeGreaterThan(from.d);
      // The second-last defender when the ball was played.
      const line = before.players
        .filter((player) => sideOf(passage.session, player.id) !== side)
        .map((player) => spotOf(side, passage.minute, player.point).d)
        .sort((a, b) => b - a)[1]!;
      expect(to.d).toBeGreaterThan(line);
    }
    expect(throughs).toBeGreaterThan(20);
  });
  it('switches the play from one flank to the other', () => {
    let switches = 0;
    for (const { beat, before, frame, passage } of all) {
      if (beat.kind !== 'switch' || beat.pattern !== 'switch') continue;
      switches++;
      const side = sideOf(passage.session, beat.actorId);
      const from = flankOf(spotOf(side, passage.minute, before.ball).w);
      const to = flankOf(spotOf(side, passage.minute, frame.ball).w);
      expect(to).not.toBe(from);
      expect(to).not.toBe('centre');
    }
    expect(switches).toBeGreaterThan(20);
  });
  it('pulls cut-backs back from the byline to the penalty spot area', () => {
    let cutbacks = 0;
    for (const { beat, before, frame, passage } of all) {
      if (beat.kind !== 'cutback' || !beat.pattern) continue;
      cutbacks++;
      const side = sideOf(passage.session, beat.actorId);
      const from = spotOf(side, passage.minute, before.ball);
      const to = spotOf(side, passage.minute, frame.ball);
      expect(from.d).toBeGreaterThanOrEqual(85);
      expect(to.d).toBeLessThan(from.d);
      expect(to.d).toBeGreaterThanOrEqual(72);
      expect(Math.abs(to.w - 50)).toBeLessThanOrEqual(25);
      expect(frame.ballMotion).toBe('ground');
    }
    expect(cutbacks).toBeGreaterThan(20);
  });
  it('counters with at most two passes from the regain', () => {
    let counters = 0;
    for (const { passages } of matches)
      for (const passage of passages) {
        let passes = -1;
        passage.frames.forEach((frame, index) => {
          const beat = index ? frame.beat : undefined;
          if (beat?.pattern === 'counter') {
            if (passes < 0) {
              counters++;
              passes = 0;
            }
            if (PASSES.has(beat.kind)) passes++;
            expect(passes).toBeLessThanOrEqual(2);
          } else passes = -1;
        });
      }
    expect(counters).toBeGreaterThan(10);
  });
  it('heads only crosses, and scores headers from a wide player’s cross', () => {
    let headers = 0,
      headerGoals = 0;
    for (const { passages, session } of matches) {
      const seen = beats(passages);
      const goals = new Set(
        session.state.match.events.filter((e) => e.kind === 'goal').map((e) => e.id),
      );
      seen.forEach(({ beat }, index) => {
        if (beat.kind !== 'header') return;
        headers++;
        const cross = seen[index - 1]!;
        expect(cross.beat.kind).toBe('cross');
        expect(cross.beat.receiverId).toBe(beat.actorId);
        expect(cross.beat.flank).not.toBe('centre');
        // A header is met in the air.
        expect(cross.frame.ballMotion).toBe('air');
        const celebration = seen[index + 1]?.beat;
        if (celebration?.kind === 'celebration' && goals.has(celebration.eventId!)) headerGoals++;
      });
    }
    expect(headers).toBeGreaterThan(30);
    expect(headerGoals).toBeGreaterThan(3);
  });
  it('scores from balls in behind after a run beyond the line', () => {
    let goals = 0;
    for (const { passages } of matches) {
      const seen = beats(passages);
      seen.forEach(({ beat }, index) => {
        if (beat.kind !== 'celebration') return;
        // Strike, then back through the scorer's carry to the ball that set them up.
        const shot = seen[index - 1]!.beat;
        for (let k = index - 2; k >= Math.max(0, index - 3); k--) {
          const previous = seen[k]!.beat;
          if (previous.kind === 'through' && previous.receiverId === shot.actorId) {
            goals++;
            expect(previous.pattern).toMatch(/through-ball|counter/);
            break;
          }
          if (previous.actorId !== shot.actorId) break;
        }
      });
    }
    expect(goals).toBeGreaterThan(0);
  });
});

describe('match narration', { timeout: 180000 }, () => {
  it('narrates moves with real players on the right teams', () => {
    const PATTERN_IDS = new Set<string>(PATTERNS);
    for (const { session } of matches) {
      const events = new Map(session.state.match.events.map((e) => [e.id, e]));
      const lines = session.state.narration;
      expect(lines.length).toBeGreaterThan(5);
      // Sparse: a few dozen lines a match, not one per pass.
      expect(lines.length).toBeLessThan(70);
      let minute = 0;
      for (const line of lines) {
        expect(hasNarrationLabel(line.key)).toBe(true);
        expect(line.minute).toBeGreaterThanOrEqual(minute);
        minute = line.minute;
        const family = line.key.split('.').slice(2, -1).join('.');
        const { player, receiver, flank, zone, post, pattern } = line.params;
        expect(session.setup.players[player!]).toBeDefined();
        if (receiver) {
          expect(session.setup.players[receiver]).toBeDefined();
          const cut = (CUT_FAMILIES as readonly string[]).includes(family);
          expect(sideOf(session, receiver) === sideOf(session, player!)).toBe(!cut);
        }
        if (flank) expect(['left', 'right', 'centre']).toContain(flank);
        if (zone) expect(['def', 'mid', 'final']).toContain(zone);
        if (post) expect(['near', 'far']).toContain(post);
        if (family.startsWith('cross.header')) expect(family.endsWith(post!)).toBe(true);
        expect(PATTERN_IDS.has(pattern!)).toBe(true);
        if (line.eventId) {
          const event = events.get(line.eventId);
          expect(event).toBeDefined();
          expect(event!.minute).toBe(line.minute);
        }
      }
    }
  });
  it('ties a move’s lines to the shot it creates, describing the right players', () => {
    let tied = 0;
    for (const { passages } of matches)
      for (const passage of passages) {
        const session = passage.session;
        const start = session.state.motion.narrationStart!;
        const events = new Map(session.state.match.events.map((e) => [e.id, e]));
        for (const line of session.state.narration.slice(start)) {
          const beat = passage.frames[line.frame]?.beat;
          expect(beat).toBeDefined();
          const family = line.key.split('.').slice(2, -1).join('.');
          if ((CUT_FAMILIES as readonly string[]).includes(family)) {
            // The passer had the ball; the player who cut it out won it.
            expect(passage.frames[line.frame - 1]!.carrierId).toBe(line.params.player);
            expect(beat!.actorId).toBe(line.params.receiver);
          } else {
            expect(beat!.actorId).toBe(line.params.player);
            if (line.params.receiver) expect(beat!.receiverId).toBe(line.params.receiver);
          }
          if (
            family.startsWith('cross.header') ||
            family === 'cross.shot' ||
            family === 'cutback.shot'
          ) {
            tied++;
            const shot = events.get(line.eventId!)!;
            expect(shot.kind).toBe('shot');
            expect(shot.playerId).toBe(line.params.receiver);
            if (family.startsWith('cross.header')) expect(shot.action).toBe('header');
          }
        }
      }
    expect(tied).toBeGreaterThan(30);
  });
  it('uses every narration family with copy for every variant', () => {
    const used = new Set<string>();
    for (const { session } of matches)
      for (const line of session.state.narration)
        used.add(line.key.split('.').slice(2, -1).join('.'));
    for (const family of NARRATION_FAMILIES)
      for (let variant = 0; variant < NARRATION_VARIANTS; variant++)
        expect(hasNarrationLabel(`match.narration.${family}.${variant}`)).toBe(true);
    // The common families all appear in a sample of matches.
    for (const family of [
      'cross.header.far',
      'cross.shot',
      'cutback.shot',
      'through',
      'switch',
      'recycle',
    ])
      expect(used).toContain(family);
  });
  it('is deterministic and replays exactly after a JSON round trip', () => {
    const again = play(setupAt('ST', 0)).session;
    expect(again.state.narration).toEqual(matches[0]!.session.state.narration);
    for (const { session, midway } of matches.slice(0, 6))
      for (const saved of [...midway, session]) {
        const restored = validateMatchSession(JSON.parse(JSON.stringify(saved)));
        expect(restored.state.narration).toEqual(saved.state.narration);
        expect(restored).toEqual(saved);
      }
    // A session saved before narration cannot replay to the same state: it is outdated.
    const before = JSON.parse(JSON.stringify(matches[0]!.session));
    delete before.state.narration;
    expect(() => validateMatchSession(before)).toThrow(OutdatedMatchSessionError);
  });
  it('gives the UI display lines in order, revealing the current passage as it plays', () => {
    const { passages } = matches.find((m) => m.position === 'ST')!;
    const passage = passages.find(
      (p) => p.session.state.narration.length - p.session.state.motion.narrationStart! >= 1,
    )!;
    const session = passage.session;
    const all = narrationFeed(session);
    expect(all).toHaveLength(session.state.narration.length);
    expect(all.map((entry) => entry.index)).toEqual(all.map((_, index) => index));
    const start = session.state.motion.narrationStart!;
    expect(all.filter((entry) => entry.current)).toHaveLength(all.length - start);
    for (const entry of all) {
      const line = session.state.narration[entry.index]!;
      expect(entry.text).not.toMatch(/\{\w+\}/);
      expect(entry.text).toContain(narrationName(session.setup.players[line.params.player!]!.name));
      expect(entry.side).toBe(sideOf(session, line.params.player!));
    }
    // Before the passage plays, only earlier lines show; at its end, all of them.
    expect(narrationFeed(session, 0).filter((entry) => entry.current)).toEqual([]);
    expect(narrationFeed(session, passage.frames.length - 1)).toEqual(all);
    expect(narrationName('Joris van Dijk')).toBe('van Dijk');
    expect(narrationName('Luca Vale')).toBe('Vale');
  });
});
