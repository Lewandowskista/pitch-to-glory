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
  Position,
} from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { expectedGoals, playerAbility, teamStrength } from '../strength';
import {
  MATCH_ENGINE_VERSION,
  type MatchSetup,
  type MatchSession,
  type MatchState,
  type MatchCommand,
  type RatingPart,
} from './types';
import { MATCH_CONFIG as C } from './tuning';
import { validateSetup, validateTactics, validateCommand, validateJson } from './validation';
import { SITUATION_BY_ID, type ChoiceTemplate, type Situation } from './situations';
import { halftimeRole, roleEffect, shiftMentality } from './roles';
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
export {
  buildChoices,
  expectedImpact,
  momentBudget,
  situationWeights,
  conditionsEffect,
  type DecisionContext,
} from './decisions';

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
];

function fit(player: Player, position: Position): number {
  return player.primaryPosition === position
    ? 100
    : (player.secondaryPositions.find((p) => p.position === position)?.familiarity ?? 0);
}
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
  options: { neutral?: boolean; fixture?: MatchSetup['fixture'] } = {},
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
  });
}
const selectedSide = (setup: MatchSetup) =>
  setup.players[setup.selectedPlayerId]!.clubId === setup.home.id ? 0 : 1;

/** Strength-model expectations adjusted by personal tactics, rounded for stable replay. */
function rates(setup: MatchSetup, strength: [number, number], tactics: Tactics): [number, number] {
  const [home, away] = expectedGoals(strength[0], strength[1], setup.neutral);
  const total = (home + away) * C.tactics.riskTotal[tactics.risk];
  const shift =
    (tactics.mentality === 'attacking' ? 1 : tactics.mentality === 'defensive' ? -1 : 0) *
      C.tactics.mentalityShare +
    (roleEffect(tactics.role).share ?? 0);
  const share = clamp(
    home / (home + away) + (selectedSide(setup) === 0 ? shift : -shift),
    C.tactics.minimumShare,
    C.tactics.maximumShare,
  );
  return [round6(total * share), round6(total * (1 - share))];
}
function shares(position: Position, role: string): MatchState['shares'] {
  const [attack, defence] = C.shares[position];
  const weights = situationWeights(position, role);
  return {
    attack: weights.some((w) => w.situation.attackWeight > 0) ? attack : 0,
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
  s.stats.homePossession = Math.round(
    clamp(
      possessionBase(session.setup, s, s.match.tactics) +
        (s.match.momentum - 50) * C.possession.momentum,
      C.possession.minimum,
      C.possession.maximum,
    ),
  );
}
export function createMatchSession(setup: MatchSetup, tactics: Tactics): MatchSession {
  validateSetup(setup);
  const selected = setup.players[setup.selectedPlayerId]!;
  validateTactics(tactics, selected.primaryPosition);
  const home = lineup(setup.home, setup.players, setup.selectedPlayerId),
    away = lineup(setup.away, setup.players, setup.selectedPlayerId);
  const starters = (team: Lineup) => team.starterIds.map((id) => setup.players[id]!);
  const strength: [number, number] = [
    round6(teamStrength(setup.home.reputation, starters(home))),
    round6(teamStrength(setup.away.reputation, starters(away))),
  ];
  const matchLevel = round6(
    [...starters(home), ...starters(away)].reduce((sum, p) => sum + playerAbility(p), 0) / 22,
  );
  const rng = createRng(`${setup.seed}:preview`);
  const involvement =
    selected.primaryPosition === 'GK'
      ? C.involvement.keeper
      : ATTACKERS.includes(selected.primaryPosition)
        ? C.involvement.attack
        : C.involvement.other;
  const count = clamp(
    C.momentBase + involvement + Math.round((selected.form - 50) / C.formStep) + rng.int(-1, 1),
    C.minimumMoments,
    C.maximumMoments,
  );
  const minutes: number[] = [];
  for (let i = 0; i < count; i++)
    minutes.push(
      Math.max((minutes[i - 1] ?? 0) + 1, Math.round(6 + (i * 78) / (count - 1)) + rng.int(-2, 2)),
    );
  const keeper = selected.primaryPosition === 'GK';
  const objectives = [
    { id: 'rating', kind: 'rating' as const, target: 7, progress: 0 },
    {
      id: keeper ? 'clean-sheet' : 'passing',
      kind: keeper ? ('clean-sheet' as const) : ('passing' as const),
      target: keeper ? 1 : 85,
      progress: 0,
    },
  ];
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
  const captainId = [...(selectedSide(setup) === 0 ? home : away).starterIds].sort(
    (a, b) =>
      setup.players[b]!.attributes.leadership - setup.players[a]!.attributes.leadership ||
      (a < b ? -1 : 1),
  )[0];
  const session: MatchSession = {
    version: 1,
    engine: MATCH_ENGINE_VERSION,
    setup: copy(setup),
    initialTactics: copy(tactics),
    commands: [],
    state: {
      match,
      currentMoment: null,
      frames: [frame(setup, home, away, 0)],
      selectedPlayerMinutes: 0,
      substituted: false,
      substitutionDecisionPending: false,
      captain: captainId === selected.id,
      captainDecisionPending: false,
      strength,
      matchLevel,
      expectedGoals: rates(setup, strength, tactics),
      shares: shares(selected.primaryPosition, tactics.role),
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
        errors: 0,
        rating: C.rating.base,
        fatigue: selected.fatigue,
      },
      ratingParts: Object.fromEntries(RATING_PARTS.map((part) => [part, 0])) as Record<
        RatingPart,
        number
      >,
      report: null,
      momentMinutes: minutes,
      managerTrustDelta: 0,
      managerReactionKey: 'match.reaction.manager.steady',
      fanReactionKey: 'match.reaction.fans.steady',
      headlineKey: 'match.headline.steady',
    },
  };
  updatePossession(session);
  return session;
}
const FORMATION_POINTS = [
  [5, 50],
  [24, 15],
  [22, 38],
  [22, 62],
  [24, 85],
  [45, 27],
  [42, 50],
  [45, 73],
  [70, 18],
  [76, 50],
  [70, 82],
];
function frame(setup: MatchSetup, home: Lineup, away: Lineup, minute: number): ReplayFrame {
  const rng = createRng(`${setup.seed}:frame:${minute}`);
  return {
    timeMs: minute * 60000,
    ball: { x: rng.int(20, 80), y: rng.int(12, 88) },
    players: [home, away].flatMap((team, side) =>
      team.starterIds.map((id, i) => {
        const base = FORMATION_POINTS[i]!;
        const flip = (side === 1) !== minute > 45;
        const x = clamp(base[0]! + rng.int(-5, 5), 2, 98);
        return {
          id,
          point: { x: flip ? 100 - x : x, y: clamp(base[1]! + rng.int(-6, 6), 2, 98) },
          animation: 'run',
        };
      }),
    ),
  };
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
function recordShot(session: MatchSession, side: number, id: string, key: string, target?: number) {
  if (side === 0) session.state.stats.homeShots++;
  else session.state.stats.awayShots++;
  return event(session, 'shot', sideTeam(session, side), id, line(session, key), null, target);
}
function goal(session: MatchSession, side: number, playerId: string, target?: number): void {
  const m = session.state.match;
  m.score[side]!++;
  event(
    session,
    'goal',
    sideTeam(session, side),
    playerId,
    line(session, 'match.commentary.goal'),
    null,
    target,
  );
  if (playerId === session.setup.selectedPlayerId) {
    session.state.stats.goals++;
    addRating(session, 'goals', C.rating.goal);
  }
  const currentFrame = session.state.frames[session.state.frames.length - 1]!;
  session.state.frames[session.state.frames.length - 1] = {
    ...currentFrame,
    ball: { ...m.events[m.events.length - 1]!.endPoint! },
  };
}
function addRating(session: MatchSession, part: RatingPart, delta: number): void {
  const s = session.state;
  s.ratingParts = { ...s.ratingParts, [part]: round6(s.ratingParts[part] + delta) };
  const total = RATING_PARTS.reduce<number>((sum, key) => sum + s.ratingParts[key], C.rating.base);
  s.stats.rating = round6(clamp(total, C.rating.minimum, C.rating.maximum));
}
/** Picks a likely finisher: forwards most often, never the goalkeeper. */
function finisher(session: MatchSession, side: number, rng: Rng, exclude?: string): string {
  const team = side === 0 ? session.state.match.home : session.state.match.away;
  const pool = team.starterIds.filter(
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
  recordShot(session, side, scorer, key);
  if (rng.next() >= probability / shot) return false;
  goal(session, side, scorer);
  return true;
}
function simulateMinuteGoals(session: MatchSession): void {
  const s = session.state,
    rng = createRng(`${session.setup.seed}:minute:${s.match.minute}`);
  const selected = session.setup.players[session.setup.selectedPlayerId]!,
    own = selectedSide(session.setup);
  for (let side = 0; side < 2; side++) {
    // Personal key moments replace part of each side's expected goals while the player is on.
    const replaced = s.substituted ? 0 : side === own ? s.shares.attack : s.shares.defence;
    const rate = clamp((s.expectedGoals[side]! * (1 - replaced)) / 90, 0, 0.2);
    if (rng.next() < rate / C.shotConversion) {
      const id = finisher(
        session,
        side,
        rng,
        side === own && !s.substituted ? selected.id : undefined,
      );
      recordShot(session, side, id, 'match.commentary.attempt');
      if (rng.next() < C.shotConversion) goal(session, side, id);
    }
  }
  // Ordinary passes are real logged actions and contribute to the pass map.
  if (!s.substituted && selected.primaryPosition !== 'GK' && rng.next() < C.passPerMinute) {
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
    s.match.status = 'finished';
    s.report = report(session);
    s.match.reports = [s.report];
  }
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
};
function report(session: MatchSession): MatchReport {
  const s = session.state,
    m = s.match,
    id = session.setup.selectedPlayerId;
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
  const objectives = m.objectives.map((o) => ({
    ...o,
    progress:
      o.kind === 'rating'
        ? rating
        : o.kind === 'passing'
          ? s.stats.passesAttempted
            ? (s.stats.passesCompleted / s.stats.passesAttempted) * 100
            : 0
          : m.score[1 - ownSide] === 0
            ? 1
            : 0,
  }));
  m.objectives = objectives;
  s.managerReactionKey =
    rating >= 7 ? 'match.reaction.manager.pleased' : 'match.reaction.manager.steady';
  s.fanReactionKey = rating >= 7 ? 'match.reaction.fans.pleased' : 'match.reaction.fans.steady';
  s.headlineKey =
    s.stats.goals > 0
      ? 'match.headline.scorer'
      : rating >= 7
        ? 'match.headline.strong'
        : 'match.headline.steady';
  // Every contribution is listed; the final factor absorbs the 3–10 bound and the rounding.
  const ratingFactors: ProbabilityFactor[] = [
    { labelKey: 'match.rating.base', source: 'attribute', contribution: C.rating.base },
    ...RATING_PARTS.filter((part) => s.ratingParts[part] !== 0).map((part) => ({
      labelKey: RATING_LABELS[part],
      source: 'attribute' as const,
      contribution: s.ratingParts[part],
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
    xp: Math.round(
      s.selectedPlayerMinutes * C.xp.perMinute +
        Math.max(0, rating - C.xp.ratingThreshold) * C.xp.perRating +
        s.stats.goals * C.xp.perGoal +
        s.stats.assists * C.xp.perAssist +
        objectives.filter((o) => o.progress >= o.target).length * C.xp.perObjective,
    ),
    fameDelta: Math.round(
      Math.max(0, rating - C.fame.ratingThreshold) * C.fame.perRating +
        s.stats.goals * C.fame.perGoal,
    ),
    heatmap: s.frames.flatMap((f) => {
      const p = f.players.find((p) => p.id === id);
      return p ? [p.point] : [];
    }),
    passes,
    shots,
    objectives,
    headlineId: s.headlineKey,
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
function contextFor(session: MatchSession, situation: Situation, rng: Rng): DecisionContext {
  const s = session.state,
    setup = session.setup,
    side = selectedSide(setup);
  const player = setup.players[setup.selectedPlayerId]!;
  const opposition = side === 0 ? s.match.away : s.match.home;
  const pickAbility = (positions: Position[]) => {
    const pool = opposition.starterIds.filter((id) =>
      positions.includes(setup.players[id]!.primaryPosition),
    );
    return round6(
      playerAbility(setup.players[rng.pick(pool.length ? pool : opposition.starterIds)]!),
    );
  };
  const weights = situationWeights(player.primaryPosition, s.match.tactics.role);
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
    strengthGap: round6(s.strength[side]! - s.strength[1 - side]!),
    opponents: {
      keeper: pickAbility(['GK']),
      defender: pickAbility(['CB', 'LB', 'RB', 'DM']),
      attacker: pickAbility(['ST', 'LW', 'RW', 'AM']),
    },
  };
}
function openMoment(next: MatchSession): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const rng = createRng(`${setup.seed}:situation:${m.minute}`);
  const weights = situationWeights(player.primaryPosition, m.tactics.role);
  let target = rng.next() * weights.reduce((sum, w) => sum + w.weight, 0);
  let situation = weights[weights.length - 1]!.situation;
  for (const w of weights) {
    target -= w.weight;
    if (target < 0) {
      situation = w.situation;
      break;
    }
  }
  const context = contextFor(next, situation, rng);
  // Place the selected player where the situation happens, attacking the correct end.
  const right = attacksRight(next, player.clubId!, m.minute);
  const width = clamp(
    (rng.next() < 0.5 ? situation.spot.width : 100 - situation.spot.width) + rng.int(-4, 4),
    2,
    98,
  );
  const spot = {
    x: right ? situation.spot.depth : 100 - situation.spot.depth,
    y: width,
  };
  const currentFrame = s.frames[s.frames.length - 1]!;
  const momentFrame: ReplayFrame = {
    ...currentFrame,
    ball: { ...spot },
    players: currentFrame.players.map((p) =>
      p.id === player.id ? { ...p, point: { ...spot } } : p,
    ),
  };
  s.frames[s.frames.length - 1] = momentFrame;
  const moment = {
    id: `${m.id}:moment:${m.minute}`,
    minute: m.minute,
    situationId: situation.id,
    situationKey: `match.situation.${situation.id}`,
    frame: momentFrame,
    budget: context.budget,
    choices: buildChoices(context),
  };
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
    recordShot(next, 1 - side, shooter, 'match.commentary.attempt');
    event(next, template.event, p.clubId!, p.id, line(next, key), outcome);
    if (!success) {
      goal(next, 1 - side, shooter);
      s.stats.errors++;
      addRating(next, 'errors', C.rating.error);
    }
  } else if (template.event === 'shot') {
    if (side === 0) s.stats.homeShots++;
    else s.stats.awayShots++;
    event(next, 'shot', p.clubId!, p.id, line(next, key), outcome, template.target);
    if (success) goal(next, side, p.id, template.target);
  } else event(next, template.event, p.clubId!, p.id, line(next, key), outcome);
  if (template.stat === 'passes') {
    s.stats.passesAttempted++;
    if (success) s.stats.passesCompleted++;
  } else if (template.stat === 'tackles' && success) s.stats.tackles++;
  if (template.stat === 'saves' && success) s.stats.saves++;
  if (success && (template.family === 'goalkeeping' || template.family === 'defending')) {
    // A stop earns credit in proportion to the danger it removed and its difficulty, so its
    // expected value (stop × danger) is the same for every defensive choice.
    const danger =
      template.againstShare *
      moment.budget.against *
      (template.opponent === 'attacker' ? C.decision.defensiveEdge : 1);
    addRating(next, 'saves', (C.rating.stop * danger) / choice.probability);
  }
  // Follow-up chances: created for the selected team, or conceded to the opposition.
  const goalProbability = success
    ? template.direct === 'for'
      ? 0
      : stakes.successGoal
    : stakes.failureGoal;
  if (goalProbability > 0) {
    const self = success && template.scorer === 'self';
    const scorer = self ? p.id : finisher(next, side, rng, p.id);
    const scored = chance(
      next,
      side,
      scorer,
      goalProbability,
      rng,
      self ? 'match.commentary.attempt' : 'match.commentary.chance',
    );
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
  // Expected-value-neutral decision credit: harder successes earn more, safe failures cost more.
  const weight = C.rating.decisionWeight;
  addRating(
    next,
    template.family,
    success ? weight * (1 - choice.probability) : -weight * choice.probability,
  );
}
export function applyMatchCommand(session: MatchSession, command: MatchCommand): MatchSession {
  validateCommand(command);
  const source = session.state;
  const state: MatchState = {
    ...source,
    stats: { ...source.stats },
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
    state.frames.push(frame(setup, m.home, m.away, m.minute));
    if (!state.substituted) {
      state.selectedPlayerMinutes++;
      state.stats.fatigue = round6(
        clamp(
          state.stats.fatigue +
            C.fatiguePerMinute * (1.3 - player.attributes.stamina / 150) +
            (m.tactics.risk === 'high' ? C.highRiskFatigue : 0),
          0,
          100,
        ),
      );
      // Fatigue already starts from the player's condition, so it is the only trigger.
      if (
        m.minute >= C.minimumSubstitutionMinute &&
        m.minute < C.substitutionCutoffMinute &&
        state.stats.fatigue >= C.substitutionFatigue
      ) {
        const team = selectedSide(setup) === 0 ? 'home' : 'away';
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
          state.frames[state.frames.length - 1] = frame(setup, m.home, m.away, m.minute);
          event(next, 'substitution', player.clubId!, player.id, 'match.commentary.substitution');
        }
      }
    }
    if (!state.substituted && state.momentMinutes.includes(m.minute)) openMoment(next);
    else {
      simulateMinuteGoals(next);
      afterMinute(next);
    }
  } else if (command.type === 'choose') {
    if (m.status !== 'decision' || !state.currentMoment) throw new Error('No decision pending');
    resolveChoice(next, command.choiceId);
    simulateMinuteGoals(next);
    // End the highlight at the resolved action or goal, never an unrelated ball position.
    const goalEvent = m.events.findLast((e) => e.minute === m.minute && e.kind === 'goal');
    const actionEvent = m.events.find((e) => e.outcome?.input.momentId === state.currentMoment!.id);
    const currentFrame = state.frames[state.frames.length - 1]!;
    const destination =
      goalEvent?.endPoint ?? actionEvent?.endPoint ?? actionEvent?.point ?? currentFrame.ball;
    state.frames[state.frames.length - 1] = { ...currentFrame, ball: { ...destination } };
    state.currentMoment = null;
    m.status = 'live';
    afterMinute(next);
  } else if (command.type === 'halftime') {
    if (m.status !== 'halftime' || !['motivate', 'role', 'complain'].includes(command.response))
      throw new Error('Invalid halftime response');
    state.managerTrustDelta =
      command.response === 'complain' ? -5 : command.response === 'motivate' ? 3 : 1;
    if (command.response === 'role') {
      m.tactics.role = halftimeRole(player.primaryPosition, m.tactics.role);
      state.expectedGoals = rates(setup, state.strength, m.tactics);
      state.shares = shares(player.primaryPosition, m.tactics.role);
    }
    state.stats.fatigue = round6(Math.max(0, state.stats.fatigue - C.halftimeRecovery));
    m.status = 'live';
    state.captainDecisionPending = state.captain;
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
    state.expectedGoals = rates(setup, state.strength, m.tactics);
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
  // Sessions from another engine cannot replay; callers discard them and keep the world.
  if (session.engine !== MATCH_ENGINE_VERSION) throw new OutdatedMatchSessionError(session.engine);
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
