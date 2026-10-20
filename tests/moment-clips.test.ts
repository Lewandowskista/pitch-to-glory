import { describe, expect, it } from 'vitest';
import type { Beat, Moment, ReplayFrame } from '../src/model/domain';
import {
  CLIP_FRAMES,
  CLIP_MAX_LENGTH,
  LINK_MAX_LENGTH,
  decodeClip,
  encodeClip,
  momentLink,
  parseMomentLink,
  type Clip,
  type ClipFrame,
} from '../src/engine/career/honours/clip';
import { captureMoments } from '../src/engine/career/honours/moments';
import { cutHighlight, HIGHLIGHT_FRAMES } from '../src/engine/match/highlight';
import { applyMatchCommand, createMatchSession, createMatchSetup } from '../src/engine/match';
import { autoPlayCommand } from '../src/engine/career/matches';
import { generateWorld } from '../src/engine/world/generate';
import {
  clipCaption,
  clipStory,
  prepareClip,
  sampleClip,
  V1_FRAME_MS,
} from '../src/screens/career/clipReplay';

/**
 * Moments clip codec v2 (redesign M9): annotated keyframes, names and numbers, both versions
 * decoding, link size bounds, and highlights cut from the first beat of the goal's move.
 */

/** A milestone-8 (v1) clip as stored in saves and share links: three keyframes, scorer 9. */
const STORED_V1 =
  'AQMJs01NDVkuZk9zcH-RjLOZ1KYPszC_UsxzZpRztX_WjBKZM6ZUs3W_lsy42dnlFNZjVBphO25cen2HnpS_oeCtHLo9x17Uf2GhbsJ644cflEChYa2CuqPHxNTl4CH6elwmaUd1aYKKj6uczKjttSnCSs9r24xcrWnPdfCCK49NnG6oj7WwwtHPDdsu';

const positions = (frame: number) =>
  Array.from({ length: 22 }, (_, index) => ({
    x: index < 11 ? 30 + index * 5 + frame : 40 + (index - 11) * 5 - frame,
    y: ((index * 13 + frame * 5) % 90) + 5,
  }));
const players = Array.from({ length: 22 }, (_, index) => ({
  away: index >= 11,
  number: (index % 11) + 1,
  ...(index === 9 ? { name: 'Vale' } : index === 7 ? { name: 'Okafor' } : {}),
}));
/** A cross from the right (attacking towards x = 100) met by a header in the net. */
const crossClip: Clip = {
  selected: 9,
  pattern: 'wing-play',
  trim: ['#2a2320', '#ffffff'],
  players,
  frames: [
    { ball: { x: 60, y: 70 }, players: positions(0), ms: 0, carrier: 7, motion: 'carry' },
    {
      ball: { x: 80, y: 85 },
      players: positions(1),
      ms: 2200,
      carrier: 7,
      motion: 'carry',
      beat: { kind: 'carry', actor: 7 },
    },
    {
      ball: { x: 93, y: 52 },
      players: positions(2),
      ms: 1500,
      carrier: 9,
      motion: 'air',
      apex: 1,
      beat: { kind: 'cross', actor: 7 },
    },
    {
      ball: { x: 101.5, y: 50 },
      players: positions(3),
      ms: 560,
      carrier: null,
      motion: 'shot',
      beat: { kind: 'header', actor: 9 },
    },
    {
      ball: { x: 101.5, y: 50 },
      players: positions(4),
      ms: 3500,
      carrier: null,
      motion: 'dead',
      beat: { kind: 'celebration', actor: 9 },
    },
  ],
};

describe('clip codec', () => {
  it('still decodes and plays a stored v1 clip', () => {
    const clip = decodeClip(STORED_V1);
    expect(clip.selected).toBe(9);
    expect(clip.players).toBeUndefined();
    expect(clip.frames).toHaveLength(3);
    expect(clip.frames[0]!.ball.x).toBeCloseTo(70, 0);
    expect(clip.frames[0]!.ball.y).toBeCloseTo(30, 0);
    clip.frames.forEach((frame, index) =>
      frame.players.forEach((point, player) =>
        expect(Math.abs(point.y - (((player * 13 + index * 5) % 90) + 5))).toBeLessThan(0.3),
      ),
    );
    // v1 keeps its even pace: one keyframe every 0.9 s, ending on the last.
    const playback = prepareClip(clip);
    expect(playback.duration).toBe(V1_FRAME_MS * 2);
    const end = sampleClip(clip, playback, playback.duration);
    expect(end.ball).toEqual(clip.frames[2]!.ball);
    const middle = sampleClip(clip, playback, V1_FRAME_MS * 1.5);
    expect(middle.index).toBe(2);
    expect(middle.ball.x).toBeGreaterThan(clip.frames[1]!.ball.x);
    expect(middle.ball.x).toBeLessThan(clip.frames[2]!.ball.x);
    // Re-encoding a v1 clip keeps the v1 bytes.
    expect(encodeClip(clip)).toBe(STORED_V1);
    expect(clipCaption(clip, 'Robin Vale')).toBeNull();
  });

  it('round-trips a v2 clip with timing, flight, carriers, beats, numbers and names', () => {
    const text = encodeClip(crossClip);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    const clip = decodeClip(text);
    expect(clip.selected).toBe(9);
    expect(clip.pattern).toBe('wing-play');
    expect(clip.trim).toEqual(['#2a2320', '#ffffff']);
    expect(clip.players).toEqual(players.map((player) => ({ ...player, number: player.number })));
    clip.frames.forEach((frame, index) => {
      const source = crossClip.frames[index]!;
      expect(Math.abs(frame.ball.x - source.ball.x)).toBeLessThan(0.25);
      expect(Math.abs(frame.ball.y - source.ball.y)).toBeLessThan(0.25);
      frame.players.forEach((point, player) => {
        expect(Math.abs(point.x - source.players[player]!.x)).toBeLessThan(0.25);
        expect(Math.abs(point.y - source.players[player]!.y)).toBeLessThan(0.25);
      });
      expect(frame.ms).toBe(source.ms);
      expect(frame.motion).toBe(source.motion);
      expect(frame.carrier).toBe(source.carrier);
      expect(frame.beat).toEqual(source.beat);
    });
    // The ball in the net stays behind the line, and the cross keeps its height.
    expect(clip.frames[3]!.ball.x).toBeGreaterThan(101);
    expect(clip.frames[2]!.apex).toBe(1);
  });

  it('plays a v2 clip through the match replay, the cross arcing in', () => {
    const clip = decodeClip(encodeClip(crossClip));
    const playback = prepareClip(clip);
    // The cross: halfway through its step the ball is up in the air.
    const start = playback.times[1]!;
    const step = playback.times[2]! - start;
    const mid = sampleClip(clip, playback, start + step / 2);
    expect(mid.index).toBe(2);
    expect(mid.height).toBeCloseTo(1, 1);
    // A carry keeps the ball at the runner's feet.
    const run = sampleClip(clip, playback, playback.times[1]! / 2);
    expect(run.height).toBe(0);
    expect(run.ball).toEqual(run.players[7]);
    // It ends with the ball in the net.
    expect(sampleClip(clip, playback, playback.duration).ball.x).toBeGreaterThan(101);
  });

  it('tells how the goal was made', () => {
    const clip = decodeClip(encodeClip(crossClip));
    expect(clipStory(clip)).toMatchObject({
      strike: 3,
      finish: 'header',
      assist: { frame: 2, kind: 'cross', actor: 7 },
    });
    expect(clipCaption(clip, 'Robin Vale')).toBe(
      'Down the wing: Okafor’s cross from the right, and Vale heads it in.',
    );
    // Attacking the other way, the same touchline is the left.
    const mirrored: Clip = {
      ...crossClip,
      pattern: undefined,
      frames: crossClip.frames.map((frame) => ({
        ...frame,
        ball: { x: 100 - frame.ball.x, y: frame.ball.y },
      })),
    };
    expect(clipCaption(decodeClip(encodeClip(mirrored)), 'Robin Vale')).toBe(
      'Okafor’s cross from the left, and Vale heads it in.',
    );
    // A run and a finish without a teammate's pass.
    const solo: Clip = {
      ...crossClip,
      pattern: undefined,
      frames: crossClip.frames.map((frame, index) =>
        index === 2 ? { ...frame, beat: { kind: 'dribble' as const, actor: 9 } } : frame,
      ),
    };
    expect(clipCaption(solo, 'Robin Vale')).toBe('Vale carries it forward and finishes.');
  });

  it('keeps a worst-case clip and link within their limits', () => {
    const long = 'Ñúñez-Égalité'.repeat(4);
    const worst: Clip = {
      selected: 21,
      pattern: 'recycle',
      trim: ['#ffffff', '#000000'],
      players: Array.from({ length: 22 }, (_, index) => ({
        away: index >= 11,
        number: 99,
        name: `${long}${index}`,
      })),
      frames: Array.from({ length: CLIP_FRAMES[2] }, (_, index) => ({
        ball: { x: 105, y: 0 },
        players: positions(index),
        ms: 9000,
        motion: 'over',
        apex: 1.5,
        carrier: 21,
        beat: { kind: 'celebration', actor: 21 },
      })),
    };
    const text = encodeClip(worst);
    expect(text.length).toBeLessThanOrEqual(CLIP_MAX_LENGTH);
    const decoded = decodeClip(text);
    // Names are capped (eight of them, 24 bytes each, cut on whole characters).
    const names = decoded.players!.filter((player) => player.name);
    expect(names).toHaveLength(8);
    for (const { name } of names)
      expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(24);
    expect(names[0]!.name).toBe(long.slice(0, Array.from(names[0]!.name!).length));
    expect(decoded.frames.every((frame) => frame.ms === 5100)).toBe(true);
    const moment: Moment = {
      id: 'moment:worst',
      playerId: 'player:1',
      date: { season: 2030, week: 40, day: 6 },
      kind: 'hat-trick',
      minute: 130,
      scorerName: '€'.repeat(80),
      home: { name: '漢'.repeat(80), color: '#123456' },
      away: { name: '漢'.repeat(80), color: '#abcdef' },
      score: [39, 39],
      seed: 's'.repeat(256),
      clip: text,
    };
    const link = momentLink(moment);
    expect(link.length).toBeLessThanOrEqual(LINK_MAX_LENGTH);
    // Headroom documented in MATCH-BALANCING.md (Moments clips v2).
    expect(link.length).toBeLessThan(4200);
    expect(parseMomentLink(link).decoded.frames).toHaveLength(CLIP_FRAMES[2]);
  });

  it('rejects damaged v2 clips', () => {
    const text = encodeClip(crossClip);
    const bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
      char.charCodeAt(0),
    );
    const encode = (value: Uint8Array) =>
      btoa(String.fromCharCode(...value))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const damaged = (at: number, value: number) => {
      const copy = bytes.slice();
      copy[at] = value;
      return encode(copy);
    };
    expect(() => decodeClip(text.slice(0, -8))).toThrow();
    expect(() => decodeClip(damaged(0, 3))).toThrow();
    expect(() => decodeClip(damaged(2, 22))).toThrow();
    // Shirt number above 99, a name that is not UTF-8, a carrier and a beat out of range.
    expect(() => decodeClip(damaged(10, 100))).toThrow();
    const nameAt = 33 + 2;
    expect(() => decodeClip(damaged(nameAt, 0xff))).toThrow();
    const frameAt = bytes.length - 51 * crossClip.frames.length;
    expect(() => decodeClip(damaged(frameAt + 4, 30))).toThrow();
    expect(() => decodeClip(damaged(frameAt + 5, 40))).toThrow();
    expect(() =>
      encodeClip({
        ...crossClip,
        frames: Array.from({ length: CLIP_FRAMES[2] + 1 }, () => crossClip.frames[0]!),
      }),
    ).toThrow();
  });
});

describe('highlight cut', () => {
  const home = new Set(['h1', 'h2', 'h3']);
  const frame = (
    index: number,
    beat?: Partial<Beat> & Pick<Beat, 'kind' | 'actorId'>,
    motion: ReplayFrame['ballMotion'] = 'ground',
  ): ReplayFrame => ({
    timeMs: index * 1000,
    ball: { x: index, y: 50 },
    players: [],
    ballMotion: motion,
    ...(beat ? { beat: { zone: 'mid', flank: 'centre', ...beat } } : {}),
  });
  const strike = (index: number) => frame(index, { kind: 'shot', actorId: 'h1' }, 'shot');
  const celebration = (index: number) =>
    frame(index, { kind: 'celebration', actorId: 'h1' }, 'dead');

  it('starts where the scoring side won the ball', () => {
    const frames = [
      frame(0, { kind: 'pass', actorId: 'h2' }),
      frame(1, { kind: 'pass', actorId: 'a1' }),
      frame(2, { kind: 'intercept', actorId: 'h3' }),
      frame(3),
      frame(4, { kind: 'pass', actorId: 'h3' }),
      frame(5, { kind: 'cross', actorId: 'h2' }, 'air'),
      strike(6),
      celebration(7),
    ];
    const cut = cutHighlight(frames, 'h1', home);
    expect(cut.map((f) => f.ball.x)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('starts at a restart taken by the scoring side', () => {
    const frames = [
      frame(0, { kind: 'pass', actorId: 'h2' }),
      frame(1, { kind: 'clearance', actorId: 'h2' }),
      frame(2, { kind: 'restart', actorId: 'h3' }, 'dead'),
      frame(3, { kind: 'cross', actorId: 'h3' }, 'air'),
      strike(4),
      celebration(5),
    ];
    expect(cutHighlight(frames, 'h1', home).map((f) => f.ball.x)).toEqual([1, 2, 3, 4, 5]);
  });

  it('starts at the first beat of the pattern the goal came from', () => {
    const frames = [
      frame(0, { kind: 'intercept', actorId: 'h2' }),
      frame(1, { kind: 'pass', actorId: 'h2', pattern: 'recycle' }),
      frame(2, { kind: 'pass', actorId: 'h3', pattern: 'recycle' }),
      frame(3, { kind: 'pass', actorId: 'h2', pattern: 'wing-play' }),
      frame(4, { kind: 'cross', actorId: 'h3', pattern: 'wing-play' }, 'air'),
      strike(5),
      celebration(6),
    ];
    expect(cutHighlight(frames, 'h1', home).map((f) => f.ball.x)).toEqual([2, 3, 4, 5, 6]);
  });

  it('keeps the end of a long move, and the old cut for frames without beats', () => {
    const long = [
      ...Array.from({ length: 40 }, (_, index) =>
        frame(index, { kind: 'pass', actorId: index % 2 ? 'h2' : 'h3' }),
      ),
      strike(40),
      celebration(41),
    ];
    const cut = cutHighlight(long, 'h1', home);
    expect(cut).toHaveLength(HIGHLIGHT_FRAMES);
    expect(cut.at(-1)!.ball.x).toBe(41);
    const plain = Array.from({ length: 20 }, (_, index) => frame(index));
    expect(cutHighlight(plain, 'h1', home)).toEqual(plain.slice(-12));
    // A first-time finish still shows the frame before the strike.
    const quick = [frame(0, { kind: 'save', actorId: 'a1' }), strike(1), celebration(2)];
    expect(cutHighlight(quick, 'h1', home)).toHaveLength(3);
  });

  it('cuts engine goals from the build-up, with the strike, and saves them as v2 clips', () => {
    const world = generateWorld('match-tests', { format: 'legacy' });
    const clubs = Object.values(world.clubs).slice(0, 4);
    let checked = 0;
    let builtUp = 0;
    let saved = 0;
    for (let i = 0; i < 16 && checked < 6; i++) {
      const club = clubs[i % 2]!;
      const position = (['ST', 'AM', 'RW', 'LW'] as const)[i % 4];
      const selected = club.playerIds.find((id) => world.players[id]!.primaryPosition === position);
      if (!selected) continue;
      const setup = createMatchSetup(world, club.id, clubs[2 + (i % 2)]!.id, selected, `clip-${i}`);
      let session = createMatchSession(setup, {
        role: 'balanced',
        risk: 'balanced',
        mentality: 'balanced',
      });
      while (session.state.match.status !== 'finished')
        session = applyMatchCommand(session, autoPlayCommand(session));
      const homeIds = new Set(setup.home.playerIds);
      const ours = homeIds.has(selected);
      for (const highlight of session.state.highlights) {
        checked++;
        const frames = highlight.frames;
        expect(frames.length).toBeLessThanOrEqual(HIGHLIGHT_FRAMES);
        expect(frames.at(-1)!.beat?.kind).toBe('celebration');
        const strikeAt = frames.findIndex(
          (f) =>
            (f.beat?.kind === 'shot' || f.beat?.kind === 'header') && f.beat.actorId === selected,
        );
        expect(strikeAt).toBeGreaterThan(0);
        // Every action of the build-up after the first frame is the scoring side's.
        for (const f of frames.slice(1, strikeAt))
          if (f.beat && f.beat.kind !== 'restart') expect(homeIds.has(f.beat.actorId)).toBe(ours);
        if (frames.slice(1, strikeAt).some((f) => f.beat)) builtUp++;
      }
      if (session.state.highlights.length && saved < 3) {
        saved++;
        const copy = structuredClone(world);
        copy.career = { playerId: selected, market: { sequence: 0 } } as unknown as NonNullable<
          typeof copy.career
        >;
        copy.moments = [];
        captureMoments(copy, session, 1.5);
        const clip = decodeClip(copy.moments[0]!.clip);
        expect(clip.players).toHaveLength(22);
        expect(clip.players![clip.selected]!.name).toBe(
          world.players[selected]!.name.split(' ').at(-1),
        );
        expect(clip.players![clip.selected]!.number).toBe(world.players[selected]!.squadNumber);
        expect(clip.players![clip.selected]!.away).toBe(!ours);
        expect(clip.frames.some((f: ClipFrame) => f.beat?.kind === 'celebration')).toBe(true);
        expect(clipStory(clip).strike).not.toBeNull();
        expect(copy.moments[0]!.clip.length).toBeLessThanOrEqual(CLIP_MAX_LENGTH);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(builtUp).toBeGreaterThan(0);
    expect(saved).toBeGreaterThan(0);
  }, 120000);
});
