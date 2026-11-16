import type { Point, ReplayFrame } from '../../../model/domain';
import { PITCH_LENGTH_M, PITCH_WIDTH_M, toCam } from '../cam';

/*
 * The clip camera (docs/EXPERIENCE-REDESIGN-1.0.md §1.3), shared by the Pixi renderer and its
 * SVG stills. Everything is in "clip metres": `x` across the pitch (0–68, the player's team's
 * left to right) and `y` from the goal the player's team attacks (0–105), so that team always
 * attacks up the screen in portrait, and to the right in landscape.
 */
/** The camera frames about 30 m across and 35 m along the pitch. */
export const VIEW_ACROSS_M = 30;
export const VIEW_ALONG_M = 35;
/** How far past the touchlines and goal lines the camera may look. */
const MARGIN_M = 5;
/** Camera follow: how quickly it catches up with the play (ms to close about 63% of a gap). */
export const FOLLOW_MS = 220;
/** Token sizes in CSS pixels: the cast, the ghosts and the ball. */
export const TOKEN_PX = 25;
export const GHOST_PX = 16;
export const BALL_PX = 8;
export const GHOST_ALPHA = 0.35;
/** Arrow and badge colours by choice number, as on the tactical camera. */
export const ARROW_COLOURS = ['#efcf63', '#ffffff', '#9ed9b7'] as const;

export { PITCH_LENGTH_M, PITCH_WIDTH_M };
/** An engine point in clip metres. */
export const toClip = (point: Point, attacksRight: boolean): Point => toCam(point, attacksRight);

/** Pixels per metre for a stage of `width` × `height` CSS pixels. */
export function pixelsPerMetre(width: number, height: number, vertical: boolean): number {
  const across = vertical ? width : height;
  const along = vertical ? height : width;
  return Math.max(1, Math.min(across / VIEW_ACROSS_M, along / VIEW_ALONG_M));
}

/** Where the camera wants to be: on the ball, leaning a little towards the player. */
export function cameraTarget(ball: Point, you: Point | undefined, lean = 0.2): Point {
  return you ? { x: ball.x + (you.x - ball.x) * lean, y: ball.y + (you.y - ball.y) * lean } : ball;
}

/**
 * Keep the camera's centre where its view stays on (or just past) the pitch, given the view's
 * size in metres across and along.
 */
export function clampCamera(centre: Point, across: number, along: number): Point {
  const clamp = (value: number, size: number, extent: number) => {
    const low = -MARGIN_M + size / 2;
    const high = extent + MARGIN_M - size / 2;
    return low > high ? extent / 2 : Math.min(high, Math.max(low, value));
  };
  return {
    x: clamp(centre.x, across, PITCH_WIDTH_M),
    y: clamp(centre.y, along, PITCH_LENGTH_M),
  };
}

/** One step of the follow camera: `dt` ms closer to `target`, frame-rate independent. */
export function follow(camera: Point, target: Point, dt: number): Point {
  const k = 1 - Math.exp(-Math.max(0, dt) / FOLLOW_MS);
  return { x: camera.x + (target.x - camera.x) * k, y: camera.y + (target.y - camera.y) * k };
}

/** The view's size in metres for a stage in CSS pixels. */
export function viewSize(width: number, height: number, vertical: boolean) {
  const ppm = pixelsPerMetre(width, height, vertical);
  return vertical
    ? { ppm, across: width / ppm, along: height / ppm }
    : { ppm, across: height / ppm, along: width / ppm };
}

/** Where the camera rests on a still frame: on the ball and the player. */
export function frameCamera(
  frame: ReplayFrame,
  you: string,
  attacksRight: boolean,
  view: { across: number; along: number },
  lean = 0.2,
): Point {
  const ball = toClip(frame.ball, attacksRight);
  const point = frame.players.find((player) => player.id === you)?.point;
  return clampCamera(
    cameraTarget(ball, point ? toClip(point, attacksRight) : undefined, lean),
    view.across,
    view.along,
  );
}

/** A clip-metre point on the stage, in CSS pixels, for a camera centre. */
export function toStage(
  point: Point,
  camera: Point,
  size: { width: number; height: number; ppm: number },
  vertical: boolean,
): Point {
  const dx = (point.x - camera.x) * size.ppm;
  const dy = (point.y - camera.y) * size.ppm;
  // Landscape: the attacked goal is on the right, the team's left at the top.
  return vertical
    ? { x: size.width / 2 + dx, y: size.height / 2 + dy }
    : { x: size.width / 2 - dy, y: size.height / 2 + dx };
}

/**
 * Where an arrow's numbered badge sits: 60% along its curve, or, on an arrow too short to
 * carry it clear of the player's token, just past its head.
 */
export function badgePoint(a: Point, c: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 70) {
    const ex = b.x - c.x,
      ey = b.y - c.y;
    const el = Math.hypot(ex, ey) || 1;
    return { x: b.x + (ex / el) * 16, y: b.y + (ey / el) * 16 };
  }
  const t = 0.6,
    v = 1 - t;
  return {
    x: v * v * a.x + 2 * v * t * c.x + t * t * b.x,
    y: v * v * a.y + 2 * v * t * c.y + t * t * b.y,
  };
}
