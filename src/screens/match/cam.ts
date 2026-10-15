import type { KeyMoment, Point, ReplayFrame } from '../../model/domain';
import { attacksRightAt, SITUATION_BY_ID, type MatchSetup } from '../../engine/match';

/**
 * The tactical camera's geometry (redesign phase 5b). A key moment is drawn on a vertical
 * pitch with the selected player's team attacking north, framed on the third where the play
 * is and showing only the players involved. From engine match-15 (phase 6, M4) the engine
 * names the cast and each choice's target; sessions from earlier engines derive the cast here
 * from the moment's frame. Everything is in metres: `x` across the pitch (0–68, the attacking
 * team's left to right) and `y` from the goal it attacks (0–105).
 */
export type CamZone = 'final' | 'middle' | 'defensive';
/**
 * `press`: the opponent closing you down; `carrier`: the attacker on the ball when you defend;
 * `cover`: players covering (opponents when you attack, teammates when you defend); `runner`:
 * your runner in behind, or theirs to track; `crosser`: who delivers an aerial ball.
 */
export type CastRole =
  | 'you'
  | 'press'
  | 'carrier'
  | 'cover'
  | 'free'
  | 'runner'
  | 'crosser'
  | 'keeper'
  | 'opponent'
  | 'teammate';
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
  /** What the arrow shows: a shot, a pass to a teammate, a carry or step, or a challenge. */
  kind?: 'shot' | 'pass' | 'lane' | 'player';
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

/**
 * The window for a zone at an aspect ratio (width / height); phones use a wider crop. Given a
 * centre (metres from the attacked goal), the window follows the play instead of the third's
 * fixed frame, kept within the pitch's ends; the zone still names the third.
 */
export function camWindow(
  zone: CamZone,
  aspect = WINDOW_WIDTH / 42.2,
  centreAt?: number,
): CamWindow {
  const height = WINDOW_WIDTH / aspect;
  const centre = centreAt ?? ZONE_TOP[zone] + 42.2 / 2;
  const top =
    centreAt === undefined
      ? centre - height / 2
      : Math.max(ZONE_TOP.final, Math.min(ZONE_TOP.defensive + 42.2 - height, centre - height / 2));
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

/**
 * The cast the engine named (match-15), in the camera's roles: you first, then the opponent
 * closing you down (or the attacker on the ball when you defend), the runner, the crosser,
 * those covering, teammates in space and the keeper that matters. Null for earlier engines.
 */
export function engineCast(
  moment: KeyMoment,
  setup: Pick<MatchSetup, 'home' | 'away' | 'selectedPlayerId'>,
  attacking: boolean,
): CastMember[] | null {
  const cast = moment.cast;
  if (!cast) return null;
  const own = new Set(
    (setup.home.playerIds.includes(setup.selectedPlayerId) ? setup.home : setup.away).playerIds,
  );
  const members: CastMember[] = [{ id: cast.selected, role: 'you', own: true }];
  const add = (id: string | undefined, role: CastRole) => {
    if (id && !members.some((member) => member.id === id))
      members.push({ id, role, own: own.has(id) });
  };
  add(cast.presser, attacking ? 'press' : 'carrier');
  add(cast.runner, 'runner');
  add(cast.crosser, 'crosser');
  for (const id of cast.cover) add(id, 'cover');
  for (const id of cast.free) add(id, 'free');
  add(cast.keeper, 'keeper');
  return members;
}

const CAM_ZONES: Record<NonNullable<KeyMoment['zone']>, CamZone> = {
  def: 'defensive',
  mid: 'middle',
  final: 'final',
};
/** Pulls an arrow's head back from a player's token so it stays visible. */
function short(from: Point, to: Point, metres: number): Point {
  const length = distance(from, to);
  if (length <= metres * 2) return to;
  return {
    x: to.x - ((to.x - from.x) * metres) / length,
    y: to.y - ((to.y - from.y) * metres) / length,
  };
}
/**
 * Arrows from the engine's choice targets (match-15): a shot to the near or far post (marked)
 * or where it is aimed, a pass to the named teammate, a carry's lane or the space a defender
 * steps into, and a challenge on the attacker or the runner to track. Null for earlier engines.
 */
export function targetArrows(
  moment: KeyMoment,
  you: Point,
  attacksRight: boolean,
): CamArrow[] | null {
  if (!moment.choices.some((choice) => choice.target)) return moment.cast ? [] : null;
  const at = (id: string) => {
    const point = moment.frame.players.find((p) => p.id === id)?.point;
    return point ? toCam(point, attacksRight) : undefined;
  };
  const arrows: CamArrow[] = [];
  moment.choices.forEach((choice, index) => {
    const target = choice.target;
    if (!target) return;
    const number = index + 1;
    if (target.kind === 'goal') {
      arrows.push({
        number,
        from: you,
        to: toCam(target.point, attacksRight),
        kind: 'shot',
        ...(target.post !== 'centre' ? { post: target.post } : {}),
      });
    } else if (target.kind === 'lane') {
      arrows.push({ number, from: you, to: toCam(target.point, attacksRight), kind: 'lane' });
    } else {
      const to = at(target.playerId);
      if (to)
        arrows.push({
          number,
          from: you,
          to: short(you, to, 2.2),
          kind: target.kind === 'teammate' ? 'pass' : 'player',
        });
    }
  });
  return arrows;
}

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
  const attacking = attackingMoment(moment, side, setup.home);
  const engine = you && moment.zone ? targetArrows(moment, you, attacksRight) : null;
  // The engine names the third (match-15), and the window follows the play: halfway between
  // the player and where the choices go, so a build-up on the edge of a third shows its runs.
  const ends = (engine ?? []).map((arrow) => arrow.to.y);
  const window =
    moment.zone && you
      ? camWindow(
          CAM_ZONES[moment.zone],
          aspect,
          ends.length ? (you.y + ends.reduce((sum, y) => sum + y, 0) / ends.length) / 2 : you.y,
        )
      : camWindow(zoneOf(ball, you), aspect);
  // The engine's cast and targets (match-15); the derivation stays for earlier sessions.
  const cast =
    engineCast(moment, setup, attacking) ??
    deriveCast(moment.frame, setup, attacksRight, window, attacking);
  const arrows = you ? (engine ?? choiceArrows(moment, you)) : [];
  return { attacksRight, window, cast, arrows };
}
/** The phones' camera crop: a little wider than the desktop frame, to save height. */
export const COMPACT_ASPECT = 1.9;
