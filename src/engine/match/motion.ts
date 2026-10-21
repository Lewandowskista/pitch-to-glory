import type {
  BallMotion,
  Beat,
  BeatKind,
  ChoiceTarget,
  MatchEvent,
  MomentCast,
  PatternId,
  Point,
  ReplayFrame,
} from '../../model/domain';
import { createRng, hashSeed, type Rng } from '../rng';
import { clamp } from './decisions';
import { OFF_ANIMATION, PARKED } from './parked';
import { SITUATION_BY_ID, type Situation } from './situations';
import { HEAT_COLUMNS, HEAT_ROWS, type MatchSession, type PlayState } from './types';
import {
  FORMATION_SLOTS,
  formationOf,
  type FormationSlot,
  type SlotRole,
} from '../selection/formations';
import {
  crossFinish,
  onGoal,
  planMove,
  wingOf,
  type Area,
  type MoveContext,
  type PassStep,
  type Plan,
  type Wing,
} from './patterns';

/**
 * Match motion: turns the engine's events into a continuous, football-logical passage of
 * play. Outcomes (shots, goals, decisions) are decided by the calibrated statistical model;
 * this module only choreographs how they happen on the pitch:
 *
 * - possession moves between actual teammates by passes, carries, tackles and interceptions;
 * - both teams hold their formation's shape (src/engine/selection/formations.ts), which slides
 *   with the ball, compresses out of possession,
 *   presses the ball carrier with the two nearest players and respects the offside line;
 * - every recorded shot is struck by its shooter from a shooting position and ends in the
 *   net, in the keeper's hands, off a defender, wide or over, matching the commentary line;
 * - restarts follow the laws: kickoffs after goals and at half-time (ends switched), goal
 *   kicks after misses, corners after parries;
 * - players never move faster than a sprint and the ball always starts where the previous
 *   passage ended, so nothing teleports except the second-half kickoff.
 *
 * Every action keyframe carries a `Beat` (engine match-14): what was done with the ball, by whom,
 * to whom and where, so a viewer can draw the last pass, label players and narrate the play.
 * Build-up follows the pattern library (patterns.ts: wing play, overlaps, switches, balls in
 * behind, counters, cut-backs, long balls, recycling), and those beats carry their `pattern`.
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
  /** Lineup slot index: 0 is the keeper; the formation gives each slot its post. */
  slot: number;
  /** The slot's position, line, role and shape in the team's formation. */
  post: FormationSlot;
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
/** What a move is for, so the pattern library can choose one (see patterns.ts). */
interface MoveRequest {
  purpose: MoveContext['purpose'];
  /** The engine calls it a counter-attack. */
  counter?: boolean;
  situationId?: string;
}
/** Beats that win the ball for the actor's side. */
const WINS: ReadonlySet<BeatKind> = new Set(['tackle', 'intercept', 'save', 'block', 'clearance']);
/** How often ordinary possession plays out a recognisable move before passing it about. */
const FILL_PATTERN = 0.5;
/** A wide player's slot on each flank, for the decision passes that go down a wing. */
const FLANK_ROLES = {
  left: { wide: 'wide-left', back: 'left-back' },
  right: { wide: 'wide-right', back: 'right-back' },
} as const satisfies Record<string, Record<string, SlotRole>>;
/** How a keyframe's beat is described to `emit`. */
interface BeatSpec {
  kind: BeatKind;
  actor: Actor;
  receiver?: Actor;
  eventId?: string;
  /** Locate the beat where the ball is won (its end) rather than where it was played. */
  won?: boolean;
}
export interface Passage {
  /** Keyframes, starting with the frame shown before the passage. */
  frames: ReplayFrame[];
  play: PlayState;
  /** Goals choreographed in this passage, with the index of their celebration frame. */
  goals: { eventId: string; playerId: string; frame: number }[];
  /** Shots that ended in the net or in the keeper's hands, per side, as shown. */
  onTarget: [number, number];
  /** The keyframes of the decision and what it led to (outcome passages). */
  focus?: { start: number; end: number };
  /** Who a key moment involves, as placed in its scene (moment passages, match-15). */
  cast?: MomentCast;
}

/** One width unit is 0.65 length units (68 m across, 105 m along). */
const WIDTH = 0.65;
/** Metres per length unit (105 m along the pitch). */
export const METRES_PER_UNIT = 1.05;
/** Top running speed in length units per sporting millisecond (about 9 m/s). */
const RUN = 0.0085;
/** Longest pause a keyframe may take while players walk to their marks. */
const MAX_STEP_MS = 14000;
const CENTRE: Point = { x: 50, y: 50 };
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
  penalty: ['parry', 'wide', 'over'],
  'free-kick': ['over', 'catch', 'wide'],
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
  'penalty-read': 'parry',
  'penalty-stay': 'catch',
};
const PASS_STYLES: Record<string, PassStyle> = {
  'through-ball': 'through',
  'disguised-pass': 'through',
  'cross-switch': 'cross',
  'clear-long': 'long',
  'long-distribution': 'long',
  'quick-release': 'long',
  'corner-inswinger': 'cross',
  'corner-near-post': 'cross',
};
/** Short decision passes that keep the ball: patient circulation (the recycle pattern). */
const RECYCLES = ['short-pass', 'short-distribution', 'lay-off', 'cushion'];
/** Ball-carrying choices that gain ground without taking on a defender. */
const CARRY_ONLY = ['carry-forward', 'carry-out', 'control-shoot'];
/** Defensive choices whose winning action is not a plain tackle. */
const CHALLENGES: Record<string, BeatKind> = {
  intercept: 'intercept',
  'goal-line-clear': 'clearance',
  'body-block': 'block',
  'slide-block': 'block',
};
/** Carries: depth gained and width moved towards the centre. */
const CARRIES: Record<string, Spot> = {
  /** Any other dribble. */
  generic: { d: 9, w: 2 },
  'take-on': { d: 7, w: 3 },
  'drive-inside': { d: 6, w: 10 },
  'carry-forward': { d: 12, w: 0 },
  'carry-out': { d: 11, w: 0 },
  'press-escape': { d: 9, w: 4 },
  'control-shoot': { d: 1.5, w: 0 },
};

/**
 * Where a carrying choice takes the ball, in the carrier's attack frame: forward by the
 * choice's depth and in from the touchline by up to its width. Null for other choices.
 */
export function carryLane(choiceId: string, from: Spot): Spot | null {
  const style = CARRIES[choiceId];
  if (!style) return null;
  const toward = from.w < 50 ? 1 : -1;
  return {
    d: clamp(from.d + style.d, 2, 95),
    w: clamp(from.w + toward * Math.min(style.w, Math.abs(50 - from.w)), 3, 97),
  };
}
/** Who the engine has picked for a key moment before its scene is set (match-15). */
export interface CastPlan {
  /** Teammates the moment's passes go to, in choice order. */
  receivers: string[];
  /** The receiver of a ball in behind, who makes the run. */
  runner?: string;
}
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
/** The shape line an outfield slot belongs to. */
const lineOf = (actor: Actor) => (actor.post.line === 'keeper' ? 'defence' : actor.post.line);
/** Back line, keeper included: who plays a short goal kick out. */
const atBack = (actor: Actor) => actor.post.line === 'keeper' || actor.post.line === 'defence';
/** The first teammate, in slot order, holding any of the roles, in their order of preference. */
function byRole(team: readonly Actor[], ...roles: SlotRole[]): Actor | undefined {
  for (const role of roles) {
    const actor = team.find((entry) => entry.post.role === role);
    if (actor) return actor;
  }
  return undefined;
}
const hasRole = (actor: Actor, roles: readonly SlotRole[]) => roles.includes(actor.post.role);
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
  /** The most recent beat, carried over between passages in the play state. */
  last: Beat | null;
  /** The move the next beats belong to, when one is being played out. */
  pattern: PatternId | null = null;
  readonly onTarget: [number, number] = [0, 0];
  focus: { start: number; end: number } | undefined;
  /** A key moment's cast once its scene is set (match-15). */
  cast: MomentCast | undefined;
  /** The opponent a scene sets goal-side of the selected player, and an aerial ball's crosser. */
  private direct: string | undefined;
  private crosser: string | undefined;
  /** How the ball reached the passage's first frame. */
  private readonly arrived: BallMotion | undefined;
  private time = 0;
  private readonly lookup = new Map<string, Actor>();
  /** Current positions, by actor index. */
  private readonly pos: Point[] = [];
  /**
   * Actors sent off (engine match-16), by index: they keep their place in the line-up (so
   * keyframes and clips keep 22 players in slot order) but stand parked off the pitch, out of
   * play and hidden by the renderers. Empty on earlier engines.
   */
  private readonly parked = new Set<number>();

  constructor(
    private readonly session: MatchSession,
    start: ReplayFrame | null,
    play: PlayState,
    readonly minute: number,
    private readonly startTime: number,
    readonly rng: Rng,
    /** Players sent off during this passage: they play it out and leave after it. */
    exempt: ReadonlySet<string> = new Set(),
  ) {
    const m = session.state.match;
    const off = new Set(
      [...(m.home.sentOffIds ?? []), ...(m.away.sentOffIds ?? [])].filter((id) => !exempt.has(id)),
    );
    [m.home, m.away].forEach((team, side) => {
      const posts = FORMATION_SLOTS[formationOf(team.formation)];
      team.starterIds.forEach((id, slot) => {
        const actor: Actor = {
          id,
          index: this.actors.length,
          side: side as Side,
          slot,
          post: posts[slot]!,
          keeper: slot === 0,
          style: styleOf(id),
        };
        this.actors.push(actor);
        this.lookup.set(id, actor);
        if (off.has(id)) this.parked.add(actor.index);
      });
    });
    this.play = { ...play };
    this.last = play.last ?? null;
    this.ball = start ? { ...start.ball } : { ...CENTRE };
    const shown = new Map(start?.players.map((p) => [p.id, p.point]));
    for (const actor of this.actors) {
      // A substitute takes the place of the player who left that slot.
      const point = this.parked.has(actor.index)
        ? PARKED
        : (shown.get(actor.id) ?? start?.players[actor.index]?.point);
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
    // A player sent off leaves the ball where it is.
    if (this.parked.size && this.play.carrierId && !this.actor(this.play.carrierId))
      this.play.carrierId = null;
    this.frames.push(this.snapshot(this.ball, this.play.carrierId, 'dead'));
    this.arrived = start?.ballMotion;
  }
  /** How the ball arrived where it is: in the air, along the ground… (across passages too). */
  arrival(): BallMotion | undefined {
    return this.frames.length > 1 ? this.frames[this.frames.length - 1]!.ballMotion : this.arrived;
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  actor(id: string | null | undefined): Actor | undefined {
    const actor = id ? this.lookup.get(id) : undefined;
    return actor && this.parked.size && this.parked.has(actor.index) ? undefined : actor;
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
    const base = inPossession ? actor.post.in : actor.post.out;
    const bounds = LINE_DEPTH[lineOf(actor)];
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
    const team = side === 0 ? this.actors.slice(0, 11) : this.actors.slice(11);
    return this.parked.size ? team.filter((actor) => !this.parked.has(actor.index)) : team;
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

  private snapshot(
    ball: Point,
    carrierId: string | null,
    motion: BallMotion,
    beat?: Beat,
  ): ReplayFrame {
    return {
      timeMs: this.startTime + this.time,
      ball: { x: tenth(ball.x), y: tenth(ball.y) },
      players: this.actors.map((actor) => ({
        id: actor.id,
        point: { ...this.pos[actor.index]! },
        animation: this.parked.has(actor.index)
          ? OFF_ANIMATION
          : actor.id === carrierId
            ? 'ball'
            : 'run',
      })),
      carrierId,
      ballMotion: motion,
      ...(beat ? { beat } : {}),
    };
  }
  /** The third and channel of a point, for a side facing the goal it attacks. */
  locate(side: Side, point: Point): Pick<Beat, 'zone' | 'flank'> {
    const spot = this.toSpot(side, point);
    return {
      zone: spot.d < 100 / 3 ? 'def' : spot.d < 200 / 3 ? 'mid' : 'final',
      flank: spot.w < 100 / 3 ? 'left' : spot.w > 200 / 3 ? 'right' : 'centre',
    };
  }
  private beatOf(spec: BeatSpec, origin: Point, end: Point): Beat {
    const where = this.locate(spec.actor.side, spec.won ? end : origin);
    return {
      kind: spec.kind,
      actorId: spec.actor.id,
      ...(spec.receiver ? { receiverId: spec.receiver.id } : {}),
      ...(spec.eventId ? { eventId: spec.eventId } : {}),
      ...(this.pattern ? { pattern: this.pattern } : {}),
      zone: where.zone,
      flank: where.flank,
    };
  }
  /**
   * The shape of a pass between teammates: a cross from wide in the final third into the box
   * (a cut-back when pulled back low from the byline), a switch across the pitch, a through
   * ball behind the line, any other lofted ball long, otherwise a pass.
   */
  passKind(side: Side, from: Point, to: Point, air: boolean, hint?: BeatKind): BeatKind {
    const origin = this.locate(side, from);
    const a = this.toSpot(side, from),
      b = this.toSpot(side, to);
    if (origin.zone === 'final' && origin.flank !== 'centre' && Math.abs(b.w - 50) <= 25) {
      if (!air && a.d >= 85 && b.d < a.d - 3 && b.d >= 72) return 'cutback';
      if (b.d >= 80) return 'cross';
    }
    if (hint === 'through' && b.d > a.d) return 'through';
    if ((air || hint === 'cross') && Math.abs(b.w - a.w) >= 45) return 'switch';
    return air ? 'long' : 'pass';
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
    /** The ball action this keyframe shows (engine match-14). */
    beat?: BeatSpec;
  }): void {
    const count = this.actors.length;
    const origin = this.ball;
    const marks: (Point | undefined)[] = new Array<Point | undefined>(count);
    for (const [id, point] of options.fixed ?? []) marks[this.lookup.get(id)!.index] = point;
    // Players sent off stay parked off the pitch (match-16).
    for (const index of this.parked) marks[index] = PARKED;
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
    const beat = options.beat ? this.beatOf(options.beat, origin, this.ball) : undefined;
    if (beat) this.last = beat;
    this.frames.push(this.snapshot(this.ball, this.play.carrierId, options.motion, beat));
  }
  /** The offside line a side attacks: the second-last defender, the ball or halfway. */
  lineDepth(side: Side): number {
    const depths = this.teammates((1 - side) as Side)
      .map((actor) => this.toSpot(side, this.pos[actor.index]!).d)
      .sort((a, b) => b - a);
    return Math.max(50, depths[1] ?? 50, this.toSpot(side, this.ball).d);
  }
  /** Hold a run level with the current second-last defender (or the ball) in their half. */
  onside(side: Side, point: Point): Point {
    const line = this.lineDepth(side) - 0.5;
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
    /** A hint at the pass's shape, or `save` for a keeper claiming it; the decision it plays. */
    tag: { hint?: BeatKind; eventId?: string } = {},
  ): Point {
    const flight = (end: Point) => {
      const length = span(this.ball, end);
      return air ? 1300 + length * 55 : 700 + length * 60;
    };
    let dt = flight(target);
    // An exact pass waits for the receiver to arrive (scene set-ups). Otherwise the receiver
    // meets the ball where they can reach it, and the ball's flight is timed to that point,
    // which may be further from the ball than the target itself.
    let reach = exact ? { ...target } : this.reachable(receiver.id, target, dt);
    if (!exact) {
      dt = Math.max(dt, flight(reach));
      reach = this.reachable(receiver.id, target, dt);
      dt = Math.max(dt, flight(reach));
    }
    // An opponent taking the ball wins it; between teammates the shape names the pass.
    const passer = this.carrier();
    const beat: BeatSpec =
      !passer || passer.side !== receiver.side
        ? {
            kind: tag.hint === 'save' ? 'save' : 'intercept',
            actor: receiver,
            eventId: tag.eventId,
            won: true,
          }
        : passer.id === receiver.id
          ? { kind: 'carry', actor: passer, eventId: tag.eventId }
          : {
              kind: this.passKind(passer.side, this.ball, reach, air, tag.hint),
              actor: passer,
              receiver,
              eventId: tag.eventId,
            };
    this.emit({
      dt,
      ball: reach,
      motion: air ? 'air' : 'ground',
      carrier: receiver.id,
      fixed,
      beat,
    });
    return reach;
  }
  /** A pass towards `target` cut out by the opponent best placed along its path. */
  intercept(passingSide: Side, target: Point, air: boolean, eventId?: string): Actor {
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
    const flight = (end: Point) => {
      const length = span(from, end);
      return air ? 1200 + length * 55 : 600 + length * 60;
    };
    let dt = flight(point);
    let ball = this.reachable(best.id, point, dt);
    dt = Math.max(dt, flight(ball));
    ball = this.reachable(best.id, point, dt);
    dt = Math.max(dt, flight(ball));
    this.emit({
      dt,
      ball,
      motion: air ? 'air' : 'ground',
      carrier: best.id,
      beat: { kind: 'intercept', actor: best, eventId, won: true },
    });
    return best;
  }
  /** Run with the ball; a `dribble` takes it past an opponent. */
  carry(
    actor: Actor,
    target: Point,
    fixed?: Map<string, Point>,
    kind: 'carry' | 'dribble' = 'carry',
    eventId?: string,
  ): void {
    const destination = { x: clamp(target.x, 1, 99), y: clamp(target.y, 1, 99) };
    this.emit({
      dt: 600 + span(this.ball, destination) * 170,
      ball: destination,
      motion: 'carry',
      carrier: actor.id,
      fixed,
      beat: { kind, actor, eventId },
    });
  }
  /** A defender wins the ball from the carrier (a tackle, block or clearance). */
  tackle(winner: Actor, eventId?: string, kind: BeatKind = 'tackle'): void {
    const loser = this.carrier();
    const ball = lerp(this.ball, this.at(winner.id), 0.3);
    const fixed = new Map<string, Point>();
    if (loser) fixed.set(loser.id, { ...this.ball });
    this.emit({
      dt: 900,
      ball,
      motion: 'loose',
      carrier: winner.id,
      fixed,
      beat: { kind, actor: winner, eventId, won: true },
    });
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
        const run = !atBack(actor) ? 1 + this.rng.next() * 3 : 0;
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
    this.emit({
      dt: 700,
      ball: this.ball,
      motion: 'loose',
      carrier: collector.id,
      beat: { kind: 'intercept', actor: collector, won: true },
    });
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
  bringBall(
    want: Want,
    spot: Point | null,
    options: {
      air?: boolean;
      passes?: number;
      /** Play a recognisable move from the pattern library (match-14); a shot's spot follows it. */
      move?: MoveRequest;
    } = {},
  ): void {
    this.restart(want);
    const move = options.move;
    if (this.play.side !== want.side || !this.carrier()) {
      // A counter-attack starts with the regain.
      if (move?.counter) this.pattern = 'counter';
      this.winBall(want.side);
    }
    const holder = this.carrier();
    if (move && holder && holder.side === want.side && holder.id !== want.target.id) {
      const plan = planMove(this.context(want.side, want.target, move, spot), this.rng);
      if (plan) {
        this.pattern = plan.id;
        const ended = this.follow(
          plan,
          want.side,
          want.target,
          move.purpose === 'scene' ? spot : null,
        );
        if (this.carrier()?.id === want.target.id) {
          // Received from the move's final ball (a cross met first time stays where it is
          // met), or earlier in the move: then on to the spot.
          const end =
            spot ??
            (plan.finish
              ? this.toPitch(want.side, plan.finish)
              : ended === 'early' && move.purpose === 'shot'
                ? this.shootingSpot(want.target)
                : null);
          if (end && span(this.ball, end) > 2) this.carry(want.target, end);
          this.pattern = null;
          return;
        }
        if (ended === 'lost') this.winBall(want.side);
      }
    }
    this.pattern = move?.counter ? 'counter' : null;
    const finish = spot ?? (move?.purpose === 'shot' ? this.shootingSpot(want.target) : null);
    this.relay(want, finish, options);
    this.pattern = null;
  }
  /** The ball moves up through teammates to the target (the generic way, no pattern). */
  private relay(want: Want, spot: Point | null, options: { air?: boolean; passes?: number }) {
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

  // ── Patterns (match-14, redesign step M2) ──────────────────────────────────

  /** What the pattern library needs to know about a move for one side. */
  private context(
    side: Side,
    target: Actor | null,
    move: MoveRequest,
    spot: Point | null,
  ): MoveContext {
    const carrier = this.carrier();
    const own = carrier && carrier.side === side ? carrier : null;
    const m = this.session.state.match;
    const last = this.last;
    return {
      purpose: move.purpose,
      ball: this.toSpot(side, this.ball),
      carrierRole: own ? own.post.role : null,
      carrierAtBack: !!own && atBack(own),
      targetRole: target ? target.post.role : null,
      ...(target ? { targetAt: this.toSpot(side, this.at(target.id)) } : {}),
      roles: new Set(this.teammates(side).map((actor) => actor.post.role)),
      style: (side === 0 ? this.session.setup.home : this.session.setup.away).playingStyle,
      formation: formationOf((side === 0 ? m.home : m.away).formation),
      line: this.lineDepth(side),
      counter: !!move.counter,
      won: !!last && WINS.has(last.kind) && this.actor(last.actorId)?.side === side,
      ...(move.situationId ? { situationId: move.situationId } : {}),
      ...(spot ? { spot: this.toSpot(side, spot) } : {}),
    };
  }
  /** The first outfield teammate, other than the carrier, holding one of the roles. */
  private resolve(side: Side, roles: readonly SlotRole[], carrier: Actor): Actor | undefined {
    const team = this.teammates(side);
    for (const role of roles) {
      const actor = team.find(
        (entry) => entry.post.role === role && entry.id !== carrier.id && !entry.keeper,
      );
      if (actor) return actor;
    }
    return undefined;
  }
  /**
   * Play a planned move's steps for `side`. The finisher (`target`) and the next receiver time
   * their runs to stay onside until the ball is played; a ball in behind goes beyond the line
   * as it stands when it is played; a contested ball into the box may be cut out. Returns how
   * it ended: the finisher received the final ball (`target`) or an earlier one (`early`), the
   * side still has it without a finisher (`open`), or lost it (`lost`).
   */
  private follow(
    plan: Plan,
    side: Side,
    target: Actor | null,
    spot: Point | null,
  ): 'target' | 'early' | 'open' | 'lost' {
    const steps = plan.steps;
    const point = (area: Area) =>
      this.toPitch(side, { d: clamp(area.d, 1, 99), w: clamp(area.w, 2, 98) });
    const final = steps.find(
      (step): step is PassStep => step.kind === 'pass' && step.who === 'target',
    );
    const arrival = spot ?? (final ? point(final.to) : plan.finish ? point(plan.finish) : null);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const carrier = this.carrier();
      if (!carrier || carrier.side !== side) return 'lost';
      if (target && carrier.id === target.id) return 'early';
      const runs = new Map<string, Point>();
      if (target && arrival)
        runs.set(target.id, this.reachable(target.id, this.onside(side, arrival), 2500));
      if (step.kind === 'carry') {
        const to = point(step.to);
        // Never carry backwards, except to hold the ball up for an overlap.
        if (!step.run && this.toSpot(side, to).d < this.toSpot(side, this.ball).d - 3) continue;
        const runner = step.run ? this.resolve(side, step.run.who, carrier) : undefined;
        if (step.run && runner && runner.id !== target?.id)
          runs.set(
            runner.id,
            this.reachable(runner.id, this.onside(side, point(step.run.to)), 4000),
          );
        runs.delete(carrier.id);
        this.carry(carrier, to, runs.size ? runs : undefined, step.dribble ? 'dribble' : 'carry');
        continue;
      }
      const receiver = step.who === 'target' ? target : this.resolve(side, step.who, carrier);
      if (!receiver || receiver.id === carrier.id) continue;
      const finishing = !!target && receiver.id === target.id;
      let to = finishing && step.who === 'target' && spot ? spot : point(step.to);
      if (step.behind !== undefined && !(finishing && spot)) {
        // Beyond the line as it stands now, in the runner's channel.
        const depth = Math.min(92, this.lineDepth(side) + step.behind);
        to = this.toPitch(side, { d: depth, w: this.toSpot(side, to).w });
      }
      runs.delete(receiver.id);
      // The next receiver gets moving too.
      const next = steps.slice(i + 1).find((entry): entry is PassStep => entry.kind === 'pass');
      if (next && next.who !== 'target') {
        const mate = this.resolve(side, next.who, receiver);
        if (mate && mate.id !== target?.id && mate.id !== carrier.id)
          runs.set(mate.id, this.reachable(mate.id, this.onside(side, point(next.to)), 2000));
      }
      if (step.contest && this.rng.next() < 0.6) {
        this.intercept(side, to, step.air);
        return 'lost';
      }
      // A ball in behind is weighted for the runner to arrive on it; one the runner cannot reach
      // in time, or to a spot short of the line, is an ordinary forward pass.
      let hint = step.hint,
        exact = false;
      if (hint === 'through') {
        if (span(this.at(receiver.id), to) < 40 && this.toSpot(side, to).d > this.lineDepth(side))
          exact = true;
        else hint = 'pass';
      }
      this.passTo(receiver, to, step.air, runs.size ? runs : undefined, exact, { hint });
      if (finishing) return step.who === 'target' ? 'target' : 'early';
    }
    const holder = this.carrier();
    if (!holder || holder.side !== side) return 'lost';
    return target && holder.id === target.id ? 'early' : 'open';
  }
  /** Ordinary possession plays out a recognisable move (no finisher; a ball into the box may be cut out). */
  private build(): void {
    const side = this.play.side;
    const plan = planMove(this.context(side, null, { purpose: 'fill' }, null), this.rng);
    if (!plan) return;
    this.pattern = plan.id;
    this.follow(plan, side, null, null);
    this.pattern = null;
  }

  // ── Restarts ───────────────────────────────────────────────────────────────

  kickoffMarks(side: Side): { kicker: Actor; marks: Map<string, Point> } {
    const team = this.teammates(side);
    const kicker = byRole(team, 'striker', 'second-striker') ?? team[team.length - 1]!;
    const marks = new Map<string, Point>();
    for (const actor of this.actors) {
      const own = actor.side === side;
      const spot = this.shape(actor, own, { d: 50, w: 50 });
      spot.d = Math.min(spot.d, own ? 47 : 44);
      if (!own && Math.abs(spot.w - 50) < 16) spot.d = Math.min(spot.d, 39);
      marks.set(actor.id, this.toPitch(actor.side, spot));
    }
    const partner = byRole(team, 'left-mid', 'second-striker', 'attacking-mid', 'pivot');
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
        beat: { kind: 'restart', actor: kicker, won: true },
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
      beat: { kind: 'restart', actor: kicker, won: true },
    });
  }
  kickoff(): void {
    // The carrier normally stands over the ball. A shot drawn before a pending kickoff was
    // taken clears it; the side's usual taker kicks off instead (this used to crash).
    const kicker = this.carrier() ?? this.kickoffMarks(this.play.side).kicker;
    const team = this.teammates(kicker.side).filter((actor) => actor.id !== kicker.id);
    const receiver =
      byRole(team, 'pivot', 'left-mid', 'attacking-mid') ?? team.find((a) => !a.keeper)!;
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
      beat: { kind: 'restart', actor: keeper, won: true },
    });
    const short = want ? want.side === side && atBack(want.target) : this.rng.next() < 0.5;
    if (short) {
      const backs = this.teammates(side);
      const back =
        byRole(backs, spot.y < 50 ? 'centre-back-left' : 'centre-back-right', 'centre-back') ??
        backs.find((actor) => actor.post.line === 'defence')!;
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
      .filter((actor) => !atBack(actor))
      .sort(
        (a, b) => span(this.at(a.id), landing) - span(this.at(b.id), landing) || byId(a, b),
      )[0]!;
    this.passTo(receiver, landing, true);
  }
  corner(want: Want | undefined): void {
    const side = this.play.side;
    const left = this.toSpot(side, this.ball).w < 50;
    const team = this.teammates(side);
    const taker = byRole(team, left ? 'wide-left' : 'wide-right') ?? team[1]!;
    const flag = this.toPitch(side, { d: 99.4, w: left ? 0.8 : 99.2 });
    const marks = new Map<string, Point>();
    const runners = team.filter((actor) =>
      hasRole(actor, [
        'centre-back-left',
        'centre-back',
        'centre-back-right',
        'left-mid',
        'striker',
        'second-striker',
        left ? 'wide-right' : 'wide-left',
      ]),
    );
    runners.forEach((actor, index) =>
      marks.set(actor.id, this.toPitch(side, { d: 87 + (index % 3) * 3, w: 38 + index * 5 })),
    );
    const defenders = this.teammates((1 - side) as Side);
    defenders.forEach((actor) => {
      if (actor.keeper) marks.set(actor.id, this.toPitch(side, { d: 98.5, w: 50 }));
      else if (actor.post.line !== 'attack')
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
      beat: { kind: 'restart', actor: taker, won: true },
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

  /** Where a player shoots from, by their role in the formation (attack frame). */
  shootingSpot(actor: Actor): Point {
    const r = this.rng.next(),
      s = this.rng.next();
    const role = actor.post.role;
    const spot =
      role === 'striker' || role === 'second-striker'
        ? { d: 84 + r * 6, w: 41 + s * 18 }
        : role === 'wide-left'
          ? { d: 80 + r * 7, w: 27 + s * 13 }
          : role === 'wide-right'
            ? { d: 80 + r * 7, w: 60 + s * 13 }
            : role === 'left-mid' || role === 'right-mid'
              ? { d: 74 + r * 7, w: role === 'left-mid' ? 36 + s * 14 : 50 + s * 14 }
              : role === 'pivot' || role === 'attacking-mid'
                ? { d: 71 + r * 6, w: 40 + s * 20 }
                : { d: 87 + r * 5, w: 42 + s * 16 };
    return this.toPitch(actor.side, spot);
  }
  /**
   * Strike from the ball's position; returns where the ball ended. The strike keyframe is the
   * shot (a header when met straight from a cross); a parry, punch or block adds the keeper's
   * or defender's keyframe, and a goal its celebration.
   */
  shoot(
    shooter: Actor,
    visual: ShotVisual,
    aim: number,
    ids: { shot?: string; save?: string; block?: string; goal?: string } = {},
    kind: 'shot' | 'header' = 'shot',
  ): Point {
    const side = shooter.side,
      defending = (1 - side) as Side;
    const keeper = this.keeperOf(defending);
    const origin = { ...this.ball };
    const toward = (d: number, w: number) => this.toPitch(side, { d, w });
    const shot: BeatSpec = { kind, actor: shooter, eventId: ids.shot };
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
        beat: shot,
        ...extra,
      });
    const fixed = (point: Point) => new Map([[keeper.id, point]]);
    if (visual === 'goal') {
      const end = toward(101.5, aim);
      // The keeper dives, a yard short of the ball.
      strike(end, 'shot', { fixed: fixed(toward(98.5, aim + (aim < 50 ? 3 : -3))) });
      this.onTarget[side]++;
      this.celebrate(shooter, defending, ids.goal);
      return end;
    }
    if (visual === 'catch' || visual === 'smother') {
      const end = visual === 'smother' ? lerp(origin, toward(100, aim), 0.15) : toward(98, aim);
      this.emit({
        dt: 250 + span(origin, end) * 28,
        ball: end,
        motion: 'shot',
        carrier: keeper.id,
        beat: shot,
      });
      this.onTarget[side]++;
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
        beat: shot,
      });
      this.onTarget[side]++;
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
        beat: { kind: 'save', actor: keeper, eventId: ids.save },
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
        beat: shot,
      });
      const rebound = lerp(blockAt, origin, 0.4);
      this.emit({
        dt: 600,
        ball: { x: rebound.x, y: clamp(rebound.y + (this.rng.next() - 0.5) * 12, 2, 98) },
        motion: 'loose',
        carrier: null,
        side: defending,
        beat: { kind: 'block', actor: blocker, eventId: ids.block },
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
  celebrate(scorer: Actor, conceding: Side, eventId?: string): void {
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
      beat: { kind: 'celebration', actor: scorer, eventId },
    });
    this.play = { side: conceding, carrierId: null, restart: 'goal' };
    this.celebrated = true;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /**
   * Choreograph engine events in order, fixing their pitch points to what is shown. The first
   * `focusCount` events are a decision and what it led to: their keyframes become the focus.
   */
  run(events: MatchEvent[], situation: Situation | null, focusCount = 0): void {
    const done = new Set<MatchEvent>();
    events.forEach((event, index) => {
      if (done.has(event)) return;
      const start = this.frames.length - 1;
      const actor = this.actor(event.playerId);
      if (event.kind === 'shot' && actor)
        this.shot(event, actor, events.slice(index + 1), done, situation);
      else if (event.kind === 'pass' && actor) this.pass(event, actor, events[index + 1]);
      else if (event.kind === 'dribble' && actor) this.dribble(event, actor);
      else if (event.kind === 'tackle' && actor) this.challenge(event, actor);
      else if (event.kind === 'save' && actor) this.note(event, 'save', actor);
      if (index < focusCount)
        this.focus = { start: this.focus?.start ?? start, end: this.frames.length - 1 };
    });
  }
  /** The target the engine set for the choice an event plays (match-15), if any. */
  private targetOf(event: MatchEvent): ChoiceTarget | undefined {
    const moment = this.session.state.currentMoment;
    const input = event.outcome?.input;
    if (!moment || !input || input.momentId !== moment.id) return undefined;
    return moment.choices.find((choice) => choice.id === input.choiceId)?.target;
  }
  private mark(event: MatchEvent, point: Point, end: Point) {
    event.point = { x: tenth(point.x), y: tenth(point.y) };
    event.endPoint = { x: tenth(end.x), y: tenth(end.y) };
  }
  /** How an event was played on the pitch: its action, third and receiver (match-14). */
  private note(event: MatchEvent, action: BeatKind, actor: Actor, receiver?: Actor) {
    event.action = action;
    event.zone = this.locate(actor.side, event.point).zone;
    if (receiver) event.receiverId = receiver.id;
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
    // A defender's last-ditch challenge on the shot (engine match-12) is a block.
    const block =
      !save && rest[next]?.kind === 'tackle' && rest[next]!.teamId !== event.teamId
        ? rest[next++]
        : undefined;
    if (block) done.add(block);
    const scored =
      rest[next]?.kind === 'goal' && rest[next]!.playerId === event.playerId
        ? rest[next]
        : undefined;
    if (save) done.add(save);
    if (scored) done.add(scored);
    const template = situation?.choices.find((c) => c.id === event.outcome?.input.choiceId);
    // A shot at a named post (match-15) goes where the arrow pointed.
    const aimed = this.targetOf(event);
    const aim =
      aimed?.kind === 'goal'
        ? this.toSpot(side, aimed.point).w
        : (template?.target ?? 45.5 + this.rng.next() * 9);
    let visual: ShotVisual;
    if (scored) visual = 'goal';
    else if (block) visual = 'block';
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
      // A wide man's cross: wing play.
      this.pattern = 'wing-play';
      if (visual === 'catch')
        this.passTo(keeper, landing, true, run, false, { hint: 'save', eventId: save.id });
      else {
        this.emit({
          dt: 1800,
          ball: landing,
          motion: 'air',
          carrier: null,
          side,
          fixed: new Map([...run, [keeper.id, landing]]),
          beat: { kind: this.passKind(side, this.ball, landing, true, 'cross'), actor: carrier },
        });
        const away = this.toPitch(side, { d: 77, w: 30 + this.rng.next() * 40 });
        this.emit({
          dt: 900,
          ball: away,
          motion: 'air',
          carrier: null,
          side: (1 - side) as Side,
          beat: { kind: 'save', actor: keeper, eventId: save.id },
        });
      }
      this.pattern = null;
      this.onTarget[side]++;
      this.mark(event, this.at(shooter.id), landing);
      this.note(event, 'header', shooter);
      this.mark(save, this.at(keeper.id), this.ball);
      this.note(save, 'save', keeper);
      return;
    }
    if (!(carrier?.id === shooter.id && this.toSpot(side, this.ball).d >= 62)) {
      const counter = event.commentaryKey.includes('.counter.');
      // The pattern library brings the ball to the shooter (and picks the spot it is struck from).
      this.bringBall({ side, target: shooter }, null, {
        air: crossing || undefined,
        passes: counter ? 1 : 3,
        move: { purpose: 'shot', counter },
      });
    }
    const origin = { ...this.ball };
    // Met first time from a lofted cross into the box: a header (an overhead kick stays a shot;
    // a low cross is struck).
    const kind =
      this.last?.kind === 'cross' &&
      this.last.receiverId === shooter.id &&
      this.carrier()?.id === shooter.id &&
      this.arrival() === 'air' &&
      event.outcome?.input.choiceId !== 'bicycle-kick'
        ? 'header'
        : 'shot';
    const end = this.shoot(
      shooter,
      visual,
      aim,
      { shot: event.id, save: save?.id, block: block?.id, goal: scored?.id },
      kind,
    );
    this.mark(event, origin, end);
    this.note(event, kind, shooter);
    if (scored) {
      this.mark(scored, origin, end);
      this.note(scored, kind, shooter);
      this.goals.push({ eventId: scored.id, playerId: shooter.id, frame: this.frames.length - 1 });
    }
    if (save) {
      this.mark(save, this.at(keeper.id), end);
      this.note(save, 'save', keeper);
    }
    if (block) {
      const blocker = this.actor(block.playerId);
      this.mark(block, blocker ? this.at(blocker.id) : end, end);
      if (blocker) this.note(block, 'block', blocker);
    }
  }
  private pass(event: MatchEvent, passer: Actor, next: MatchEvent | undefined) {
    const side = passer.side;
    if (this.carrier()?.id !== passer.id)
      this.bringBall({ side, target: passer }, null, { move: { purpose: 'reach' } });
    const choice = event.outcome?.input.choiceId ?? '';
    const style = PASS_STYLES[choice] ?? 'short';
    const origin = { ...this.ball };
    const from = this.toSpot(side, origin);
    const team = this.teammates(side).filter((actor) => actor.id !== passer.id);
    const follower =
      next?.kind === 'shot' && next.teamId === event.teamId && next.playerId !== passer.id
        ? this.actor(next.playerId)
        : undefined;
    const wing: Wing = from.w < 50 ? 'left' : 'right';
    const farWing: Wing = wing === 'left' ? 'right' : 'left';
    const pitch = (area: Area) =>
      this.toPitch(side, { d: clamp(area.d, 1, 99), w: clamp(area.w, 2, 98) });
    /** Forwards furthest up the pitch first. */
    const forwards = (long: boolean) =>
      team
        .filter((actor) => (long ? !atBack(actor) : actor.post.line === 'attack'))
        .sort(
          (a, b) =>
            this.toSpot(side, this.at(b.id)).d - this.toSpot(side, this.at(a.id)).d || byId(a, b),
        );
    /** In behind the line as it stands, in the receiver's channel. */
    const inBehind = (receiver: Actor, beyond: number) => {
      const lane = this.toSpot(side, this.at(receiver.id)).w;
      return pitch({
        d: clamp(this.lineDepth(side) + beyond, from.d + 4, 92),
        w: lane + (50 - lane) * 0.2,
      });
    };
    // The decision pass, the move it belongs to (match-14 pattern library), and what takes the
    // ball on to the follower's shot once it arrives.
    let receiver: Actor | undefined, target: Point | undefined;
    let pattern: PatternId | null = null;
    let then: ((holder: Actor) => void) | null = null;
    let exact = false;
    // The teammate the engine named before the choice (match-15): the pass goes to them.
    const named = this.targetOf(event);
    const planned =
      named?.kind === 'teammate'
        ? team.find((actor) => actor.id === named.playerId && !actor.keeper)
        : undefined;
    if (style === 'cross' && ((from.d > 66 && Math.abs(from.w - 50) > 17) || from.d > 80)) {
      // A cross into the box: wing play to a run at the near or far post.
      pattern = 'wing-play';
      receiver = planned ?? follower ?? byRole(team, 'striker', 'second-striker', 'attacking-mid');
      target = pitch(crossFinish(wing, this.rng.next() < 0.5 ? 'near' : 'far', this.rng));
    } else if (style === 'cross') {
      // Switch play: a long diagonal to the far flank, then the attack goes down that side.
      pattern = 'switch';
      const far = FLANK_ROLES[farWing];
      receiver =
        follower && wingOf(follower.post.role) === farWing
          ? follower
          : byRole(team, far.wide, far.back);
      if (receiver)
        target = this.reachable(
          receiver.id,
          this.toPitch(side, { d: from.d + 8, w: farWing === 'right' ? 88 : 12 }),
          3000,
        );
      if (follower && receiver && receiver.id !== follower.id)
        then = (holder) => {
          this.carry(
            holder,
            pitch({ d: 80 + this.rng.next() * 4, w: farWing === 'right' ? 91 : 9 }),
          );
          this.passTo(
            follower,
            pitch(crossFinish(farWing, 'far', this.rng)),
            true,
            undefined,
            false,
            { hint: 'cross' },
          );
        };
    } else if (style === 'through') {
      // A ball in behind for a runner.
      pattern = 'through-ball';
      const runners = forwards(false);
      receiver =
        planned ?? follower ?? runners[Math.floor(this.rng.next() * Math.min(2, runners.length))];
      if (receiver) {
        target = inBehind(receiver, 5 + this.rng.next() * 6);
        exact = span(this.at(receiver.id), target) < 40;
      }
      if (follower) then = (holder) => this.carry(holder, pitch(onGoal(this.rng)));
    } else if (style === 'long' && choice === 'quick-release') {
      // The keeper sets a counter going: one ball to a runner.
      pattern = 'counter';
      receiver = planned ?? follower ?? forwards(true)[0];
      if (receiver) {
        target = inBehind(receiver, 3 + this.rng.next() * 5);
        exact = span(this.at(receiver.id), target) < 40;
      }
      if (follower) then = (holder) => this.carry(holder, pitch(onGoal(this.rng)));
    } else if (style === 'long') {
      // Long to the target man, who knocks it down.
      pattern = 'long-ball';
      receiver = planned ?? byRole(team, 'striker', 'second-striker') ?? forwards(true)[0];
      if (follower && receiver?.id === follower.id) receiver = follower;
      const knock = { d: 62 + this.rng.next() * 10, w: 40 + this.rng.next() * 20 };
      if (receiver) target = pitch(knock);
      if (follower)
        then = (holder) => {
          if (holder.id !== follower.id)
            this.passTo(
              follower,
              pitch({ d: knock.d + 3 + this.rng.next() * 5, w: knock.w }),
              false,
            );
          this.carry(follower, this.shootingSpot(follower));
        };
    } else if (follower) {
      receiver = follower;
      if (from.d >= 85 && Math.abs(from.w - 50) > 17) {
        // From the byline: pulled back to the penalty spot area.
        pattern = 'cut-back';
        target = pitch({
          d: clamp(from.d - 4 - this.rng.next() * 5, 76, 87),
          w: 42 + this.rng.next() * 16,
        });
      } else
        target =
          from.d > 70
            ? this.toPitch(side, { d: clamp(from.d + 4, 76, 92), w: 44 + this.rng.next() * 12 })
            : this.shootingSpot(follower);
    } else if (RECYCLES.includes(choice)) pattern = 'recycle';
    if (planned && receiver?.id !== planned.id) {
      // A move that would go to someone else goes straight to the named teammate instead.
      receiver = planned;
      target = undefined;
      exact = false;
      then = follower ? (holder) => this.carry(holder, this.shootingSpot(holder)) : null;
    }
    if (planned && !target) {
      const spot = this.toSpot(side, this.at(planned.id));
      target = this.reachable(
        planned.id,
        this.onside(side, pitch({ d: Math.max(spot.d + 3, from.d - 8), w: spot.w })),
        2500,
      );
    }
    if (!receiver || !target) {
      const option = this.pickReceiver(side, 92);
      if (!option) return;
      receiver = option.actor;
      target = option.point;
    }
    const air = style === 'cross' || style === 'long';
    const hint: BeatKind =
      style === 'short'
        ? 'pass'
        : pattern === 'counter'
          ? exact
            ? 'through'
            : 'long'
          : style === 'through' && !exact
            ? 'pass'
            : style;
    this.pattern = pattern;
    if (event.outcome?.success ?? true) {
      this.passTo(receiver, target, air, undefined, exact, { hint, eventId: event.id });
      this.mark(event, origin, this.ball);
      this.note(event, this.last?.kind ?? 'pass', passer, receiver);
      if (then && this.carrier()?.id === receiver.id) then(receiver);
    } else {
      this.intercept(side, target, air, event.id);
      this.mark(event, origin, this.ball);
      this.note(event, this.passKind(side, origin, target, air, hint), passer);
    }
    this.pattern = null;
  }
  private dribble(event: MatchEvent, runner: Actor) {
    const side = runner.side;
    if (this.carrier()?.id !== runner.id)
      this.bringBall({ side, target: runner }, null, { move: { purpose: 'reach' } });
    const origin = { ...this.ball };
    const from = this.toSpot(side, origin);
    const defender = this.nearest((1 - side) as Side, origin)[0]!;
    // Carries gain ground; dribbles take the ball past a defender.
    const choice = event.outcome?.input.choiceId ?? '';
    const kind = CARRY_ONLY.includes(choice) ? 'carry' : 'dribble';
    if (event.outcome?.success ?? true) {
      const destination = this.toPitch(
        side,
        carryLane(choice, from) ?? carryLane('generic', from) ?? from,
      );
      // The beaten defender lunges at where the ball was.
      this.carry(runner, destination, new Map([[defender.id, origin]]), kind, event.id);
    } else this.tackle(defender, event.id);
    this.mark(event, origin, this.ball);
    this.note(event, kind, runner);
  }
  private challenge(event: MatchEvent, defender: Actor) {
    const attacker = this.carrier();
    const choice = event.outcome?.input.choiceId ?? '';
    const action = CHALLENGES[choice] ?? 'tackle';
    if (!attacker || attacker.side === defender.side) {
      this.mark(event, this.at(defender.id), this.ball);
      this.note(event, action, defender);
      return;
    }
    const start = { ...this.at(defender.id) };
    const origin = { ...this.ball };
    const side = attacker.side;
    const from = this.toSpot(side, origin);
    // Tracking the runner (match-15): the carrier looks for the run the cast named.
    const tracked = this.targetOf(event);
    const runner =
      choice === 'track-runner' && tracked?.kind === 'runner'
        ? this.actor(tracked.playerId)
        : undefined;
    if (runner && runner.side === side && runner.id !== attacker.id) {
      const run = this.toSpot(side, this.at(runner.id));
      const lane = this.toPitch(side, { d: clamp(Math.max(run.d, from.d) + 8, 2, 94), w: run.w });
      if (event.outcome?.success ?? true) {
        // The defender goes with the run and cuts out the ball played into it.
        const cut = lerp(origin, lane, 0.7);
        this.emit({
          dt: 700 + span(origin, cut) * 60,
          ball: cut,
          motion: 'ground',
          carrier: defender.id,
          fixed: new Map([[runner.id, this.reachable(runner.id, lane, 1500)]]),
          beat: { kind: 'intercept', actor: defender, eventId: event.id, won: true },
        });
      } else
        // The runner is away from the defender, who is a step behind.
        this.passTo(runner, lane, false, new Map([[defender.id, lerp(start, lane, 0.6)]]), false, {
          eventId: event.id,
        });
      this.mark(event, start, this.ball);
      this.note(event, 'intercept', defender);
      return;
    }
    if (event.outcome?.success ?? true) {
      if (choice === 'intercept') {
        const option = this.pickReceiver(side, 95);
        const lane = option ? lerp(origin, option.point, 0.45) : origin;
        this.emit({
          dt: 900,
          ball: lane,
          motion: 'ground',
          carrier: defender.id,
          beat: { kind: 'intercept', actor: defender, eventId: event.id, won: true },
        });
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
        this.tackle(defender, event.id);
      } else this.tackle(defender, event.id, action);
    } else {
      // The attacker gets past; the defender is left where the ball was.
      const past = this.toPitch(side, {
        d: clamp(from.d + (choice === 'jockey' ? 6 : 10), 2, 94),
        w: clamp(from.w + (50 - from.w) * 0.3, 3, 97),
      });
      this.carry(attacker, past, new Map([[defender.id, origin]]), 'dribble', event.id);
    }
    this.mark(event, start, this.ball);
    this.note(event, action, defender);
  }

  /**
   * Keep the ball moving until the passage has enough play. A goal celebrated in this passage
   * ends it; any later passage, even a quiet minute, starts with that goal's kickoff.
   */
  fill(minimum: number): void {
    const carrier = this.carrier();
    if (
      this.beats < minimum &&
      !this.play.restart &&
      carrier &&
      carrier.side === this.play.side &&
      this.rng.next() < FILL_PATTERN
    )
      this.build();
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
    return {
      frames: this.frames,
      play: { ...this.play, ...(this.last ? { last: this.last } : {}) },
      goals: this.goals,
      onTarget: this.onTarget,
      ...(this.focus ? { focus: this.focus } : {}),
      ...(this.cast ? { cast: this.cast } : {}),
    };
  }

  // ── Key-moment scenes ──────────────────────────────────────────────────────

  /**
   * Bring play to a key moment and set the scene around the selected player. Given the
   * engine's plan (match-15), the moment's cast is then named and placed.
   */
  scene(
    situation: Situation,
    selected: Actor,
    spot: Point,
    opponents: { defender?: string; attacker?: string },
    plan?: CastPlan,
  ): void {
    this.stage(situation, selected, spot, opponents);
    if (plan) this.castScene(situation, selected, spot, plan);
  }
  private stage(
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
          (actor) =>
            actor.id !== selected.id &&
            hasRole(actor, ['wide-left', 'wide-right', 'left-back', 'right-back']),
        );
        const crosser = byRole(wide, at.w <= 50 ? 'wide-right' : 'wide-left') ?? wide[0]!;
        const crossFrom = ownFrame(85, hasRole(crosser, ['wide-right', 'right-back']) ? 90 : 10);
        this.crosser = crosser.id;
        // Wing play: down the crosser's wing, then the cross to the selected player's run.
        this.bringBall({ side: own, target: crosser }, crossFrom, {
          move: { purpose: 'scene', situationId: situation.id },
        });
        const marker = outfield(opponents.defender, spot);
        this.direct = marker.id;
        this.pattern = 'wing-play';
        this.passTo(
          selected,
          spot,
          true,
          new Map([[marker.id, ownFrame(at.d + 1.5, at.w + 1.5)]]),
          true,
        );
        this.pattern = null;
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
            beat: { kind: 'intercept', actor: selected, won: true },
          });
          this.carry(selected, spot);
        }
        return;
      }
      case 'penalty': {
        // The ball on the spot, everyone else out of the area.
        this.bringBall({ side: own, target: selected }, spot);
        for (const side of [own, opposition])
          for (const actor of this.teammates(side)) {
            if (actor.id === selected.id || actor.keeper) continue;
            const where = this.toSpot(own, this.at(actor.id));
            if (where.d > 80 && where.w > 18 && where.w < 82)
              marks.set(actor.id, ownFrame(79 - this.rng.next() * 3, where.w));
          }
        this.emit({
          dt: 900,
          ball: spot,
          motion: 'carry',
          carrier: selected.id,
          fixed: marks,
          action: false,
          beat: { kind: 'restart', actor: selected, won: true },
        });
        return;
      }
      case 'free-kick': {
        // A two-man wall ten yards goal-side of the ball.
        this.bringBall({ side: own, target: selected }, spot);
        const wallAt = ownFrame(at.d + 8.7, at.w + (50 - at.w) * 0.15);
        for (const [index, actor] of this.nearest(opposition, wallAt).slice(0, 2).entries())
          if (!actor.keeper)
            marks.set(actor.id, ownFrame(at.d + 8.7, wallAt.y + (index ? 1.6 : -1.6)));
        this.emit({
          dt: 900,
          ball: spot,
          motion: 'carry',
          carrier: selected.id,
          fixed: marks,
          action: false,
          beat: { kind: 'restart', actor: selected, won: true },
        });
        return;
      }
      case 'corner-kick': {
        this.bringBall({ side: own, target: selected }, spot);
        this.emit({
          dt: 900,
          ball: spot,
          motion: 'carry',
          carrier: selected.id,
          fixed: marks,
          action: false,
          beat: { kind: 'restart', actor: selected, won: true },
        });
        return;
      }
      case 'defend-attack':
      case 'offside-line':
      case 'goal-line':
      case 'penalty-save':
      case 'shot-incoming':
      case 'one-on-one':
      case 'cross-ball': {
        const fallback = ownFrame(at.d + 6, at.w);
        const attacker =
          situation.id === 'cross-ball'
            ? (byRole(this.teammates(opposition), at.w <= 50 ? 'wide-right' : 'wide-left') ??
              outfield(opponents.attacker, fallback))
            : outfield(opponents.attacker, fallback);
        const ballAt =
          situation.id === 'defend-attack'
            ? ownFrame(at.d + 4, at.w + (this.rng.next() - 0.5) * 2)
            : situation.id === 'offside-line'
              ? ownFrame(at.d + 18, at.w + (this.rng.next() - 0.5) * 20)
              : situation.id === 'goal-line'
                ? ownFrame(9 + this.rng.next() * 3, 38 + this.rng.next() * 24)
                : situation.id === 'penalty-save'
                  ? ownFrame(10.5, 50)
                  : situation.id === 'shot-incoming'
                    ? ownFrame(19 + this.rng.next() * 4, 40 + this.rng.next() * 20)
                    : situation.id === 'one-on-one'
                      ? ownFrame(13, 44 + this.rng.next() * 12)
                      : ownFrame(8, at.w <= 50 ? 94 : 6);
        // The opposition's move into the danger the selected player faces (not a penalty).
        this.bringBall({ side: opposition, target: attacker }, ballAt, {
          air: situation.id === 'one-on-one' || situation.id === 'penalty-save' ? false : undefined,
          ...(situation.id === 'penalty-save'
            ? {}
            : { move: { purpose: 'scene' as const, situationId: situation.id } }),
        });
        const ball = this.toSpot(own, this.ball);
        marks.set(
          selected.id,
          situation.id === 'defend-attack' || situation.id === 'offside-line'
            ? spot
            : ownFrame(at.d, 50 + (ball.w - 50) * 0.3),
        );
        if (situation.id === 'goal-line') {
          // The keeper has been drawn out and beaten; the defender is the last line.
          const keeper = this.keeperOf(own);
          marks.set(keeper.id, ownFrame(ball.d + 3, ball.w + (ball.w < 50 ? 6 : -6)));
        }
        if (situation.id === 'penalty-save')
          for (const side of [own, opposition])
            for (const actor of this.teammates(side)) {
              if (actor.id === selected.id || actor.id === attacker.id || actor.keeper) continue;
              const where = this.toSpot(own, this.at(actor.id));
              if (where.d < 20 && where.w > 18 && where.w < 82)
                marks.set(actor.id, ownFrame(21 + this.rng.next() * 3, where.w));
            }
        if (situation.id === 'one-on-one')
          for (const back of this.teammates(own).filter((actor) =>
            hasRole(actor, ['centre-back-left', 'centre-back-right']),
          ))
            marks.set(
              back.id,
              ownFrame(ball.d + 6, ball.w + (back.post.role === 'centre-back-left' ? -5 : 5)),
            );
        if (situation.id === 'cross-ball') {
          const target = byRole(
            this.teammates(opposition).filter((actor) => actor.id !== attacker.id),
            'striker',
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
          beat: { kind: 'carry', actor: attacker },
        });
        return;
      }
      default: {
        // Attacking scenes: the selected player receives at the spot, the direct opponent
        // goal-side of them (a presser for build-out).
        this.bringBall({ side: own, target: selected }, spot, {
          move: { purpose: 'scene', situationId: situation.id },
        });
        const presser = situation.id === 'build-out';
        const opponent = outfield(presser ? opponents.attacker : opponents.defender, spot);
        this.direct = opponent.id;
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
          beat: { kind: 'carry', actor: selected },
        });
      }
    }
  }
  /**
   * Name everyone a key moment involves and put them where the moment needs them (engine
   * match-15, redesign step M4). Attacking: the opponent closing you down, the next ones
   * covering, their keeper in the final third, the crosser of an aerial ball, the runner a ball
   * in behind is for and the teammates the passes go to, in space. Defending: the attacker on
   * the ball (or crossing it), the runner to track, the teammates covering and your keeper in
   * your third. Everyone else holds still while the cast take their marks, so the scene keeps
   * its shape.
   */
  private castScene(situation: Situation, selected: Actor, spot: Point, plan: CastPlan): void {
    const own = selected.side,
      opposition = (1 - own) as Side;
    const at = this.toSpot(own, spot);
    const ball = this.toSpot(own, this.ball);
    const ownFrame = (d: number, w: number) =>
      this.toPitch(own, { d: clamp(d, 1, 99), w: clamp(w, 3, 97) });
    const near = (id: string, point: Point) => this.reachable(id, point, 1500);
    const cast: MomentCast = { selected: selected.id, cover: [], free: [] };
    const taken = new Set<string>([selected.id]);
    const marks = new Map<string, Point>();
    const outfield = (id: string | undefined, side: Side) => {
      const actor = this.actor(id);
      return actor && !actor.keeper && actor.side === side && !taken.has(actor.id)
        ? actor
        : undefined;
    };
    // Set pieces keep their set-up: the cast is named, not moved.
    const setPiece = ['penalty', 'free-kick', 'corner-kick', 'penalty-save'].includes(situation.id);
    if (situation.phase === 'defence') {
      const carrier = this.carrier();
      const onBall =
        carrier && carrier.side === opposition && !carrier.keeper ? carrier : undefined;
      if (onBall) {
        if (situation.id === 'cross-ball') cast.crosser = onBall.id;
        else cast.presser = onBall.id;
        taken.add(onBall.id);
      }
      // Their attacker nearest you, off the ball: the run to track.
      const runner = this.nearest(opposition, this.at(selected.id)).find(
        (actor) => !taken.has(actor.id) && actor.post.line !== 'defence',
      );
      if (runner) {
        cast.runner = runner.id;
        taken.add(runner.id);
        if (situation.id === 'defend-attack' || situation.id === 'offside-line')
          marks.set(runner.id, near(runner.id, ownFrame(at.d + 1, at.w + (at.w < 50 ? 12 : -12))));
      }
      // Teammates covering, goal-side of the ball.
      const mates = this.nearest(own, this.ball).filter((actor) => !taken.has(actor.id));
      for (const [index, mate] of mates.slice(0, selected.keeper ? 1 : 2).entries()) {
        cast.cover.push(mate.id);
        taken.add(mate.id);
        if (!selected.keeper && !setPiece)
          marks.set(
            mate.id,
            near(
              mate.id,
              ownFrame(Math.min(ball.d, at.d) - 5 - index * 3, ball.w + (index ? 9 : -9)),
            ),
          );
      }
      if (!selected.keeper && at.d < 100 / 3) cast.keeper = this.keeperOf(own).id;
    } else {
      const presser = outfield(this.direct, opposition);
      if (presser) {
        cast.presser = presser.id;
        taken.add(presser.id);
      }
      // The next opponents cover, goal-side of the ball.
      if (situation.id !== 'penalty') {
        const others = this.nearest(opposition, this.ball).filter((actor) => !taken.has(actor.id));
        for (const [index, actor] of others.slice(0, presser ? 1 : 2).entries()) {
          cast.cover.push(actor.id);
          taken.add(actor.id);
          if (!setPiece)
            marks.set(
              actor.id,
              near(
                actor.id,
                ownFrame(at.d + 7 + index * 3, at.w + (50 - at.w) * 0.4 + (index ? 6 : -6)),
              ),
            );
        }
      }
      if (at.d >= 200 / 3) cast.keeper = this.keeperOf(opposition).id;
      const crosser = outfield(this.crosser, own);
      if (crosser) {
        cast.crosser = crosser.id;
        taken.add(crosser.id);
      }
      // The runner times the run on the line; the others find space ahead of the ball.
      const runner = outfield(plan.runner, own);
      if (runner) {
        cast.runner = runner.id;
        taken.add(runner.id);
        const from = this.toSpot(own, this.at(runner.id));
        if (!setPiece)
          marks.set(
            runner.id,
            near(runner.id, this.onside(own, ownFrame(Math.max(from.d, at.d + 6), from.w))),
          );
      }
      for (const id of plan.receivers) {
        const mate = outfield(id, own);
        if (!mate) continue;
        cast.free.push(mate.id);
        taken.add(mate.id);
        if (setPiece) continue;
        const from = this.toSpot(own, this.at(mate.id));
        marks.set(
          mate.id,
          near(mate.id, this.onside(own, ownFrame(from.d + 3, from.w + (from.w < 50 ? -3 : 3)))),
        );
      }
    }
    // The cast run towards their marks in the scene's last keyframe, as far as a sprint takes
    // them in its time; everyone else stays where the scene put them.
    const last = this.frames[this.frames.length - 1]!;
    const before = this.frames[this.frames.length - 2];
    const limit = 1 + (before ? last.timeMs - before.timeMs : 0) * RUN;
    for (const [id, mark] of marks) {
      const actor = this.lookup.get(id)!;
      if (actor.id === this.play.carrierId) continue;
      const from = before?.players[actor.index]?.point ?? this.pos[actor.index]!;
      const length = span(from, mark);
      const reach = length <= limit ? mark : lerp(from, mark, limit / length);
      const point = { x: tenth(clamp(reach.x, 0.8, 99.2)), y: tenth(clamp(reach.y, 1, 99)) };
      this.pos[actor.index] = point;
      last.players[actor.index]!.point = { ...point };
    }
    this.cast = cast;
  }
}

function director(
  session: MatchSession,
  start: ReplayFrame | null,
  startTime: number,
  tag: string,
  exempt?: ReadonlySet<string>,
) {
  const minute = session.state.match.minute;
  return new Director(
    session,
    start,
    session.state.play,
    minute,
    startTime,
    createRng(`${session.setup.seed}:motion:${minute}:${tag}`),
    exempt,
  );
}
const lastFrame = (session: MatchSession) => session.state.frames[session.state.frames.length - 1]!;
/**
 * Cost probe for `npm run profile:match`: with a clock set, every passage adds its duration
 * (choreography plus its narration; `narrationMs` keeps the narration's share). Unset in the
 * game, so it costs nothing and never touches replayed state.
 */
export const motionProbe: {
  clock: (() => number) | null;
  ms: number;
  narrationMs: number;
  passages: number;
} = {
  clock: null,
  ms: 0,
  narrationMs: 0,
  passages: 0,
};
function timed<T>(work: () => T): T {
  const clock = motionProbe.clock;
  if (!clock) return work();
  const start = clock();
  const result = work();
  motionProbe.ms += clock() - start;
  motionProbe.passages++;
  return result;
}
/** Narration's share of the probe: counted in the choreography budget too. */
export function timedNarration<T>(work: () => T): T {
  const clock = motionProbe.clock;
  if (!clock) return work();
  const start = clock();
  const result = work();
  const spent = clock() - start;
  motionProbe.ms += spent;
  motionProbe.narrationMs += spent;
  return result;
}

/** The opening kickoff: both teams in their halves, the home side on the ball. */
export function openingKickoff(session: MatchSession): { frame: ReplayFrame; play: PlayState } {
  return timed(() => kickoffScene(session));
}
function kickoffScene(session: MatchSession): { frame: ReplayFrame; play: PlayState } {
  const scene = director(session, null, 0, 'kickoff');
  scene.placeKickoff(0, true);
  const frame = { ...scene.frames[scene.frames.length - 1]!, timeMs: 0 };
  return { frame, play: { ...scene.play, restart: 'kickoff' } };
}
/** A simulated minute: its events plus enough ordinary possession to fill it. */
export function minutePassage(session: MatchSession, events: MatchEvent[]): Passage {
  return timed(() => minuteScene(session, events));
}
function minuteScene(session: MatchSession, events: MatchEvent[]): Passage {
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
  plan?: CastPlan,
): Passage {
  return timed(() => momentScene(session, situation, spot, opponents, plan));
}
function momentScene(
  session: MatchSession,
  situation: Situation,
  spot: Point,
  opponents: { defender?: string; attacker?: string },
  plan?: CastPlan,
): Passage {
  const minute = session.state.match.minute;
  const scene = director(session, lastFrame(session), (minute - 1) * 60000, 'moment');
  const selected = scene.actor(session.setup.selectedPlayerId)!;
  scene.scene(situation, selected, spot, opponents, plan);
  return scene.finish();
}
/** A resolved decision and the rest of its minute, starting from the moment's scene. */
export function outcomePassage(
  session: MatchSession,
  events: MatchEvent[],
  situationId: string,
  /** How many of `events` the decision produced: its action and what followed from it. */
  decisionEvents = 0,
): Passage {
  return timed(() => outcomeScene(session, events, situationId, decisionEvents));
}
function outcomeScene(
  session: MatchSession,
  events: MatchEvent[],
  situationId: string,
  decisionEvents: number,
): Passage {
  const minute = session.state.match.minute;
  // A player the decision sent off (match-16) plays the decision out and leaves after it.
  const dismissed = new Set(
    events.flatMap((event) =>
      event.kind === 'card' && event.card !== 'yellow' && event.playerId ? [event.playerId] : [],
    ),
  );
  const scene = director(session, lastFrame(session), minute * 60000 - 20000, 'outcome', dismissed);
  scene.run(events, SITUATION_BY_ID[situationId] ?? null, decisionEvents);
  scene.fill(2);
  return scene.finish();
}

/**
 * What a passage shows of one player (engine match-14 bookkeeping): the distance covered in
 * length units (`METRES_PER_UNIT` converts), their touches, and the time spent in each heat cell
 * added to `heat`, sampled along each keyframe span. `mirror` flips the pitch so the player's
 * team attacks towards x = 100. A half-time reset is a jump, not a run.
 */
export function followPlayer(
  frames: readonly ReplayFrame[],
  id: string,
  mirror: boolean,
  heat: number[],
): { distance: number; touches: number } {
  let distance = 0,
    touches = 0;
  let previous: Point | undefined;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const beat = frame.beat;
    if (
      i > 0 &&
      beat &&
      beat.kind !== 'restart' &&
      beat.kind !== 'celebration' &&
      (beat.actorId === id || beat.receiverId === id)
    )
      touches++;
    const point = frame.players.find((player) => player.id === id)?.point;
    if (point && previous && i > 0) {
      const dt = frame.timeMs - frames[i - 1]!.timeMs;
      const length = frame.ballMotion === 'reset' ? 0 : span(previous, point);
      distance += length;
      if (dt > 0) {
        // About one sample every 5 units of running, each with its share of the time.
        const samples = Math.max(1, Math.ceil(length / 5));
        for (let k = 0; k < samples; k++) {
          const at = lerp(previous, point, (k + 0.5) / samples);
          const x = mirror ? 100 - at.x : at.x,
            y = mirror ? 100 - at.y : at.y;
          const column = clamp(Math.floor((x * HEAT_COLUMNS) / 100), 0, HEAT_COLUMNS - 1);
          const row = clamp(Math.floor((y * HEAT_ROWS) / 100), 0, HEAT_ROWS - 1);
          heat[row * HEAT_COLUMNS + column]! +=
            Math.round((dt * (k + 1)) / samples) - Math.round((dt * k) / samples);
        }
      }
    }
    previous = point;
  }
  return { distance, touches };
}
