import type {
  Club,
  World,
  Player,
  Lineup,
  ReplayFrame,
  Tactics,
  ProbabilityFactor,
  MatchEvent,
  MatchReport,
  DecisionOutcome,
  DecisionChoice,
  ChoiceTarget,
  KeyMoment,
  MomentCast,
  PitchZone,
  Point,
  Position,
} from '../../model/domain';
import { createRng, type Rng } from '../rng';
import {
  expectedGoals,
  managerStrengthBonus,
  playerAbility,
  strengthFromAbility,
  teamStrength,
} from '../strength';
import { available, lineupAbility, selectLineup, slotPosition } from '../selection/lineup';
import { FORMATION_SLOTS, type Formation } from '../selection/formations';
import { clubFormation, usesFormations } from '../selection/world';
import {
  MATCH_ENGINE_VERSION,
  engineFor,
  type MatchSetup,
  type MatchSession,
  type MatchState,
  type MatchCommand,
  type MatchMotion,
  type RatingPart,
  HEAT_COLUMNS,
  HEAT_ROWS,
} from './types';
import {
  METRES_PER_UNIT,
  attacksRightAt,
  carryLane,
  followPlayer,
  minutePassage,
  momentPassage,
  openingKickoff,
  outcomePassage,
  timedNarration,
  type CastPlan,
  type Passage,
} from './motion';
import { narrate } from './narration';
import { MATCH_CONFIG as C } from './tuning';
import { performanceFame, performanceXp } from './rewards';
import { reportCopy } from './headlines';
import { validateSetup, validateTactics, validateCommand, validateJson } from './validation';
import { SITUATION_BY_ID, type ChoiceTemplate, type Situation } from './situations';
import { halftimeRole, roleEffect, shiftMentality } from './roles';
import { cutHighlight } from './highlight';
import { matchObjectives, objectivesFor } from './objectives';
import {
  bookingRisk,
  bookings,
  cardsOfMinute,
  substitutionOff,
  substitutionPlan,
  type Card,
} from './discipline';
import { intensityFor, pitchStateFor } from './conditions';
import { OFF_ANIMATION } from './parked';
import {
  buildChoices,
  clamp,
  momentBudget,
  round6,
  situationWeights,
  type DecisionContext,
} from './decisions';
export * from './types';
export { MATCH_CONFIG } from './tuning';
export { SITUATIONS, SITUATION_BY_ID } from './situations';
export type { Situation, ChoiceTemplate, RatingFamily } from './situations';
export {
  ROLES_BY_FAMILY,
  rolesForPosition,
  isRoleFor,
  halftimeRole,
  positionFamily,
  shiftMentality,
} from './roles';
export { span, attacksRightAt, type Passage } from './motion';
export {
  NARRATION_FAMILIES,
  NARRATION_VARIANTS,
  CUT_FAMILIES,
  type NarrationFamily,
} from './narration';
export {
  buildChoices,
  expectedImpact,
  momentBudget,
  situationWeights,
  conditionsEffect,
  type DecisionContext,
} from './decisions';
export {
  pitchEffect,
  pitchStateFor,
  weatherEffect,
  type Intensity,
  type PitchState,
} from './conditions';
export { bookingRisk, cardsOfMinute, drawCard, type Card } from './discipline';
export { PARKED, OFF_ANIMATION, isParked } from './parked';

/** Thrown before replay when a saved session was produced by a different match engine. */
export class OutdatedMatchSessionError extends Error {
  constructor(found: unknown) {
    super(
      `Match session engine ${typeof found === 'string' ? found : 'unknown'} is not ${MATCH_ENGINE_VERSION}`,
    );
    this.name = 'OutdatedMatchSessionError';
  }
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const SLOTS: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'LW', 'ST', 'RW'];
const COMPATIBLE: Record<Position, Position[]> = {
  GK: ['GK'],
  CB: ['CB', 'LB', 'RB', 'DM'],
  LB: ['LB', 'RB', 'CB'],
  RB: ['RB', 'LB', 'CB'],
  DM: ['DM', 'CM', 'CB'],
  CM: ['CM', 'DM', 'AM'],
  AM: ['CM', 'AM', 'ST'],
  LW: ['LW', 'RW', 'ST'],
  RW: ['RW', 'LW', 'ST'],
  ST: ['ST', 'LW', 'RW'],
};
const ATTACKERS: Position[] = ['ST', 'LW', 'RW', 'AM'];
/** Positions whose beaten defender leads into a shot of their own (match-13). */
const CHAINING: Position[] = ['ST', 'LW', 'RW', 'AM', 'CM'];
const RATING_PARTS: RatingPart[] = [
  'shooting',
  'passing',
  'dribbling',
  'defending',
  'goalkeeping',
  'goals',
  'assists',
  'saves',
  'errors',
  'team',
];
/** The rating parts a match keeps: cards (`discipline`) count from match-16. */
const partsOf = (setup: Pick<MatchSetup, 'occasions' | 'discipline'>): RatingPart[] =>
  full(setup) ? [...RATING_PARTS, 'discipline'] : RATING_PARTS;

function fit(player: Player, position: Position): number {
  return player.primaryPosition === position
    ? 100
    : (player.secondaryPositions.find((p) => p.position === position)?.familiarity ?? 0);
}
/**
 * The eleven for a formation, by the shared selection (src/engine/selection/lineup.ts), with
 * the career player in their best slot. A match needs eleven available players.
 */
function formationLineup(
  club: Club,
  players: Record<string, Player>,
  formation: Formation,
  selected: string,
  /** A matchday bench of seven (match-15); earlier engines name every other available player. */
  capBench = false,
  /** Players suspended for this match (match-16), as long as eleven remain. */
  suspended: readonly string[] = [],
): Lineup {
  const ready = club.playerIds.filter((id) => available(players[id]));
  if (ready.length < 11) throw new Error('A match requires eleven available players per team');
  const banned = suspended.filter((id) => id !== selected && ready.includes(id));
  const exclude = banned.slice(0, Math.max(0, ready.length - 11));
  // With every keeper out, the shared selection puts an outfielder in goal rather than
  // leaving the club unable to play.
  const choice = selectLineup(
    club.playerIds,
    players,
    formation,
    exclude.length ? { selected, exclude } : { selected },
  );
  if (choice.starterIds.length !== 11) throw new Error('Invalid lineup');
  return {
    teamId: club.id,
    formation,
    starterIds: choice.starterIds,
    benchIds: capBench ? matchdayBench(choice.benchIds, players) : choice.benchIds,
  };
}
/**
 * The seven on the bench (match-15): the best reserve keeper, then the best of each line
 * (centre-back, full-back, central midfield, wide or attacking midfield, striker), then the
 * best of the rest by ability, so a like-for-like change is usually there.
 */
function matchdayBench(ids: readonly string[], players: Record<string, Player>): string[] {
  const pool = [...ids].sort(byAbility(players));
  const bench: string[] = [];
  for (const line of BENCH_LINES) {
    const id = pool.find(
      (candidate) =>
        !bench.includes(candidate) && line.includes(players[candidate]!.primaryPosition),
    );
    if (id && bench.length < C.benchSize) bench.push(id);
  }
  for (const id of pool) if (bench.length < C.benchSize && !bench.includes(id)) bench.push(id);
  return bench;
}
const BENCH_LINES: readonly (readonly Position[])[] = [
  ['GK'],
  ['CB'],
  ['LB', 'RB'],
  ['DM', 'CM'],
  ['AM', 'LW', 'RW'],
  ['ST'],
];
function byAbility(players: Record<string, Player>) {
  return (a: string, b: string) =>
    playerAbility(players[b]!) - playerAbility(players[a]!) || (a < b ? -1 : 1);
}
/** 4-3-3 by positional fit, then ability; the selected player always starts. */
function lineup(club: Club, players: Record<string, Player>, selected: string): Lineup {
  const available = club.playerIds.filter((id) => {
    const p = players[id];
    return p && !p.retired && !p.injuryId && p.fitness > 0;
  });
  if (available.length < 11) throw new Error('A match requires eleven available players per team');
  const keepers = available.filter((id) => players[id]!.primaryPosition === 'GK');
  if (!keepers.length) throw new Error('A match requires a goalkeeper');
  const starters = [[...keepers].sort(byAbility(players))[0]!];
  for (const position of SLOTS.slice(1)) {
    const candidates = available.filter(
      (id) => !starters.includes(id) && players[id]!.primaryPosition !== 'GK',
    );
    candidates.sort(
      (a, b) => fit(players[b]!, position) - fit(players[a]!, position) || byAbility(players)(a, b),
    );
    if (candidates[0]) starters.push(candidates[0]);
  }
  if (available.includes(selected) && !starters.includes(selected)) {
    const position = players[selected]!.primaryPosition;
    if (position === 'GK') starters[0] = selected;
    else {
      // Replace the weakest starter in the closest matching slot.
      const slots = COMPATIBLE[position]
        .map((candidate) => SLOTS.flatMap((slot, index) => (slot === candidate ? [index] : [])))
        .find((indices) => indices.length)!;
      const replaced = [...slots].sort(
        (a, b) =>
          playerAbility(players[starters[a]!]!) - playerAbility(players[starters[b]!]!) || b - a,
      )[0]!;
      starters[replaced] = selected;
    }
  }
  if (starters.length !== 11) throw new Error('Invalid lineup');
  return {
    teamId: club.id,
    formation: '4-3-3',
    starterIds: starters,
    benchIds: available.filter((id) => !starters.includes(id)),
  };
}
export function createMatchSetup(
  world: World,
  homeId: string,
  awayId: string,
  selectedPlayerId: string,
  seed: string,
  options: {
    neutral?: boolean;
    fixture?: MatchSetup['fixture'];
    chemistry?: number;
    captain?: boolean;
    /** Players of either club serving a suspension in this competition (match-16). */
    suspended?: readonly string[];
  } = {},
): MatchSetup {
  const home = world.clubs[homeId],
    away = world.clubs[awayId];
  if (!home || !away || homeId === awayId || !seed || seed.length > 256)
    throw new Error('Invalid match setup');
  const selected = world.players[selectedPlayerId];
  if (
    !selected ||
    ![homeId, awayId].includes(selected.clubId ?? '') ||
    selected.retired ||
    selected.injuryId ||
    selected.fitness <= 0
  )
    throw new Error('Selected player unavailable');
  const players = Object.fromEntries(
    [...home.playerIds, ...away.playerIds].map((id) => [id, world.players[id]!]),
  );
  return copy({
    version: 1,
    seed,
    season: world.date.season,
    home,
    away,
    players,
    selectedPlayerId,
    neutral: options.neutral ?? false,
    ...(options.fixture ? { fixture: options.fixture } : {}),
    ...(options.chemistry !== undefined ? { chemistry: options.chemistry } : {}),
    ...(options.captain ? { captain: true as const } : {}),
    // Worlds on formation-aware selection field each manager's shape, and key moments follow
    // the slot the selected player fills in it.
    ...(usesFormations(world)
      ? {
          formations: [clubFormation(world, home), clubFormation(world, away)],
          slotMoments: true as const,
          dramaMoments: true as const,
          occasions: true as const,
          discipline: true as const,
          roleSlot: true as const,
          ...(options.suspended?.some((id) => id !== selectedPlayerId)
            ? { suspended: options.suspended.filter((id) => id !== selectedPlayerId) }
            : {}),
        }
      : {}),
    strengthBonus: [
      round6(managerStrengthBonus(world.managers[home.managerId]?.ability ?? 60)),
      round6(managerStrengthBonus(world.managers[away.managerId]?.ability ?? 60)),
    ],
  });
}
const selectedSide = (setup: MatchSetup) =>
  setup.players[setup.selectedPlayerId]!.clubId === setup.home.id ? 0 : 1;
/**
 * The selected player's effective position (`match-17`): the formation slot they start in, as
 * the shared selection places them (`selectedSlotIndex`), so role choices, objectives,
 * involvement and back-line credit follow the job they are given. A keeper never swaps with an
 * outfield slot. Earlier engines, and setups without formations, use the primary position.
 */
export function rolePosition(
  setup: Pick<
    MatchSetup,
    'roleSlot' | 'discipline' | 'occasions' | 'formations' | 'players' | 'selectedPlayerId' | 'home'
  >,
): Position {
  const player = setup.players[setup.selectedPlayerId]!;
  // Only on the current engine chain: an earlier engine replays by its own rules.
  if (!setup.roleSlot || !setup.occasions || !setup.discipline || !setup.formations)
    return player.primaryPosition;
  const side = player.clubId === setup.home.id ? 0 : 1;
  return slotPosition(player, setup.formations[side]);
}
export { slotPosition };
/**
 * The current engine path (`match-15`, redesign phase 6): key moments name their cast and
 * each choice's target, a pass reaches the teammate named before the choice, and the rules of
 * the later steps apply. Earlier paths (setups without `occasions`) keep their rules.
 */
const latest = (setup: Pick<MatchSetup, 'occasions'>) => Boolean(setup.occasions);
/** Full discipline (`match-16`): second yellows, reds, ten men and booking risks. */
const full = (setup: Pick<MatchSetup, 'occasions' | 'discipline'>) =>
  Boolean(setup.occasions && setup.discipline);
/** The current engine (`match-17`): one effective role, and skills that stack everywhere. */
const current = (setup: Pick<MatchSetup, 'occasions' | 'discipline' | 'roleSlot'>) =>
  Boolean(setup.occasions && setup.discipline && setup.roleSlot);
const F = C.cards;
/** The players of a line-up on the pitch: its starters, less anyone sent off (match-16). */
const onPitch = (team: Lineup): string[] =>
  team.sentOffIds?.length
    ? team.starterIds.filter((id) => !team.sentOffIds!.includes(id))
    : team.starterIds;
/** The selected player no longer plays: substituted, or sent off (match-16). */
const offPitch = (state: MatchState) => state.substituted || state.sentOff !== undefined;
/** How many men each side is down (match-16). */
const menDown = (match: MatchState['match']): [number, number] => [
  match.home.sentOffIds?.length ?? 0,
  match.away.sentOffIds?.length ?? 0,
];

/**
 * Where the selected player plays: the formation slot they fill in a slot-aware match, with
 * their familiarity there, else their primary position (familiarity 100).
 */
function playedSlot(session: MatchSession): { position: Position; familiarity: number } {
  const setup = session.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const primary = { position: player.primaryPosition, familiarity: 100 };
  if (!setup.slotMoments) return primary;
  const own = selectedSide(setup) === 0 ? session.state.match.home : session.state.match.away;
  const formation = own.formation as Formation | undefined;
  const index = own.starterIds.indexOf(player.id);
  const slot = formation ? FORMATION_SLOTS[formation]?.[index]?.position : undefined;
  if (
    !slot ||
    slot === player.primaryPosition ||
    (slot === 'GK') !== (player.primaryPosition === 'GK')
  )
    return primary;
  const familiarity = player.secondaryPositions.find((p) => p.position === slot)?.familiarity ?? 0;
  return { position: slot, familiarity };
}

/** Strength-model expectations adjusted by personal tactics, rounded for stable replay. */
/**
 * Expected goals after personal tactics. Risk scales the whole game; mentality and attacking
 * roles scale the selected team's and the opposition's goals separately, so attacking brings
 * more goals at both ends rather than moving goals from one side to the other.
 */
function rates(setup: MatchSetup, strength: [number, number], tactics: Tactics): [number, number] {
  const [home, away] = expectedGoals(strength[0], strength[1], setup.neutral);
  const risk = C.tactics.riskTotal[tactics.risk];
  const mentality: readonly [number, number] =
    tactics.mentality === 'attacking'
      ? C.tactics.mentality.attacking
      : tactics.mentality === 'defensive'
        ? C.tactics.mentality.defensive
        : [1, 1];
  const role = roleEffect(tactics.role).totals ?? [1, 1];
  const own = selectedSide(setup);
  const factors: [number, number] = [1, 1];
  factors[own] = mentality[0] * role[0];
  factors[1 - own] = mentality[1] * role[1];
  return [round6(home * risk * factors[0]!), round6(away * risk * factors[1]!)];
}
/**
 * Expected goals for the game as it stands: personal tactics, and on match-16 the men each
 * side is down. A side a man short scores × (1 − attack) per man (at least the floor), and
 * concedes × (1 + concede) per man the other side is up.
 */
function currentRates(session: MatchSession, tactics: Tactics): [number, number] {
  const s = session.state;
  const base = rates(session.setup, s.strength, tactics);
  if (!full(session.setup)) return base;
  const [home, away] = menDown(s.match);
  if (!home && !away) return base;
  const M = F.menDown;
  const scale = (own: number, other: number) =>
    Math.max(M.attackFloor, 1 - own * M.attack) * (1 + other * M.concede);
  return [round6(base[0] * scale(home, away)), round6(base[1] * scale(away, home))];
}
function shares(position: Position, role: string, drama = false): MatchState['shares'] {
  const [attack, defence] = C.shares[position];
  const weights = situationWeights(position, role);
  // A set-piece taker (engine match-12) carries more of the team's attack: set pieces add to
  // the open-play moments rather than taking from them, and the background plays less.
  const mass = (pool: typeof weights) =>
    pool.reduce((sum, w) => sum + w.weight * w.situation.attackWeight, 0);
  const open = mass(weights);
  const setPieces = drama && open ? mass(situationWeights(position, role, { drama })) / open : 1;
  return {
    attack: weights.some((w) => w.situation.attackWeight > 0)
      ? round6(attack * Math.min(C.drama.setPieceShareCap, setPieces))
      : 0,
    defence: weights.some((w) => w.situation.defenceWeight > 0) ? defence : 0,
  };
}
function possessionBase(setup: MatchSetup, state: Pick<MatchState, 'strength'>, tactics: Tactics) {
  const mentality =
    (tactics.mentality === 'attacking' ? 1 : tactics.mentality === 'defensive' ? -1 : 0) *
    C.possession.mentality *
    (selectedSide(setup) === 0 ? 1 : -1);
  return 50 + (state.strength[0] - state.strength[1]) * C.possession.strengthSlope + mentality;
}
function updatePossession(session: MatchSession): void {
  const s = session.state;
  // A side down to ten men (match-16) sees less of the ball.
  const [home, away] = menDown(s.match);
  const short = home || away ? (away - home) * F.menDown.possession : 0;
  s.stats.homePossession = Math.round(
    clamp(
      possessionBase(session.setup, s, s.match.tactics) +
        short +
        (s.match.momentum - 50) * C.possession.momentum,
      C.possession.minimum,
      C.possession.maximum,
    ),
  );
}
export function createMatchSession(setup: MatchSetup, tactics: Tactics): MatchSession {
  validateSetup(setup);
  const selected = setup.players[setup.selectedPlayerId]!;
  // The job they are given (match-17), or their primary position on earlier engines.
  const position = rolePosition(setup);
  validateTactics(tactics, position);
  const formations = setup.formations;
  const bench = latest(setup);
  const suspended = full(setup) ? (setup.suspended ?? []) : [];
  const home = formations
      ? formationLineup(
          setup.home,
          setup.players,
          formations[0],
          setup.selectedPlayerId,
          bench,
          suspended,
        )
      : lineup(setup.home, setup.players, setup.selectedPlayerId),
    away = formations
      ? formationLineup(
          setup.away,
          setup.players,
          formations[1],
          setup.selectedPlayerId,
          bench,
          suspended,
        )
      : lineup(setup.away, setup.players, setup.selectedPlayerId);
  const starters = (team: Lineup) => team.starterIds.map((id) => setup.players[id]!);
  // With formations each starter is valued in their slot, as background results are.
  const strengthOf = (club: MatchSetup['home'], team: Lineup) =>
    formations
      ? strengthFromAbility(
          club.reputation,
          lineupAbility(
            {
              formation: team.formation as Formation,
              starterIds: team.starterIds,
              slots: FORMATION_SLOTS[team.formation as Formation].map((slot) => slot.position),
              benchIds: team.benchIds,
            },
            setup.players,
          ),
        )
      : teamStrength(club.reputation, starters(team));
  const bonus = setup.strengthBonus ?? [0, 0];
  const strength: [number, number] = [
    round6(strengthOf(setup.home, home) + bonus[0]),
    round6(strengthOf(setup.away, away) + bonus[1]),
  ];
  const matchLevel = round6(
    [...starters(home), ...starters(away)].reduce((sum, p) => sum + playerAbility(p), 0) / 22,
  );
  const rng = createRng(`${setup.seed}:preview`);
  const involvement =
    position === 'GK'
      ? C.involvement.keeper
      : ATTACKERS.includes(position)
        ? C.involvement.attack
        : C.involvement.other;
  const count = clamp(
    C.momentBase + involvement + Math.round((selected.form - 50) / C.formStep) + rng.int(-1, 1),
    C.minimumMoments,
    C.maximumMoments,
  );
  const minutes: number[] = [];
  if (setup.dramaMoments) {
    // The last moment waits on the game: it is placed when the match reaches the deciding
    // minute (see `placeLateMoment`), provisionally just after it.
    for (let i = 0; i < count - 1; i++)
      minutes.push(
        Math.max(
          (minutes[i - 1] ?? 0) + 1,
          Math.round(6 + (i * 70) / Math.max(1, count - 2)) + rng.int(-2, 2),
        ),
      );
    minutes.push(C.drama.routineLateMinute);
  } else
    for (let i = 0; i < count; i++)
      minutes.push(
        Math.max(
          (minutes[i - 1] ?? 0) + 1,
          Math.round(6 + (i * 78) / (count - 1)) + rng.int(-2, 2),
        ),
      );
  // Objectives have their own stream on the current engine (match-15, decision 3), so the hub
  // can show them before matchday; earlier engines draw them here from the preview stream.
  const objectives = latest(setup)
    ? objectivesFor(setup.seed, selected, position)
    : matchObjectives(selected, rng);
  const consistencyShift = Math.round(
    (rng.next() * 2 - 1) * (1 - selected.hidden.consistency / 100) * C.decision.consistencySpread,
  );
  const match: MatchState['match'] = {
    id: `match:${setup.seed}`,
    fixtureId: setup.fixture?.id ?? `friendly:${setup.seed}`,
    seed: setup.seed,
    rng: rng.snapshot(),
    home,
    away,
    weather: rng.pick(['clear', 'clear', 'rain', 'wind', 'snow'] as const),
    pitchCondition: setup.home.stadium.pitchQuality,
    instructionsKey: 'match.instructions',
    tactics: copy(tactics),
    objectives,
    minute: 0,
    score: [0, 0],
    momentum: 50,
    status: 'preview',
    events: [],
    keyMoments: [],
    reports: [],
  };
  if (latest(setup)) {
    // How hard it rains, blows or snows (match-15), drawn after the weather so every earlier
    // draw is unchanged, and the pitch's state, derived without a draw.
    match.weatherIntensity = intensityFor(rng.next());
    match.pitchState = pitchStateFor(match.weather, match.pitchCondition, match.weatherIntensity);
  }
  const captainId = [...(selectedSide(setup) === 0 ? home : away).starterIds].sort(
    (a, b) =>
      setup.players[b]!.attributes.leadership - setup.players[a]!.attributes.leadership ||
      (a < b ? -1 : 1),
  )[0];
  const session: MatchSession = {
    version: 1,
    engine: engineFor(setup),
    setup: copy(setup),
    initialTactics: copy(tactics),
    commands: [],
    state: {
      match,
      currentMoment: null,
      frames: [],
      play: { side: 0, carrierId: null, restart: null },
      motion: { kind: 'kickoff', frames: [] },
      highlights: [],
      selectedPlayerMinutes: 0,
      substituted: false,
      substitutionDecisionPending: false,
      captain: setup.captain === true || captainId === selected.id,
      captainDecisionPending: false,
      strength,
      matchLevel,
      expectedGoals: rates(setup, strength, tactics),
      shares: shares(position, tactics.role, setup.dramaMoments),
      stats: {
        homeShots: 0,
        awayShots: 0,
        homePossession: 50,
        passesAttempted: 0,
        passesCompleted: 0,
        tackles: 0,
        saves: 0,
        goals: 0,
        assists: 0,
        shots: 0,
        errors: 0,
        rating: C.rating.base,
        fatigue: selected.fatigue,
        xg: [0, 0],
        shotsOnTarget: [0, 0],
        keyPasses: 0,
        tacklesAttempted: 0,
        distanceM: 0,
        touches: 0,
      },
      ratingByMinute: [],
      narration: [],
      heat: new Array<number>(HEAT_COLUMNS * HEAT_ROWS).fill(0),
      ratingParts: Object.fromEntries(
        partsOf(setup).map((part) => [part, 0]),
      ) as MatchState['ratingParts'],
      report: null,
      momentMinutes: minutes,
      talkOdds: 1,
      consistencyShift,
      managerTrustDelta: 0,
      managerReactionKey: 'match.reaction.manager.steady',
      fanReactionKey: 'match.reaction.fans.steady',
      headlineKey: 'match.headline.steady',
    },
  };
  updatePossession(session);
  const opening = openingKickoff(session);
  delete opening.frame.beat;
  session.state.frames = [opening.frame];
  session.state.play = opening.play;
  session.state.motion = { kind: 'kickoff', frames: [opening.frame] };
  return session;
}
/**
 * Store a passage of play: its keyframes become the current motion and its last frame the
 * snapshot of this minute. The selected player's goals keep their build-up for Moments.
 */
function applyPassage(
  session: MatchSession,
  kind: MatchMotion['kind'],
  passage: Passage,
  lead: ReplayFrame[] = [],
  /** The passage continues the minute already snapshotted (an outcome, or a follow-up moment). */
  replace = kind === 'outcome',
): void {
  const s = session.state;
  const last = passage.frames[passage.frames.length - 1]!;
  // Snapshots keep positions only: beats live in the passage's keyframes (and the last one in
  // the play state), so the per-minute history stays small.
  const snapshot: ReplayFrame = { ...last, timeMs: s.match.minute * 60000 };
  delete snapshot.beat;
  if (replace) s.frames[s.frames.length - 1] = snapshot;
  else s.frames.push(snapshot);
  s.play = passage.play;
  // Narration from the passage's beats (match-14), on its own stream.
  const narrationStart = s.narration.length;
  const lines = timedNarration(() => narrate(session, passage.frames, kind, narrationStart));
  if (lines.length) s.narration = [...s.narration, ...lines];
  s.motion = {
    kind,
    frames: passage.frames,
    ...(passage.focus ? { focus: passage.focus } : {}),
    narrationStart,
  };
  // Bookkeeping from what is shown (match-14): shots on target, and the selected player's
  // distance, touches and heat, oriented with their team attacking towards x = 100.
  const stats = s.stats;
  stats.shotsOnTarget = [
    stats.shotsOnTarget[0] + passage.onTarget[0],
    stats.shotsOnTarget[1] + passage.onTarget[1],
  ];
  s.heat = [...s.heat];
  const followed = followPlayer(
    passage.frames,
    session.setup.selectedPlayerId,
    !attacksRightAt(selectedSide(session.setup), s.match.minute),
    s.heat,
  );
  stats.distanceM = Math.round((stats.distanceM + followed.distance * METRES_PER_UNIT) * 10) / 10;
  stats.touches += followed.touches;
  for (const goal of passage.goals)
    if (goal.playerId === session.setup.selectedPlayerId)
      s.highlights = [
        ...s.highlights,
        {
          eventId: goal.eventId,
          frames: cutHighlight(
            [...lead, ...passage.frames.slice(0, goal.frame + 1)],
            goal.playerId,
            new Set(session.setup.home.playerIds),
          ),
        },
      ];
}
/** True when the team attacks towards x = 100 at this minute. */
const attacksRight = (session: MatchSession, teamId: string, minute: number) =>
  (teamId === session.setup.home.id) !== minute > 45;
function line(session: MatchSession, base: string): string {
  const salt = `${session.state.match.id}:${session.state.match.events.length}`;
  return `${base}.${createRng(`${session.setup.seed}:commentary:${salt}`).int(0, C.commentaryVariants - 1)}`;
}
function event(
  session: MatchSession,
  kind: MatchEvent['kind'],
  teamId: string,
  playerId: string | null,
  commentaryKey: string,
  outcome: DecisionOutcome | null = null,
  target?: number,
): MatchEvent {
  const m = session.state.match;
  const currentFrame = session.state.frames[session.state.frames.length - 1]!;
  const point = {
    ...(currentFrame.players.find((player) => player.id === playerId)?.point ?? currentFrame.ball),
  };
  const direction = attacksRight(session, teamId, m.minute) ? 1 : -1;
  let endPoint: { x: number; y: number } | undefined;
  if (kind === 'pass') {
    const team = teamId === session.setup.home.id ? m.home : m.away;
    const receivers = currentFrame.players.filter(
      (player) =>
        player.id !== playerId &&
        team.starterIds.includes(player.id) &&
        session.setup.players[player.id]!.primaryPosition !== 'GK',
    );
    // Squared distances avoid engine-dependent square roots in replayed ordering.
    const distance = (player: (typeof receivers)[number]) => {
      const dx = player.point.x - point.x,
        dy = player.point.y - point.y;
      return dx * dx + dy * dy + (dx * direction < 0 ? 400 : 0);
    };
    receivers.sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : 1));
    endPoint = {
      ...(receivers[0]?.point ?? { x: clamp(point.x + direction * 12, 0, 100), y: point.y }),
    };
  } else if (kind === 'shot' || kind === 'goal')
    endPoint = { x: direction > 0 ? 100 : 0, y: target ?? 50 };
  else if (kind === 'dribble') endPoint = { x: clamp(point.x + direction * 9, 0, 100), y: point.y };
  const name = playerId ? session.setup.players[playerId]?.name : undefined;
  const created: MatchEvent = {
    id: `${m.id}:event:${m.events.length}`,
    minute: m.minute,
    kind,
    teamId,
    playerId,
    point,
    ...(endPoint ? { endPoint } : {}),
    commentaryKey,
    ...(name ? { commentaryParams: { player: name } } : {}),
    outcome,
  };
  m.events.push(created);
  return created;
}
const sideTeam = (session: MatchSession, side: number) =>
  side === 0 ? session.setup.home.id : session.setup.away.id;
/** A shot's chance of a goal, kept on the event and in the side's expected goals (match-14). */
function addXg(session: MatchSession, side: number, shot: MatchEvent, xg: number): void {
  const stats = session.state.stats;
  shot.xg = round6(xg);
  stats.xg =
    side === 0
      ? [round6(stats.xg[0] + shot.xg), stats.xg[1]]
      : [stats.xg[0], round6(stats.xg[1] + shot.xg)];
}
function recordShot(
  session: MatchSession,
  side: number,
  id: string,
  key: string,
  xg: number,
  target?: number,
) {
  if (side === 0) session.state.stats.homeShots++;
  else session.state.stats.awayShots++;
  if (id === session.setup.selectedPlayerId) session.state.stats.shots++;
  const shot = event(
    session,
    'shot',
    sideTeam(session, side),
    id,
    line(session, key),
    null,
    target,
  );
  addXg(session, side, shot, xg);
  return shot;
}
function goal(session: MatchSession, side: number, playerId: string, target?: number): void {
  const m = session.state.match;
  m.score[side]!++;
  // In the closing minutes a goal that levels the game or puts a side ahead is called as such.
  const margin = m.score[side]! - m.score[1 - side]!;
  const key =
    session.setup.dramaMoments &&
    m.minute >= C.drama.lateMinutes[0] - 1 &&
    margin >= 0 &&
    margin <= 1
      ? margin === 0
        ? 'match.commentary.late-equaliser'
        : 'match.commentary.late-winner'
      : 'match.commentary.goal';
  event(session, 'goal', sideTeam(session, side), playerId, line(session, key), null, target);
  if (playerId === session.setup.selectedPlayerId) {
    session.state.stats.goals++;
    addRating(session, 'goals', C.rating.goal);
  }
}
function addRating(session: MatchSession, part: RatingPart, delta: number): void {
  const s = session.state;
  s.ratingParts = { ...s.ratingParts, [part]: round6((s.ratingParts[part] ?? 0) + delta) };
  const total = partsOf(session.setup).reduce<number>(
    (sum, key) => sum + (s.ratingParts[key] ?? 0),
    C.rating.base,
  );
  s.stats.rating = round6(clamp(total, C.rating.minimum, C.rating.maximum));
}
/** Picks a likely finisher: forwards most often, never the goalkeeper. */
function finisher(session: MatchSession, side: number, rng: Rng, exclude?: string): string {
  const team = side === 0 ? session.state.match.home : session.state.match.away;
  const pool = onPitch(team).filter(
    (id) => id !== exclude && session.setup.players[id]!.primaryPosition !== 'GK',
  );
  const weighted = pool.flatMap((id) => {
    const position = session.setup.players[id]!.primaryPosition;
    const weight =
      position === 'ST' ? 4 : ATTACKERS.includes(position) ? 3 : position === 'CM' ? 2 : 1;
    return Array.from({ length: weight }, () => id);
  });
  return rng.pick(weighted);
}
/** A created chance becomes a recorded shot, and a goal with the given total probability. */
function chance(
  session: MatchSession,
  side: number,
  scorer: string,
  probability: number,
  rng: Rng,
  key: string,
): boolean {
  if (probability <= 0) return false;
  const shot = Math.min(1, probability / C.chanceConversion);
  if (rng.next() >= shot) return false;
  // The shot's own chance: the goal probability given that the chance became a shot.
  recordShot(session, side, scorer, key, probability / shot);
  if (rng.next() >= probability / shot) return false;
  goal(session, side, scorer);
  return true;
}
function simulateMinuteGoals(session: MatchSession): void {
  const s = session.state,
    rng = createRng(`${session.setup.seed}:minute:${s.match.minute}`);
  const selected = session.setup.players[session.setup.selectedPlayerId]!,
    own = selectedSide(session.setup);
  const off = offPitch(s);
  for (let side = 0; side < 2; side++) {
    // Personal key moments replace part of each side's expected goals while the player is on.
    const replaced = off ? 0 : side === own ? s.shares.attack : s.shares.defence;
    const rate = clamp((s.expectedGoals[side]! * (1 - replaced)) / 90, 0, 0.2);
    if (rng.next() < rate / C.shotConversion) {
      const id = finisher(session, side, rng, side === own && !off ? selected.id : undefined);
      recordShot(session, side, id, 'match.commentary.attempt', C.shotConversion);
      if (rng.next() < C.shotConversion) goal(session, side, id);
    }
  }
  // Ordinary passes are real logged actions and contribute to the pass map.
  if (!off && selected.primaryPosition !== 'GK' && rng.next() < C.passPerMinute) {
    const P = C.routinePass;
    const probability = round6(
      clamp(
        P.base + selected.attributes.passing * P.passing - s.stats.fatigue * P.fatigue,
        P.minimum,
        P.maximum,
      ),
    );
    const roll = rng.next(),
      success = roll < probability;
    s.stats.passesAttempted++;
    if (success) s.stats.passesCompleted++;
    event(
      session,
      'pass',
      selected.clubId!,
      selected.id,
      line(session, `match.commentary.routine.${success ? 'success' : 'failure'}`),
      {
        input: { momentId: `routine:${s.match.minute}`, choiceId: 'pass' },
        success,
        roll,
        probability,
        factors: [
          { labelKey: 'match.factor.base', source: 'attribute', contribution: probability },
        ],
      },
    );
  }
  s.match.rng = rng.snapshot();
  // Cosmetic yellows on match-15; match-16 shows its cards at the start of the minute.
  if (latest(session.setup) && !full(session.setup)) discipline(session);
}
/**
 * Cosmetic yellow cards (match-15, decision 5): drawn on `${seed}:discipline:${minute}`,
 * weighted by aggression and tackling, logged as `card` events with commentary. They never
 * move an outcome roll, change nobody's strength and send nobody off.
 */
function discipline(session: MatchSession): void {
  const m = session.state.match,
    setup = session.setup;
  const booked = new Set(m.events.filter((e) => e.kind === 'card').map((e) => e.playerId ?? ''));
  for (const card of bookings(setup.seed, m.minute, [m.home, m.away], setup.players, booked)) {
    const booking = event(
      session,
      'card',
      sideTeam(session, card.side),
      card.playerId,
      line(session, 'match.commentary.card'),
    );
    booking.card = 'yellow';
  }
}
/** Players on a yellow and still on the pitch (match-16). */
function bookedPlayers(match: MatchState['match']): Set<string> {
  const off = new Set([...(match.home.sentOffIds ?? []), ...(match.away.sentOffIds ?? [])]);
  return new Set(
    match.events.flatMap((e) =>
      e.kind === 'card' && e.card === 'yellow' && e.playerId && !off.has(e.playerId)
        ? [e.playerId]
        : [],
    ),
  );
}
/**
 * Full discipline (match-16): the minute's cards, drawn at its start on
 * `${seed}:cards:${minute}` (see `cardsOfMinute`), before anything else happens in it.
 */
function showCards(session: MatchSession): void {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  // While on, the selected player's defending moments carry part of their risk.
  const scaled = offPitch(s)
    ? undefined
    : {
        id: setup.selectedPlayerId,
        factor: Math.max(0, 1 - s.shares.defence * F.selectedDefence),
      };
  for (const card of cardsOfMinute(
    setup.seed,
    m.minute,
    [m.home, m.away],
    setup.players,
    bookedPlayers(m),
    scaled,
  ))
    showCard(session, card.side, card.playerId, card.card);
}
const CARD_COMMENTARY: Record<Card['card'], string> = {
  yellow: 'match.commentary.card',
  'second-yellow': 'match.commentary.second-yellow',
  red: 'match.commentary.red',
};
/**
 * A card shown (match-16): a `card` event with commentary; a second yellow or a red sends the
 * player off. The selected player's cards cost rating (`cards.rating`).
 */
function showCard(
  session: MatchSession,
  side: 0 | 1,
  playerId: string,
  kind: Card['card'],
): MatchEvent {
  const shown = event(
    session,
    'card',
    sideTeam(session, side),
    playerId,
    line(session, CARD_COMMENTARY[kind]),
  );
  shown.card = kind;
  if (playerId === session.setup.selectedPlayerId)
    addRating(session, 'discipline', kind === 'yellow' ? F.rating.yellow : F.rating.red);
  if (kind !== 'yellow') dismiss(session, side, playerId, kind);
  return shown;
}
/**
 * A player leaves the pitch (match-16): his side plays on a man short, with expected goals,
 * possession and team odds recalculated. The selected player's match ends here.
 */
function dismiss(
  session: MatchSession,
  side: 0 | 1,
  playerId: string,
  kind: 'second-yellow' | 'red',
): void {
  const s = session.state,
    m = s.match;
  const key = side === 0 ? 'home' : 'away';
  m[key] = { ...m[key], sentOffIds: [...(m[key].sentOffIds ?? []), playerId] };
  if (playerId === session.setup.selectedPlayerId) {
    const reason = kind === 'red' ? 'straight-red' : 'second-yellow';
    s.sentOff = { minute: m.minute, reason };
    s.managerTrustDelta += F.trust[reason];
    s.captainDecisionPending = false;
  }
  s.expectedGoals = currentRates(session, m.tactics);
  updatePossession(session);
}
/**
 * The managers' substitutions (match-15): each side's plan from `${seed}:ai-subs` (60–80′, at
 * most the limit, one fewer on the career player's side so their own change always fits); who
 * comes off is drawn at the minute among outfielders who started (never the career player),
 * the tired, unfit and out of form most likely, and the best bench replacement comes on.
 */
function managerSubstitutions(session: MatchSession): void {
  const m = session.state.match,
    setup = session.setup,
    S = C.aiSubstitutions;
  if (m.minute < S.from || m.minute > S.to) return;
  const own = selectedSide(setup);
  const plan = substitutionPlan(
    setup.seed,
    own === 0 ? [S.limit - 1, S.limit] : [S.limit, S.limit - 1],
  );
  for (const side of [0, 1] as const) {
    const due = plan[side]!.filter((minute) => minute === m.minute).length;
    for (let change = 0; change < due; change++) {
      const key = side === 0 ? 'home' : 'away';
      const team = m[key];
      const made = m.events.filter((e) => e.kind === 'substitution' && e.teamId === team.teamId);
      if (made.length >= S.limit) break;
      const cameOn = new Set(made.map((e) => e.receiverId));
      // A player sent off (match-16) cannot be replaced.
      const sentOff = team.sentOffIds ?? [];
      const candidates = team.starterIds.filter(
        (id, slot) =>
          slot > 0 &&
          id !== setup.selectedPlayerId &&
          !cameOn.has(id) &&
          !sentOff.includes(id) &&
          setup.players[id]!.primaryPosition !== 'GK',
      );
      const rng = createRng(`${setup.seed}:ai-subs:${m.minute}:${side}:${change}`);
      const off = substitutionOff(rng, candidates, setup.players);
      const on = off ? replacement(session, team.benchIds, setup.players[off]!) : undefined;
      if (!off || !on) continue;
      m[key] = {
        ...team,
        starterIds: team.starterIds.map((id) => (id === off ? on : id)),
        benchIds: team.benchIds.filter((id) => id !== on),
      };
      const sub = event(
        session,
        'substitution',
        team.teamId,
        off,
        line(session, 'match.commentary.change'),
      );
      sub.receiverId = on;
      sub.commentaryParams = { ...sub.commentaryParams, receiver: setup.players[on]!.name };
    }
  }
}
/** Momentum decays towards even and reacts to this minute's shots, goals and decisions. */
function updateMomentum(session: MatchSession): void {
  const m = session.state.match,
    M = C.momentum;
  let impulse = 0;
  for (const e of m.events) {
    if (e.minute !== m.minute) continue;
    const sign = e.teamId === session.setup.home.id ? 1 : -1;
    if (e.kind === 'shot') impulse += sign * M.shot;
    else if (e.kind === 'goal') impulse += sign * M.goal;
    else if (e.outcome && !e.outcome.input.momentId.startsWith('routine:'))
      impulse += sign * (e.outcome.success ? M.success : -M.failure);
  }
  m.momentum = clamp(50 + Math.round((m.momentum - 50) * M.decay) + impulse, M.minimum, M.maximum);
  updatePossession(session);
}
function afterMinute(session: MatchSession) {
  const s = session.state;
  s.ratingByMinute = [...s.ratingByMinute, Math.round(s.stats.rating * 100) / 100];
  updateMomentum(session);
  if (s.match.minute === 45) {
    s.match.status = 'halftime';
    event(
      session,
      'halftime',
      session.setup.players[session.setup.selectedPlayerId]!.clubId!,
      null,
      'match.commentary.halftime',
    );
  } else if (s.match.minute === 90) {
    if (shootoutDue(session)) {
      const keeper =
        session.setup.players[session.setup.selectedPlayerId]!.primaryPosition === 'GK';
      openMoment(session, {
        kind: 'shootout',
        situation: SITUATION_BY_ID[keeper ? 'penalty-save' : 'penalty']!,
      });
      return;
    }
    finish(session);
  }
}
function finish(session: MatchSession): void {
  const s = session.state;
  s.match.status = 'finished';
  s.report = report(session);
  s.match.reports = [s.report];
}
/**
 * A level knockout at full time (match-13): the player takes a shootout kick, or faces them in
 * goal, should extra time not separate the sides. Not after being substituted.
 */
function shootoutDue(session: MatchSession): boolean {
  const s = session.state,
    lead = session.setup.fixture?.shootoutLead;
  return (
    Boolean(session.setup.occasions) &&
    lead !== undefined &&
    !offPitch(s) &&
    !s.shootout &&
    s.match.score[0] - s.match.score[1] + lead === 0
  );
}
/** The shootout kick: success by the stated chance, no goal on the scoreboard. */
function resolveShootout(next: MatchSession, choiceId: string): void {
  const s = next.state,
    setup = next.setup,
    moment = s.currentMoment!;
  const choice = moment.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Invalid decision choice');
  const roll = createRng(`${setup.seed}:shootout:${choice.id}`).next();
  const success = roll < choice.probability;
  s.shootout = { choiceId: choice.id, probability: choice.probability, roll, success };
  const p = setup.players[setup.selectedPlayerId]!;
  event(
    next,
    p.primaryPosition === 'GK' ? 'save' : 'shot',
    p.clubId!,
    p.id,
    line(
      next,
      `match.commentary.${p.primaryPosition === 'GK' ? 'shootout-keeper' : 'shootout'}.${success ? 'success' : 'failure'}`,
    ),
    {
      input: { momentId: moment.id, choiceId: choice.id },
      success,
      roll,
      probability: choice.probability,
      factors: choice.factors,
    },
  );
}
const RATING_LABELS: Record<RatingPart, string> = {
  shooting: 'match.rating.shooting',
  passing: 'match.rating.passing',
  dribbling: 'match.rating.dribbling',
  defending: 'match.rating.defending',
  goalkeeping: 'match.rating.goalkeeping',
  goals: 'match.rating.goals',
  assists: 'match.rating.assists',
  saves: 'match.rating.saves',
  errors: 'match.rating.errors',
  team: 'match.rating.team',
  discipline: 'match.rating.discipline',
};
function report(session: MatchSession): MatchReport {
  const s = session.state,
    m = s.match,
    id = session.setup.selectedPlayerId;
  // The team's result and, for the back line, a clean sheet count toward the rating.
  const own = selectedSide(session.setup);
  const margin = m.score[own]! - m.score[1 - own]!;
  const back = ['GK', 'CB', 'LB', 'RB'].includes(rolePosition(session.setup));
  addRating(
    session,
    'team',
    (margin > 0 ? C.rating.result : margin < 0 ? -C.rating.result : 0) +
      (back && m.score[1 - own] === 0 && !offPitch(s) ? C.rating.cleanSheet : 0),
  );
  const rating = Math.round(clamp(s.stats.rating, C.rating.minimum, C.rating.maximum) * 10) / 10;
  const playerEvents = m.events.filter((e) => e.playerId === id);
  const passes = playerEvents
    .filter((e) => e.kind === 'pass')
    .map((e) => ({
      from: e.point,
      to: { ...(e.endPoint ?? e.point) },
      success: e.outcome?.success ?? true,
    }));
  const shots = playerEvents
    .filter((e) => e.kind === 'shot')
    .map((e) => ({
      from: e.point,
      to: { ...(e.endPoint ?? e.point) },
      goal: m.events.some((g) => g.kind === 'goal' && g.minute === e.minute && g.playerId === id),
    }));
  const ownSide = selectedSide(session.setup);
  const cleanSheet = m.score[1 - ownSide] === 0;
  const objectives = m.objectives.map((o) => ({
    ...o,
    progress:
      o.kind === 'rating'
        ? rating
        : o.kind === 'passing'
          ? s.stats.passesAttempted
            ? (s.stats.passesCompleted / s.stats.passesAttempted) * 100
            : 0
          : o.kind === 'clean-sheet'
            ? cleanSheet
              ? 1
              : 0
            : o.kind === 'goals'
              ? s.stats.goals
              : o.kind === 'assists'
                ? s.stats.assists
                : o.kind === 'tackles'
                  ? s.stats.tackles
                  : o.kind === 'saves'
                    ? s.stats.saves
                    : s.stats.shots,
  }));
  m.objectives = objectives;
  const backLine = ['GK', 'CB', 'LB', 'RB'].includes(rolePosition(session.setup));
  if (session.setup.dramaMoments) {
    // The story of the match decides the headline; the result and the rating the reactions.
    const copy = reportCopy(session, rating);
    s.headlineKey = copy.headlineKey;
    s.headlineParams = copy.headlineParams;
    s.managerReactionKey = copy.managerReactionKey;
    s.fanReactionKey = copy.fanReactionKey;
  } else {
    s.managerReactionKey =
      rating >= 7 ? 'match.reaction.manager.pleased' : 'match.reaction.manager.steady';
    s.fanReactionKey = rating >= 7 ? 'match.reaction.fans.pleased' : 'match.reaction.fans.steady';
    s.headlineKey =
      s.stats.goals > 0
        ? 'match.headline.scorer'
        : rating >= 7
          ? 'match.headline.strong'
          : 'match.headline.steady';
  }
  // Every contribution is listed; the final factor absorbs the 3–10 bound and the rounding.
  const ratingFactors: ProbabilityFactor[] = [
    { labelKey: 'match.rating.base', source: 'attribute', contribution: C.rating.base },
    ...partsOf(session.setup)
      .filter((part) => (s.ratingParts[part] ?? 0) !== 0)
      .map((part) => ({
        labelKey: RATING_LABELS[part],
        source: 'attribute' as const,
        contribution: s.ratingParts[part] ?? 0,
      })),
  ];
  const limit = round6(
    rating - ratingFactors.reduce((sum, f) => sum + f.contribution, 0 as number),
  );
  if (limit !== 0)
    ratingFactors.push({
      labelKey: 'match.rating.limit',
      source: 'attribute',
      contribution: limit,
    });
  return {
    playerId: id,
    rating,
    ratingFactors,
    xp: performanceXp({
      minutes: s.selectedPlayerMinutes,
      rating,
      goals: s.stats.goals,
      assists: s.stats.assists,
      objectives: objectives.filter((o) => o.progress >= o.target).length,
    }),
    // A dismissal costs fame (match-16).
    fameDelta:
      performanceFame(
        rating,
        s.stats.goals,
        s.stats.assists,
        backLine && cleanSheet && !s.sentOff,
      ) - (s.sentOff ? F.fame : 0),
    heatmap: s.frames.flatMap((f) => {
      const p = f.players.find((p) => p.id === id);
      return p && p.animation !== OFF_ANIMATION ? [p.point] : [];
    }),
    passes,
    shots,
    objectives,
    headlineId: s.headlineKey,
    ...(s.headlineParams ? { headlineParams: s.headlineParams } : {}),
    ...(full(session.setup)
      ? {
          cards: {
            yellow: m.events.filter(
              (e) =>
                e.kind === 'card' &&
                e.playerId === id &&
                (e.card === 'yellow' || e.card === 'second-yellow'),
            ).length,
            ...(s.sentOff ? { sentOff: { ...s.sentOff } } : {}),
          },
        }
      : {}),
  };
}
/** Best bench replacement: same position, then a compatible one, then any outfielder. */
function replacement(session: MatchSession, bench: string[], player: Player): string | undefined {
  const players = session.setup.players;
  const tier = (id: string) => {
    const candidate = players[id]!;
    if ((candidate.primaryPosition === 'GK') !== (player.primaryPosition === 'GK')) return 0;
    if (candidate.primaryPosition === player.primaryPosition) return 3;
    return fit(candidate, player.primaryPosition) > 0 ||
      COMPATIBLE[player.primaryPosition].includes(candidate.primaryPosition)
      ? 2
      : 1;
  };
  return bench
    .filter((id) => tier(id) > 0)
    .sort((a, b) => tier(b) - tier(a) || byAbility(players)(a, b))[0];
}
function contextFor(
  session: MatchSession,
  situation: Situation,
  rng: Rng,
  drawn: { keeper?: string; defender?: string; attacker?: string } = {},
  weights = situationWeights(playedSlot(session).position, session.state.match.tactics.role),
): DecisionContext {
  const s = session.state,
    setup = session.setup,
    side = selectedSide(setup);
  const player = setup.players[setup.selectedPlayerId]!;
  const opposition = side === 0 ? s.match.away : s.match.home;
  // The drawn opponents are also the ones placed in the moment's scene.
  const theirs = onPitch(opposition);
  const pickAbility = (positions: Position[], role: keyof typeof drawn) => {
    const pool = theirs.filter((id) => positions.includes(setup.players[id]!.primaryPosition));
    const id = rng.pick(pool.length ? pool : theirs);
    drawn[role] = id;
    return round6(playerAbility(setup.players[id]!));
  };
  const slot = playedSlot(session);
  // The finishers a created chance falls to: the best three teammate attackers on the pitch.
  const own = side === 0 ? s.match.home : s.match.away;
  const finishing = onPitch(own)
    .filter((id) => id !== player.id && setup.players[id]!.primaryPosition !== 'GK')
    .map((id) => setup.players[id]!.attributes.finishing)
    .sort((a, b) => b - a)
    .slice(0, 3);
  return {
    player,
    situation,
    budget: momentBudget(
      situation,
      weights,
      s.shares,
      { own: s.expectedGoals[side]!, opposition: s.expectedGoals[1 - side]! },
      s.momentMinutes.length,
    ),
    matchLevel: s.matchLevel,
    importance: setup.fixture?.importance ?? 1,
    fatigue: s.stats.fatigue,
    tactics: s.match.tactics,
    weather: s.match.weather,
    pitchCondition: s.match.pitchCondition,
    ...(s.match.weatherIntensity ? { weatherIntensity: s.match.weatherIntensity } : {}),
    ...(s.match.pitchState ? { pitchState: s.match.pitchState } : {}),
    // A side down to ten men (match-16) plays as if weaker.
    strengthGap: round6(
      s.strength[side]! -
        s.strength[1 - side]! -
        (full(setup)
          ? (menDown(s.match)[side]! - menDown(s.match)[1 - side]!) * F.menDown.strength
          : 0),
    ),
    opponents: {
      keeper: pickAbility(['GK'], 'keeper'),
      defender: pickAbility(['CB', 'LB', 'RB', 'DM'], 'defender'),
      attacker: pickAbility(['ST', 'LW', 'RW', 'AM'], 'attacker'),
    },
    momentum: side === 0 ? s.match.momentum : 100 - s.match.momentum,
    talkOdds: s.talkOdds,
    teammateFinishing: finishing.length
      ? round6(finishing.reduce((sum, value) => sum + value, 0) / finishing.length)
      : s.matchLevel,
    consistencyShift: s.consistencyShift,
    chemistry: setup.chemistry ?? 60,
    positionPenalty: round6((100 - slot.familiarity) * C.decision.positionPenalty),
    ...(latest(setup) ? { latest: true } : {}),
    // Skills stack on the impact path too (match-17).
    ...(current(setup) ? { stackImpact: true } : {}),
  };
}
/**
 * How a moment reads (engine match-12): one of several sentences for the situation, naming the
 * people in it, and a line on what is at stake late in a close game. Drawn from its own stream,
 * so the wording never moves a roll.
 */
function framing(
  session: MatchSession,
  situation: Situation,
  opponents: { keeper?: string; defender?: string; attacker?: string },
  margin: number,
): Pick<KeyMoment, 'situationKey' | 'situationParams' | 'pressureKey'> {
  const setup = session.setup,
    m = session.state.match,
    side = selectedSide(setup);
  const rng = createRng(`${setup.seed}:framing:${m.minute}`);
  const variant = rng.int(0, C.drama.situationVariants - 1);
  const name = (id: string | undefined) => (id ? setup.players[id]?.name : undefined);
  const own = side === 0 ? m.home : m.away;
  const teammate = onPitch(own)
    .filter((id) => id !== setup.selectedPlayerId && setup.players[id]!.primaryPosition !== 'GK')
    .sort(
      (a, b) =>
        setup.players[b]!.attributes.finishing - setup.players[a]!.attributes.finishing ||
        (a < b ? -1 : 1),
    )[0];
  const params: Record<string, string> = {
    opponent: (side === 0 ? setup.away : setup.home).name,
    minute: String(m.minute),
  };
  for (const [key, value] of [
    ['keeper', name(opponents.keeper)],
    ['defender', name(opponents.defender)],
    ['attacker', name(opponents.attacker)],
    ['teammate', name(teammate)],
  ] as const)
    if (value) params[key] = value;
  const late = m.minute >= C.drama.lateDecisionMinute && Math.abs(margin) <= C.drama.closeMargin;
  return {
    situationKey: `match.situation.${situation.id}.${variant}`,
    situationParams: params,
    ...(late
      ? {
          pressureKey: `match.pressure.${margin === 0 ? 'level' : margin > 0 ? 'ahead' : 'behind'}`,
        }
      : {}),
  };
}
/**
 * The last moment of a match-12 game is placed at the deciding minute: in the closing minutes
 * when the game is within a goal, otherwise where it was provisionally scheduled.
 */
function placeLateMoment(session: MatchSession): void {
  const s = session.state,
    m = s.match,
    D = C.drama;
  const side = selectedSide(session.setup);
  if (Math.abs(m.score[side]! - m.score[1 - side]!) > D.closeMargin) return;
  const rng = createRng(`${session.setup.seed}:late`);
  s.momentMinutes = [...s.momentMinutes.slice(0, -1), rng.int(D.lateMinutes[0], D.lateMinutes[1])];
}
/** The third of the pitch at a depth from the selected team's goal. */
const zoneAt = (depth: number): PitchZone =>
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
function spotWidth(session: MatchSession, situation: Situation, rng: Rng): number {
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
function pickReceivers(
  session: MatchSession,
  situation: Situation,
  forced?: ForcedMoment,
): Map<string, string> {
  const setup = session.setup;
  const rng = createRng(
    `${setup.seed}:receiver:${session.state.match.minute}${forced ? `:${forced.kind}` : ''}`,
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
function choiceTarget(
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
/**
 * A moment that follows from another (engine match-13): the shootout kick at full time, or the
 * shot after a beaten defender, which carries the chance the dribble made.
 */
interface ForcedMoment {
  kind: 'shootout' | 'chain';
  situation: Situation;
  /** For a chain: the goal probability the beaten defender opened up. */
  goal?: number;
}
function openMoment(next: MatchSession, forced?: ForcedMoment): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const rng = createRng(
    forced
      ? `${setup.seed}:${forced.kind}:${m.minute}:${m.keyMoments.length}`
      : `${setup.seed}:situation:${m.minute}`,
  );
  const side = selectedSide(setup);
  const margin = m.score[side]! - m.score[1 - side]!;
  const weights = situationWeights(playedSlot(next).position, m.tactics.role, {
    drama: setup.dramaMoments,
    state: { minute: m.minute, margin },
  });
  let situation = weights[weights.length - 1]!.situation;
  if (forced) situation = forced.situation;
  else {
    let target = rng.next() * weights.reduce((sum, w) => sum + w.weight, 0);
    for (const w of weights) {
      target -= w.weight;
      if (target < 0) {
        situation = w.situation;
        break;
      }
    }
  }
  const opponents: { keeper?: string; defender?: string; attacker?: string } = {};
  const context = contextFor(next, situation, rng, opponents, weights);
  // A chained shot is worth what the dribble opened up; the rest of the match is unchanged.
  if (forced?.kind === 'chain') context.budget = { for: forced.goal ?? 0, against: 0 };
  // Place the selected player where the situation happens, attacking the correct end: on the
  // side of their formation post (match-15), or on a random side before.
  const right = attacksRight(next, player.clubId!, m.minute);
  const width = latest(setup)
    ? spotWidth(next, situation, rng)
    : clamp(
        (rng.next() < 0.5 ? situation.spot.width : 100 - situation.spot.width) + rng.int(-4, 4),
        2,
        98,
      );
  const spot = {
    x: right ? situation.spot.depth : 100 - situation.spot.depth,
    y: latest(setup) && !right ? 100 - width : width,
  };
  // The teammates the moment's passes go to are picked before the choice (match-15), on their
  // own stream, so the camera can name them and the pass reaches the one it names.
  const receivers = latest(setup) ? pickReceivers(next, situation, forced) : null;
  const plan: CastPlan | undefined = receivers
    ? {
        receivers: [...new Set(receivers.values())],
        ...((receivers.get('through-ball') ?? receivers.get('disguised-pass'))
          ? { runner: receivers.get('through-ball') ?? receivers.get('disguised-pass') }
          : {}),
      }
    : undefined;
  // A follow-up moment continues its minute: it replaces the minute's snapshot.
  const passage = momentPassage(next, situation, spot, opponents, plan);
  applyPassage(next, 'moment', passage, [], !!forced);
  const momentFrame = s.frames[s.frames.length - 1]!;
  const choices = buildChoices(context);
  const moment: KeyMoment = {
    id: forced
      ? `${m.id}:moment:${m.minute}:${forced.kind}:${m.keyMoments.length}`
      : `${m.id}:moment:${m.minute}`,
    minute: m.minute,
    situationId: situation.id,
    situationKey: `match.situation.${situation.id}`,
    frame: momentFrame,
    budget: context.budget,
    choices,
  };
  if (receivers && passage.cast) {
    const cast = passage.cast;
    moment.zone = zoneAt(situation.spot.depth);
    moment.cast = cast;
    moment.choices = choices.map((choice) => {
      const target = choiceTarget(next, situation, choice.id, momentFrame, cast, receivers);
      return target ? { ...choice, target } : choice;
    });
  }
  // Defending choices carry a booking risk (match-16), shown with the odds.
  if (full(setup) && player.primaryPosition !== 'GK') {
    const booked = bookedPlayers(m).has(player.id);
    moment.choices = moment.choices.map((choice) => {
      const booking = bookingRisk(choice.id, player, choice.probability, booked);
      return booking ? { ...choice, booking } : choice;
    });
  }
  if (setup.dramaMoments) Object.assign(moment, framing(next, situation, opponents, margin));
  if (forced) moment.follows = forced.kind;
  if (forced?.kind === 'shootout')
    moment.situationKey = `match.situation.shootout${situation.id === 'penalty-save' ? '-keeper' : ''}.${
      moment.situationKey.split('.').pop() ?? '0'
    }`;
  s.currentMoment = moment;
  m.keyMoments.push(moment);
  m.status = 'decision';
}
function resolveChoice(next: MatchSession, choiceId: string): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const moment = s.currentMoment!;
  const choice = moment.choices.find((c) => c.id === choiceId);
  const template: ChoiceTemplate | undefined = SITUATION_BY_ID[moment.situationId]?.choices.find(
    (c) => c.id === choiceId,
  );
  if (!choice || !template) throw new Error('Invalid decision choice');
  // Each choice has its own stream, so alternatives at the same moment never share a roll.
  const rng = createRng(`${setup.seed}:decision:${m.minute}:${moment.id}:${choice.id}`);
  const roll = rng.next(),
    success = roll < choice.probability;
  const p = setup.players[setup.selectedPlayerId]!,
    side = selectedSide(setup),
    stakes = choice.stakes;
  const outcome: DecisionOutcome = {
    input: { momentId: moment.id, choiceId: choice.id },
    success,
    roll,
    probability: choice.probability,
    factors: choice.factors,
  };
  const key = `match.commentary.${template.commentary}.${success ? 'success' : 'failure'}`;
  const opponentShooter = () => finisher(next, 1 - side, rng);
  if (template.direct === 'against') {
    // The shot is already on its way: record it, then the goalkeeper's attempt.
    const shooter = opponentShooter();
    recordShot(next, 1 - side, shooter, 'match.commentary.attempt', 1 - choice.probability);
    event(next, template.event, p.clubId!, p.id, line(next, key), outcome);
    if (!success) {
      goal(next, 1 - side, shooter);
      s.stats.errors++;
      addRating(next, 'errors', C.rating.error);
    }
  } else if (template.event === 'shot') {
    if (side === 0) s.stats.homeShots++;
    else s.stats.awayShots++;
    s.stats.shots++;
    const shot = event(next, 'shot', p.clubId!, p.id, line(next, key), outcome, template.target);
    addXg(next, side, shot, choice.probability);
    if (success) goal(next, side, p.id, template.target);
  } else event(next, template.event, p.clubId!, p.id, line(next, key), outcome);
  // A failed defending choice can be a foul worth a card (match-16): its own stream, so the
  // decision's rolls never move. A side already down `maxDismissals` men gets no more reds.
  if (full(setup) && !success && choice.booking) {
    const draw = createRng(`${setup.seed}:booking:${moment.id}:${choice.id}`);
    const foulRoll = round6(draw.next()),
      redRoll = draw.next();
    const kind: Card['card'] | undefined =
      foulRoll >= choice.booking.foul
        ? undefined
        : redRoll < choice.booking.straight
          ? 'red'
          : choice.booking.booked
            ? 'second-yellow'
            : 'yellow';
    const shown =
      kind && (kind === 'yellow' || menDown(m)[side]! < F.maxDismissals) ? kind : undefined;
    outcome.booking = {
      roll: foulRoll,
      foul: choice.booking.foul,
      ...(shown ? { card: shown } : {}),
    };
    if (shown) showCard(next, side, p.id, shown);
  }
  if (template.stat === 'passes') {
    s.stats.passesAttempted++;
    if (success) s.stats.passesCompleted++;
  } else if (template.stat === 'tackles') {
    s.stats.tacklesAttempted++;
    if (success) s.stats.tackles++;
  }
  if (template.stat === 'saves' && success) s.stats.saves++;
  if (success && (template.family === 'goalkeeping' || template.family === 'defending')) {
    // A stop earns credit in proportion to the danger it removed and its difficulty, so its
    // expected value (stop × danger) is the same for every defensive choice.
    const danger =
      template.fixed ??
      template.againstShare *
        moment.budget.against *
        (template.opponent === 'attacker' ? C.decision.defensiveEdge : 1);
    // Before match-13 the credit was divided by the player's own odds, so its expected value was
    // the same for every player. Divided by the reference player's odds instead, an average
    // player earns what they did, and a better one more: their stops are worth their quality.
    const reference = setup.occasions ? referenceOdds(choice) : choice.probability;
    addRating(next, 'saves', (C.rating.stop * danger) / reference);
  }
  // A beaten defender (match-13): an attacker's successful dribble leads into the shot itself,
  // carrying the chance it made, instead of a hidden roll.
  const chains =
    setup.occasions &&
    success &&
    template.event === 'dribble' &&
    template.scorer === 'self' &&
    !moment.follows &&
    CHAINING.includes(playedSlot(next).position) &&
    stakes.successGoal > 0;
  if (chains) s.chain = { goal: stakes.successGoal };
  // Follow-up chances: created for the selected team, or conceded to the opposition.
  const goalProbability = chains
    ? 0
    : success
      ? template.direct === 'for'
        ? 0
        : stakes.successGoal
      : stakes.failureGoal;
  if (goalProbability > 0) {
    const self = success && template.scorer === 'self';
    // A completed pass reaches the teammate named before the choice (match-15), who takes the
    // chance it makes; earlier engines drew the finisher here.
    const named =
      success && template.event === 'pass' && choice.target?.kind === 'teammate'
        ? choice.target.playerId
        : undefined;
    const scorer = self ? p.id : (named ?? finisher(next, side, rng, p.id));
    const shotsBefore = side === 0 ? s.stats.homeShots : s.stats.awayShots;
    const scored = chance(
      next,
      side,
      scorer,
      goalProbability,
      rng,
      self ? 'match.commentary.attempt' : 'match.commentary.chance',
    );
    // A key pass: the player's completed pass led to a teammate's shot.
    if (
      success &&
      !self &&
      template.event === 'pass' &&
      (side === 0 ? s.stats.homeShots : s.stats.awayShots) > shotsBefore
    )
      s.stats.keyPasses++;
    if (scored && success && template.assist && !self) {
      // Tag the goal so a committed fixture credits the assist to the right player.
      const scoredGoal = m.events.findLast((e) => e.kind === 'goal');
      if (scoredGoal) scoredGoal.assistId = p.id;
      s.stats.assists++;
      addRating(next, 'assists', C.rating.assist);
    }
  }
  const concedeProbability = success
    ? stakes.successConcede
    : template.direct === 'against'
      ? 0
      : stakes.failureConcede;
  if (concedeProbability > 0) {
    const conceded = chance(
      next,
      1 - side,
      opponentShooter(),
      concedeProbability,
      rng,
      'match.commentary.counter',
    );
    if (conceded) {
      s.stats.errors++;
      addRating(next, 'errors', C.rating.error);
    }
  }
  // Decision credit: harder successes earn more, safe failures cost more. Measured against the
  // player's own odds (before match-13) it averages nothing for anyone; against the reference
  // player's odds it averages what the player's quality adds: weight × (odds − reference).
  const weight = C.rating.decisionWeight;
  const baseline = setup.occasions ? referenceOdds(choice) : choice.probability;
  addRating(next, template.family, success ? weight * (1 - baseline) : -weight * baseline);
}
/** A choice's odds for the reference player, before attributes, form and conditions. */
function referenceOdds(choice: DecisionChoice): number {
  return (
    choice.factors.find((factor) => factor.labelKey === 'match.factor.base')?.contribution ??
    choice.probability
  );
}
export function applyMatchCommand(session: MatchSession, command: MatchCommand): MatchSession {
  validateCommand(command);
  const source = session.state;
  const state: MatchState = {
    ...source,
    stats: { ...source.stats },
    play: { ...source.play },
    ratingParts: { ...source.ratingParts },
    frames: [...source.frames],
    match: {
      ...source.match,
      tactics: { ...source.match.tactics },
      score: [...source.match.score],
      events: [...source.match.events],
      keyMoments: [...source.match.keyMoments],
      reports: [...source.match.reports],
    },
  };
  const next: MatchSession = { ...session, commands: [...session.commands, copy(command)], state };
  const m = state.match;
  const setup = session.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  if (command.type === 'kickoff') {
    if (m.status !== 'preview') throw new Error('Match already started');
    m.status = 'live';
  } else if (command.type === 'advance') {
    if (m.status !== 'live' || state.captainDecisionPending || state.substitutionDecisionPending)
      throw new Error('Cannot advance paused match');
    m.minute++;
    const first = m.events.length;
    if (!offPitch(state)) {
      state.selectedPlayerMinutes++;
      const stamina =
        player.primaryPosition === 'GK'
          ? Math.max(C.keeperStamina, player.attributes.stamina)
          : player.attributes.stamina;
      state.stats.fatigue = round6(
        clamp(
          state.stats.fatigue +
            (C.fatiguePerMinute * (1.3 - stamina / 150) +
              (m.tactics.risk === 'high' ? C.highRiskFatigue : 0)) *
              (player.traits.includes('second-wind') ? C.decision.secondWindFatigue : 1),
          0,
          100,
        ),
      );
      // Fatigue already starts from the player's condition. A tired player comes off; a
      // manager may also replace a poor one, or protect a lead, at a few set minutes.
      const T = C.tacticalSubstitution;
      const own = selectedSide(setup);
      const inWindow =
        m.minute >= C.minimumSubstitutionMinute && m.minute < C.substitutionCutoffMinute;
      // Keepers are not taken off for tiredness, nor for tactics.
      const tired = player.primaryPosition !== 'GK' && state.stats.fatigue >= C.substitutionFatigue;
      const tactical =
        player.primaryPosition !== 'GK' &&
        (T.minutes as readonly number[]).includes(m.minute) &&
        (state.stats.rating < T.ratingBelow || m.score[own]! - m.score[1 - own]! >= T.leadingBy) &&
        createRng(`${setup.seed}:substitution:${m.minute}`).next() < T.chance;
      if (inWindow && (tired || tactical)) {
        const team = own === 0 ? 'home' : 'away';
        const current = m[team];
        const incoming = replacement(next, current.benchIds, player);
        if (incoming) {
          state.substituted = true;
          state.substitutionDecisionPending = true;
          m[team] = {
            ...current,
            starterIds: current.starterIds.map((id) => (id === player.id ? incoming : id)),
            benchIds: current.benchIds.filter((id) => id !== incoming),
          };
          const sub = event(
            next,
            'substitution',
            player.clubId!,
            player.id,
            'match.commentary.substitution',
          );
          // Who comes on (match-15), for the substitution board and minutes.
          if (latest(setup)) sub.receiverId = incoming;
        }
      }
    }
    if (latest(setup)) managerSubstitutions(next);
    // Full discipline (match-16): the minute's cards come first, so a player sent off takes
    // no further part in it (and the selected player has no moment).
    if (full(setup)) showCards(next);
    if (setup.dramaMoments && m.minute === C.drama.lateDecisionMinute) placeLateMoment(next);
    if (!offPitch(state) && state.momentMinutes.includes(m.minute)) openMoment(next);
    else {
      simulateMinuteGoals(next);
      applyPassage(next, 'minute', minutePassage(next, m.events.slice(first)));
      afterMinute(next);
    }
  } else if (command.type === 'choose') {
    if (m.status !== 'decision' || !state.currentMoment) throw new Error('No decision pending');
    if (state.currentMoment.follows === 'shootout') {
      resolveShootout(next, command.choiceId);
      state.currentMoment = null;
      finish(next);
      return next;
    }
    const first = m.events.length;
    resolveChoice(next, command.choiceId);
    const decided = m.events.length - first;
    if (state.chain) {
      // The defender is beaten: play carries on into the shot it leads to, in the same minute.
      const goal = state.chain.goal;
      delete state.chain;
      openMoment(next, { kind: 'chain', situation: SITUATION_BY_ID['box-chance']!, goal });
      return next;
    }
    simulateMinuteGoals(next);
    // The build-up to the moment leads into its outcome in a goal highlight.
    const lead = source.motion.kind === 'moment' ? source.motion.frames.slice(0, -1) : [];
    applyPassage(
      next,
      'outcome',
      outcomePassage(next, m.events.slice(first), state.currentMoment.situationId, decided),
      lead,
    );
    state.currentMoment = null;
    m.status = 'live';
    afterMinute(next);
  } else if (command.type === 'halftime') {
    if (m.status !== 'halftime' || !['motivate', 'role', 'complain'].includes(command.response))
      throw new Error('Invalid halftime response');
    // On big-occasion engines (match-13) the challenge is a demand for the ball: more of the
    // second half goes through the player, at a smaller cost in trust and no sulk.
    const demand = setup.occasions && command.response === 'complain';
    state.managerTrustDelta = demand
      ? C.decision.talk.demand.trust
      : command.response === 'complain'
        ? -5
        : command.response === 'motivate'
          ? 3
          : 1;
    // The talk carries into the second half: a lift in momentum and odds, or a sulk.
    const talk = C.decision.talk;
    const ownSide = selectedSide(setup);
    if (command.response === 'motivate') {
      const lift = talk.momentum * (player.traits.includes('leader') ? talk.leaderBonus : 1);
      m.momentum = clamp(
        m.momentum + (ownSide === 0 ? lift : -lift),
        C.momentum.minimum,
        C.momentum.maximum,
      );
      state.talkOdds = talk.motivate;
    } else if (demand) {
      state.talkOdds = 1;
      state.shares = {
        ...state.shares,
        attack: round6(
          Math.min(C.decision.talk.demand.maximum, state.shares.attack * talk.demand.share),
        ),
      };
    } else state.talkOdds = command.response === 'complain' ? talk.complain : 1;
    if (command.response === 'role') {
      const position = rolePosition(setup);
      m.tactics.role = halftimeRole(position, m.tactics.role);
      state.expectedGoals = currentRates(next, m.tactics);
      state.shares = shares(position, m.tactics.role, setup.dramaMoments);
    }
    state.stats.fatigue = round6(Math.max(0, state.stats.fatigue - C.halftimeRecovery));
    // Ends are switched and the away side kicks off the second half.
    state.play = { side: 1, carrierId: null, restart: 'second-half' };
    m.status = 'live';
    // A captain sent off (match-16) no longer leads the side.
    state.captainDecisionPending = state.captain && !state.sentOff;
  } else if (command.type === 'substitution') {
    if (
      m.status === 'finished' ||
      !state.substitutionDecisionPending ||
      !['accept', 'encourage'].includes(command.response)
    )
      throw new Error('No substitution response pending');
    state.substitutionDecisionPending = false;
    if (command.response === 'encourage') state.managerTrustDelta += 1;
  } else if (command.type === 'captain') {
    if (
      m.status !== 'live' ||
      !state.captainDecisionPending ||
      !['push', 'calm'].includes(command.instruction)
    )
      throw new Error('No captain decision pending');
    state.captainDecisionPending = false;
    m.tactics.mentality = shiftMentality(
      m.tactics.mentality,
      command.instruction === 'push' ? 1 : -1,
    );
    if (player.traits.includes('captains-voice')) {
      // A captain the dressing room listens to lifts the side with the call itself.
      const voice = C.decision.captainsVoice[command.instruction];
      m.momentum = clamp(
        m.momentum + (selectedSide(setup) === 0 ? voice : -voice),
        C.momentum.minimum,
        C.momentum.maximum,
      );
    }
    state.expectedGoals = currentRates(next, m.tactics);
    updatePossession(next);
  } else throw new Error('Unknown match command');
  return next;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function validateMatchSession(value: unknown): MatchSession {
  validateJson(value);
  if (!value || typeof value !== 'object') throw new Error('Invalid match session');
  const session = value as MatchSession;
  // Sessions from another engine cannot replay; callers discard them and keep the world. A
  // session from before formations, or before slot-aware moments, replays with the rules its
  // setup implies.
  // Sessions saved before the choreography annotations and bookkeeping stats (match-14), or
  // before its narration, lack them whatever their engine, so they cannot replay to the same
  // state either.
  if (
    !session.setup ||
    typeof session.setup !== 'object' ||
    session.engine !== engineFor(session.setup) ||
    !Array.isArray(session.state?.stats?.xg) ||
    !Array.isArray(session.state?.narration)
  )
    throw new OutdatedMatchSessionError(session.engine);
  if (
    session.version !== 1 ||
    !session.setup ||
    session.setup.version !== 1 ||
    !Array.isArray(session.commands) ||
    session.commands.length > 240 ||
    !session.state ||
    typeof session.setup.seed !== 'string' ||
    !session.setup.seed ||
    session.setup.seed.length > 256 ||
    typeof session.setup.neutral !== 'boolean' ||
    !Number.isSafeInteger(session.setup.season)
  )
    throw new Error('Invalid match session');
  validateSetup(session.setup);
  let replay = createMatchSession(session.setup, session.initialTactics);
  for (const command of session.commands) replay = applyMatchCommand(replay, command);
  if (canonical(replay) !== canonical(session))
    throw new Error('Match session differs from deterministic replay');
  return replay;
}
