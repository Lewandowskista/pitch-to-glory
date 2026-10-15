import type { BeatKind, PatternId } from '../../model/domain';
import type { Rng } from '../rng';
import type { Formation, SlotRole } from '../selection/formations';

/**
 * The pattern library (redesign step M2, engine match-14): the recognisable moves a team uses
 * to get the ball to a finisher, so goals and chances look like football. A pattern is chosen
 * on the motion stream from the formation's slot roles, the ball's flank, the finisher's role,
 * the decision being played, counter-attacks and the club's playing style, then planned as
 * concrete steps (passes to slot roles, carries) that `motion.ts` plays out within its usual
 * constraints (sprint speed, the offside line, pressing). Patterns never change an outcome:
 * who shoots, and whether it goes in, was decided before the choreography starts.
 *
 * Every area is in the attacking team's frame: depth `d` from its own goal line (0) to the
 * opponent's (100), width `w` from its left touchline. Patterns are authored down the left and
 * mirrored for the right.
 *
 * - wing-play: full-back → winger down the line → the winger carries towards the byline →
 *   cross to a finisher attacking the near or far post.
 * - overlap: the winger holds it up while the full-back overlaps outside, the ball goes down
 *   the line into the run, then a cross or a cut-back.
 * - switch: a midfielder on one side plays a long diagonal to the far flank, then the attack
 *   goes down that side.
 * - through-ball: a midfielder slides a runner in behind the defensive line.
 * - counter: straight after winning the ball, at most two passes and fast runs.
 * - cut-back: the wide player gets to the byline and pulls a low ball back to the penalty
 *   spot area.
 * - long-ball: keeper or centre-back hits the target man, who knocks it down.
 * - recycle: patient circulation back and across before going again.
 */

export type Wing = 'left' | 'right';
/** A point in the attacking team's frame. */
export interface Area {
  d: number;
  w: number;
}
export interface PassStep {
  kind: 'pass';
  /** Who receives: slot roles by preference, or the move's finisher. */
  who: readonly SlotRole[] | 'target';
  to: Area;
  air: boolean;
  hint: BeatKind;
  /** A ball into the box that the defence may cut out (build-up without a shot). */
  contest?: boolean;
  /**
   * A ball in behind: played this far beyond the offside line as it stands when the pass is
   * played (`to.w` keeps the runner's channel).
   */
  behind?: number;
}
export interface CarryStep {
  kind: 'carry';
  to: Area;
  /** Taken past a defender (the byline run of a cut-back). */
  dribble: boolean;
  /** A teammate's run while the carrier holds the ball (the overlap), held onside. */
  run?: { who: readonly SlotRole[]; to: Area };
}
export type Step = PassStep | CarryStep;
export interface Plan {
  id: PatternId;
  wing: Wing;
  steps: Step[];
  /** Where the finisher ends the move (the shooting spot), when not where they receive. */
  finish?: Area;
  /** The post a cross is aimed at, relative to the wing it comes from. */
  post?: 'near' | 'far';
}
export interface MoveContext {
  /**
   * `shot`: deliver the ball to a shooter; `scene`: set up a key moment at a fixed spot;
   * `fill`: ordinary possession with no finisher; `reach`: get the ball to a player who acts.
   */
  purpose: 'shot' | 'scene' | 'fill' | 'reach';
  /** Where the ball is. */
  ball: Area;
  carrierRole: SlotRole | null;
  /** The carrier plays in the back line (or is the keeper). */
  carrierAtBack: boolean;
  /** The finisher's (or receiver's) slot role. */
  targetRole: SlotRole | null;
  /** Where the finisher stands now. */
  targetAt?: Area;
  /** Slot roles in the team's formation. */
  roles: ReadonlySet<SlotRole>;
  /** The club's playing style (possession, direct, press, counter, balanced). */
  style: string;
  formation: Formation;
  /** Depth of the opposition's second-last defender (the offside line). */
  line: number;
  /** The engine calls this a counter-attack. */
  counter: boolean;
  /** The team has just won the ball. */
  won: boolean;
  situationId?: string;
  /** A scene's fixed spot for the finisher. */
  spot?: Area;
}

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
type Weights = Partial<Record<PatternId, number>>;

const other = (wing: Wing): Wing => (wing === 'left' ? 'right' : 'left');
/** An area authored down the left, on the given wing. */
const on = (wing: Wing, d: number, w: number): Area => ({ d, w: wing === 'left' ? w : 100 - w });
const between = (rng: Rng, low: number, high: number) => low + rng.next() * (high - low);
const clampTo = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** Most crosses are lofted (headed); the rest are driven low across the six-yard box (struck). */
const lofted = (rng: Rng) => rng.next() < 0.6;
/** The side of the pitch a slot plays on, if any. */
export function wingOf(role: SlotRole | null | undefined): Wing | null {
  if (!role) return null;
  if (role === 'left-back' || role === 'wide-left' || role === 'left-mid') return 'left';
  if (role === 'right-back' || role === 'wide-right' || role === 'right-mid') return 'right';
  return null;
}
const ROLES = {
  left: {
    back: 'left-back',
    wide: 'wide-left',
    mid: 'left-mid',
    centreBack: 'centre-back-left',
  },
  right: {
    back: 'right-back',
    wide: 'wide-right',
    mid: 'right-mid',
    centreBack: 'centre-back-right',
  },
} as const satisfies Record<Wing, Record<string, SlotRole>>;
const STRIKERS: readonly SlotRole[] = ['striker', 'second-striker'];
const MIDFIELD: readonly SlotRole[] = ['pivot', 'left-mid', 'right-mid', 'attacking-mid'];
const BACKS: readonly SlotRole[] = [
  'left-back',
  'centre-back-left',
  'centre-back',
  'centre-back-right',
  'right-back',
];
const WIDE: readonly SlotRole[] = ['wide-left', 'wide-right'];
const has = (role: SlotRole | null, list: readonly SlotRole[]) => !!role && list.includes(role);

/** Style and formation multipliers on top of the finisher's preferences. */
const STYLE: Record<string, Weights> = {
  possession: { recycle: 2, switch: 1.5, 'cut-back': 1.3, 'long-ball': 0.3 },
  direct: { 'long-ball': 3, 'wing-play': 1.5, recycle: 0.4 },
  press: { 'through-ball': 1.5, counter: 1.5 },
  counter: { counter: 2.5, 'through-ball': 1.5, recycle: 0.5 },
};
const FORMATION: Record<Formation, Weights> = {
  '4-3-3': { overlap: 1.3, 'wing-play': 1.1 },
  '4-4-2': { 'long-ball': 1.5, 'wing-play': 1.2 },
  '4-2-3-1': { 'through-ball': 1.2, 'cut-back': 1.2 },
  '3-5-2': { overlap: 0, 'wing-play': 1.3 },
};

/** How likely each pattern is for this move, before style and formation. */
function preferences(ctx: MoveContext): Weights {
  const role = ctx.targetRole;
  if (ctx.purpose === 'fill')
    return {
      recycle: 3,
      switch: 2,
      'long-ball': 2,
      'wing-play': 1.2,
      overlap: 1,
      'through-ball': 0.7,
      'cut-back': 0.6,
      counter: ctx.won ? 2 : 0,
    };
  if (ctx.purpose === 'reach') {
    const across =
      ctx.targetAt && wingOf(role) && Math.abs(ctx.targetAt.w - ctx.ball.w) >= 50 ? 4 : 0;
    return { switch: across, recycle: ctx.targetAt && ctx.targetAt.d < ctx.ball.d - 6 ? 2 : 0 };
  }
  if (ctx.purpose === 'scene')
    switch (ctx.situationId) {
      case 'box-chance':
        return { 'through-ball': 3, 'cut-back': 3, 'wing-play': has(role, WIDE) ? 0 : 0.5 };
      case 'build-up':
        return { switch: 2, 'wing-play': 2, overlap: has(role, BACKS) ? 2 : 0, recycle: 1 };
      case 'edge-of-area':
        return { 'cut-back': 3, recycle: 2 };
      case 'aerial-chance':
      case 'cross-ball':
        return { 'wing-play': 1 };
      case 'one-on-one':
        return { 'through-ball': 3, counter: 1 };
      case 'defend-attack':
        return { counter: 2, 'wing-play': 1, recycle: 1 };
      case 'goal-line':
        return { 'cut-back': 2, 'wing-play': 1 };
      case 'shot-incoming':
        return { recycle: 2, 'cut-back': 1 };
      case 'offside-line':
        return { recycle: 2, switch: 1 };
      default:
        return {};
    }
  // A shot. A wide teammate already on the ball deep in the final third crosses or cuts back.
  if (ctx.ball.d > 78 && Math.abs(ctx.ball.w - 50) > 25 && wingOf(ctx.carrierRole))
    return { 'wing-play': 2, 'cut-back': 1 };
  if (has(role, STRIKERS))
    return {
      'wing-play': 3,
      'through-ball': 3,
      'cut-back': 2,
      overlap: 1.5,
      switch: 1,
      'long-ball': 1,
    };
  if (has(role, WIDE))
    return { 'wing-play': 2, 'through-ball': 2.5, switch: 2, 'cut-back': 1, 'long-ball': 0.4 };
  if (has(role, MIDFIELD))
    return {
      'cut-back': 3,
      recycle: 2.5,
      'through-ball': 1.5,
      switch: 1,
      'wing-play': 1,
      'long-ball': 0.4,
    };
  // Defenders: a header from a cross, or a ball pulled back to them.
  return { 'wing-play': 4, 'cut-back': 1, recycle: 1 };
}

/** The pattern's weight once the team's shape and the state of play allow it. */
function allowed(id: PatternId, ctx: MoveContext): boolean {
  const roles = ctx.roles;
  const wideOrBack = (wing: Wing) =>
    roles.has(ROLES[wing].wide) || roles.has(ROLES[wing].back) || roles.has(ROLES[wing].mid);
  switch (id) {
    case 'overlap':
      return (
        (roles.has('left-back') && roles.has('wide-left')) ||
        (roles.has('right-back') && roles.has('wide-right'))
      );
    case 'wing-play':
    case 'cut-back':
      return wideOrBack('left') || wideOrBack('right');
    case 'switch':
      return ctx.ball.d < 72;
    case 'through-ball': {
      // A ball in behind needs room behind the line, and a scene's spot beyond it.
      if (ctx.line > 85) return false;
      return !ctx.spot || ctx.spot.d > ctx.line + 2;
    }
    case 'counter':
      return ctx.counter || ctx.won;
    case 'long-ball':
      return (
        STRIKERS.some((role) => roles.has(role)) &&
        (ctx.carrierAtBack || ctx.ball.d < 35) &&
        ctx.targetRole !== 'keeper'
      );
    case 'recycle':
      return ctx.ball.d > 25;
  }
}

/**
 * Choose and plan a move, or null when no pattern fits (the generic relay then plays it). The
 * draws come from the motion stream, so nothing here can change an outcome.
 */
export function planMove(ctx: MoveContext, rng: Rng): Plan | null {
  let id: PatternId | null = null;
  if (ctx.counter && allowed('counter', ctx)) id = 'counter';
  else if (ctx.situationId === 'aerial-chance' || ctx.situationId === 'cross-ball')
    id = 'wing-play';
  else {
    const base = preferences(ctx);
    const style = STYLE[ctx.style] ?? {};
    const shape = FORMATION[ctx.formation];
    let total = 0;
    const weights: [PatternId, number][] = [];
    for (const pattern of PATTERNS) {
      const weight =
        (base[pattern] ?? 0) *
        (style[pattern] ?? 1) *
        (shape[pattern] ?? 1) *
        (allowed(pattern, ctx) ? 1 : 0);
      if (weight > 0) {
        weights.push([pattern, weight]);
        total += weight;
      }
    }
    // A short draw after the weights, so each pattern keeps its share.
    let pick = rng.next() * total;
    for (const [pattern, weight] of weights) {
      pick -= weight;
      if (pick < 0) {
        id = pattern;
        break;
      }
    }
    if (!id && weights.length) id = weights[weights.length - 1]![0];
  }
  if (!id) return null;
  return build(id, chooseWing(id, ctx, rng), ctx, rng);
}

/** The wing a move goes down. */
function chooseWing(id: PatternId, ctx: MoveContext, rng: Rng): Wing {
  const target = wingOf(ctx.targetRole);
  const ball: Wing | null = ctx.ball.w < 100 / 3 ? 'left' : ctx.ball.w > 200 / 3 ? 'right' : null;
  const coin: Wing = rng.next() < 0.5 ? 'left' : 'right';
  const spot: Wing | null = ctx.spot ? (ctx.spot.w < 50 ? 'left' : 'right') : null;
  switch (id) {
    case 'switch':
      // To the finisher's wing; otherwise away from the ball.
      return spot ?? target ?? (ball ? other(ball) : coin);
    case 'wing-play':
    case 'cut-back':
    case 'overlap':
      // A wide finisher arrives from the far side; a scene's spot names the crossing wing.
      if (ctx.situationId === 'cross-ball' && spot) return spot;
      // The aerial chance brings the ball to the crosser: down their own wing.
      if (ctx.situationId === 'aerial-chance' && target) return target;
      // A wide man already deep on the ball crosses from where he is.
      if (wingOf(ctx.carrierRole) && ctx.ball.d > 78 && ball) return ball;
      if (target && has(ctx.targetRole, WIDE)) return other(target);
      if (target && ctx.purpose === 'scene' && spot) return spot;
      return ball ?? coin;
    case 'through-ball':
    case 'counter':
      return target ?? spot ?? ball ?? coin;
    default:
      return ball ?? coin;
  }
}

/** The finisher's run for a cross: the near post, or the far post. */
export function crossFinish(wing: Wing, post: 'near' | 'far', rng: Rng): Area {
  return post === 'near'
    ? on(wing, between(rng, 88, 91), between(rng, 40, 46))
    : on(wing, between(rng, 86, 90), between(rng, 55, 62));
}
/** In behind the defensive line, in the finisher's channel (the depth is set when played). */
function behind(ctx: MoveContext, wing: Wing, rng: Rng): { to: Area; behind: number } {
  const beyond = between(rng, 5, 11);
  const lane = has(ctx.targetRole, WIDE) ? between(rng, 28, 38) : between(rng, 40, 54);
  return { to: on(wing, clampTo(ctx.line + beyond, 70, 91), lane), behind: beyond };
}
/** Bearing down on goal after a ball in behind. */
export const onGoal = (rng: Rng): Area => ({ d: between(rng, 84, 89), w: between(rng, 42, 58) });

function build(id: PatternId, wing: Wing, ctx: MoveContext, rng: Rng): Plan {
  const side = ROLES[wing],
    far = ROLES[other(wing)];
  const finisher = ctx.purpose !== 'fill' && ctx.targetRole !== null;
  const steps: Step[] = [];
  const pass = (
    who: PassStep['who'],
    to: Area,
    air = false,
    hint: BeatKind = 'pass',
    contest = false,
    beyond?: number,
  ): void => {
    steps.push({
      kind: 'pass',
      who,
      to,
      air,
      hint,
      ...(contest ? { contest } : {}),
      ...(beyond !== undefined ? { behind: beyond } : {}),
    });
  };
  const carry = (to: Area, dribble = false, run?: CarryStep['run']): void => {
    steps.push({ kind: 'carry', to, dribble, ...(run ? { run } : {}) });
  };
  const ahead = (depth: number) => ctx.ball.d < depth;
  /** The wide man on the ball already: the move starts from him. */
  const wideOnBall =
    ctx.carrierRole === side.wide || (ctx.carrierRole === side.mid && !ctx.roles.has(side.wide));
  const plan: Plan = { id, wing, steps };
  /** The final ball into the box: to the finisher, or contested when there is none. */
  const finalBall = (to: Area, air: boolean, hint: BeatKind) => {
    if (finisher) pass('target', to, air, hint);
    else pass(['striker', 'second-striker', 'attacking-mid', far.wide], to, air, hint, true);
  };

  switch (id) {
    case 'wing-play': {
      const post: 'near' | 'far' =
        has(ctx.targetRole, WIDE) || has(ctx.targetRole, BACKS)
          ? 'far'
          : rng.next() < 0.6
            ? 'near'
            : 'far';
      plan.post = post;
      if (!wideOnBall) {
        if (ahead(50))
          pass([side.back, side.mid, 'pivot'], on(wing, between(rng, 40, 50), between(rng, 8, 16)));
        pass([side.wide, side.mid, side.back], on(wing, between(rng, 64, 72), between(rng, 6, 12)));
      }
      carry(on(wing, between(rng, 80, 85), between(rng, 5, 12)));
      finalBall(crossFinish(wing, post, rng), lofted(rng), 'cross');
      break;
    }
    case 'overlap': {
      if (!wideOnBall)
        pass([side.wide, side.mid], on(wing, between(rng, 60, 68), between(rng, 10, 18)));
      const lane = on(wing, between(rng, 80, 85), between(rng, 4, 9));
      // The winger checks inside and holds it while the full-back overlaps outside.
      carry(on(wing, between(rng, 64, 70), between(rng, 20, 28)), false, {
        who: [side.back],
        to: lane,
      });
      pass([side.back], lane);
      if (rng.next() < 0.5) {
        plan.post = rng.next() < 0.5 ? 'near' : 'far';
        finalBall(crossFinish(wing, plan.post, rng), lofted(rng), 'cross');
      } else {
        carry(on(wing, between(rng, 90, 94), between(rng, 12, 22)), true);
        finalBall(on(wing, between(rng, 80, 87), between(rng, 42, 58)), false, 'cutback');
      }
      break;
    }
    case 'switch': {
      // From the far side of midfield to the near touchline of this wing.
      pass(
        [far.mid, 'pivot', far.centreBack, far.back],
        on(wing, between(rng, 42, 56), between(rng, 65, 76)),
      );
      pass(
        [side.wide, side.back, side.mid],
        on(wing, between(rng, 56, 68), between(rng, 6, 14)),
        true,
        'switch',
      );
      if (finisher && ctx.purpose !== 'reach') {
        carry(on(wing, between(rng, 78, 84), between(rng, 6, 12)));
        plan.post = has(ctx.targetRole, WIDE) ? 'far' : rng.next() < 0.5 ? 'near' : 'far';
        pass('target', crossFinish(wing, plan.post, rng), lofted(rng), 'cross');
      }
      break;
    }
    case 'through-ball': {
      const playmaker = ctx.carrierRole && MIDFIELD.includes(ctx.carrierRole) && ctx.ball.d >= 45;
      if (!playmaker)
        pass(['attacking-mid', side.mid, 'pivot', far.mid], {
          d: between(rng, 52, 62),
          w: between(rng, 40, 60),
        });
      const runIn = behind(ctx, wing, rng);
      if (finisher) {
        pass('target', runIn.to, false, 'through', false, runIn.behind);
        if (ctx.purpose === 'shot') plan.finish = onGoal(rng);
      } else
        pass(
          ['striker', side.wide, 'second-striker'],
          runIn.to,
          false,
          'through',
          true,
          runIn.behind,
        );
      break;
    }
    case 'counter': {
      // At most two passes from the regain: out to a runner, then in behind.
      if (ctx.ball.d < 55)
        pass(
          [side.wide, 'attacking-mid', 'second-striker', side.mid],
          on(wing, between(rng, 55, 66), between(rng, 18, 32)),
        );
      const runIn = behind(ctx, wing, rng);
      if (finisher) {
        pass('target', runIn.to, false, 'through', false, runIn.behind);
        if (ctx.purpose === 'shot') plan.finish = onGoal(rng);
      } else
        pass(
          ['striker', 'second-striker', far.wide],
          runIn.to,
          false,
          'through',
          true,
          runIn.behind,
        );
      break;
    }
    case 'cut-back': {
      if (!wideOnBall)
        pass([side.wide, side.back, side.mid], on(wing, between(rng, 70, 78), between(rng, 8, 14)));
      carry(on(wing, between(rng, 90, 94), between(rng, 12, 22)), true);
      finalBall(on(wing, between(rng, 80, 87), between(rng, 42, 58)), false, 'cutback');
      break;
    }
    case 'long-ball': {
      const knock = { d: between(rng, 62, 72), w: between(rng, 40, 60) };
      pass(['striker', 'second-striker'], knock, true, 'long');
      // The knock-down to a runner arriving from deeper.
      const drop = {
        d: knock.d + between(rng, 3, 8),
        w: clampTo(knock.w + between(rng, -12, 12), 30, 70),
      };
      if (finisher) pass('target', drop);
      else pass(['second-striker', 'attacking-mid', side.mid, side.wide], drop);
      break;
    }
    case 'recycle': {
      // Back and across, then go again.
      const depth = ctx.ball.d;
      pass([side.mid, 'pivot', side.centreBack], {
        d: clampTo(depth - between(rng, 6, 14), 15, 70),
        w: wing === 'left' ? between(rng, 30, 45) : between(rng, 55, 70),
      });
      pass([far.mid, 'pivot', far.centreBack, far.back], {
        d: clampTo(depth - between(rng, 4, 12), 15, 70),
        w: wing === 'left' ? between(rng, 60, 78) : between(rng, 22, 40),
      });
      if (finisher && ctx.purpose === 'shot')
        pass('target', { d: between(rng, 70, 76), w: between(rng, 40, 60) });
      break;
    }
  }
  return plan;
}
