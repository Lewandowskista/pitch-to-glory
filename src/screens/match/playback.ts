import type { Point, ReplayFrame } from '../../model/domain';

/**
 * Plays a passage of engine keyframes (see engine/match/motion.ts) in real time. Keyframe
 * times are sporting milliseconds; `rate` compresses them (18 means 18 s of play per real
 * second) and `maxMs` caps the whole passage so it ends before the next one arrives.
 */
export interface Playback {
  frames: ReplayFrame[];
  /** Wall-clock offset of each keyframe from the start, in ms. */
  times: number[];
  duration: number;
}
export interface PlaybackSample {
  players: Map<string, Point>;
  ball: Point;
  /** Height of a lofted ball, 0 on the ground to 1 at the top of the arc. */
  height: number;
}

export function preparePlayback(frames: ReplayFrame[], rate: number, maxMs: number): Playback {
  const start = frames[0]?.timeMs ?? 0;
  const sporting = (frames[frames.length - 1]?.timeMs ?? start) - start;
  const duration = Math.max(0, Math.min(maxMs, sporting / Math.max(rate, 0.001)));
  const scale = sporting > 0 ? duration / sporting : 0;
  return { frames, times: frames.map((frame) => (frame.timeMs - start) * scale), duration };
}

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const mix = (a: Point, b: Point, u: number): Point => ({
  x: a.x + (b.x - a.x) * u,
  y: a.y + (b.y - a.y) * u,
});
/** Uniform Catmull-Rom through p1 → p2, so runs curve smoothly through keyframes. */
function spline(p0: Point, p1: Point, p2: Point, p3: Point, u: number): Point {
  const u2 = u * u,
    u3 = u2 * u;
  const axis = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
  return { x: axis(p0.x, p1.x, p2.x, p3.x), y: axis(p0.y, p1.y, p2.y, p3.y) };
}
function pointOf(frame: ReplayFrame | undefined, id: string): Point | undefined {
  return frame?.players.find((player) => player.id === id)?.point;
}

/** Positions at `elapsed` ms into a playback. */
export function samplePlayback(playback: Playback, elapsed: number): PlaybackSample {
  const { frames, times } = playback;
  const last = frames.length - 1;
  let i = 0;
  while (i < last - 1 && times[i + 1]! <= elapsed) i++;
  const a = frames[i]!,
    b = frames[Math.min(last, i + 1)]!;
  const length = times[Math.min(last, i + 1)]! - times[i]!;
  const u =
    last === 0 || elapsed >= playback.duration
      ? 1
      : length > 0
        ? Math.max(0, Math.min(1, (elapsed - times[i]!) / length))
        : 1;
  const snap = b.ballMotion === 'reset';
  const players = new Map<string, Point>();
  for (const player of b.players) {
    const p1 = pointOf(a, player.id) ?? player.point;
    if (snap || p1 === player.point) {
      players.set(player.id, snap && u > 0 ? player.point : p1);
      continue;
    }
    const p0 = pointOf(frames[i - 1], player.id) ?? p1;
    const p3 = pointOf(frames[i + 2], player.id) ?? player.point;
    players.set(player.id, spline(p0, p1, player.point, p3, u));
  }
  let ball: Point,
    height = 0;
  const motion = b.ballMotion;
  if (snap) ball = u > 0 ? b.ball : a.ball;
  else if (motion === 'carry' && b.carrierId && b.carrierId === a.carrierId)
    // A dribble: the ball stays at the runner's feet.
    ball = players.get(b.carrierId) ?? mix(a.ball, b.ball, u);
  else if (motion === 'air' || motion === 'over') {
    ball = mix(a.ball, b.ball, u);
    const reach = Math.min(
      1,
      (Math.abs(b.ball.x - a.ball.x) + Math.abs(b.ball.y - a.ball.y) * 0.65) / 30,
    );
    height = 4 * u * (1 - u) * reach * (motion === 'over' ? 1.3 : 1);
  } else if (motion === 'shot') ball = mix(a.ball, b.ball, 0.5 * u + 0.5 * easeOut(u));
  else ball = mix(a.ball, b.ball, easeOut(u));
  return { players, ball, height };
}
