import type {
  DecisionOutcome,
  KeyMoment,
  MatchEvent,
  MomentCast,
  ReplayFrame,
} from '../../../model/domain';
import type { MatchSession, MatchSetup } from '../../../engine/match';
import { situationOf } from '../../../engine/match/situations22';
import { OFF_ANIMATION } from '../../../engine/match/parked';
import { selectedSide } from '../cam';
import type {
  ChainCast,
  ChainKind,
  ChainOutcome,
  ChainState,
  ChainStepResult,
  ChainSummary,
  KeyedLine,
} from '../../../engine/match/types';

/*
 * The decision chains (docs/EXPERIENCE-REDESIGN-1.0.md §1.7) as the match screen reads them:
 * match-22 sessions carry them (`MatchState.decisionChain`, `chains`, `KeyMoment.chainId`,
 * `step`, `steps`, `chainCast`). A match-21 session (restored from an older save) has none; its
 * moments are read as chains of their own here, so the reel plays either.
 */

export type { ChainKind };
/** One resolved step of a chain; a match-21 step has no cause line. */
export type ChainStep = Omit<ChainStepResult, 'cause'> & { cause?: KeyedLine };
/** The chain being played, as the card reads it. */
export interface ChainView extends Pick<
  ChainState,
  'id' | 'kind' | 'minute' | 'addedTime' | 'side' | 'prize' | 'climax' | 'hero'
> {
  steps: number;
  step: number;
  stakes?: KeyedLine;
  results: ChainStep[];
  /** The chain's finish (or the step's situation), for the stakes header. */
  situationId?: string;
}
/** A finished chain, with the key moments it was played from. */
export interface ChainSummaryView extends Pick<
  ChainSummary,
  'id' | 'kind' | 'minute' | 'addedTime' | 'outcome' | 'positive'
> {
  results: ChainStep[];
  momentIds: string[];
}
export type ChainCastView = ChainCast;

const SET_PIECES = new Set([
  'penalty',
  'free-kick',
  'corner-kick',
  'penalty-save',
  'set-piece-marking',
]);
const KEEPER_SITUATIONS = new Set([
  'shot-incoming',
  'one-on-one',
  'cross-ball',
  'distribution',
  'sweeping',
  'back-pass',
]);
/** The kind of chain a moment opens, from its situation. */
export function kindOf(moment: Pick<KeyMoment, 'situationId' | 'follows'>): ChainKind {
  if (moment.follows === 'shootout') return 'shootout';
  if (SET_PIECES.has(moment.situationId)) return 'set-piece';
  if (KEEPER_SITUATIONS.has(moment.situationId)) return 'keeper';
  const phase = situationOf(moment.situationId)?.phase;
  return phase === 'defence' ? 'defence' : 'attack';
}
/** Whether a chain is the player's side defending (the anticipation reads "Danger building"). */
export const defending = (kind: ChainKind) => kind === 'defence' || kind === 'keeper';

/**
 * The key moments of a session grouped into chains, in order: the engine's `chainId` when
 * present, otherwise a `follows: 'chain'` moment joins the chain before it.
 */
export function groupChains(moments: readonly KeyMoment[]): KeyMoment[][] {
  const groups: KeyMoment[][] = [];
  for (const moment of moments) {
    const last = groups.at(-1);
    const previous = last?.at(-1);
    const joins =
      last &&
      previous &&
      (moment.chainId !== undefined
        ? previous.chainId === moment.chainId
        : moment.follows === 'chain');
    if (joins) last.push(moment);
    else groups.push([moment]);
  }
  return groups;
}

/** The decision outcome recorded for a moment, if it was answered. */
export function outcomeOf(
  events: readonly MatchEvent[],
  momentId: string,
): { event: MatchEvent; outcome: DecisionOutcome } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.outcome?.input.momentId === momentId) return { event, outcome: event.outcome };
  }
  return null;
}

/** The engine's chain state (match-22), else null. */
function engineChain(session: MatchSession): ChainView | null {
  const chain = session.state.decisionChain;
  if (!chain) return null;
  // The stakes read from the chain's finish (the shot, the block), not its lead-in.
  return { ...chain, situationId: chain.path.at(-1) ?? session.state.currentMoment?.situationId };
}

/**
 * The chain the current key moment belongs to: the engine's (X1a), or derived from the moment
 * and the steps already answered in its group.
 */
export function currentChain(session: MatchSession): ChainView | null {
  const moment = session.state.currentMoment;
  if (!moment) return null;
  const engine = engineChain(session);
  if (engine) return engine;
  const groups = groupChains(session.state.match.keyMoments);
  const group = groups.find((entry) => entry.some((m) => m.id === moment.id)) ?? [moment];
  const first = group[0]!;
  const index = group.findIndex((m) => m.id === moment.id);
  const results = group
    .slice(0, Math.max(0, index))
    .map((m, step) => stepOf(session.state.match.events, m, step))
    .filter((entry): entry is ChainStep => entry !== null);
  const steps = Math.max(group.length, index + 1);
  return {
    id: first.id,
    kind: kindOf(first),
    minute: first.minute,
    ...(first.addedTime ? { addedTime: first.addedTime } : {}),
    side: selectedSide(session.setup),
    steps,
    step: index,
    ...(first.pressureKey ? { climax: true as const } : {}),
    results,
    situationId: moment.situationId,
  };
}

function stepOf(events: readonly MatchEvent[], moment: KeyMoment, step: number): ChainStep | null {
  const found = outcomeOf(events, moment.id);
  if (!found) return null;
  return {
    step,
    choiceId: found.outcome.input.choiceId,
    probability: found.outcome.probability,
    success: found.outcome.success,
  };
}

/** How a derived chain ended, from the events its answers produced. */
function chainOutcome(
  session: MatchSession,
  group: readonly KeyMoment[],
  results: readonly ChainStep[],
): ChainOutcome {
  const events = session.state.match.events;
  const last = group.at(-1)!;
  const found = outcomeOf(events, last.id);
  if (!found) return 'lost';
  const side = selectedSide(session.setup);
  const ownTeam = side === 0 ? session.setup.home.id : session.setup.away.id;
  const you = session.setup.selectedPlayerId;
  const index = events.indexOf(found.event);
  // What the answer led to: the events after it in the same minute.
  const after = events
    .slice(index)
    .filter((event) => event.minute === found.event.minute && event.kind !== 'pass');
  const goal = after.find((event) => event.kind === 'goal');
  if (goal && goal.teamId === ownTeam)
    return goal.playerId === you ? 'goal' : goal.assistId === you ? 'assist' : 'chance';
  if (goal) return 'conceded';
  if (after.some((event) => event.kind === 'card' && event.playerId === you))
    return found.outcome.success ? 'foul' : 'card';
  const kind = kindOf(group[0]!);
  const success = results.at(-1)?.success ?? found.outcome.success;
  if (!success) return 'lost';
  if (defending(kind)) return 'stop';
  return after.some((event) => event.kind === 'shot' || event.kind === 'save') ? 'chance' : 'won';
}
const POSITIVE: ReadonlySet<ChainOutcome> = new Set(['goal', 'assist', 'chance', 'stop', 'won']);

/** Every finished chain of a session: the engine's `chains` (X1a), or derived. */
export function chainSummaries(session: MatchSession): ChainSummaryView[] {
  const groups = groupChains(session.state.match.keyMoments);
  const engine = session.state.chains;
  if (engine)
    return engine.map((summary) => ({
      ...summary,
      momentIds: (groups.find((group) => group[0]!.chainId === summary.id) ?? []).map((m) => m.id),
    }));
  const current = session.state.currentMoment?.id;
  return groups
    .filter((group) => group.every((m) => m.id !== current))
    .map((group) => {
      const results = group
        .map((m, step) => stepOf(session.state.match.events, m, step))
        .filter((entry): entry is ChainStep => entry !== null);
      const first = group[0]!;
      const outcome = chainOutcome(session, group, results);
      return {
        id: first.id,
        kind: kindOf(first),
        minute: first.minute,
        ...(first.addedTime ? { addedTime: first.addedTime } : {}),
        outcome,
        positive: POSITIVE.has(outcome),
        results,
        momentIds: group.map((m) => m.id),
      };
    })
    .filter((summary) => summary.results.length > 0);
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, (a.y - b.y) * 0.65);

/**
 * Who a step involves: the engine's ChainCast (X1a), or one derived from the moment's cast
 * (match-15): the presser is the direct opponent, covering, free and running players fill the
 * teammates and the defenders (two each at most), and up to four ghosts are the nearest
 * outfield players to the ball not otherwise cast.
 */
export function stepCast(
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>,
  moment: Pick<KeyMoment, 'frame' | 'chainCast'> & { cast?: MomentCast },
): ChainCastView {
  if (moment.chainCast) return moment.chainCast;
  const raw = moment.cast;
  const you = setup.selectedPlayerId;
  const own = new Set(
    (setup.home.playerIds.includes(you) ? setup.home : setup.away).playerIds as string[],
  );
  const cast = raw;
  const taken = new Set<string>([you]);
  const opponent = cast?.presser;
  if (opponent) taken.add(opponent);
  const keeper = cast?.keeper;
  if (keeper) taken.add(keeper);
  const pool = cast
    ? [cast.runner, cast.crosser, ...cast.free, ...cast.cover].filter(
        (id): id is string => typeof id === 'string',
      )
    : [];
  const teammates: string[] = [];
  const defenders: string[] = [];
  for (const id of pool) {
    if (taken.has(id)) continue;
    const list = own.has(id) ? teammates : defenders;
    if (list.length >= 2) continue;
    list.push(id);
    taken.add(id);
  }
  // Without the engine's cast (before match-15), the nearest players to the ball.
  const frame = moment.frame;
  const ball = frame.ball;
  const active = frame.players.filter(
    (player) => player.animation !== OFF_ANIMATION && !taken.has(player.id),
  );
  const byBall = [...active].sort(
    (a, b) => distance(a.point, ball) - distance(b.point, ball) || (a.id < b.id ? -1 : 1),
  );
  let direct = opponent;
  if (!cast) {
    for (const player of byBall) {
      if (setup.players[player.id]?.primaryPosition === 'GK') continue;
      const mine = own.has(player.id);
      if (!mine && !direct) direct = player.id;
      else if (mine && teammates.length < 2) teammates.push(player.id);
      else if (!mine && defenders.length < 2) defenders.push(player.id);
      else continue;
      taken.add(player.id);
    }
  }
  const ghosts = byBall
    .filter((player) => !taken.has(player.id) && setup.players[player.id]?.primaryPosition !== 'GK')
    .slice(0, 4)
    .map((player) => player.id);
  return {
    you,
    ...(direct ? { opponent: direct } : {}),
    teammates,
    defenders,
    ...(keeper ? { keeper } : {}),
    ghosts,
  };
}

/**
 * The cast of a goal that did not involve the player's decision: the scorer and whoever played
 * the ball in the move (two at most), the two nearest defenders to the shot, the keeper beaten,
 * and the player (gold, always). Four ghosts at most, the nearest others.
 */
export function goalCast(
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>,
  frames: readonly ReplayFrame[],
  shot: number,
): ChainCastView {
  const you = setup.selectedPlayerId;
  const strike = frames[shot] ?? frames.at(-1)!;
  const scorer = strike.beat?.actorId;
  const homeIds = new Set(setup.home.playerIds as string[]);
  const scoringHome = scorer ? homeIds.has(scorer) : true;
  const ownHome = homeIds.has(you);
  const taken = new Set<string>([you]);
  const actors: string[] = [];
  for (let i = shot; i >= 0 && actors.length < 3; i--) {
    const actor = frames[i]?.beat?.actorId;
    if (actor && !taken.has(actor) && homeIds.has(actor) === scoringHome) {
      actors.push(actor);
      taken.add(actor);
    }
  }
  const origin = frames[Math.max(0, shot - 1)] ?? strike;
  const others = origin.players.filter(
    (player) => player.animation !== OFF_ANIMATION && !taken.has(player.id),
  );
  const keeperId = others.find(
    (player) =>
      setup.players[player.id]?.primaryPosition === 'GK' && homeIds.has(player.id) !== scoringHome,
  )?.id;
  if (keeperId) taken.add(keeperId);
  const byBall = [...others]
    .filter((player) => !taken.has(player.id))
    .sort(
      (a, b) =>
        distance(a.point, origin.ball) - distance(b.point, origin.ball) || (a.id < b.id ? -1 : 1),
    );
  const defenders = byBall
    .filter((player) => homeIds.has(player.id) !== scoringHome)
    .slice(0, 2)
    .map((player) => player.id);
  for (const id of defenders) taken.add(id);
  // In the scoring side's terms: "teammates" are the player's own side.
  const scoringIsOwn = scoringHome === ownHome;
  const ghosts = byBall
    .filter((player) => !taken.has(player.id))
    .slice(0, 4)
    .map((player) => player.id);
  return {
    you,
    ...(scoringIsOwn
      ? { teammates: actors.slice(0, 2), defenders }
      : { opponent: actors[0], teammates: defenders, defenders: actors.slice(1, 3) }),
    ...(keeperId ? { keeper: keeperId } : {}),
    ghosts,
  } as ChainCastView;
}
