import type { Hex, Moment, Point } from '../../../model/domain';

/**
 * The Moments clip codec and share link (AGENTS.md §9.7). Dependency-free, so the public
 * replay page and the save validator can use it without the rest of the career engine.
 */
export interface ClipFrame {
  ball: Point;
  players: Point[];
}
export interface Clip {
  /** Index of the scorer among the 22 players (home 0–10, away 11–21). */
  selected: number;
  frames: ClipFrame[];
}

const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value * 2.55)));
const fromByte = (value: number) => Math.round((value / 2.55) * 10) / 10;
function base64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Version 1: [1, frames, selected, then per frame ball x, y and 22 × (x, y)], base64url. */
export function encodeClip(clip: Clip): string {
  const bytes = [1, clip.frames.length, clip.selected];
  for (const frame of clip.frames) {
    bytes.push(toByte(frame.ball.x), toByte(frame.ball.y));
    for (const point of frame.players) bytes.push(toByte(point.x), toByte(point.y));
  }
  return base64url(Uint8Array.from(bytes));
}
export function decodeClip(text: string): Clip {
  const bytes = fromBase64url(text);
  if (bytes[0] !== 1) throw new Error('Unknown clip version');
  const count = bytes[1]!;
  if (count < 1 || count > 12 || bytes.length !== 3 + count * 46 || bytes[2]! > 21)
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
  if (text.length > 6000) throw new Error('Link too long');
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
    payload.seed.length > 256
  )
    throw new Error('Invalid moment');
  return { ...payload, decoded: decodeClip(payload.clip) };
}
