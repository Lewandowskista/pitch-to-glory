import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  attacksRightAt,
  createMatchSession,
  createMatchSetup,
  span,
  validateMatchSession,
  HEAT_COLUMNS,
  HEAT_ROWS,
  MATCH_ENGINE_VERSION,
  OutdatedMatchSessionError,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import type { Beat, Point, Position, ReplayFrame } from '../src/model/domain';

/**
 * Choreography annotations and bookkeeping stats (engine match-14, redesign steps M1 and M6):
 * every action keyframe says who did what with the ball, outcome passages mark the decision's
 * keyframes, and the live stats keep xG, shots on target, key passes, distance, touches, a
 * rating line and a heat grid. None of it may change an outcome (see the outcome snapshot).
 */
const world = generateWorld('match-beats', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 4);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const PASSES = new Set(['pass', 'cross', 'switch', 'through', 'long', 'cutback']);
/** Beats placed where the ball is won rather than where it was played. */
const WON = new Set(['intercept', 'tackle', 'save', 'restart']);

interface Passage {
  kind: string;
  frames: ReplayFrame[];
  minute: number;
  focus?: { start: number; end: number };
  session: MatchSession;
}
function setupAt(position: Position, seed: string, index: number): MatchSetup {
  const [home, away] = index % 2 ? [clubs[1]!, clubs[0]!] : [clubs[0]!, clubs[1]!];
  const club = clubs[0]!;
  const ids = club.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
  const setup = createMatchSetup(world, home.id, away.id, ids[index % ids.length]!, seed);
  if (index === 3) {
    // The legacy 4-3-3 path annotates the same way.
    delete setup.formations;
    delete setup.slotMoments;
    delete setup.dramaMoments;
    delete setup.occasions;
  }
  return setup;
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
        kind: session.state.motion.kind,
        frames: session.state.motion.frames,
        minute: session.state.match.minute,
        focus: session.state.motion.focus,
        session,
      });
    if (session.state.motion.kind === 'outcome' && midway.length < 2) midway.push(session);
  }
  return { session, passages, midway };
}
const POSITIONS: Position[] = ['ST', 'LW', 'AM', 'CM', 'DM', 'LB', 'CB', 'GK'];
const matches = POSITIONS.flatMap((position) =>
  [0, 1, 2, 3].map((index) => ({
    position,
    ...play(setupAt(position, `beats-${position}-${index}`, index)),
  })),
);
const sideOf = (session: MatchSession, id: string) =>
  session.setup.home.playerIds.includes(id) ? 0 : 1;
/** Depth and width of a point for a side facing the goal it attacks. */
function spotOf(side: number, minute: number, point: Point) {
  return attacksRightAt(side, minute)
    ? { d: point.x, w: point.y }
    : { d: 100 - point.x, w: 100 - point.y };
}
/** Every beat of a match in order, with the keyframes around it. */
function beats(passages: Passage[]) {
  const out: { beat: Beat; frame: ReplayFrame; before: ReplayFrame; minute: number }[] = [];
  for (const passage of passages)
    passage.frames.forEach((frame, index) => {
      if (index && frame.beat)
        out.push({
          beat: frame.beat,
          frame,
          before: passage.frames[index - 1]!,
          minute: passage.minute,
        });
    });
  return out;
}

describe('match choreography beats', { timeout: 120000 }, () => {
  it('tags every keyframe after a passage starts with the action that led to it', () => {
    for (const { passages } of matches)
      for (const passage of passages)
        passage.frames.slice(1).forEach((frame) => expect(frame.beat).toBeDefined());
  });
  it('places each beat in the third and channel it happened in, for the acting team', () => {
    for (const { passages, session } of matches)
      for (const { beat, frame, before, minute } of beats(passages)) {
        const side = sideOf(session, beat.actorId);
        const spot = spotOf(side, minute, WON.has(beat.kind) ? frame.ball : before.ball);
        expect(beat.zone).toBe(spot.d < 100 / 3 ? 'def' : spot.d < 200 / 3 ? 'mid' : 'final');
        expect(beat.flank).toBe(spot.w < 100 / 3 ? 'left' : spot.w > 200 / 3 ? 'right' : 'centre');
      }
  });
  it('passes reach a teammate, who becomes the next carrier', () => {
    let passes = 0;
    for (const { passages, session } of matches)
      for (const { beat, frame, before } of beats(passages)) {
        if (!PASSES.has(beat.kind) || !beat.receiverId) continue;
        passes++;
        expect(beat.receiverId).not.toBe(beat.actorId);
        expect(sideOf(session, beat.receiverId)).toBe(sideOf(session, beat.actorId));
        expect(frame.carrierId).toBe(beat.receiverId);
        // The passer had the ball when it was played.
        expect(before.carrierId).toBe(beat.actorId);
      }
    expect(passes).toBeGreaterThan(1000);
  });
  it('crosses start wide in the final third and headers follow crosses', () => {
    let crosses = 0,
      headers = 0;
    for (const { passages } of matches) {
      const all = beats(passages);
      all.forEach(({ beat }, index) => {
        if (beat.kind === 'cross') {
          crosses++;
          expect(beat.zone).toBe('final');
          expect(beat.flank).not.toBe('centre');
        }
        if (beat.kind === 'header') {
          headers++;
          const previous = all[index - 1]?.beat;
          expect(previous?.kind).toBe('cross');
          expect(previous?.receiverId).toBe(beat.actorId);
        }
      });
    }
    expect(crosses).toBeGreaterThan(50);
    expect(headers).toBeGreaterThan(5);
  });
  it('wins the ball for the other side, and links shots, saves and celebrations to events', () => {
    for (const { passages, session } of matches) {
      const events = new Map(session.state.match.events.map((e) => [e.id, e]));
      for (const { beat, before, frame } of beats(passages)) {
        if (beat.kind === 'intercept' || beat.kind === 'tackle')
          expect(frame.carrierId).toBe(beat.actorId);
        if (beat.kind === 'tackle' && before.carrierId)
          expect(sideOf(session, before.carrierId)).not.toBe(sideOf(session, beat.actorId));
        if (beat.kind === 'shot' || beat.kind === 'header') {
          const shot = events.get(beat.eventId ?? '');
          expect(shot?.kind).toBe('shot');
          expect(shot?.playerId).toBe(beat.actorId);
          expect(shot?.action).toBe(beat.kind);
        }
        if (beat.kind === 'celebration') expect(events.get(beat.eventId!)?.kind).toBe('goal');
      }
    }
  });
  it('annotates events with their action, third and receiver', () => {
    for (const { session } of matches)
      for (const event of session.state.match.events) {
        if (event.kind === 'shot' && event.xg !== undefined)
          expect(['shot', 'header']).toContain(event.action);
        if (event.kind === 'pass' && event.action) {
          expect(PASSES.has(event.action)).toBe(true);
          if (event.receiverId) {
            expect(event.outcome?.success ?? true).toBe(true);
            expect(sideOf(session, event.receiverId)).toBe(sideOf(session, event.playerId!));
          }
        }
        if (event.zone) expect(['def', 'mid', 'final']).toContain(event.zone);
      }
  });
  it('focuses outcome passages on the decision and what it led to', () => {
    let checked = 0;
    for (const { passages, session } of matches) {
      const events = session.state.match.events;
      for (const passage of passages) {
        if (passage.kind !== 'outcome') continue;
        const focus = passage.focus!;
        expect(focus).toBeDefined();
        expect(focus.start).toBeGreaterThanOrEqual(0);
        expect(focus.end).toBeGreaterThanOrEqual(focus.start);
        expect(focus.end).toBeLessThan(passage.frames.length);
        const moment = passage.session.state.match.keyMoments.at(-1)!;
        const index = events.findIndex((e) => e.outcome?.input.momentId === moment.id);
        const decision = events[index]!;
        // A save or last-ditch challenge on a shot already struck plays out that shot.
        const previous = events[index - 1];
        const shown =
          (decision.kind === 'save' || decision.kind === 'tackle') &&
          previous?.kind === 'shot' &&
          previous.minute === decision.minute &&
          previous.teamId !== decision.teamId
            ? previous
            : decision;
        if (!['pass', 'shot', 'dribble', 'tackle'].includes(shown.kind)) continue;
        const ids = passage.frames
          .slice(focus.start + 1, focus.end + 1)
          .map((frame) => frame.beat?.eventId);
        expect(ids).toContain(shown.id);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('match bookkeeping stats', { timeout: 120000 }, () => {
  it('sums expected goals from each recorded shot', () => {
    for (const { session } of matches) {
      const s = session.state;
      const shots = s.match.events.filter((e) => e.kind === 'shot' && e.xg !== undefined);
      expect(shots).toHaveLength(s.stats.homeShots + s.stats.awayShots);
      for (const side of [0, 1]) {
        const team = side ? session.setup.away.id : session.setup.home.id;
        const own = shots.filter((e) => e.teamId === team);
        expect(own.every((e) => e.xg! > 0 && e.xg! <= 1)).toBe(true);
        expect(s.stats.xg[side]).toBeCloseTo(
          own.reduce((sum, e) => sum + e.xg!, 0),
          5,
        );
        expect(s.stats.xg[side]).toBeGreaterThanOrEqual(0);
        // Every goal went in from a shot on target.
        expect(s.stats.shotsOnTarget[side]).toBeLessThanOrEqual(own.length);
        expect(s.stats.shotsOnTarget[side]).toBeGreaterThanOrEqual(s.match.score[side]!);
      }
    }
    // Across matches, expected goals track the goals scored.
    const goals = matches.reduce(
      (sum, m) => sum + m.session.state.match.score[0] + m.session.state.match.score[1],
      0,
    );
    const xg = matches.reduce(
      (sum, m) => sum + m.session.state.stats.xg[0] + m.session.state.stats.xg[1],
      0,
    );
    expect(xg / goals).toBeGreaterThan(0.6);
    expect(xg / goals).toBeLessThan(1.5);
  });
  it('counts key passes, tackles attempted and touches within their bounds', () => {
    for (const { session, position } of matches) {
      const stats = session.state.stats;
      expect(stats.tacklesAttempted).toBeGreaterThanOrEqual(stats.tackles);
      expect(stats.keyPasses).toBeLessThanOrEqual(stats.passesCompleted);
      expect(stats.touches).toBeGreaterThan(position === 'GK' ? 0 : 20);
    }
    expect(matches.some((m) => m.session.state.stats.keyPasses > 0)).toBe(true);
    expect(matches.some((m) => m.session.state.stats.tacklesAttempted > 0)).toBe(true);
  });
  it('measures the distance shown for the selected player in metres', () => {
    for (const { session, passages, position } of matches) {
      const id = session.setup.selectedPlayerId;
      let units = 0;
      for (const passage of passages)
        for (let i = 1; i < passage.frames.length; i++) {
          const a = passage.frames[i - 1]!.players.find((p) => p.id === id);
          const b = passage.frames[i]!.players.find((p) => p.id === id);
          if (a && b && passage.frames[i]!.ballMotion !== 'reset') units += span(a.point, b.point);
        }
      expect(session.state.stats.distanceM).toBeCloseTo(units * 1.05, -1);
      // About thirteen minutes of play are shown a match: a few kilometres for an outfielder.
      if (!session.state.substituted) {
        expect(session.state.stats.distanceM).toBeGreaterThan(position === 'GK' ? 300 : 1500);
        expect(session.state.stats.distanceM).toBeLessThan(position === 'GK' ? 4000 : 8000);
      }
    }
  });
  it('keeps a dt-weighted heat grid of everything shown, oriented to the attack', () => {
    for (const { session, passages } of matches) {
      const heat = session.state.heat;
      expect(heat).toHaveLength(HEAT_COLUMNS * HEAT_ROWS);
      expect(heat.every((ms) => Number.isInteger(ms) && ms >= 0)).toBe(true);
      const id = session.setup.selectedPlayerId;
      let shown = 0;
      for (const passage of passages)
        for (let i = 1; i < passage.frames.length; i++)
          if (
            passage.frames[i - 1]!.players.some((p) => p.id === id) &&
            passage.frames[i]!.players.some((p) => p.id === id)
          )
            shown += passage.frames[i]!.timeMs - passage.frames[i - 1]!.timeMs;
      expect(heat.reduce((sum, ms) => sum + ms, 0)).toBe(shown);
    }
    // Strikers spend their time in the attacking half, keepers at the near end.
    const half = (position: Position) =>
      matches
        .filter((m) => m.position === position)
        .reduce(
          (sum, m) =>
            sum +
            m.session.state.heat.reduce(
              (part, ms, cell) => part + (cell % HEAT_COLUMNS >= HEAT_COLUMNS / 2 ? ms : -ms),
              0,
            ),
          0,
        );
    expect(half('ST')).toBeGreaterThan(0);
    expect(half('GK')).toBeLessThan(0);
  });
  it('records the rating at the end of every minute', () => {
    for (const { session } of matches) {
      const line = session.state.ratingByMinute;
      expect(line).toHaveLength(90);
      expect(line.every((value) => value >= 3 && value <= 10)).toBe(true);
    }
  });
  it('replays sessions with annotations exactly after a JSON round trip', () => {
    for (const { session, midway } of matches.slice(0, 12))
      for (const saved of [...midway, session]) {
        const restored = validateMatchSession(JSON.parse(JSON.stringify(saved)));
        expect(restored).toEqual(saved);
      }
  });
  it('treats sessions saved before the annotations as outdated', () => {
    const { session } = matches[0]!;
    expect(session.engine).toBe(MATCH_ENGINE_VERSION);
    expect(MATCH_ENGINE_VERSION).toBe('match-14');
    const legacy = matches.find((m) => !m.session.setup.formations)!.session;
    for (const saved of [session, legacy]) {
      const before = JSON.parse(JSON.stringify(saved));
      delete before.state.stats.xg;
      expect(() => validateMatchSession(before)).toThrow(OutdatedMatchSessionError);
    }
  });
});
