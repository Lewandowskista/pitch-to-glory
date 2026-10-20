import type { BallMotion, BeatKind, Hex, Moment, PatternId, Point } from '../../../model/domain';

/**
 * The Moments clip codec and share link (AGENTS.md §9.7). Dependency-free, so the public
 * replay page and the save validator can use it without the rest of the career engine.
 *
 * Version 1 (milestone 8) carries up to 12 keyframes of positions. Version 2 (redesign M9)
 * adds what an annotated replay needs: per keyframe its timing, how the ball travelled (with
 * the height of a lofted ball), who has it and the action that led into it; per player the
 * side and shirt number; short names of the players who act in the move; and both kits'
 * second colours. Both versions keep decoding.
 */
export interface ClipBeat {
  kind: BeatKind;
  /** Index of the player who played it (0–21), or null. */
  actor: number | null;
}
export interface ClipFrame {
  ball: Point;
  players: Point[];
  /** Sporting milliseconds since the previous keyframe (v2). */
  ms?: number;
  /** How the ball travelled into this keyframe (v2). */
  motion?: BallMotion;
  /** Peak height of a lofted ball over this step, 0 on the ground to 1.5 (v2). */
  apex?: number;
  /** Index of the player with the ball at their feet, or null (v2). */
  carrier?: number | null;
  /** The action between the previous keyframe and this one (v2). */
  beat?: ClipBeat;
}
export interface ClipPlayer {
  away: boolean;
  /** Shirt number, null when unknown. */
  number: number | null;
  /** Short name, for the players who act in the move. */
  name?: string;
}
export interface Clip {
  /** Index of the scorer among the 22 players (home 0–10, away 11–21 in version 1). */
  selected: number;
  frames: ClipFrame[];
  /** The 22 players' sides, numbers and names (v2; a clip without them encodes as v1). */
  players?: ClipPlayer[];
  /** The recognisable move the goal came from (v2). */
  pattern?: PatternId;
  /** Second kit colours for the token outlines, home then away (v2). */
  trim?: [Hex, Hex];
}

/** Keyframes a clip may hold, per version. */
export const CLIP_FRAMES = { 1: 12, 2: 24 } as const;
/** Short names a v2 clip carries, and their longest UTF-8 length in bytes. */
const MAX_NAMES = 8;
const MAX_NAME_BYTES = 24;
/** A v2 keyframe step is stored in 20 ms units, up to 5.1 s. */
const STEP_UNIT = 20;
/** The longest a v2 clip can be: header, names, then every keyframe. */
const V2_HEADER = 33;
const V2_FRAME = 51;
const V2_MAX_BYTES = V2_HEADER + MAX_NAMES * (2 + MAX_NAME_BYTES) + CLIP_FRAMES[2] * V2_FRAME;
/** Longest encoded clip, in characters (a full v2 clip; v1 clips are far shorter). */
export const CLIP_MAX_LENGTH = Math.ceil((V2_MAX_BYTES * 4) / 3);
/** Longest share link the viewer accepts, in characters. */
export const LINK_MAX_LENGTH = 6000;

// Append-only code tables: a clip stores the index + 1 (0 = none).
const MOTIONS: readonly BallMotion[] = [
  'ground',
  'air',
  'shot',
  'over',
  'carry',
  'loose',
  'dead',
  'reset',
];
const BEATS: readonly BeatKind[] = [
  'pass',
  'cross',
  'switch',
  'through',
  'long',
  'cutback',
  'carry',
  'dribble',
  'shot',
  'header',
  'tackle',
  'intercept',
  'block',
  'save',
  'clearance',
  'restart',
  'celebration',
];
const PATTERNS: readonly PatternId[] = [
  'wing-play',
  'overlap',
  'switch',
  'through-ball',
  'counter',
  'cut-back',
  'long-ball',
  'recycle',
];
const NONE = 255;

/** v1 positions: 0–100 in steps of 1/2.55. */
const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value * 2.55)));
const fromByte = (value: number) => Math.round((value / 2.55) * 10) / 10;
/** v2 positions: −5 to 105.9, so a ball in the net (x 101.5) stays in the net. */
const toByte2 = (value: number) => Math.max(0, Math.min(255, Math.round((value + 5) * 2.3)));
const fromByte2 = (value: number) => Math.round((value / 2.3 - 5) * 10) / 10;
const code = <T>(table: readonly T[], value: T | undefined) =>
  value === undefined ? 0 : table.indexOf(value) + 1;
function base64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
const hexBytes = (hex: Hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) || 0);
const toHex = (bytes: ArrayLike<number>, at: number) =>
  `#${[0, 1, 2].map((i) => bytes[at + i]!.toString(16).padStart(2, '0')).join('')}` as Hex;
/** A short name cut to whole characters within the byte limit. */
function nameBytes(name: string): Uint8Array {
  const encoder = new TextEncoder();
  let text = name.trim();
  let bytes = encoder.encode(text);
  while (bytes.length > MAX_NAME_BYTES) {
    text = Array.from(text).slice(0, -1).join('');
    bytes = encoder.encode(text);
  }
  return bytes;
}

/**
 * Version 1: [1, frames, selected, then per frame ball x, y and 22 × (x, y)].
 * Version 2: [2, frames, selected, pattern, home trim RGB, away trim RGB, 22 × player
 * (bit 7 away, bits 0–6 shirt number), name count, names × (player, length, UTF-8), then per
 * frame step (20 ms), ball x, y, motion (bits 0–3) with apex (bits 4–7, fifteenths of 1.5),
 * carrier, beat kind, beat actor and 22 × (x, y)]. base64url either way.
 */
export function encodeClip(clip: Clip): string {
  if (!clip.players) {
    if (clip.frames.length > CLIP_FRAMES[1]) throw new Error('Clip too long');
    const bytes = [1, clip.frames.length, clip.selected];
    for (const frame of clip.frames) {
      bytes.push(toByte(frame.ball.x), toByte(frame.ball.y));
      for (const point of frame.players) bytes.push(toByte(point.x), toByte(point.y));
    }
    return base64url(Uint8Array.from(bytes));
  }
  if (clip.frames.length > CLIP_FRAMES[2] || clip.players.length !== 22)
    throw new Error('Invalid clip');
  const trim = clip.trim ?? ['#ffffff', '#ffffff'];
  const bytes = [
    2,
    clip.frames.length,
    clip.selected,
    code(PATTERNS, clip.pattern),
    ...hexBytes(trim[0]),
    ...hexBytes(trim[1]),
  ];
  for (const player of clip.players)
    bytes.push((player.away ? 128 : 0) | Math.max(0, Math.min(99, player.number ?? 0)));
  const named = clip.players
    .map((player, index) => ({ index, name: player.name ? nameBytes(player.name) : null }))
    .filter((entry): entry is { index: number; name: Uint8Array } => !!entry.name?.length)
    .slice(0, MAX_NAMES);
  bytes.push(named.length);
  for (const { index, name } of named) bytes.push(index, name.length, ...name);
  const index = (value: number | null | undefined) =>
    value === null || value === undefined || value < 0 || value > 21 ? NONE : value;
  for (const frame of clip.frames) {
    const apex = Math.max(0, Math.min(15, Math.round(((frame.apex ?? 0) / 1.5) * 15)));
    bytes.push(
      Math.max(0, Math.min(255, Math.round((frame.ms ?? 0) / STEP_UNIT))),
      toByte2(frame.ball.x),
      toByte2(frame.ball.y),
      code(MOTIONS, frame.motion) | (apex << 4),
      index(frame.carrier),
      code(BEATS, frame.beat?.kind),
      index(frame.beat?.actor),
    );
    for (const point of frame.players) bytes.push(toByte2(point.x), toByte2(point.y));
  }
  return base64url(Uint8Array.from(bytes));
}

function decodeV1(bytes: Uint8Array): Clip {
  const count = bytes[1]!;
  if (count < 1 || count > CLIP_FRAMES[1] || bytes.length !== 3 + count * 46 || bytes[2]! > 21)
    throw new Error('Invalid clip');
  const frames: ClipFrame[] = [];
  for (let frame = 0; frame < count; frame++) {
    const base = 3 + frame * 46;
    const point = (offset: number) => ({
      x: fromByte(bytes[base + offset]!),
      y: fromByte(bytes[base + offset + 1]!),
    });
    frames.push({
      ball: point(0),
      players: Array.from({ length: 22 }, (_, index) => point(2 + index * 2)),
    });
  }
  return { selected: bytes[2]!, frames };
}

function decodeV2(bytes: Uint8Array): Clip {
  const invalid = () => new Error('Invalid clip');
  const count = bytes[1]!;
  const selected = bytes[2]!;
  const pattern = bytes[3]!;
  if (count < 1 || count > CLIP_FRAMES[2] || selected > 21 || pattern > PATTERNS.length)
    throw invalid();
  const players: ClipPlayer[] = [];
  for (let i = 0; i < 22; i++) {
    const value = bytes[10 + i];
    if (value === undefined || (value & 127) > 99) throw invalid();
    players.push({ away: value >= 128, number: value & 127 || null });
  }
  let at = 32;
  const names = bytes[at++];
  if (names === undefined || names > MAX_NAMES) throw invalid();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let n = 0; n < names; n++) {
    const player = bytes[at];
    const length = bytes[at + 1];
    if (
      player === undefined ||
      length === undefined ||
      player > 21 ||
      length < 1 ||
      length > MAX_NAME_BYTES ||
      at + 2 + length > bytes.length ||
      players[player]!.name !== undefined
    )
      throw invalid();
    const name = decoder.decode(bytes.subarray(at + 2, at + 2 + length));
    if (!name.trim()) throw invalid();
    players[player]!.name = name;
    at += 2 + length;
  }
  if (bytes.length !== at + count * V2_FRAME) throw invalid();
  const index = (value: number) => {
    if (value === NONE) return null;
    if (value > 21) throw invalid();
    return value;
  };
  const frames: ClipFrame[] = [];
  for (let f = 0; f < count; f++, at += V2_FRAME) {
    const motion = bytes[at + 3]! & 15;
    const beat = bytes[at + 5]!;
    if (motion > MOTIONS.length || beat > BEATS.length) throw invalid();
    const point = (offset: number) => ({
      x: fromByte2(bytes[at + offset]!),
      y: fromByte2(bytes[at + offset + 1]!),
    });
    const frame: ClipFrame = {
      ball: point(1),
      players: Array.from({ length: 22 }, (_, i) => point(7 + i * 2)),
      ms: bytes[at]! * STEP_UNIT,
      carrier: index(bytes[at + 4]!),
    };
    if (motion) frame.motion = MOTIONS[motion - 1]!;
    const apex = bytes[at + 3]! >> 4;
    if (apex) frame.apex = Math.round(((apex * 1.5) / 15) * 100) / 100;
    const actor = index(bytes[at + 6]!);
    if (beat) frame.beat = { kind: BEATS[beat - 1]!, actor };
    frames.push(frame);
  }
  const clip: Clip = {
    selected,
    frames,
    players,
    trim: [toHex(bytes, 4), toHex(bytes, 7)],
  };
  if (pattern) clip.pattern = PATTERNS[pattern - 1]!;
  return clip;
}

export function decodeClip(text: string): Clip {
  if (text.length > CLIP_MAX_LENGTH) throw new Error('Invalid clip');
  const bytes = fromBase64url(text);
  if (bytes[0] === 1) return decodeV1(bytes);
  if (bytes[0] === 2) return decodeV2(bytes);
  throw new Error('Unknown clip version');
}

/** The link payload: the clip plus what the viewer needs to label it. */
export interface MomentLink {
  v: 1;
  kind: Moment['kind'];
  minute: number;
  scorer: string;
  home: [string, Hex];
  away: [string, Hex];
  score: [number, number];
  seed: string;
  clip: string;
}
export function momentLink(moment: Moment): string {
  const payload: MomentLink = {
    v: 1,
    kind: moment.kind,
    minute: moment.minute,
    scorer: moment.scorerName,
    home: [moment.home.name, moment.home.color],
    away: [moment.away.name, moment.away.color],
    score: moment.score,
    seed: moment.seed,
    clip: moment.clip,
  };
  return base64url(new TextEncoder().encode(JSON.stringify(payload)));
}
const HEX = /^#[0-9a-f]{6}$/i;
/** Parse and check a shared link; throws on anything malformed. */
export function parseMomentLink(text: string): MomentLink & { decoded: Clip } {
  if (text.length > LINK_MAX_LENGTH) throw new Error('Link too long');
  const payload = JSON.parse(new TextDecoder().decode(fromBase64url(text))) as MomentLink;
  const name = (value: unknown) =>
    typeof value === 'string' && value.length > 0 && value.length <= 80;
  if (
    payload?.v !== 1 ||
    !['winner', 'equalizer', 'wonder', 'final', 'hat-trick'].includes(payload.kind) ||
    !Number.isInteger(payload.minute) ||
    payload.minute < 1 ||
    payload.minute > 130 ||
    !name(payload.scorer) ||
    !name(payload.home?.[0]) ||
    !name(payload.away?.[0]) ||
    !HEX.test(payload.home[1]) ||
    !HEX.test(payload.away[1]) ||
    !Array.isArray(payload.score) ||
    payload.score.length !== 2 ||
    !payload.score.every((goals) => Number.isInteger(goals) && goals >= 0 && goals < 40) ||
    typeof payload.seed !== 'string' ||
    payload.seed.length > 256 ||
    typeof payload.clip !== 'string'
  )
    throw new Error('Invalid moment');
  return { ...payload, decoded: decodeClip(payload.clip) };
}
