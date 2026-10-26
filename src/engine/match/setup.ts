/**
 * Creating a match: the setup taken from a world (squads, formations, the current engine's
 * flags), and the session it starts (line-ups, strengths, moment minutes, weather, kick-off).
 */
import type { Lineup, World } from '../../model/domain';
import { createRng } from '../rng';
import { managerStrengthBonus, playerAbility, strengthFromAbility } from '../strength';
import { lineupAbility } from '../selection/lineup';
import { FORMATION_SLOTS, type Formation } from '../selection/formations';
import { clubFormation } from '../selection/world';
import {
  rules22,
  CURRENT_SETUP_FLAGS,
  MATCH_ENGINE_VERSION,
  PREVIOUS_MATCH_ENGINE,
  setupEngine,
  rules22,
  type MatchSetup,
  type MatchSession,
  type MatchState,
  type Tactics,
  HEAT_COLUMNS,
  HEAT_ROWS,
} from './types';
import { openingKickoff } from './motion';
import { MATCH_CONFIG as C } from './tuning';
import { validateSetup, validateTactics } from './validation';
import { objectivesFor } from './objectives';
import { intensityFor, pitchStateFor } from './conditions';
import { clamp, round6 } from './decisions';
import { formationLineup } from './lineup';
import { rates, shares, updatePossession } from './rates';
import { INITIAL_RATING_PARTS } from './report';
import { ATTACKERS, copy, rolePosition, selectedSide } from './shared';

/** Thrown before replay when a saved session was produced by a different match engine. */
export class OutdatedMatchSessionError extends Error {
  constructor(found: unknown) {
    super(
      `Match session engine ${typeof found === 'string' ? found : 'unknown'} is not ${MATCH_ENGINE_VERSION} or ${PREVIOUS_MATCH_ENGINE}`,
    );
    this.name = 'OutdatedMatchSessionError';
  }
}

/**
 * A match between two clubs of a world, on the current engine: each manager's formation, and
 * every current engine flag (`CURRENT_SETUP_FLAGS`).
 */
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
    /** The player studied the opponent in training this week (match-19). */
    prepared?: boolean;
    /** The player starts on the bench, with the role they were promised (match-22). */
    bench?: NonNullable<MatchSetup['bench']>['role'];
    /** The career's injury factor and a rushed return's risk (match-22). */
    injury?: MatchSetup['injury'];
    /** Trust with the manager, 0–100 (match-22). */
    trust?: number;
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
    // Each manager fields their shape, and key moments follow the slot the selected player
    // fills in it.
    formations: [clubFormation(world, home), clubFormation(world, away)],
    ...CURRENT_SETUP_FLAGS,
    decidingHeadline: true as const,
    ...(options.prepared ? { prepared: true as const } : {}),
    // The occasions (match-22): the bench, the injury factor, the manager's trust.
    ...(options.bench ? { bench: { role: options.bench } } : {}),
    ...(options.injury ? { injury: options.injury } : {}),
    ...(options.trust !== undefined ? { trust: Math.round(options.trust) } : {}),
    ...(options.suspended?.some((id) => id !== selectedPlayerId)
      ? { suspended: options.suspended.filter((id) => id !== selectedPlayerId) }
      : {}),
    strengthBonus: [
      round6(managerStrengthBonus(world.managers[home.managerId]?.ability ?? 60)),
      round6(managerStrengthBonus(world.managers[away.managerId]?.ability ?? 60)),
    ],
  });
}
export function createMatchSession(setup: MatchSetup, tactics: Tactics): MatchSession {
  // The current engine plays, and the previous one for a setup without its flag (a session
  // saved before the update); a setup from an earlier engine cannot start or replay.
  const engine = setupEngine(setup);
  if (!engine) throw new OutdatedMatchSessionError(undefined);
  validateSetup(setup);
  const selected = setup.players[setup.selectedPlayerId]!;
  // The job they are given (match-17).
  const position = rolePosition(setup);
  validateTactics(tactics, position);
  const formations = setup.formations!;
  const suspended = setup.suspended ?? [];
  // Match-22: a career player left out starts on the bench.
  const bench = rules22(setup) && setup.bench !== undefined;
  const home = formationLineup(
      setup.home,
      setup.players,
      formations[0],
      setup.selectedPlayerId,
      suspended,
      bench,
    ),
    away = formationLineup(
      setup.away,
      setup.players,
      formations[1],
      setup.selectedPlayerId,
      suspended,
      bench,
    );
  const benched =
    bench && ![...home.starterIds, ...away.starterIds].includes(setup.selectedPlayerId);
  const starters = (team: Lineup) => team.starterIds.map((id) => setup.players[id]!);
  // Each starter is valued in their slot, as background results are.
  const strengthOf = (club: MatchSetup['home'], team: Lineup) =>
    strengthFromAbility(
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
    );
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
  // Match-22: a player on the bench has no moments until they come on (bench.ts).
  if (benched) minutes.length = 0;
  // Objectives have their own stream (match-15, decision 3), so the hub can show them before
  // matchday.
  const objectives = objectivesFor(setup.seed, selected, position);
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
  // How hard it rains, blows or snows (match-15), drawn after the weather, and the pitch's
  // state, derived without a draw.
  match.weatherIntensity = intensityFor(rng.next());
  match.pitchState = pitchStateFor(match.weather, match.pitchCondition, match.weatherIntensity);
  const captainId = [...(selectedSide(setup) === 0 ? home : away).starterIds].sort(
    (a, b) =>
      setup.players[b]!.attributes.leadership - setup.players[a]!.attributes.leadership ||
      (a < b ? -1 : 1),
  )[0];
  const session: MatchSession = {
    version: 1,
    engine,
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
      shares: shares(position, tactics.role, rules22(setup)),
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
        rating: rules22(setup) ? C.rating22.base : C.rating.base,
        fatigue: selected.fatigue,
        xg: [0, 0],
        shotsOnTarget: [0, 0],
        keyPasses: 0,
        tacklesAttempted: 0,
        distanceM: 0,
        touches: 0,
        // Engine match-22 counts shots off the woodwork.
        ...(rules22(setup) ? { woodwork: [0, 0] as [number, number] } : {}),
      },
      ratingByMinute: [],
      narration: [],
      heat: new Array<number>(HEAT_COLUMNS * HEAT_ROWS).fill(0),
      ratingParts: Object.fromEntries(
        INITIAL_RATING_PARTS.map((part) => [part, 0]),
      ) as MatchState['ratingParts'],
      report: null,
      momentMinutes: minutes,
      talkOdds: 1,
      consistencyShift,
      managerTrustDelta: 0,
      managerReactionKey: 'match.reaction.manager.steady',
      fanReactionKey: 'match.reaction.fans.steady',
      headlineKey: 'match.headline.steady',
      ...(benched ? { bench: {} } : {}),
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
