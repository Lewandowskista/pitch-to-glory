import type { KeyMoment, Point, ReplayFrame } from '../../model/domain';
import { attacksRightAt, SITUATION_BY_ID, type MatchSetup } from '../../engine/match';

/**
 * The tactical camera's geometry (redesign phase 5b). A key moment is drawn on a vertical
 * pitch with the selected player's team attacking north, framed on the third where the play
 * is and showing only the players involved. Until the engine names the cast (phase 6, M4),
 * the cast is derived here from the moment's frame. Everything is in metres: `x` across the
 * pitch (0–68, the attacking team's left to right) and `y` from the goal it attacks (0–105).
 */
export type CamZone = 'final' | 'middle' | 'defensive';
export type CastRole = 'you' | 'press' | 'free' | 'keeper' | 'opponent' | 'teammate';
export interface CastMember {
  id: string;
  role: CastRole;
  /** On the selected player's team. */
  own: boolean;
}
export interface CamWindow {
  zone: CamZone;
  /** SVG viewBox in decimetres (the drawing's units). */
  viewBox: string;
  top: number;
  bottom: number;
}
export interface CamArrow {
  /** 1-based choice number, matching the key on the choice card. */
  number: number;
  from: Point;
  to: Point;
  /** "Near post" / "Far post" when the target is a named post. */
  post?: 'near' | 'far';
}

export const PITCH_WIDTH_M = 68;
export const PITCH_LENGTH_M = 105;
/** Width of the camera window across the pitch, and its default height (720 × 422 dm). */
const WINDOW_WIDTH = 72;
const WINDOW_LEFT = -2;
/** The third each zone frames, from the attacked goal (metres), with room for labels. */
const ZONE_TOP: Record<CamZone, number> = { final: -4.2, middle: 31.8, defensive: 66.8 };
const PASS_BEATS = new Set(['pass', 'cross', 'switch', 'through', 'long', 'cutback']);

/** The selected team's side: 0 home, 1 away. */
export const selectedSide = (setup: Pick<MatchSetup, 'home' | 'selectedPlayerId'>): 0 | 1 =>
  setup.home.playerIds.includes(setup.selectedPlayerId) ? 0 : 1;

/** Whether the selected team attacks towards x = 100 at a minute (it changes at half-time). */
export const selectedAttacksRight = (
  setup: Pick<MatchSetup, 'home' | 'selectedPlayerId'>,
  minute: number,
) => attacksRightAt(selectedSide(setup), minute);

/** An engine point (0–100 along, 0–100 across) on the vertical camera pitch, in metres. */
export function toCam(point: Point, attacksRight: boolean): Point {
  const along = attacksRight ? point.x : 100 - point.x;
  const across = attacksRight ? point.y : 100 - point.y;
  return { x: (across * PITCH_WIDTH_M) / 100, y: ((100 - along) * PITCH_LENGTH_M) / 100 };
}

/** The third the play is in: halfway between the ball and the selected player. */
export function zoneOf(ball: Point, you: Point | undefined): CamZone {
  const depth = you ? (ball.y + you.y) / 2 : ball.y;
  return depth < PITCH_LENGTH_M / 3
    ? 'final'
    : depth < (2 * PITCH_LENGTH_M) / 3
      ? 'middle'
      : 'defensive';
}

/** The window for a zone at an aspect ratio (width / height); phones use a wider crop. */
export function camWindow(zone: CamZone, aspect = WINDOW_WIDTH / 42.2): CamWindow {
  const height = WINDOW_WIDTH / aspect;
  const centre = ZONE_TOP[zone] + 42.2 / 2;
  const top = centre - height / 2;
  const d = (value: number) => Math.round(value * 10);
  return {
    zone,
    top,
    bottom: top + height,
    viewBox: `${d(WINDOW_LEFT)} ${d(top)} ${d(WINDOW_WIDTH)} ${d(height)}`,
  };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A short name for labels: the surname (the last word). */
export function surname(name: string): string {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? name;
}

/**
 * Who the camera shows at a key moment: the selected player, the two or three opponents
 * nearest the ball and the player (the nearest to the player is the one pressing), the
 * opposing keeper in the final third (your own in the defensive third), and the one or two
 * nearest teammates ahead of the ball when attacking (goal-side when defending). Among the
 * teammates, one at least 6 m from every opponent is marked free.
 */
export function deriveCast(
  frame: ReplayFrame,
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>,
  attacksRight: boolean,
  window: CamWindow,
  attacking: boolean,
): CastMember[] {
  const ownIds = new Set(
    (setup.home.playerIds.includes(setup.selectedPlayerId) ? setup.home : setup.away).playerIds,
  );
  const at = new Map(frame.players.map((p) => [p.id, toCam(p.point, attacksRight)]));
  const ball = toCam(frame.ball, attacksRight);
  const you = at.get(setup.selectedPlayerId) ?? ball;
  const inView = (point: Point) =>
    point.x >= WINDOW_LEFT &&
    point.x <= WINDOW_LEFT + WINDOW_WIDTH &&
    point.y >= window.top + 1 &&
    point.y <= window.bottom - 3;
  const keeper = (id: string) => setup.players[id]?.primaryPosition === 'GK';
  const others = frame.players.filter((p) => p.id !== setup.selectedPlayerId);
  const opponents = others.filter((p) => !ownIds.has(p.id) && !keeper(p.id));
  const teammates = others.filter((p) => ownIds.has(p.id) && !keeper(p.id));
  const near = (id: string) => Math.min(distance(at.get(id)!, ball), distance(at.get(id)!, you));
  const cast: CastMember[] = [{ id: setup.selectedPlayerId, role: 'you', own: true }];
  const chosen = opponents
    .filter((p) => inView(at.get(p.id)!))
    .sort((a, b) => near(a.id) - near(b.id) || (a.id < b.id ? -1 : 1))
    .slice(0, 3);
  const presser = [...chosen].sort(
    (a, b) => distance(at.get(a.id)!, you) - distance(at.get(b.id)!, you),
  )[0];
  for (const p of chosen)
    cast.push({ id: p.id, role: p === presser ? 'press' : 'opponent', own: false });
  if (window.zone !== 'middle') {
    const wanted = window.zone === 'final' ? false : true;
    const gk = others.find((p) => keeper(p.id) && ownIds.has(p.id) === wanted);
    if (gk && inView(at.get(gk.id)!)) cast.push({ id: gk.id, role: 'keeper', own: wanted });
  }
  const ahead = (id: string) =>
    attacking ? at.get(id)!.y <= ball.y + 2 : at.get(id)!.y >= ball.y - 2;
  const byBall = (a: { id: string }, b: { id: string }) =>
    distance(at.get(a.id)!, ball) - distance(at.get(b.id)!, ball) || (a.id < b.id ? -1 : 1);
  const visible = teammates.filter((p) => inView(at.get(p.id)!));
  const mates = [...visible.filter((p) => ahead(p.id)).sort(byBall)];
  for (const p of [...visible].sort(byBall)) if (!mates.includes(p)) mates.push(p);
  const picked = mates.slice(0, 2);
  const space = (id: string) =>
    Math.min(
      Infinity,
      ...frame.players
        .filter((p) => !ownIds.has(p.id))
        .map((p) => distance(at.get(p.id)!, at.get(id)!)),
    );
  const free = attacking
    ? [...picked].sort((a, b) => space(b.id) - space(a.id)).find((p) => space(p.id) >= 6)
    : undefined;
  for (const p of picked)
    cast.push({ id: p.id, role: p === free ? 'free' : 'teammate', own: true });
  return cast;
}

/** Whether the selected team is on the ball at a key moment, from its situation. */
export function attackingMoment(moment: KeyMoment, side: 0 | 1, home: { playerIds: string[] }) {
  const phase = SITUATION_BY_ID[moment.situationId]?.phase;
  if (phase) return phase === 'attack';
  const carrier = moment.frame.carrierId;
  if (carrier) return home.playerIds.includes(carrier) === (side === 0);
  return true;
}

/**
 * Arrows for choices whose target is known today: shots at a post, from the situation
 * template's aim (goal-mouth width, 0–100). The aim is mirrored when the player is on the
 * right, so "near post" points at the post nearer to the shooter. Other choices get their
 * targets with the engine's cast (phase 6).
 */
export function choiceArrows(moment: KeyMoment, you: Point): CamArrow[] {
  const situation = SITUATION_BY_ID[moment.situationId];
  if (!situation) return [];
  const right = you.x > PITCH_WIDTH_M / 2;
  const arrows: CamArrow[] = [];
  moment.choices.forEach((choice, index) => {
    const template = situation.choices.find((c) => c.id === choice.id);
    if (!template || template.target === undefined || template.direct !== 'for') return;
    const offset = ((template.target - 50) * PITCH_WIDTH_M) / 100;
    const post = /near-post/.test(choice.id)
      ? 'near'
      : /far-post/.test(choice.id)
        ? 'far'
        : undefined;
    arrows.push({
      number: index + 1,
      from: you,
      to: { x: PITCH_WIDTH_M / 2 + (right ? -offset : offset), y: 0.6 },
      post,
    });
  });
  return arrows;
}

/**
 * Who else the replay of a decision involves: anyone who plays, receives or carries the ball
 * in the replayed keyframes (the teammate who finishes a square pass, the keeper who saves).
 */
export function replayIds(frames: readonly ReplayFrame[]): string[] {
  const ids = new Set<string>();
  for (const frame of frames) {
    if (frame.carrierId) ids.add(frame.carrierId);
    if (frame.beat) {
      ids.add(frame.beat.actorId);
      if (frame.beat.receiverId) ids.add(frame.beat.receiverId);
    }
  }
  return [...ids];
}

/** The keyframes a decision's replay plays: its focus, or the whole passage without one. */
export function focusFrames(motion: {
  frames: ReplayFrame[];
  focus?: { start: number; end: number };
}) {
  const { frames, focus } = motion;
  if (!focus) return frames;
  const start = Math.max(0, Math.min(frames.length - 1, focus.start));
  const end = Math.max(start, Math.min(frames.length - 1, focus.end));
  return frames.slice(start, end + 1);
}

/** The last completed pass in a run of keyframes up to an index, for the live trail. */
export function lastPass(frames: readonly ReplayFrame[], upTo: number) {
  for (let i = Math.min(upTo, frames.length - 1); i > 0; i--) {
    const beat = frames[i]!.beat;
    if (beat && PASS_BEATS.has(beat.kind))
      return { index: i, from: frames[i - 1]!.ball, to: frames[i]!.ball };
  }
  return null;
}
export const isPassBeat = (kind: string | undefined) => Boolean(kind && PASS_BEATS.has(kind));

/** Everything the camera needs for a key moment, at an aspect ratio (phones crop wider). */
export function momentCamera(
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>,
  moment: KeyMoment,
  aspect?: number,
) {
  const attacksRight = selectedAttacksRight(setup, moment.minute);
  const side = selectedSide(setup);
  const ball = toCam(moment.frame.ball, attacksRight);
  const youPoint = moment.frame.players.find((p) => p.id === setup.selectedPlayerId)?.point;
  const you = youPoint ? toCam(youPoint, attacksRight) : undefined;
  const window = camWindow(zoneOf(ball, you), aspect);
  const cast = deriveCast(
    moment.frame,
    setup,
    attacksRight,
    window,
    attackingMoment(moment, side, setup.home),
  );
  return { attacksRight, window, cast, arrows: you ? choiceArrows(moment, you) : [] };
}
/** The phones' camera crop: a little wider than the desktop frame, to save height. */
export const COMPACT_ASPECT = 1.9;
