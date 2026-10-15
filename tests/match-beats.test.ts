import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  attacksRightAt,
  createMatchSession,
  createMatchSetup,
  validateMatchSession,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import type { Beat, Point, Position, ReplayFrame } from '../src/model/domain';

/**
 * Choreography annotations (engine match-14, redesign step M1): every action keyframe says who
 * did what with the ball, and outcome passages mark the decision's keyframes. None of it may
 * change an outcome (see the outcome snapshot).
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
        if (event.kind === 'shot' && event.action)
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

describe('annotated sessions', { timeout: 120000 }, () => {
  it('replay exactly after a JSON round trip', () => {
    for (const { session, midway } of matches.slice(0, 12))
      for (const saved of [...midway, session]) {
        const restored = validateMatchSession(JSON.parse(JSON.stringify(saved)));
        expect(restored).toEqual(saved);
      }
  });
});
