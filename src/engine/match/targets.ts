/**
 * Where a key moment happens and where each choice goes (match-15): the spot across the pitch,
 * the teammates a moment's passes go to, and each choice's target on the pitch.
 */
import type { ChoiceTarget, MomentCast, PitchZone, Point, ReplayFrame } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { FORMATION_SLOTS, type Formation } from '../selection/formations';
import type { MatchSession } from './types';
import { carryLane } from './motion';
import type { ChoiceTemplate, Situation } from './situations';
import { clamp } from './decisions';
import { finisher } from './events';
import { attacksRight, selectedSide } from './shared';
import type { ForcedMoment } from './moments';

/** The third of the pitch at a depth from the selected team's goal. */
export const zoneAt = (depth: number): PitchZone =>
  depth < 100 / 3 ? 'def' : depth < 200 / 3 ? 'mid' : 'final';
/** Open-play situations whose spot follows the player's formation post across the pitch. */
const POST_WIDTH = new Set([
  'box-chance',
  'build-up',
  'edge-of-area',
  'aerial-chance',
  'defend-attack',
  'build-out',
]);
/**
 * Where across the pitch a moment happens (match-15, in the selected team's attack frame): on
 * the side of the player's formation post, drawn a little towards it in open play, with a
 * small jitter drawn last on the situation stream, so the draws before it are unchanged.
 */
export function spotWidth(session: MatchSession, situation: Situation, rng: Rng): number {
  const setup = session.setup;
  const own = selectedSide(setup) === 0 ? session.state.match.home : session.state.match.away;
  const formation = own.formation as Formation | undefined;
  const post = formation
    ? FORMATION_SLOTS[formation]?.[own.starterIds.indexOf(setup.selectedPlayerId)]
    : undefined;
  const lateral = post ? (situation.phase === 'defence' ? post.out[1] : post.in[1]) : 50;
  const base = lateral <= 50 ? situation.spot.width : 100 - situation.spot.width;
  const pull = POST_WIDTH.has(situation.id) ? (lateral - base) * 0.3 : 0;
  return clamp(base + pull + rng.int(-4, 4), 2, 98);
}
/** Pass-type choices: their success makes a chance for a teammate, named in advance. */
const passesTo = (template: ChoiceTemplate) =>
  template.event === 'pass' && template.scorer === 'teammate' && !template.direct;
/**
 * The teammate each pass-type choice of a moment goes to (match-15), picked like a finisher
 * (forwards most often, never the keeper or the player) on `${seed}:receiver:${minute}`, in the
 * catalogue's order, before the choice is made.
 */
export function pickReceivers(
  session: MatchSession,
  situation: Situation,
  forced?: ForcedMoment,
  /** A chain's step (match-22): its own stream. */
  step?: string,
): Map<string, string> {
  const setup = session.setup;
  const rng = createRng(
    `${setup.seed}:receiver:${session.state.match.minute}${forced ? `:${forced.kind}` : ''}${step ? `:${step}` : ''}`,
  );
  const player = setup.players[setup.selectedPlayerId]!;
  const receivers = new Map<string, string>();
  for (const template of situation.choices) {
    if (!passesTo(template)) continue;
    const id = finisher(session, selectedSide(setup), rng, player.id);
    if (!template.requiredTraitId || player.traits.includes(template.requiredTraitId))
      receivers.set(template.id, id);
  }
  return receivers;
}
/** Shots at a named post; the rest (a penalty into the corner too) go where the catalogue aims. */
const POSTS: Record<string, 'near' | 'far'> = {
  'near-post': 'near',
  'far-post': 'far',
  curler: 'far',
};
/** Defending choices that go at a player: the one on the ball, or the runner to track. */
const AT_PLAYER: Record<string, 'presser' | 'runner'> = {
  tackle: 'presser',
  'slide-block': 'presser',
  'body-block': 'presser',
  'stretch-tackle': 'presser',
  rush: 'presser',
  smother: 'presser',
  'track-runner': 'runner',
};
/**
 * Where a choice goes (match-15), from the moment's frame and cast: a shot at the near or far
 * post (near is the post on the shooter's side) or where the catalogue aims it; a pass to the
 * named teammate; a carry's lane; a challenge on the player on the ball or the runner; the
 * space a defender steps into or drops off to; the landing spot a keeper attacks.
 */
export function choiceTarget(
  session: MatchSession,
  situation: Situation,
  choiceId: string,
  frame: ReplayFrame,
  cast: MomentCast,
  receivers: ReadonlyMap<string, string>,
): ChoiceTarget | undefined {
  const template = situation.choices.find((c) => c.id === choiceId);
  if (!template) return undefined;
  const setup = session.setup;
  const right = attacksRight(
    session,
    setup.players[setup.selectedPlayerId]!.clubId!,
    session.state.match.minute,
  );
  const toSpot = (point: Point) =>
    right ? { d: point.x, w: point.y } : { d: 100 - point.x, w: 100 - point.y };
  const toPitch = (spot: { d: number; w: number }): Point => {
    const d = clamp(spot.d, 0, 100),
      w = clamp(spot.w, 0, 100);
    return {
      x: Math.round((right ? d : 100 - d) * 10) / 10,
      y: Math.round((right ? w : 100 - w) * 10) / 10,
    };
  };
  const at = (id: string | undefined) => frame.players.find((p) => p.id === id)?.point;
  const you = toSpot(at(cast.selected) ?? frame.ball);
  if (template.direct === 'for') {
    const post = POSTS[choiceId] ?? 'centre';
    const left = you.w <= 50;
    const w =
      post === 'near'
        ? left
          ? 47
          : 53
        : post === 'far'
          ? left
            ? 53
            : 47
          : (template.target ?? 50);
    return { kind: 'goal', post, point: toPitch({ d: 100, w }) };
  }
  if (passesTo(template)) {
    const id = receivers.get(choiceId);
    const point = at(id);
    return id && point ? { kind: 'teammate', playerId: id, point: { ...point } } : undefined;
  }
  const lane = carryLane(choiceId, you);
  if (lane && template.event === 'dribble') return { kind: 'lane', point: toPitch(lane) };
  const player = AT_PLAYER[choiceId];
  const ball = toSpot(frame.ball);
  if (player) {
    const id = player === 'runner' ? cast.runner : (cast.presser ?? frame.carrierId ?? undefined);
    return id && at(id) ? { kind: 'runner', playerId: id } : undefined;
  }
  const runner = toSpot(at(cast.runner) ?? frame.ball);
  const lanes: Record<string, { d: number; w: number }> = {
    intercept: { d: (ball.d + runner.d) / 2, w: (ball.w + runner.w) / 2 },
    jockey: {
      d: ball.d - 3,
      w: ball.w < 50 ? Math.max(4, ball.w - 12) : Math.min(96, ball.w + 12),
    },
    'step-up': { d: you.d + 6, w: you.w },
    'drop-off': { d: you.d - 6, w: you.w },
    'goal-line-clear': { d: 1, w: ball.w },
    claim: { d: 8, w: 50 },
    punch: { d: 8, w: 50 },
  };
  const spot = lanes[choiceId];
  return spot ? { kind: 'lane', point: toPitch(spot) } : undefined;
}
