import type { BallMotion, MatchEvent, Point, ReplayFrame } from '../../model/domain';
import { createRng, hashSeed, type Rng } from '../rng';
import { clamp } from './decisions';
import { SITUATION_BY_ID, type Situation } from './situations';
import type { MatchSession, PlayState } from './types';

/**
 * Match motion: turns the engine's events into a continuous, football-logical passage of
 * play. Outcomes (shots, goals, decisions) are decided by the calibrated statistical model;
 * this module only choreographs how they happen on the pitch:
 *
 * - possession moves between actual teammates by passes, carries, tackles and interceptions;
 * - both teams hold a 4-3-3 shape that slides with the ball, compresses out of possession,
 *   presses the ball carrier with the two nearest players and respects the offside line;
 * - every recorded shot is struck by its shooter from a shooting position and ends in the
 *   net, in the keeper's hands, off a defender, wide or over, matching the commentary line;
 * - restarts follow the laws: kickoffs after goals and at half-time (ends switched), goal
 *   kicks after misses, corners after parries;
 * - players never move faster than a sprint and the ball always starts where the previous
 *   passage ended, so nothing teleports except the second-half kickoff.
 *
 * Coordinates: `x` 0–100 along the pitch (home attacks x = 100 in the first half), `y` 0–100
 * across it. Each team reasons in its attack frame: depth `d` from its own goal line (0) to the
 * opponent's (100) and width `w` from its left touchline. Replayed values use only + − × ÷,
 * min/max/abs and Math.round, and points are rounded to tenths, so motion replays exactly.
 */

type Side = 0 | 1;
interface Spot {
  d: number;
  w: number;
}
interface Actor {
  id: string;
  /** Position in frames: home slots 0–10, away slots 11–21. */
  index: number;
  side: Side;
  /** Lineup slot: 0 GK, 1 LB, 2–3 CB, 4 RB, 5 CM, 6 DM, 7 CM, 8 LW, 9 ST, 10 RW. */
  slot: number;
  keeper: boolean;
  /** A stable personal offset from the shape, so teammates do not move in lockstep. */
  style: Spot;
}
type ShotVisual = 'goal' | 'catch' | 'parry' | 'block' | 'wide' | 'over' | 'smother' | 'punch';
type PassStyle = 'short' | 'through' | 'cross' | 'long';
interface Want {
  side: Side;
  target: Actor;
}
export interface Passage {
  /** Keyframes, starting with the frame shown before the passage. */
  frames: ReplayFrame[];
  play: PlayState;
  /** Goals choreographed in this passage, with the index of their celebration frame. */
  goals: { eventId: string; playerId: string; frame: number }[];
}

/** One width unit is 0.65 length units (68 m across, 105 m along). */
const WIDTH = 0.65;
/** Top running speed in length units per sporting millisecond (about 9 m/s). */
const RUN = 0.0085;
/** Longest pause a keyframe may take while players walk to their marks. */
const MAX_STEP_MS = 14000;
const CENTRE: Point = { x: 50, y: 50 };
/** Slot positions in the attack frame with the ball on the centre spot. */
const SHAPE: Record<'in' | 'out', readonly (readonly [number, number])[]> = {
  in: [
    [6, 50],
    [38, 13],
    [28, 37],
    [28, 63],
    [38, 87],
    [50, 33],
    [40, 50],
    [50, 67],
    [66, 12],
    [70, 50],
    [66, 88],
  ],
  out: [
    [5, 50],
    [26, 22],
    [23, 41],
    [23, 59],
    [26, 78],
    [38, 36],
    [32, 50],
    [38, 64],
    [50, 25],
    [56, 50],
    [50, 75],
  ],
};
/** Depth bounds per line [in possession min, max, out of possession min, max]. */
const LINE_DEPTH = {
  defence: [7, 68, 9, 52],
  midfield: [10, 84, 8, 66],
  attack: [28, 95, 22, 80],
} as const;
/** Failed shots look like their commentary line (variant index → visual; null = seeded). */
const FAILED_SHOTS: Record<string, readonly (ShotVisual | null)[]> = {
  shot: ['catch', 'block', 'wide'],
  placed: ['wide', 'parry', 'wide'],
  long: ['over', 'catch', 'block'],
  header: ['over', 'catch', 'wide'],
  attempt: [null, 'catch', null],
};
const KEEPER_SAVES: Record<string, ShotVisual> = {
  hold: 'catch',
  parry: 'parry',
  'tip-over': 'parry',
  rush: 'smother',
  smother: 'smother',
  'stay-line': 'catch',
  claim: 'catch',
  punch: 'punch',
  'hold-line': 'catch',
};
const PASS_STYLES: Record<string, PassStyle> = {
  'through-ball': 'through',
  'disguised-pass': 'through',
  'cross-switch': 'cross',
  'clear-long': 'long',
  'long-distribution': 'long',
  'quick-release': 'long',
};
/** Carries: depth gained and width moved towards the centre. */
const CARRIES: Record<string, Spot> = {
  'take-on': { d: 7, w: 3 },
  'drive-inside': { d: 6, w: 10 },
  'carry-forward': { d: 12, w: 0 },
  'carry-out': { d: 11, w: 0 },
  'press-escape': { d: 9, w: 4 },
  'control-shoot': { d: 1.5, w: 0 },
};

const tenth = (value: number) => Math.round(value * 10) / 10;
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
/** Approximate distance in length units (octagonal norm, within 4 %; no square root). */
export function span(a: Point, b: Point): number {
  const dx = Math.abs(a.x - b.x),
    dy = Math.abs(a.y - b.y) * WIDTH;
  return Math.max(dx, dy) * 0.96 + Math.min(dx, dy) * 0.4;
}
/** True when the side attacks towards x = 100 in this minute (home in the first half). */
export const attacksRightAt = (side: number, minute: number) => (side === 0) !== minute > 45;
/** A player's personal offset from the shape, the same in every match. */
const styles = new Map<string, Spot>();
function styleOf(id: string): Spot {
  let style = styles.get(id);
  if (!style) {
    const hash = hashSeed(`style:${id}`);
    style = { d: ((hash % 41) - 20) / 10, w: (((hash >>> 8) % 61) - 30) / 10 };
    if (styles.size > 20000) styles.clear();
    styles.set(id, style);
  }
  return style;
}
const lineOf = (slot: number) => (slot <= 4 ? 'defence' : slot <= 7 ? 'midfield' : 'attack');
const byId = (a: Actor, b: Actor) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

class Director {
  readonly frames: ReplayFrame[] = [];
  readonly actors: Actor[] = [];
  readonly goals: Passage['goals'] = [];
  play: PlayState;
  ball: Point;
  /** Ball actions (passes, carries, shots, tackles) emitted so far. */
  beats = 0;
  /** A goal was celebrated in this passage: its kickoff waits for the next one. */
  celebrated = false;
  private time = 0;
  private readonly lookup = new Map<string, Actor>();
  /** Current positions, by actor index. */
  private readonly pos: Point[] = [];

  constructor(
    private readonly session: MatchSession,
    start: ReplayFrame | null,
    play: PlayState,
    readonly minute: number,
    private readonly startTime: number,
    readonly rng: Rng,
  ) {
    const m = session.state.match;
    [m.home, m.away].forEach((team, side) =>
      team.starterIds.forEach((id, slot) => {
        const actor: Actor = {
          id,
          index: this.actors.length,
          side: side as Side,
          slot,
          keeper: slot === 0,
          style: styleOf(id),
        };
        this.actors.push(actor);
        this.lookup.set(id, actor);
      }),
    );
    this.play = { ...play };
    this.ball = start ? { ...start.ball } : { ...CENTRE };
    const shown = new Map(start?.players.map((p) => [p.id, p.point]));
    for (const actor of this.actors) {
      // A substitute takes the place of the player who left that slot.
      const point = shown.get(actor.id) ?? start?.players[actor.index]?.point;
      this.pos.push(
        point
          ? { ...point }
          : this.toPitch(actor.side, this.shape(actor, actor.side === 0, { d: 50, w: 50 })),
      );
    }
    if (this.play.carrierId && !this.lookup.has(this.play.carrierId)) {
      const index = start?.players.findIndex((p) => p.id === this.play.carrierId) ?? -1;
      this.play.carrierId = this.actors[index]?.id ?? null;
    }
    this.frames.push(this.snapshot(this.ball, this.play.carrierId, 'dead'));
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  actor(id: string | null | undefined): Actor | undefined {
    return id ? this.lookup.get(id) : undefined;
  }
  at(id: string): Point {
    return this.pos[this.lookup.get(id)!.index]!;
  }
  carrier(): Actor | undefined {
    return this.actor(this.play.carrierId);
  }
  toPitch(side: Side, spot: Spot): Point {
    return attacksRightAt(side, this.minute)
      ? { x: spot.d, y: spot.w }
      : { x: 100 - spot.d, y: 100 - spot.w };
  }
  toSpot(side: Side, point: Point): Spot {
    return attacksRightAt(side, this.minute)
      ? { d: point.x, w: point.y }
      : { d: 100 - point.x, w: 100 - point.y };
  }
  /** Where an actor stands in its team's shape for this ball position (attack frame). */
  shape(actor: Actor, inPossession: boolean, ball: Spot): Spot {
    if (actor.keeper)
      return {
        d: clamp(3 + (ball.d - 25) * 0.12, 2, inPossession ? 20 : 14),
        w: 50 + (ball.w - 50) * 0.25,
      };
    const base = SHAPE[inPossession ? 'in' : 'out'][actor.slot]!;
    const bounds = LINE_DEPTH[lineOf(actor.slot)];
    const d = base[0] + (ball.d - 50) * (inPossession ? 0.55 : 0.5) + actor.style.d;
    const w =
      50 +
      (base[1] - 50) * (inPossession ? 1.05 : 0.8) +
      (ball.w - 50) * (inPossession ? 0.12 : 0.3) +
      actor.style.w;
    return {
      d: clamp(
        d,
        inPossession ? bounds[0] : Math.min(bounds[2], ball.d - 2),
        inPossession ? bounds[1] : bounds[3],
      ),
      w: clamp(w, 3, 97),
    };
  }
  teammates(side: Side) {
    return side === 0 ? this.actors.slice(0, 11) : this.actors.slice(11);
  }
  keeperOf(side: Side): Actor {
    return this.actors[side === 0 ? 0 : 11]!;
  }
  /** Outfielders of a side ordered by distance to a point (ties by id). */
  nearest(side: Side, point: Point, exclude?: Set<number>): Actor[] {
    const ranked: { actor: Actor; distance: number }[] = [];
    for (const actor of this.teammates(side))
      if (!actor.keeper && !exclude?.has(actor.index))
        ranked.push({ actor, distance: span(this.pos[actor.index]!, point) });
    return ranked
      .sort((a, b) => a.distance - b.distance || byId(a.actor, b.actor))
      .map((entry) => entry.actor);
  }
  /** The furthest an actor can run towards a point within a sporting duration. */
  reachable(id: string, target: Point, dt: number): Point {
    const from = this.at(id);
    const distance = span(from, target);
    const limit = 1 + dt * RUN;
    return distance <= limit ? { ...target } : lerp(from, target, limit / distance);
  }
  share(side: Side): number {
    const home = this.session.state.stats.homePossession / 100;
    return side === 0 ? home : 1 - home;
  }
  momentum(side: Side): number {
    const value = this.session.state.match.momentum;
    return side === 0 ? value : 100 - value;
  }

  // ── Keyframes ───────────────────────────────────────────────────────────────

  private snapshot(ball: Point, carrierId: string | null, motion: BallMotion): ReplayFrame {
    return {
      timeMs: this.startTime + this.time,
      ball: { x: tenth(ball.x), y: tenth(ball.y) },
      players: this.actors.map((actor) => ({
        id: actor.id,
        point: { ...this.pos[actor.index]! },
        animation: actor.id === carrierId ? 'ball' : 'run',
      })),
      carrierId,
      ballMotion: motion,
    };
  }
  /**
   * Emit one keyframe. The carrier stands on the ball; `fixed` players go to given marks;
   * everyone else takes their shape, the defending pair presses and attackers hold the
   * offside line. The duration stretches until fixed players can reach their marks, and
   * nobody moves faster than a sprint.
   */
  emit(options: {
    dt: number;
    ball: Point;
    motion: BallMotion;
    carrier: string | null;
    side?: Side;
    fixed?: Map<string, Point>;
    dead?: boolean;
    snap?: boolean;
    action?: boolean;
  }): void {
    const count = this.actors.length;
    const marks: (Point | undefined)[] = new Array<Point | undefined>(count);
    for (const [id, point] of options.fixed ?? []) marks[this.lookup.get(id)!.index] = point;
    const carrier = this.actor(options.carrier);
    const side: Side = carrier ? carrier.side : (options.side ?? this.play.side);
    if (carrier) marks[carrier.index] = options.ball;
    let dt = options.dt;
    if (!options.snap)
      for (let i = 0; i < count; i++) {
        const mark = marks[i];
        if (mark) dt = Math.max(dt, (span(this.pos[i]!, mark) - 1) / RUN);
      }
    dt = Math.round(clamp(dt, 0, MAX_STEP_MS));
    const shapeBall = options.dead
      ? { x: clamp(options.ball.x, 10, 90), y: clamp(options.ball.y, 5, 95) }
      : options.ball;
    const fixed = marks.map((mark) => mark !== undefined);
    const targets: Point[] = this.actors.map(
      (actor) =>
        marks[actor.index] ??
        this.toPitch(
          actor.side,
          this.shape(actor, actor.side === side, this.toSpot(actor.side, shapeBall)),
        ),
    );
    if (!options.dead) {
      this.holdOffsideLine(side, targets, fixed, options.ball);
      if (carrier) this.press((1 - side) as Side, targets, fixed, options.ball);
    }
    for (let i = 0; i < count; i++) {
      if (fixed[i]) continue;
      const target = targets[i]!;
      targets[i] = {
        x: target.x + (this.rng.next() - 0.5) * 1.2,
        y: target.y + (this.rng.next() - 0.5) * 1.6,
      };
    }
    this.separate(targets, fixed);
    const limit = options.snap ? Number.POSITIVE_INFINITY : 1 + dt * RUN;
    for (let i = 0; i < count; i++) {
      let target = targets[i]!;
      if (i !== carrier?.index) {
        const from = this.pos[i]!;
        const distance = span(from, target);
        if (distance > limit) target = lerp(from, target, limit / distance);
        if (!fixed[i]) target = { x: clamp(target.x, 0.8, 99.2), y: clamp(target.y, 1, 99) };
      }
      this.pos[i] = { x: tenth(target.x), y: tenth(target.y) };
    }
    this.time += dt;
    this.ball = { x: tenth(options.ball.x), y: tenth(options.ball.y) };
    if (carrier) this.pos[carrier.index] = { ...this.ball };
    this.play.side = side;
    this.play.carrierId = carrier?.id ?? null;
    if (options.action !== false) this.beats++;
    this.frames.push(this.snapshot(this.ball, this.play.carrierId, options.motion));
  }
  /** Hold a run level with the current second-last defender (or the ball) in their half. */
  onside(side: Side, point: Point): Point {
    const depths = this.teammates((1 - side) as Side)
      .map((actor) => this.toSpot(side, this.pos[actor.index]!).d)
      .sort((a, b) => b - a);
    const line = Math.max(50, depths[1] ?? 50, this.toSpot(side, this.ball).d) - 0.5;
    const spot = this.toSpot(side, point);
    return spot.d > line ? this.toPitch(side, { d: line, w: spot.w }) : point;
  }
  /** Attackers without the ball stay level with the second-last defender in their half. */
  private holdOffsideLine(side: Side, targets: Point[], fixed: boolean[], ball: Point) {
    const depths = this.teammates((1 - side) as Side)
      .map((actor) => this.toSpot(side, targets[actor.index]!).d)
      .sort((a, b) => b - a);
    const line = Math.max(50, depths[1] ?? 50, this.toSpot(side, ball).d) - 0.5;
    for (const actor of this.teammates(side)) {
      if (actor.keeper || fixed[actor.index]) continue;
      const spot = this.toSpot(side, targets[actor.index]!);
      if (spot.d > line) targets[actor.index] = this.toPitch(side, { d: line, w: spot.w });
    }
  }
  /** The nearest defender closes the ball down goal-side; the next one covers. */
  private press(side: Side, targets: Point[], fixed: boolean[], ball: Point) {
    const [first, second] = this.nearest(side, ball).filter((actor) => !fixed[actor.index]);
    const spot = this.toSpot(side, ball);
    if (first)
      targets[first.index] = this.toPitch(side, { d: Math.max(1, spot.d - 2.2), w: spot.w });
    if (second)
      targets[second.index] = this.toPitch(side, {
        d: Math.max(2, spot.d - 8),
        w: spot.w + (50 - spot.w) * 0.3,
      });
  }
  /** Push apart players standing on top of each other (teammates keep more room). */
  private separate(targets: Point[], fixed: boolean[]) {
    // Sweep along the pitch: span ≥ 0.96 × |dx|, so only neighbours in x can be too close.
    const order = this.actors
      .map((actor) => actor.index)
      .sort((a, b) => targets[a]!.x - targets[b]!.x || a - b);
    for (let k = 0; k < order.length; k++)
      for (let l = k + 1; l < order.length; l++) {
        const i = order[k]!,
          j = order[l]!;
        const pa = targets[i]!,
          pb = targets[j]!;
        if (Math.abs(pb.x - pa.x) * 0.96 >= 3.4) break;
        const aFree = !fixed[i],
          bFree = !fixed[j];
        if (!aFree && !bFree) continue;
        let dx = pa.x - pb.x,
          dy = pa.y - pb.y;
        const room = this.actors[i]!.side === this.actors[j]!.side ? 3.4 : 2.8;
        if (Math.abs(dy) * WIDTH * 0.96 >= room) continue;
        const distance = span(pa, pb);
        if (distance >= room) continue;
        if (distance < 0.05) {
          dx = 0;
          dy = this.actors[i]!.side === 0 ? 1 : -1;
        }
        const length = Math.max(0.05, span({ x: 0, y: 0 }, { x: dx, y: dy }));
        const push = (room - distance) / length;
        const share = aFree && bFree ? 0.5 : 1;
        if (aFree) targets[i] = { x: pa.x + dx * push * share, y: pa.y + dy * push * share };
        if (bFree) targets[j] = { x: pb.x - dx * push * share, y: pb.y - dy * push * share };
      }
  }

  // ── Ball actions ───────────────────────────────────────────────────────────

  /** Pass to a teammate who runs to meet the ball; returns where it was received. */
  passTo(
    receiver: Actor,
    target: Point,
    air: boolean,
    fixed?: Map<string, Point>,
    exact = false,
  ): Point {
    const length = span(this.ball, target);
    const dt = air ? 1300 + length * 55 : 700 + length * 60;
    // An exact pass waits for the receiver to arrive (scene set-ups).
    const reach = exact ? { ...target } : this.reachable(receiver.id, target, dt);
    this.emit({ dt, ball: reach, motion: air ? 'air' : 'ground', carrier: receiver.id, fixed });
    return reach;
  }
  /** A pass towards `target` cut out by the opponent best placed along its path. */
  intercept(passingSide: Side, target: Point, air: boolean): Actor {
    const from = { ...this.ball };
    const defenders = this.teammates((1 - passingSide) as Side).filter(
      (actor) => !actor.keeper || span(this.at(actor.id), target) < 10,
    );
    let best = defenders[0]!,
      point = target,
      score = Number.POSITIVE_INFINITY;
    for (const fraction of [0.4, 0.6, 0.8, 1]) {
      const sample = lerp(from, target, fraction);
      for (const actor of defenders) {
        const value = span(this.at(actor.id), sample) + fraction * 3;
        if (value < score) {
          score = value;
          best = actor;
          point = sample;
        }
      }
    }
    const length = span(from, point);
    const dt = air ? 1200 + length * 55 : 600 + length * 60;
    this.emit({
      dt,
      ball: this.reachable(best.id, point, dt),
      motion: air ? 'air' : 'ground',
      carrier: best.id,
    });
    return best;
  }
  carry(actor: Actor, target: Point, fixed?: Map<string, Point>): void {
    const destination = { x: clamp(target.x, 1, 99), y: clamp(target.y, 1, 99) };
    this.emit({
      dt: 600 + span(this.ball, destination) * 170,
      ball: destination,
      motion: 'carry',
      carrier: actor.id,
      fixed,
    });
  }
  /** A defender wins the ball from the carrier. */
  tackle(winner: Actor): void {
    const loser = this.carrier();
    const ball = lerp(this.ball, this.at(winner.id), 0.3);
    const fixed = new Map<string, Point>();
    if (loser) fixed.set(loser.id, { ...this.ball });
    this.emit({ dt: 900, ball, motion: 'loose', carrier: winner.id, fixed });
  }
  /** Choose a pass for the team in possession: forward when on top, safe under pressure. */
  pickReceiver(side: Side, cap: number): { actor: Actor; point: Point } | null {
    const from = this.toSpot(side, this.ball);
    const forward = (0.55 + (this.momentum(side) - 50) * 0.012) * (from.d > 72 ? 0.5 : 1);
    let best: { actor: Actor; point: Point } | null = null,
      score = Number.NEGATIVE_INFINITY;
    for (const actor of this.teammates(side)) {
      if (actor.id === this.play.carrierId || (actor.keeper && from.d > 30)) continue;
      const point = this.at(actor.id);
      const spot = this.toSpot(side, point);
      const length = span(this.ball, point);
      if (length < 4) continue;
      let free = Number.POSITIVE_INFINITY;
      for (const marker of this.teammates((1 - side) as Side))
        if (!marker.keeper) free = Math.min(free, span(this.pos[marker.index]!, point));
      const pressure = Math.max(0, 7 - free);
      const value =
        clamp(spot.d - from.d, -15, 25) * forward +
        8 -
        Math.abs(length - 18) * 0.35 -
        pressure * 1.5 -
        (spot.d > cap ? 30 : 0) -
        (length > 50 ? 20 : 0) +
        this.rng.next() * 8;
      if (value > score || (value === score && best && actor.id < best.actor.id)) {
        score = value;
        const run = actor.slot >= 5 ? 1 + this.rng.next() * 3 : 0;
        best = {
          actor,
          point: this.toPitch(side, { d: clamp(spot.d + run, 1, cap), w: spot.w }),
        };
      }
    }
    return best;
  }
  /** One pass of ordinary possession; the defending team may cut it out. */
  flow(cap = 80): void {
    const side = this.play.side;
    if (!this.carrier()) {
      this.collect(side);
      return;
    }
    const option = this.pickReceiver(side, cap);
    if (!option) return;
    const depth = this.toSpot(side, this.ball).d;
    const risk = clamp(0.2 * (1 - this.share(side)), 0.04, 0.2) * (depth > 70 ? 1.6 : 1);
    const air = span(this.ball, option.point) > 35 && this.rng.next() < 0.6;
    if (this.rng.next() < risk) {
      if (this.rng.next() < 0.6) this.intercept(side, option.point, air);
      else this.tackle(this.nearest((1 - side) as Side, this.ball)[0]!);
    } else this.passTo(option.actor, option.point, air);
  }
  /** The nearest player of a side picks up a loose ball. */
  collect(side: Side): void {
    const pool = this.teammates(side).filter(
      (actor) => !actor.keeper || span(this.at(actor.id), this.ball) < 12,
    );
    const collector = pool.sort(
      (a, b) => span(this.at(a.id), this.ball) - span(this.at(b.id), this.ball) || byId(a, b),
    )[0]!;
    this.emit({ dt: 700, ball: this.ball, motion: 'loose', carrier: collector.id });
  }
  /** The side gains possession: a tackle when close, otherwise an interception. */
  winBall(side: Side): void {
    const carrier = this.carrier();
    if (!carrier) {
      this.collect(side);
      return;
    }
    const challenger = this.nearest(side, this.ball)[0]!;
    if (span(this.at(challenger.id), this.ball) < 10 || this.rng.next() < 0.4) {
      this.tackle(challenger);
      return;
    }
    const option = this.pickReceiver(carrier.side, 85);
    if (option) this.intercept(carrier.side, option.point, false);
    else this.tackle(challenger);
  }
  /**
   * Get the ball to `target` (at `spot`, when given): resolve any restart, win it back if
   * needed, then move it up the pitch through teammates while the target makes the run.
   */
  bringBall(want: Want, spot: Point | null, options: { air?: boolean; passes?: number } = {}) {
    this.restart(want);
    if (this.play.side !== want.side || !this.carrier()) this.winBall(want.side);
    const limit = options.passes ?? 3;
    for (let pass = 0; ; pass++) {
      const carrier = this.carrier()!;
      const goal = spot ?? this.at(want.target.id);
      if (carrier.id === want.target.id) {
        if (spot && span(this.ball, spot) > 2) this.carry(carrier, spot);
        return;
      }
      const remaining = span(this.ball, goal);
      // The target times the run to stay onside until the pass is played.
      const run = new Map([
        [want.target.id, this.reachable(want.target.id, this.onside(want.side, goal), 2500)],
      ]);
      const relay =
        remaining > 32 && pass < limit
          ? this.teammates(want.side)
              .filter(
                (actor) =>
                  !actor.keeper &&
                  actor.id !== carrier.id &&
                  actor.id !== want.target.id &&
                  span(this.at(actor.id), goal) < remaining - 8 &&
                  span(this.ball, this.at(actor.id)) > 6 &&
                  span(this.ball, this.at(actor.id)) < 40,
              )
              .map((actor) => ({
                actor,
                score: -span(this.at(actor.id), goal) + this.rng.next() * 8,
              }))
              .sort((a, b) => b.score - a.score || byId(a.actor, b.actor))[0]?.actor
          : undefined;
      if (relay) {
        this.passTo(relay, lerp(this.at(relay.id), goal, 0.15), false, run);
        continue;
      }
      this.passTo(want.target, goal, options.air ?? remaining > 40);
      if (spot && span(this.ball, spot) > 2) this.carry(want.target, spot);
      return;
    }
  }

  // ── Restarts ───────────────────────────────────────────────────────────────

  kickoffMarks(side: Side): { kicker: Actor; marks: Map<string, Point> } {
    const team = this.teammates(side);
    const kicker = team.find((actor) => actor.slot === 9) ?? team[team.length - 1]!;
    const marks = new Map<string, Point>();
    for (const actor of this.actors) {
      const own = actor.side === side;
      const spot = this.shape(actor, own, { d: 50, w: 50 });
      spot.d = Math.min(spot.d, own ? 47 : 44);
      if (!own && Math.abs(spot.w - 50) < 16) spot.d = Math.min(spot.d, 39);
      marks.set(actor.id, this.toPitch(actor.side, spot));
    }
    const partner = team.find((actor) => actor.slot === 5);
    if (partner) marks.set(partner.id, this.toPitch(side, { d: 47.5, w: 44 }));
    marks.set(kicker.id, { ...CENTRE });
    return { kicker, marks };
  }
  /** Place both teams for a kickoff without animation (start of each half). */
  placeKickoff(side: Side, snap: boolean): void {
    const { kicker, marks } = this.kickoffMarks(side);
    if (!snap) {
      this.emit({
        dt: 6000,
        ball: CENTRE,
        motion: 'dead',
        carrier: kicker.id,
        fixed: marks,
        dead: true,
        action: false,
      });
      return;
    }
    for (const [id, point] of marks)
      this.pos[this.lookup.get(id)!.index] = { x: tenth(point.x), y: tenth(point.y) };
    this.emit({
      dt: 0,
      ball: CENTRE,
      motion: 'reset',
      carrier: kicker.id,
      fixed: marks,
      snap: true,
      dead: true,
      action: false,
    });
  }
  kickoff(): void {
    const kicker = this.carrier()!;
    const team = this.teammates(kicker.side).filter((actor) => actor.id !== kicker.id);
    const receiver = team.find((actor) => actor.slot === 6) ?? team.find((a) => !a.keeper)!;
    this.passTo(receiver, this.at(receiver.id), false);
  }
  goalKick(want: Want | undefined): void {
    const side = this.play.side;
    const keeper = this.keeperOf(side);
    const spot = this.toPitch(side, { d: 5.5, w: 50 + (this.rng.next() < 0.5 ? -8 : 8) });
    // Opponents wait outside the area while the keeper places the ball.
    this.emit({
      dt: 4000,
      ball: spot,
      motion: 'dead',
      carrier: keeper.id,
      dead: true,
      action: false,
    });
    const short = want ? want.side === side && want.target.slot <= 4 : this.rng.next() < 0.5;
    if (short) {
      const back = this.teammates(side).find((actor) => actor.slot === (spot.y < 50 ? 2 : 3))!;
      this.passTo(back, this.at(back.id), false);
      return;
    }
    const landing = this.toPitch(side, {
      d: 50 + this.rng.next() * 10,
      w: 30 + this.rng.next() * 40,
    });
    const won = want ? want.side === side : this.rng.next() < 0.55;
    if (!won) {
      this.intercept(side, landing, true);
      return;
    }
    const receiver = this.teammates(side)
      .filter((actor) => actor.slot >= 5)
      .sort(
        (a, b) => span(this.at(a.id), landing) - span(this.at(b.id), landing) || byId(a, b),
      )[0]!;
    this.passTo(receiver, landing, true);
  }
  corner(want: Want | undefined): void {
    const side = this.play.side;
    const left = this.toSpot(side, this.ball).w < 50;
    const team = this.teammates(side);
    const taker = team.find((actor) => actor.slot === (left ? 8 : 10)) ?? team[1]!;
    const flag = this.toPitch(side, { d: 99.4, w: left ? 0.8 : 99.2 });
    const marks = new Map<string, Point>();
    const runners = team.filter((actor) => [2, 3, 5, 9, left ? 10 : 8].includes(actor.slot));
    runners.forEach((actor, index) =>
      marks.set(actor.id, this.toPitch(side, { d: 87 + (index % 3) * 3, w: 38 + index * 5 })),
    );
    const defenders = this.teammates((1 - side) as Side);
    defenders.forEach((actor) => {
      if (actor.keeper) marks.set(actor.id, this.toPitch(side, { d: 98.5, w: 50 }));
      else if (actor.slot <= 7)
        marks.set(
          actor.id,
          this.toPitch(side, { d: 86 + (actor.slot % 3) * 3, w: 36 + actor.slot * 4 }),
        );
    });
    this.emit({
      dt: 5000,
      ball: flag,
      motion: 'dead',
      carrier: taker.id,
      fixed: marks,
      dead: true,
      action: false,
    });
    if (want && want.side === side && !want.target.keeper && want.target.id !== taker.id) {
      this.passTo(
        want.target,
        this.toPitch(side, { d: 89 + this.rng.next() * 3, w: 44 + this.rng.next() * 12 }),
        true,
      );
      return;
    }
    this.intercept(side, this.toPitch(side, { d: 91, w: 46 + this.rng.next() * 8 }), true);
  }
  /** Take any pending restart before play continues. */
  restart(want?: Want): void {
    const restart = this.play.restart;
    if (!restart) return;
    this.play.restart = null;
    if (restart === 'second-half' || restart === 'goal') {
      this.placeKickoff(this.play.side, restart === 'second-half');
      this.kickoff();
    } else if (restart === 'kickoff') this.kickoff();
    else if (restart === 'goal-kick') this.goalKick(want);
    else this.corner(want);
  }

  // ── Shots ──────────────────────────────────────────────────────────────────

  /** Where a player shoots from, by lineup slot (attack frame). */
  shootingSpot(actor: Actor): Point {
    const r = this.rng.next(),
      s = this.rng.next();
    const spot =
      actor.slot === 9
        ? { d: 84 + r * 6, w: 41 + s * 18 }
        : actor.slot === 8
          ? { d: 80 + r * 7, w: 27 + s * 13 }
          : actor.slot === 10
            ? { d: 80 + r * 7, w: 60 + s * 13 }
            : actor.slot === 5 || actor.slot === 7
              ? { d: 74 + r * 7, w: actor.slot === 5 ? 36 + s * 14 : 50 + s * 14 }
              : actor.slot === 6
                ? { d: 71 + r * 6, w: 40 + s * 20 }
                : { d: 87 + r * 5, w: 42 + s * 16 };
    return this.toPitch(actor.side, spot);
  }
  /** Strike from the ball's position; returns where the ball ended. */
  shoot(shooter: Actor, visual: ShotVisual, aim: number): Point {
    const side = shooter.side,
      defending = (1 - side) as Side;
    const keeper = this.keeperOf(defending);
    const origin = { ...this.ball };
    const toward = (d: number, w: number) => this.toPitch(side, { d, w });
    const strike = (
      end: Point,
      motion: BallMotion,
      extra: Partial<Parameters<Director['emit']>[0]>,
    ) =>
      this.emit({
        dt: 250 + span(origin, end) * 28,
        ball: end,
        motion,
        carrier: null,
        side,
        dead: true,
        ...extra,
      });
    const fixed = (point: Point) => new Map([[keeper.id, point]]);
    if (visual === 'goal') {
      const end = toward(101.5, aim);
      // The keeper dives, a yard short of the ball.
      strike(end, 'shot', { fixed: fixed(toward(98.5, aim + (aim < 50 ? 3 : -3))) });
      this.celebrate(shooter, defending);
      return end;
    }
    if (visual === 'catch' || visual === 'smother') {
      const end = visual === 'smother' ? lerp(origin, toward(100, aim), 0.15) : toward(98, aim);
      this.emit({
        dt: 250 + span(origin, end) * 28,
        ball: end,
        motion: 'shot',
        carrier: keeper.id,
      });
      return end;
    }
    if (visual === 'parry' || visual === 'punch') {
      const hands = visual === 'punch' ? this.at(keeper.id) : toward(98, aim);
      this.emit({
        dt: 250 + span(origin, hands) * 28,
        ball: hands,
        motion: visual === 'punch' ? 'air' : 'shot',
        carrier: null,
        side,
        fixed: fixed(hands),
      });
      const away =
        visual === 'parry'
          ? toward(100.8, aim < 50 ? 36 : 64)
          : toward(76 + this.rng.next() * 6, 30 + this.rng.next() * 40);
      this.emit({
        dt: 700,
        ball: away,
        motion: visual === 'parry' ? 'loose' : 'air',
        carrier: null,
        side: visual === 'parry' ? side : defending,
        dead: visual === 'parry',
      });
      if (visual === 'parry') this.play.restart = 'corner';
      return away;
    }
    if (visual === 'block') {
      const blockAt = lerp(origin, toward(100, 50), 0.22);
      const blocker = this.nearest(defending, blockAt)[0]!;
      this.emit({
        dt: 400,
        ball: blockAt,
        motion: 'shot',
        carrier: null,
        side,
        fixed: new Map([[blocker.id, blockAt]]),
      });
      const rebound = lerp(blockAt, origin, 0.4);
      this.emit({
        dt: 600,
        ball: { x: rebound.x, y: clamp(rebound.y + (this.rng.next() - 0.5) * 12, 2, 98) },
        motion: 'loose',
        carrier: null,
        side: defending,
      });
      return this.ball;
    }
    const end =
      visual === 'over'
        ? toward(104, aim)
        : toward(101.5, aim < 50 ? 41 - this.rng.next() * 3 : 59 + this.rng.next() * 3);
    strike(end, visual === 'over' ? 'over' : 'shot', {});
    this.play.side = defending;
    this.play.restart = 'goal-kick';
    return end;
  }
  /** The scorer runs to the corner flag, nearby teammates join, then a kickoff awaits. */
  celebrate(scorer: Actor, conceding: Side): void {
    const spot = this.toSpot(scorer.side, this.at(scorer.id));
    const corner = this.toPitch(scorer.side, { d: 93, w: spot.w < 50 ? 7 : 93 });
    const marks = new Map([[scorer.id, corner]]);
    for (const mate of this.teammates(scorer.side))
      if (!mate.keeper && mate.id !== scorer.id && span(this.at(mate.id), corner) < 40)
        marks.set(mate.id, lerp(this.at(mate.id), corner, 0.75));
    this.emit({
      dt: 3500,
      ball: this.ball,
      motion: 'dead',
      carrier: null,
      side: scorer.side,
      fixed: marks,
      dead: true,
      action: false,
    });
    this.play = { side: conceding, carrierId: null, restart: 'goal' };
    this.celebrated = true;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /** Choreograph engine events in order, fixing their pitch points to what is shown. */
  run(events: MatchEvent[], situation: Situation | null): void {
    const done = new Set<MatchEvent>();
    events.forEach((event, index) => {
      if (done.has(event)) return;
      const actor = this.actor(event.playerId);
      if (event.kind === 'shot' && actor)
        this.shot(event, actor, events.slice(index + 1), done, situation);
      else if (event.kind === 'pass' && actor) this.pass(event, actor, events[index + 1]);
      else if (event.kind === 'dribble' && actor) this.dribble(event, actor);
      else if (event.kind === 'tackle' && actor) this.challenge(event, actor);
    });
  }
  private mark(event: MatchEvent, point: Point, end: Point) {
    event.point = { x: tenth(point.x), y: tenth(point.y) };
    event.endPoint = { x: tenth(end.x), y: tenth(end.y) };
  }
  private shot(
    event: MatchEvent,
    shooter: Actor,
    rest: MatchEvent[],
    done: Set<MatchEvent>,
    situation: Situation | null,
  ) {
    const side = shooter.side;
    let next = 0;
    const save =
      rest[next]?.kind === 'save' && rest[next]!.teamId !== event.teamId ? rest[next++] : undefined;
    const scored =
      rest[next]?.kind === 'goal' && rest[next]!.playerId === event.playerId
        ? rest[next]
        : undefined;
    if (save) done.add(save);
    if (scored) done.add(scored);
    const template = situation?.choices.find((c) => c.id === event.outcome?.input.choiceId);
    const aim = template?.target ?? 45.5 + this.rng.next() * 9;
    let visual: ShotVisual;
    if (scored) visual = 'goal';
    else if (save) visual = KEEPER_SAVES[save.outcome?.input.choiceId ?? ''] ?? 'catch';
    else {
      const parts = event.commentaryKey.split('.');
      const options = FAILED_SHOTS[parts[2] ?? ''];
      const listed = options?.[Number(parts[parts.length - 1])];
      const r = this.rng.next();
      visual = listed ?? (r < 0.35 ? 'catch' : r < 0.65 ? 'wide' : r < 0.8 ? 'block' : 'over');
    }
    this.restart({ side, target: shooter });
    const carrier = this.carrier();
    const crossing =
      carrier &&
      carrier.side === side &&
      carrier.id !== shooter.id &&
      this.toSpot(side, this.ball).d > 84 &&
      Math.abs(this.toSpot(side, this.ball).w - 50) > 32;
    const keeper = this.keeperOf((1 - side) as Side);
    if (
      crossing &&
      save &&
      (visual === 'catch' || visual === 'punch') &&
      save.outcome?.input.choiceId !== 'hold-line'
    ) {
      // The keeper comes for the cross before it reaches the attacker.
      const landing = this.toPitch(side, { d: 93, w: 46 + this.rng.next() * 8 });
      const run = new Map([[shooter.id, this.reachable(shooter.id, landing, 2000)]]);
      if (visual === 'catch') this.passTo(keeper, landing, true, run);
      else {
        this.emit({
          dt: 1800,
          ball: landing,
          motion: 'air',
          carrier: null,
          side,
          fixed: new Map([...run, [keeper.id, landing]]),
        });
        const away = this.toPitch(side, { d: 77, w: 30 + this.rng.next() * 40 });
        this.emit({ dt: 900, ball: away, motion: 'air', carrier: null, side: (1 - side) as Side });
      }
      this.mark(event, this.at(shooter.id), landing);
      this.mark(save, this.at(keeper.id), this.ball);
      return;
    }
    if (!(carrier?.id === shooter.id && this.toSpot(side, this.ball).d >= 62))
      this.bringBall({ side, target: shooter }, this.shootingSpot(shooter), {
        air: crossing || undefined,
        passes: event.commentaryKey.includes('.counter.') ? 1 : 3,
      });
    const origin = { ...this.ball };
    const end = this.shoot(shooter, visual, aim);
    this.mark(event, origin, end);
    if (scored) {
      this.mark(scored, origin, end);
      this.goals.push({ eventId: scored.id, playerId: shooter.id, frame: this.frames.length - 1 });
    }
    if (save) this.mark(save, this.at(keeper.id), end);
  }
  private pass(event: MatchEvent, passer: Actor, next: MatchEvent | undefined) {
    const side = passer.side;
    if (this.carrier()?.id !== passer.id) this.bringBall({ side, target: passer }, null);
    const style = PASS_STYLES[event.outcome?.input.choiceId ?? ''] ?? 'short';
    const origin = { ...this.ball };
    const from = this.toSpot(side, origin);
    const follower =
      next?.kind === 'shot' && next.teamId === event.teamId && next.playerId !== passer.id
        ? this.actor(next.playerId)
        : undefined;
    let receiver: Actor | undefined, target: Point | undefined;
    if (follower) {
      receiver = follower;
      target =
        style === 'short' && from.d > 70
          ? this.toPitch(side, { d: clamp(from.d + 4, 76, 92), w: 44 + this.rng.next() * 12 })
          : this.shootingSpot(follower);
    } else if (style === 'through' || style === 'long') {
      const forwards = this.teammates(side)
        .filter((actor) => actor.slot >= (style === 'long' ? 5 : 8) && actor.id !== passer.id)
        .sort(
          (a, b) =>
            this.toSpot(side, this.at(b.id)).d - this.toSpot(side, this.at(a.id)).d || byId(a, b),
        );
      receiver =
        forwards[style === 'long' ? 0 : Math.floor(this.rng.next() * Math.min(2, forwards.length))];
      if (receiver) {
        const spot = this.toSpot(side, this.at(receiver.id));
        target = this.toPitch(side, {
          d: clamp(spot.d + (style === 'through' ? 12 : 4), 1, 92),
          w: spot.w,
        });
      }
    } else if (style === 'cross') {
      const box = from.d > 66;
      receiver = this.teammates(side).find((actor) => actor.slot === 9 && actor.id !== passer.id);
      if (box && receiver)
        target = this.toPitch(side, { d: 88 + this.rng.next() * 4, w: 42 + this.rng.next() * 16 });
      else {
        receiver = this.teammates(side).find(
          (actor) => actor.slot === (from.w < 50 ? 10 : 8) && actor.id !== passer.id,
        );
        if (receiver)
          target = this.reachable(
            receiver.id,
            this.toPitch(side, { d: from.d + 8, w: from.w < 50 ? 88 : 12 }),
            3000,
          );
      }
    }
    if (!receiver || !target) {
      const option = this.pickReceiver(side, 92);
      if (!option) return;
      receiver = option.actor;
      target = option.point;
    }
    const air = style === 'cross' || style === 'long';
    if (event.outcome?.success ?? true) this.passTo(receiver, target, air);
    else this.intercept(side, target, air);
    this.mark(event, origin, this.ball);
  }
  private dribble(event: MatchEvent, runner: Actor) {
    const side = runner.side;
    if (this.carrier()?.id !== runner.id) this.bringBall({ side, target: runner }, null);
    const origin = { ...this.ball };
    const from = this.toSpot(side, origin);
    const defender = this.nearest((1 - side) as Side, origin)[0]!;
    if (event.outcome?.success ?? true) {
      const style = CARRIES[event.outcome?.input.choiceId ?? ''] ?? { d: 9, w: 2 };
      const toward = from.w < 50 ? 1 : -1;
      const destination = this.toPitch(side, {
        d: clamp(from.d + style.d, 2, 95),
        w: clamp(from.w + toward * Math.min(style.w, Math.abs(50 - from.w)), 3, 97),
      });
      // The beaten defender lunges at where the ball was.
      this.carry(runner, destination, new Map([[defender.id, origin]]));
    } else this.tackle(defender);
    this.mark(event, origin, this.ball);
  }
  private challenge(event: MatchEvent, defender: Actor) {
    const attacker = this.carrier();
    if (!attacker || attacker.side === defender.side) {
      this.mark(event, this.at(defender.id), this.ball);
      return;
    }
    const start = { ...this.at(defender.id) };
    const origin = { ...this.ball };
    const side = attacker.side;
    const from = this.toSpot(side, origin);
    const choice = event.outcome?.input.choiceId ?? '';
    if (event.outcome?.success ?? true) {
      if (choice === 'intercept') {
        const option = this.pickReceiver(side, 95);
        const lane = option ? lerp(origin, option.point, 0.45) : origin;
        this.emit({ dt: 900, ball: lane, motion: 'ground', carrier: defender.id });
      } else if (choice === 'jockey') {
        const wide = this.toPitch(side, {
          d: from.d + 3,
          w: from.w < 50 ? Math.max(4, from.w - 12) : Math.min(96, from.w + 12),
        });
        const shadow = this.toPitch(side, {
          d: from.d + 1.5,
          w:
            (from.w < 50 ? Math.max(4, from.w - 12) : Math.min(96, from.w + 12)) +
            (from.w < 50 ? 2 : -2),
        });
        this.carry(attacker, wide, new Map([[defender.id, shadow]]));
        this.tackle(defender);
      } else this.tackle(defender);
    } else {
      // The attacker gets past; the defender is left where the ball was.
      const past = this.toPitch(side, {
        d: clamp(from.d + (choice === 'jockey' ? 6 : 10), 2, 94),
        w: clamp(from.w + (50 - from.w) * 0.3, 3, 97),
      });
      this.carry(attacker, past, new Map([[defender.id, origin]]));
    }
    this.mark(event, start, this.ball);
  }

  /**
   * Keep the ball moving until the passage has enough play. A goal celebrated in this passage
   * ends it; any later passage, even a quiet minute, starts with that goal's kickoff.
   */
  fill(minimum: number): void {
    for (let guard = 0; this.beats < minimum && guard < 8; guard++) {
      if (this.play.restart) {
        if (this.play.restart === 'goal' && this.celebrated) return;
        this.restart();
      } else if (!this.carrier()) this.collect(this.play.side);
      else this.flow();
    }
  }
  /**
   * Keyframe times are sporting time from the passage start and are never compressed, so
   * speeds stay physical; a busy passage may run past its minute (viewers play passages
   * by their relative times).
   */
  finish(): Passage {
    return { frames: this.frames, play: { ...this.play }, goals: this.goals };
  }

  // ── Key-moment scenes ──────────────────────────────────────────────────────

  /** Bring play to a key moment and set the scene around the selected player. */
  scene(
    situation: Situation,
    selected: Actor,
    spot: Point,
    opponents: { defender?: string; attacker?: string },
  ): void {
    const own = selected.side,
      opposition = (1 - own) as Side;
    const at = this.toSpot(own, spot);
    const ownFrame = (d: number, w: number) => this.toPitch(own, { d, w });
    const outfield = (id: string | undefined, fallback: Point) => {
      const actor = this.actor(id);
      return actor && !actor.keeper && actor.side === opposition
        ? actor
        : this.nearest(opposition, fallback)[0]!;
    };
    const marks = new Map<string, Point>();
    switch (situation.id) {
      case 'aerial-chance': {
        const wide = this.teammates(own).filter(
          (actor) => actor.id !== selected.id && [8, 10, 1, 4].includes(actor.slot),
        );
        const crosser = wide.find((actor) => actor.slot === (at.w <= 50 ? 10 : 8)) ?? wide[0]!;
        const crossFrom = ownFrame(85, crosser.slot === 10 || crosser.slot === 4 ? 90 : 10);
        this.bringBall({ side: own, target: crosser }, crossFrom);
        const marker = outfield(opponents.defender, spot);
        this.passTo(
          selected,
          spot,
          true,
          new Map([[marker.id, ownFrame(at.d + 1.5, at.w + 1.5)]]),
          true,
        );
        return;
      }
      case 'distribution': {
        if (this.play.side === own && this.carrier() && !this.play.restart) {
          this.bringBall({ side: own, target: selected }, spot);
        } else {
          this.restart();
          if (this.play.side === own || !this.carrier()) this.winBall(opposition);
          // The opposition's ball into the box is gathered by the keeper.
          const landing = ownFrame(11, 50 + (this.rng.next() - 0.5) * 12);
          this.emit({
            dt: 1300 + span(this.ball, landing) * 55,
            ball: landing,
            motion: 'air',
            carrier: selected.id,
          });
          this.carry(selected, spot);
        }
        return;
      }
      case 'defend-attack':
      case 'shot-incoming':
      case 'one-on-one':
      case 'cross-ball': {
        const fallback = ownFrame(at.d + 6, at.w);
        const attacker =
          situation.id === 'cross-ball'
            ? (this.teammates(opposition).find((actor) => actor.slot === (at.w <= 50 ? 10 : 8)) ??
              outfield(opponents.attacker, fallback))
            : outfield(opponents.attacker, fallback);
        const ballAt =
          situation.id === 'defend-attack'
            ? ownFrame(at.d + 4, at.w + (this.rng.next() - 0.5) * 2)
            : situation.id === 'shot-incoming'
              ? ownFrame(19 + this.rng.next() * 4, 40 + this.rng.next() * 20)
              : situation.id === 'one-on-one'
                ? ownFrame(13, 44 + this.rng.next() * 12)
                : ownFrame(8, at.w <= 50 ? 94 : 6);
        this.bringBall({ side: opposition, target: attacker }, ballAt, {
          air: situation.id === 'one-on-one' ? false : undefined,
        });
        const ball = this.toSpot(own, this.ball);
        marks.set(
          selected.id,
          situation.id === 'defend-attack' ? spot : ownFrame(at.d, 50 + (ball.w - 50) * 0.3),
        );
        if (situation.id === 'one-on-one')
          for (const back of this.teammates(own).filter(
            (actor) => actor.slot === 2 || actor.slot === 3,
          ))
            marks.set(back.id, ownFrame(ball.d + 6, ball.w + (back.slot === 2 ? -5 : 5)));
        if (situation.id === 'cross-ball') {
          const target = this.teammates(opposition).find(
            (actor) => actor.slot === 9 && actor.id !== attacker.id,
          );
          if (target) marks.set(target.id, ownFrame(9, 50));
        }
        this.emit({
          dt: 600,
          ball: this.ball,
          motion: 'carry',
          carrier: attacker.id,
          fixed: marks,
          action: false,
        });
        return;
      }
      default: {
        // Attacking scenes: the selected player receives at the spot, the direct opponent
        // goal-side of them (a presser for build-out).
        this.bringBall({ side: own, target: selected }, spot);
        const presser = situation.id === 'build-out';
        const opponent = outfield(presser ? opponents.attacker : opponents.defender, spot);
        marks.set(
          opponent.id,
          ownFrame(at.d + (presser ? 4.5 : 3), at.w + (this.rng.next() - 0.5) * 3),
        );
        this.emit({
          dt: 600,
          ball: spot,
          motion: 'carry',
          carrier: selected.id,
          fixed: marks,
          action: false,
        });
      }
    }
  }
}

function director(
  session: MatchSession,
  start: ReplayFrame | null,
  startTime: number,
  tag: string,
) {
  const minute = session.state.match.minute;
  return new Director(
    session,
    start,
    session.state.play,
    minute,
    startTime,
    createRng(`${session.setup.seed}:motion:${minute}:${tag}`),
  );
}
const lastFrame = (session: MatchSession) => session.state.frames[session.state.frames.length - 1]!;

/** The opening kickoff: both teams in their halves, the home side on the ball. */
export function openingKickoff(session: MatchSession): { frame: ReplayFrame; play: PlayState } {
  const scene = director(session, null, 0, 'kickoff');
  scene.placeKickoff(0, true);
  const frame = { ...scene.frames[scene.frames.length - 1]!, timeMs: 0 };
  return { frame, play: { ...scene.play, restart: 'kickoff' } };
}
/** A simulated minute: its events plus enough ordinary possession to fill it. */
export function minutePassage(session: MatchSession, events: MatchEvent[]): Passage {
  const minute = session.state.match.minute;
  const scene = director(session, lastFrame(session), (minute - 1) * 60000, 'minute');
  scene.run(events, null);
  scene.fill(3 + Math.floor(scene.rng.next() * 2));
  return scene.finish();
}
/** The build-up to a key moment, ending with the scene the decision is drawn on. */
export function momentPassage(
  session: MatchSession,
  situation: Situation,
  spot: Point,
  opponents: { defender?: string; attacker?: string },
): Passage {
  const minute = session.state.match.minute;
  const scene = director(session, lastFrame(session), (minute - 1) * 60000, 'moment');
  const selected = scene.actor(session.setup.selectedPlayerId)!;
  scene.scene(situation, selected, spot, opponents);
  return scene.finish();
}
/** A resolved decision and the rest of its minute, starting from the moment's scene. */
export function outcomePassage(
  session: MatchSession,
  events: MatchEvent[],
  situationId: string,
): Passage {
  const minute = session.state.match.minute;
  const scene = director(session, lastFrame(session), minute * 60000 - 20000, 'outcome');
  scene.run(events, SITUATION_BY_ID[situationId] ?? null);
  scene.fill(2);
  return scene.finish();
}
