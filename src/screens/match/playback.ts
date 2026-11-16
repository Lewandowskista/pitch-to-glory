import type { BallMotion, Point, ReplayFrame } from '../../model/domain';

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
  motion: BallMotion | undefined;
  carrierId: string | null;
  /** Flight endpoints and progress, used for direction, foot offsets and impact cues. */
  from: ReplayFrame;
  to: ReplayFrame;
  progress: number;
}

export function preparePlayback(frames: ReplayFrame[], rate: number, maxMs: number): Playback {
  // Quick actions need time to register even when a long run precedes them. At higher
  // speeds the cap compresses the passage, retaining its relative action timing.
  const minimum: Partial<Record<BallMotion, number>> = {
    ground: 160,
    air: 300,
    over: 300,
    shot: 240,
    loose: 160,
    carry: 120,
    dead: 100,
  };
  const steps = frames.slice(1).map((frame, i) => {
    const sporting = Math.max(0, frame.timeMs - frames[i]!.timeMs);
    return sporting === 0
      ? 0
      : Math.max(sporting / Math.max(rate, 0.001), minimum[frame.ballMotion ?? 'carry'] ?? 0);
  });
  const total = steps.reduce((sum, step) => sum + step, 0);
  const duration = Math.max(0, Math.min(maxMs, total));
  const scale = total > 0 ? duration / total : 0;
  const times = [0];
  for (const step of steps) times.push(times[times.length - 1]! + step * scale);
  return { frames, times, duration };
}

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const mix = (a: Point, b: Point, u: number): Point => ({
  x: a.x + (b.x - a.x) * u,
  y: a.y + (b.y - a.y) * u,
});
/** Time-aware monotone Hermite: continuous velocity without overshoot at stops/turns. */
function spline(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  u: number,
  before: number,
  length: number,
  after: number,
): Point {
  const u2 = u * u,
    u3 = u2 * u;
  const axis = (a: number, b: number, c: number, d: number) => {
    const slope = length > 0 ? (c - b) / length : 0;
    if (slope === 0) return b;
    const tangent = (left: number, right: number) =>
      left * right <= 0
        ? 0
        : Math.sign(left) *
          Math.min(Math.abs((left + right) / 2), 3 * Math.min(Math.abs(left), Math.abs(right)));
    const m1 = tangent(before > 0 ? (b - a) / before : slope, slope) * length;
    const m2 = tangent(slope, after > 0 ? (d - c) / after : slope) * length;
    return (
      (2 * u3 - 3 * u2 + 1) * b + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * c + (u3 - u2) * m2
    );
  };
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
    // A restart is a discontinuity, not an upcoming run to curve towards.
    const before = a.ballMotion === 'reset' ? 0 : times[i]! - (times[i - 1] ?? times[i]!);
    const after =
      frames[i + 2]?.ballMotion === 'reset' ? 0 : (times[i + 2] ?? times[i + 1]!) - times[i + 1]!;
    const p0 = pointOf(frames[i - 1], player.id) ?? p1;
    const p3 = pointOf(frames[i + 2], player.id) ?? player.point;
    const point = spline(p0, p1, player.point, p3, u, before, length, after);
    players.set(player.id, {
      x: Math.max(0, Math.min(100, point.x)),
      y: Math.max(0, Math.min(100, point.y)),
    });
  }
  let ball: Point,
    height = 0;
  // A skipped passage can start from the positions still on screen, with a different
  // carrier. Show the connecting pass instead of snapping the ball to the new runner.
  const motion = b.ballMotion === 'carry' && a.carrierId !== b.carrierId ? 'ground' : b.ballMotion;
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
  else ball = mix(a.ball, b.ball, motion === 'loose' ? easeOut(u) : u);
  const carrierId =
    motion === 'carry' && a.carrierId === b.carrierId
      ? (b.carrierId ?? null)
      : u >= 1
        ? (b.carrierId ?? null)
        : null;
  return { players, ball, height, motion, carrierId, from: a, to: b, progress: u };
}
