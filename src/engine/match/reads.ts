/**
 * Reads of the play (engine match-22, release 1.0 step 5.2): what the pitch shows at a key
 * moment and how it bears on each choice. Drawn on their own stream, so no other roll moves;
 * matchup reads (pace, aerial) and the marked man come from the players, without a draw. The
 * moment's scene is then nudged so the pitch shows them: the keeper off his line, a wall of
 * four, the press closing in.
 */
import type { MomentRead, Player, Point, ReplayFrame } from '../../model/domain';
import { createRng } from '../rng';
import { playerAbility } from '../strength';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { RUN, span, type Passage } from './motion';
import type { ContextRead } from './decisions';
import { clamp, round6 } from './decisions';
import type { ChoiceTemplate, Situation } from './situations';
import { UNLOCKS_22 } from './situations22';
import { READS } from './readTable';
import { attacksRight, onPitch, selectedSide } from './shared';

const M = C.moments22;
const pace = (p: Pick<Player, 'attributes'>) => (p.attributes.pace + p.attributes.acceleration) / 2;
const aerial = (p: Pick<Player, 'attributes'>) =>
  (p.attributes.heading + p.attributes.jumping + p.attributes.strength) / 3;
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** The selected side's best three in the air against the opposition's (a corner). */
function teamAerial(session: MatchSession): number {
  const setup = session.setup,
    m = session.state.match,
    side = selectedSide(setup);
  const top = (ids: string[]) =>
    mean(
      ids
        .map((id) => setup.players[id]!)
        .filter((p) => p.primaryPosition !== 'GK')
        .map(aerial)
        .sort((a, b) => b - a)
        .slice(0, 3),
    );
  const own = onPitch(side === 0 ? m.home : m.away);
  const theirs = onPitch(side === 0 ? m.away : m.home);
  return top(own) - top(theirs);
}

/**
 * How tightly the opposition marks the player (review C17): 0 unless their ability beats both
 * the match level and the opposition's mean by more than the threshold; relaxed when the
 * opposition must chase the game late on.
 */
export function markedBy(session: MatchSession): number {
  const setup = session.setup,
    s = session.state,
    m = s.match,
    side = selectedSide(setup);
  const player = setup.players[setup.selectedPlayerId]!;
  if (player.primaryPosition === 'GK') return 0;
  const theirs = onPitch(side === 0 ? m.away : m.home).map((id) => setup.players[id]!);
  const reference = Math.max(s.matchLevel, mean(theirs.map((p) => playerAbility(p))));
  const excess = playerAbility(player) - reference - M.marked.threshold;
  if (excess <= 0) return 0;
  const chasing = m.minute >= M.marked.relaxFromMinute && m.score[side]! > m.score[1 - side]!;
  return round6(Math.min(M.marked.maximum, excess * M.marked.slope) * (chasing ? M.marked.relax : 1));
}

/**
 * The reads of a moment, in the catalogue's order: each drawn read takes one draw on
 * `${seed}:reads:${minute}:${index}`; a matchup read compares the player with the drawn opponent.
 */
export function drawReads(
  session: MatchSession,
  situation: Situation,
  opponents: { keeper?: string; defender?: string; attacker?: string },
): MomentRead[] {
  const setup = session.setup,
    m = session.state.match;
  const rng = createRng(`${setup.seed}:reads:${m.minute}:${m.keyMoments.length}`);
  const player = setup.players[setup.selectedPlayerId]!;
  return (READS[situation.id] ?? []).map((read) => {
    if (read.kind) {
      const opponent =
        setup.players[(situation.phase === 'attack' ? opponents.defender : opponents.attacker) ?? ''];
      const margin =
        read.kind === 'pace'
          ? opponent
            ? pace(player) - pace(opponent)
            : 0
          : situation.id === 'corner-kick'
            ? teamAerial(session)
            : opponent
              ? aerial(player) - aerial(opponent)
              : 0;
      const state =
        margin > M.matchupMargin ? 'ahead' : margin < -M.matchupMargin ? 'behind' : 'level';
      return { id: read.id, state };
    }
    let target = rng.next() * read.states.reduce((sum, s) => sum + s.weight, 0);
    let state = read.states[read.states.length - 1]!.id;
    for (const s of read.states) {
      target -= s.weight;
      if (target < 0) {
        state = s.id;
        break;
      }
    }
    return { id: read.id, state };
  });
}

/** The odds multipliers a decision applies for the reads (and the marking) of a moment. */
export function contextReads(
  situation: Situation,
  reads: readonly MomentRead[],
  marked: number,
): ContextRead[] {
  const out: ContextRead[] = [];
  for (const read of reads) {
    const odds = READS[situation.id]
      ?.find((entry) => entry.id === read.id)
      ?.states.find((s) => s.id === read.state)?.odds;
    if (odds && Object.keys(odds).length)
      out.push({
        key: `match.read.${read.id}.${read.state}`,
        source: read.id === 'pace' || read.id === 'aerial' ? 'attribute' : 'defender',
        odds,
      });
  }
  if (marked > 0) {
    // Double-marked: fewer clean looks at goal or past a man, and a teammate left free.
    const odds: Record<string, number> = {};
    const templates: ChoiceTemplate[] = [...situation.choices, ...(UNLOCKS_22[situation.id] ?? [])];
    for (const t of templates) {
      if (t.opponent === 'attacker' || t.direct === 'against') continue;
      if (t.scorer === 'self') odds[t.id] = round6(1 - marked);
      else if (t.event === 'pass') odds[t.id] = round6(1 + marked * M.marked.passShare);
    }
    out.push({ key: 'match.read.marked.double', source: 'defender', odds });
  }
  return out;
}

/** The free kick's spot by its distance read (match-22): the pitch shows how far out it is. */
export function readDepth(situation: Situation, reads: readonly MomentRead[]): number {
  const distance = reads.find((read) => read.id === 'distance')?.state;
  if (situation.id !== 'free-kick' || !distance) return situation.spot.depth;
  return distance === 'close' ? 81 : distance === 'long' ? 71 : situation.spot.depth;
}

/**
 * Move the people a moment's reads are about in its last keyframe (a new frame, so earlier
 * keyframes that share points are untouched): the keeper's position, the angle and distance of
 * a shot, the wall, the press, the traffic in the six-yard box, the marking at a corner.
 */
export function stageReads(
  session: MatchSession,
  passage: Passage,
  situation: Situation,
  reads: readonly MomentRead[],
): void {
  if (!reads.length) return;
  const setup = session.setup,
    m = session.state.match,
    side = selectedSide(setup);
  const index = passage.frames.length - 1;
  const frame: ReplayFrame = passage.frames[index]!;
  const right = attacksRight(session, setup.players[setup.selectedPlayerId]!.clubId!, m.minute);
  const toSpot = (p: Point) => (right ? { d: p.x, w: p.y } : { d: 100 - p.x, w: 100 - p.y });
  const toPitch = (d: number, w: number): Point => {
    const dd = clamp(d, 0.5, 99.5),
      ww = clamp(w, 1, 99);
    return {
      x: Math.round((right ? dd : 100 - dd) * 10) / 10,
      y: Math.round((right ? ww : 100 - ww) * 10) / 10,
    };
  };
  const moved = new Map<string, Point>();
  let ball = frame.ball;
  const at = (id: string) => moved.get(id) ?? frame.players.find((p) => p.id === id)?.point;
  const team = (s: number) => onPitch(s === 0 ? m.home : m.away);
  const isKeeper = (id: string) => setup.players[id]?.primaryPosition === 'GK';
  const inFrame = (id: string) => frame.players.some((p) => p.id === id);
  const keeperOf = (s: number) => team(s).find(isKeeper);
  const outfield = (s: number) => team(s).filter((id) => !isKeeper(id) && inFrame(id));
  /** Outfielders of a side nearest a spot, not yet moved, never the selected player. */
  const nearest = (s: number, d: number, w: number, count: number) =>
    outfield(s)
      .filter((id) => id !== setup.selectedPlayerId && !moved.has(id))
      .map((id) => {
        const p = toSpot(at(id)!);
        return { id, gap: Math.hypot(p.d - d, (p.w - w) * 0.65) };
      })
      .sort((a, b) => a.gap - b.gap || (a.id < b.id ? -1 : 1))
      .slice(0, count)
      .map((entry) => entry.id);
  const you = toSpot(at(setup.selectedPlayerId) ?? frame.ball);
  const ballAt = toSpot(frame.ball);
  const carrier = frame.carrierId ?? undefined;
  // The carrier moves with the ball at their feet.
  let carried: Point | undefined;
  const moveCarrier = (d: number, w: number) => {
    if (carrier && carrier !== setup.selectedPlayerId) carried = toPitch(d, w);
  };
  const state = (id: string) => reads.find((read) => read.id === id)?.state;
  const theirs = 1 - side;
  // The opposition keeper in an attacking moment.
  const keeperRead = situation.phase === 'attack' ? state('keeper') : undefined;
  const theirKeeper = keeperOf(theirs);
  if (keeperRead && theirKeeper && situation.id !== 'penalty') {
    const lean = (ballAt.w - 50) * 0.3;
    const spot =
      keeperRead === 'off-line'
        ? { d: 90, w: 50 + lean }
        : keeperRead === 'near'
          ? { d: 98, w: 50 + lean * 2.2 }
          : keeperRead === 'down'
            ? { d: 97, w: 50 - lean * 2 }
            : { d: 97.5, w: 50 + lean };
    moved.set(theirKeeper, toPitch(spot.d, spot.w));
  }
  switch (situation.id) {
    case 'one-on-one': {
      moved.set(setup.selectedPlayerId, toPitch(state('position') === 'advanced' ? 10 : 3, 50));
      const w = state('angle') === 'tight' ? (ballAt.w < 50 ? 33 : 67) : ballAt.w < 50 ? 47 : 53;
      moveCarrier(ballAt.d, w);
      break;
    }
    case 'shot-incoming':
      moveCarrier(state('range') === 'close' ? 13 : 25, ballAt.w);
      break;
    case 'sweeping': {
      // The race for the ball over the top: the further their runner, the more it is yours.
      const race = state('race');
      moveCarrier(race === 'yours' ? 31 : race === 'theirs' ? 21 : ballAt.d, ballAt.w);
      break;
    }
    case 'free-kick':
      if (state('wall') === 'big') {
        // Two more in the wall, either side of the two already there.
        const wallD = you.d + 8.7;
        const wallW = you.w + (50 - you.w) * 0.15;
        for (const [i, id] of nearest(theirs, wallD, wallW, 4).slice(2).entries())
          moved.set(id, toPitch(wallD, wallW + (i ? 4.8 : -4.8)));
      }
      break;
    case 'cross-ball': {
      const traffic = state('traffic');
      if (traffic === 'crowded')
        for (const [i, id] of nearest(theirs, 6, 50, 3).entries())
          moved.set(id, toPitch(4 + i, 42 + i * 8));
      else if (traffic === 'clear')
        for (const id of outfield(theirs)) {
          const p = toSpot(at(id)!);
          if (p.d < 9) moved.set(id, toPitch(12 + (p.d % 3), p.w));
        }
      break;
    }
    case 'corner-kick': {
      const marking = state('marking');
      if (marking === 'zonal')
        for (const [i, id] of nearest(theirs, 95, 50, 3).entries())
          moved.set(id, toPitch(95, 44 + i * 6));
      else if (marking === 'packed')
        for (const [i, id] of nearest(theirs, 94, 50, 5).entries())
          moved.set(id, toPitch(92 + (i % 3) * 2, 40 + i * 5));
      else if (marking === 'man')
        for (const mate of nearest(side, 92, 50, 3)) {
          const p = toSpot(at(mate)!);
          const [marker] = nearest(theirs, p.d, p.w, 1);
          if (marker) moved.set(marker, toPitch(p.d + 1.2, p.w + 0.8));
        }
      break;
    }
    case 'distribution':
    case 'build-out':
    case 'back-pass': {
      const press = state('press');
      if (press === 'high')
        for (const [i, id] of nearest(theirs, you.d + 8, you.w, 2).entries())
          moved.set(id, toPitch(you.d + 5 + i * 4, you.w + (i ? 6 : -4)));
      else if (press === 'off')
        for (const id of nearest(theirs, you.d, you.w, 3)) {
          const p = toSpot(at(id)!);
          if (p.d < you.d + 20) moved.set(id, toPitch(you.d + 22 + (p.d % 3), p.w));
        }
      break;
    }
    case 'offside-line': {
      const mates = nearest(side, you.d, you.w, 3).filter((id) =>
        ['CB', 'LB', 'RB'].includes(setup.players[id]!.primaryPosition),
      );
      for (const [i, id] of mates.entries()) {
        const p = toSpot(at(id)!);
        moved.set(id, toPitch(state('line') === 'broken' && i === 0 ? you.d - 5 : you.d, p.w));
      }
      break;
    }
    case 'last-man':
    case 'two-on-one': {
      const help = situation.id === 'last-man' ? state('cover') === 'covered' : state('help') === 'coming';
      const [mate] = nearest(side, you.d - 6, you.w, 1);
      if (help && mate) moved.set(mate, toPitch(you.d - 6, you.w + (you.w < 50 ? 8 : -8)));
      break;
    }
  }
  if (carried && carrier) moved.set(carrier, carried);
  if (!moved.size && ball === frame.ball) return;
  // Nobody outruns a sprint from the keyframe before: a move falls short when it must.
  const before = passage.frames[index - 1];
  const reach = (id: string, point: Point): Point => {
    const from = before?.players.find((p) => p.id === id)?.point;
    if (!before || !from) return point;
    const limit = 1.2 + (frame.timeMs - before.timeMs) * RUN;
    const length = span(from, point);
    if (length <= limit) return point;
    const share = limit / length;
    return {
      x: Math.round((from.x + (point.x - from.x) * share) * 10) / 10,
      y: Math.round((from.y + (point.y - from.y) * share) * 10) / 10,
    };
  };
  for (const [id, point] of moved) moved.set(id, reach(id, point));
  if (carried && carrier) ball = moved.get(carrier)!;
  passage.frames[index] = {
    ...frame,
    ball,
    players: frame.players.map((p) => {
      const point = moved.get(p.id);
      return point ? { ...p, point } : p;
    }),
  };
}
