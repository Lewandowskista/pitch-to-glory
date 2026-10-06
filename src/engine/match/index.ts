import type {
  Club,
  World,
  Player,
  Lineup,
  ReplayFrame,
  Tactics,
  ProbabilityFactor,
  DecisionChoice,
  MatchEvent,
  MatchReport,
} from '../../model/domain';
import { createRng } from '../rng';
import type { MatchSetup, MatchSession, MatchState, MatchCommand } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { validateSetup, validateTactics, validateCommand, validateJson } from './validation';
export * from './types';
export { MATCH_CONFIG } from './tuning';
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function lineup(club: Club, players: Record<string, Player>, selected: string): Lineup {
  const available = club.playerIds.filter((id) => {
    const p = players[id];
    return p && !p.retired && !p.injuryId && p.fitness > 0;
  });
  if (available.length < 11) throw new Error('A match requires eleven available players per team');
  const keeper = available.find((id) => players[id]!.primaryPosition === 'GK');
  if (!keeper) throw new Error('A match requires a goalkeeper');
  const starters = [keeper];
  for (const position of ['LB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'LW', 'ST', 'RW']) {
    const candidates = available.filter(
      (id) => !starters.includes(id) && players[id]!.primaryPosition !== 'GK',
    );
    candidates.sort((a, b) => {
      const fit = (id: string) =>
        players[id]!.primaryPosition === position
          ? 100
          : (players[id]!.secondaryPositions.find((p) => p.position === position)?.familiarity ??
            0);
      return fit(b) - fit(a) || players[b]!.fitness - players[a]!.fitness || a.localeCompare(b);
    });
    if (candidates[0]) starters.push(candidates[0]);
  }
  if (available.includes(selected) && !starters.includes(selected)) {
    if (players[selected]!.primaryPosition === 'GK') starters[0] = selected;
    else {
      const position = players[selected]!.primaryPosition;
      const samePosition = starters.findIndex((id) => players[id]!.primaryPosition === position);
      const compatible = ['AM', 'CM', 'DM'].includes(position)
        ? 6
        : ['CB', 'LB', 'RB'].includes(position)
          ? 3
          : 9;
      starters[samePosition > 0 ? samePosition : compatible] = selected;
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
    neutral: false,
  });
}
function rates(setup: MatchSetup, tactics: Tactics): [number, number] {
  const gap = clamp(setup.home.reputation - setup.away.reputation, -75, 75);
  let share =
    1 / (1 + Math.exp(-(gap * C.reputationSlope + (setup.neutral ? 0 : C.homeAdvantage))));
  const selectedHome = setup.players[setup.selectedPlayerId]!.clubId === setup.home.id;
  const adjustment =
    (tactics.mentality === 'attacking' ? 0.035 : tactics.mentality === 'defensive' ? -0.035 : 0) +
    (tactics.role === 'cut-inside' ? 0.015 : tactics.role === 'track-back' ? -0.015 : 0);
  share = clamp(share + (selectedHome ? adjustment : -adjustment), 0.12, 0.88);
  const total =
    C.goalsPerMatch * (tactics.risk === 'high' ? 1.09 : tactics.risk === 'low' ? 0.94 : 1);
  return [total * share, total * (1 - share)];
}
export function createMatchSession(setup: MatchSetup, tactics: Tactics): MatchSession {
  validateSetup(setup);
  validateTactics(tactics);
  const home = lineup(setup.home, setup.players, setup.selectedPlayerId),
    away = lineup(setup.away, setup.players, setup.selectedPlayerId);
  const rng = createRng(`${setup.seed}:preview`);
  const player = setup.players[setup.selectedPlayerId]!;
  const involvement =
    player.primaryPosition === 'GK'
      ? 0
      : ['ST', 'AM', 'LW', 'RW'].includes(player.primaryPosition)
        ? 3
        : 1;
  const count = clamp(
    8 + involvement + Math.round((player.form - 50) / 15) + rng.int(-1, 1),
    C.minimumMoments,
    C.maximumMoments,
  );
  const minutes = Array.from(
    { length: count },
    (_, i) => Math.round(6 + (i * 78) / (count - 1)) + rng.int(-2, 2),
  );
  const selected = setup.players[setup.selectedPlayerId]!;
  const objectives = [
    { id: 'rating', kind: 'rating' as const, target: 7, progress: 0 },
    {
      id: selected.primaryPosition === 'GK' ? 'clean-sheet' : 'passing',
      kind: selected.primaryPosition === 'GK' ? ('clean-sheet' as const) : ('passing' as const),
      target: selected.primaryPosition === 'GK' ? 1 : 85,
      progress: 0,
    },
  ];
  const match: MatchState['match'] = {
    id: `match:${setup.seed}`,
    fixtureId: `friendly:${setup.seed}`,
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
  const captainId = [...(selected.clubId === setup.home.id ? home : away).starterIds].sort(
    (a, b) =>
      setup.players[b]!.attributes.leadership - setup.players[a]!.attributes.leadership ||
      a.localeCompare(b),
  )[0];
  return {
    version: 1,
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
      expectedGoals: rates(setup, tactics),
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
        rating: 6.5,
        fatigue: selected.fatigue,
      },
      report: null,
      momentMinutes: minutes,
      managerTrustDelta: 0,
      managerReactionKey: 'match.reaction.manager.steady',
      fanReactionKey: 'match.reaction.fans.steady',
      headlineKey: 'match.headline.steady',
    },
  };
}
function frame(setup: MatchSetup, home: Lineup, away: Lineup, minute: number): ReplayFrame {
  const rng = createRng(`${setup.seed}:frame:${minute}`);
  const positions = [
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
  return {
    timeMs: minute * 60000,
    ball: { x: rng.int(20, 80), y: rng.int(12, 88) },
    players: [home, away].flatMap((team, side) =>
      team.starterIds.map((id, i) => {
        const base = positions[i]!;
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
function choices(session: MatchSession): DecisionChoice[] {
  const s = session.state,
    p = session.setup.players[session.setup.selectedPlayerId]!;
  const opponent = p.clubId === session.setup.home.id ? session.setup.away : session.setup.home;
  const keeper = p.primaryPosition === 'GK',
    defender = ['CB', 'LB', 'RB', 'DM'].includes(p.primaryPosition);
  const actions = keeper
    ? ['hold', 'parry', 'rush', 'distribute']
    : defender
      ? ['intercept', 'tackle', 'clear', 'pass']
      : ['pass', 'near', 'far', 'dribble'];
  return actions.map((id) => {
    const attribute =
      id === 'hold'
        ? p.keeperAttributes.handling
        : id === 'parry'
          ? p.keeperAttributes.reflexes
          : id === 'rush'
            ? p.keeperAttributes.oneOnOnes
            : id === 'distribute'
              ? p.keeperAttributes.kicking
              : id === 'pass'
                ? (p.attributes.passing + p.attributes.vision) / 2
                : id === 'dribble'
                  ? (p.attributes.dribbling + p.attributes.agility) / 2
                  : id === 'intercept'
                    ? (p.attributes.positioning + p.attributes.decisions) / 2
                    : id === 'tackle'
                      ? p.attributes.tackling
                      : id === 'clear'
                        ? p.attributes.composure
                        : id === 'far'
                          ? (p.attributes.finishing + p.attributes.composure) / 2
                          : p.attributes.finishing;
    const traitPattern =
      id === 'far'
        ? /finesse/i
        : id === 'dribble'
          ? /trickster/i
          : ['intercept', 'tackle'].includes(id)
            ? /ball.winner/i
            : keeper
              ? /safe.hands/i
              : id === 'pass'
                ? /playmaker/i
                : /finisher/i;
    const trait = p.traits.some((t) => traitPattern.test(t)) ? C.traitBonus : 0;
    const shot = ['near', 'far'].includes(id);
    const base = shot
      ? ((s.expectedGoals[p.clubId === session.setup.home.id ? 0 : 1] * C.personalGoalShare) /
          s.momentMinutes.length) *
        (id === 'near' ? 1.1 : 0.9)
      : id === 'clear'
        ? 0.78
        : id === 'pass' || id === 'distribute'
          ? 0.8
          : id === 'rush'
            ? 0.52
            : C.baseDecisionProbability;
    const role = s.match.tactics.role;
    const roleBonus =
      (role === 'cut-inside' && shot) ||
      (role === 'track-back' && defender) ||
      (role === 'sweeper-keeper' && id === 'rush') ||
      (role === 'hug-touchline' && id === 'pass') ||
      (role === 'playmaker' && id === 'pass') ||
      (role === 'run-behind' && id === 'dribble') ||
      (role === 'target-player' && id === 'near') ||
      (role === 'ball-winner' && id === 'tackle') ||
      (role === 'hold-position' && id === 'intercept') ||
      (role === 'push-forward' && id === 'pass') ||
      (role === 'shot-stopper' && id === 'parry') ||
      (role === 'safe-distribution' && id === 'distribute')
        ? shot
          ? 0.008
          : 0.04
        : 0;
    const risk =
      s.match.tactics.risk === 'high'
        ? shot
          ? 0.008
          : -0.04
        : s.match.tactics.risk === 'low'
          ? shot
            ? -0.008
            : 0.04
          : 0;
    const factors: ProbabilityFactor[] = [
      { labelKey: 'match.factor.base', source: 'attribute', contribution: base },
      {
        labelKey: 'match.factor.attribute',
        source: 'attribute',
        contribution: (attribute - 50) * (shot ? C.attributeScale / 10 : C.attributeScale),
      },
      { labelKey: 'match.factor.trait', source: 'trait', contribution: trait },
      {
        labelKey: 'match.factor.defender',
        source: 'defender',
        contribution: -(opponent.reputation - 50) * (shot ? C.defenderScale / 10 : C.defenderScale),
      },
      {
        labelKey: 'match.factor.fatigue',
        source: 'fatigue',
        contribution: -s.stats.fatigue * (shot ? C.fatigueScale / 10 : C.fatigueScale),
      },
      { labelKey: 'match.factor.risk', source: 'attribute', contribution: risk },
      { labelKey: 'match.factor.role', source: 'attribute', contribution: roleBonus },
      {
        labelKey: 'match.factor.weather',
        source: 'attribute',
        contribution: s.match.weather === 'clear' ? 0 : shot ? -0.004 : -0.025,
      },
    ];
    const raw = factors.reduce((sum, f) => sum + f.contribution, 0),
      probability = clamp(raw, shot ? 0.02 : 0.12, 0.94);
    if (raw !== probability)
      factors.push({
        labelKey: 'match.factor.limit',
        source: 'attribute',
        contribution: probability - raw,
      });
    return { id, labelKey: `match.choice.${id}`, probability, factors, requiredTraitId: null };
  });
}
function event(
  session: MatchSession,
  kind: MatchEvent['kind'],
  teamId: string,
  playerId: string | null,
  commentaryKey: string,
  outcome: MatchEvent['outcome'] = null,
): void {
  const m = session.state.match;
  const currentFrame = session.state.frames[session.state.frames.length - 1]!;
  const point = {
    ...(currentFrame.players.find((player) => player.id === playerId)?.point ?? currentFrame.ball),
  };
  const direction = (teamId === session.setup.home.id) !== m.minute > 45 ? 1 : -1;
  let endPoint: { x: number; y: number } | undefined;
  if (kind === 'pass') {
    const team = teamId === session.setup.home.id ? m.home : m.away;
    const receivers = currentFrame.players.filter(
      (player) =>
        player.id !== playerId &&
        team.starterIds.includes(player.id) &&
        session.setup.players[player.id]!.primaryPosition !== 'GK',
    );
    receivers.sort((a, b) => {
      const distance = (player: typeof a) =>
        Math.hypot(player.point.x - point.x, player.point.y - point.y) +
        ((player.point.x - point.x) * direction < 0 ? 20 : 0);
      return distance(a) - distance(b) || a.id.localeCompare(b.id);
    });
    endPoint = {
      ...(receivers[0]?.point ?? { x: clamp(point.x + direction * 12, 0, 100), y: point.y }),
    };
  } else if (kind === 'shot' || kind === 'goal') {
    endPoint = {
      x: direction > 0 ? 100 : 0,
      y: outcome?.input.choiceId === 'near' ? 47 : outcome?.input.choiceId === 'far' ? 53 : 50,
    };
  }
  m.events.push({
    id: `${m.id}:event:${m.events.length}`,
    minute: m.minute,
    kind,
    teamId,
    playerId,
    point,
    ...(endPoint ? { endPoint } : {}),
    commentaryKey,
    outcome,
  });
}
function goal(session: MatchSession, side: number, playerId: string | null): void {
  const m = session.state.match;
  m.score[side]!++;
  event(
    session,
    'goal',
    side === 0 ? session.setup.home.id : session.setup.away.id,
    playerId,
    'match.commentary.goal',
  );
  if (playerId === session.setup.selectedPlayerId) session.state.stats.goals++;
  const currentFrame = session.state.frames[session.state.frames.length - 1]!;
  session.state.frames[session.state.frames.length - 1] = {
    ...currentFrame,
    ball: { ...m.events[m.events.length - 1]!.endPoint! },
  };
}
function simulateMinuteGoals(session: MatchSession, quality = 0, keeperSave = false): void {
  const s = session.state,
    rng = createRng(`${session.setup.seed}:minute:${s.match.minute}`);
  const selected = session.setup.players[session.setup.selectedPlayerId]!,
    selectedHome = selected.clubId === session.setup.home.id;
  for (let side = 0; side < 2; side++) {
    const own = (side === 0) === selectedHome;
    // Personal attacking moments replace a portion of the team's shot budget.
    const attacking =
      !['GK', 'CB', 'LB', 'RB', 'DM'].includes(selected.primaryPosition) && !s.substituted;
    const defensive =
      !s.substituted && ['GK', 'CB', 'LB', 'RB', 'DM'].includes(selected.primaryPosition);
    const share = (own && attacking) || (!own && defensive) ? C.personalGoalShare : 0;
    const base = (s.expectedGoals[side]! * (1 - share)) / 90;
    const chance = clamp(base * (own ? 1 + quality : keeperSave ? 0.15 : 1), 0, 0.2);
    if (rng.next() < chance / C.shotConversion) {
      const team = side === 0 ? s.match.home : s.match.away;
      const candidates = team.starterIds.filter(
        (id) =>
          session.setup.players[id]!.primaryPosition !== 'GK' && (!attacking || id !== selected.id),
      );
      const id = rng.pick(candidates);
      recordShot(session, side, id);
      if (rng.next() < C.shotConversion) goal(session, side, id);
    }
  }
  // Ordinary passes are real logged actions and contribute to the pass map.
  if (!s.substituted && selected.primaryPosition !== 'GK' && rng.next() < C.passPerMinute) {
    const probability = clamp(
      0.68 + selected.attributes.passing * 0.002 - s.stats.fatigue * 0.0008,
      0.4,
      0.96,
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
      success ? 'match.commentary.success' : 'match.commentary.failure',
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
  s.match.momentum = clamp(
    50 + (s.match.score[0] - s.match.score[1]) * 9 + rng.int(-15, 15),
    5,
    95,
  );
  s.stats.homePossession = Math.round(
    clamp(50 + (session.setup.home.reputation - session.setup.away.reputation) * 0.22, 30, 70),
  );
  s.match.rng = rng.snapshot();
}
function recordShot(session: MatchSession, side: number, id: string): void {
  if (side === 0) session.state.stats.homeShots++;
  else session.state.stats.awayShots++;
  event(
    session,
    'shot',
    side === 0 ? session.setup.home.id : session.setup.away.id,
    id,
    'match.commentary.shot',
  );
}
function afterMinute(session: MatchSession) {
  const s = session.state;
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
function report(session: MatchSession): MatchReport {
  const s = session.state,
    m = s.match,
    id = session.setup.selectedPlayerId;
  const rating = Math.round(clamp(s.stats.rating, 3, 10) * 10) / 10;
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
  const ownSide = session.setup.players[id]!.clubId === session.setup.home.id ? 0 : 1;
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
  return {
    playerId: id,
    rating: Math.round(rating * 10) / 10,
    ratingFactors: [
      {
        labelKey: 'match.rating.decisions',
        source: 'attribute',
        contribution: rating - C.ratingBase,
      },
      {
        labelKey: 'match.rating.base',
        source: 'attribute',
        contribution: C.ratingBase,
      },
    ],
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
export function applyMatchCommand(session: MatchSession, command: MatchCommand): MatchSession {
  validateCommand(command);
  const source = session.state;
  const state: MatchState = {
    ...source,
    stats: { ...source.stats },
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
  if (!command || typeof command !== 'object') throw new Error('Invalid match command');
  if (command.type === 'kickoff') {
    if (m.status !== 'preview') throw new Error('Match already started');
    m.status = 'live';
  } else if (command.type === 'advance') {
    if (m.status !== 'live' || state.captainDecisionPending || state.substitutionDecisionPending)
      throw new Error('Cannot advance paused match');
    m.minute++;
    state.frames.push(frame(session.setup, m.home, m.away, m.minute));
    if (!state.substituted) {
      state.selectedPlayerMinutes++;
      const p = session.setup.players[session.setup.selectedPlayerId]!;
      state.stats.fatigue = clamp(
        state.stats.fatigue +
          C.fatiguePerMinute * (1.3 - p.attributes.stamina / 150) +
          (m.tactics.risk === 'high' ? 0.08 : 0),
        0,
        100,
      );
      if (
        m.minute >= C.minimumSubstitutionMinute &&
        (state.stats.fatigue >= C.substitutionFatigue || p.fitness < 50)
      ) {
        const team = p.clubId === session.setup.home.id ? 'home' : 'away';
        const current = m[team];
        const replacement = current.benchIds.find(
          (id) =>
            (session.setup.players[id]!.primaryPosition === 'GK') === (p.primaryPosition === 'GK'),
        );
        if (replacement) {
          state.substituted = true;
          state.substitutionDecisionPending = true;
          m[team] = {
            ...current,
            starterIds: current.starterIds.map((id) => (id === p.id ? replacement : id)),
            benchIds: current.benchIds.filter((id) => id !== replacement),
          };
          state.frames[state.frames.length - 1] = frame(session.setup, m.home, m.away, m.minute);
          event(next, 'substitution', p.clubId!, p.id, 'match.commentary.substitution');
        }
      }
    }
    if (!state.substituted && state.momentMinutes.includes(m.minute)) {
      const currentFrame = state.frames[state.frames.length - 1]!;
      const selectedPoint = currentFrame.players.find(
        (player) => player.id === session.setup.selectedPlayerId,
      )!.point;
      state.frames[state.frames.length - 1] = { ...currentFrame, ball: { ...selectedPoint } };
      const moment = {
        id: `${m.id}:moment:${m.minute}`,
        minute: m.minute,
        situationKey:
          session.setup.players[session.setup.selectedPlayerId]!.primaryPosition === 'GK'
            ? 'match.situation.keeper'
            : 'match.situation.outfield',
        frame: state.frames[state.frames.length - 1]!,
        choices: choices(next),
      };
      state.currentMoment = moment;
      m.keyMoments.push(moment);
      m.status = 'decision';
    } else {
      simulateMinuteGoals(next);
      afterMinute(next);
    }
  } else if (command.type === 'choose') {
    if (m.status !== 'decision' || !state.currentMoment) throw new Error('No decision pending');
    const choice = state.currentMoment.choices.find((c) => c.id === command.choiceId);
    if (!choice) throw new Error('Invalid decision choice');
    const rng = createRng(`${session.setup.seed}:decision:${m.minute}`),
      roll = rng.next(),
      success = roll < choice.probability;
    const p = session.setup.players[session.setup.selectedPlayerId]!,
      keeper = p.primaryPosition === 'GK',
      defender = ['CB', 'LB', 'RB', 'DM'].includes(p.primaryPosition);
    const shot = ['near', 'far'].includes(choice.id),
      pass = ['pass', 'distribute'].includes(choice.id),
      side = p.clubId === session.setup.home.id ? 0 : 1;
    const outcome = {
      input: { momentId: state.currentMoment.id, choiceId: choice.id },
      success,
      roll,
      probability: choice.probability,
      factors: choice.factors,
    };
    event(
      next,
      shot ? 'shot' : pass ? 'pass' : 'tackle',
      p.clubId!,
      p.id,
      success ? 'match.commentary.success' : 'match.commentary.failure',
      outcome,
    );
    if (shot) {
      if (side === 0) state.stats.homeShots++;
      else state.stats.awayShots++;
      if (success) goal(next, side, p.id);
    } else if (pass) {
      state.stats.passesAttempted++;
      if (success) state.stats.passesCompleted++;
    } else if (success && !keeper && choice.id !== 'dribble') state.stats.tackles++;
    if ((keeper || defender) && !pass) {
      const opposition = side === 0 ? m.away : m.home;
      const shooter = rng.pick(
        opposition.starterIds.filter((id) => session.setup.players[id]!.primaryPosition !== 'GK'),
      );
      if (keeper || !success) {
        recordShot(next, 1 - side, shooter);
        if (keeper && success) state.stats.saves++;
        if (!success && rng.next() < C.defensiveFailureConversion) goal(next, 1 - side, shooter);
      }
    }
    if (!shot && !keeper && !defender && success) {
      const conversion =
        (state.expectedGoals[side]! * C.personalGoalShare) /
        state.momentMinutes.length /
        choice.probability;
      if (rng.next() < conversion) {
        const teammate = rng.pick(
          (side === 0 ? m.home : m.away).starterIds.filter(
            (id) => id !== p.id && session.setup.players[id]!.primaryPosition !== 'GK',
          ),
        );
        recordShot(next, side, pass ? teammate : p.id);
        goal(next, side, pass ? teammate : p.id);
        if (pass) state.stats.assists++;
      }
    }
    state.stats.rating = clamp(
      state.stats.rating +
        (success ? C.decisionRatingGain : -C.decisionRatingLoss) +
        (shot && success ? C.scoringRatingBonus : 0),
      3,
      10,
    );
    simulateMinuteGoals(
      next,
      defender ? (success ? 0.02 : -0.02) : 0,
      keeper && choice.id !== 'distribute' && success,
    );
    // End the highlight at the resolved action or goal, never an unrelated ball position.
    const goalEvent = m.events.findLast(
      (event) => event.minute === m.minute && event.kind === 'goal',
    );
    const actionEvent = m.events.find(
      (event) => event.outcome?.input.momentId === state.currentMoment!.id,
    );
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
      m.tactics.role =
        session.setup.players[session.setup.selectedPlayerId]!.primaryPosition === 'GK'
          ? 'sweeper-keeper'
          : ['CB', 'LB', 'RB', 'DM'].includes(
                session.setup.players[session.setup.selectedPlayerId]!.primaryPosition,
              )
            ? 'track-back'
            : 'cut-inside';
      state.expectedGoals = rates(session.setup, m.tactics);
    }
    state.stats.fatigue = Math.max(0, state.stats.fatigue - 8);
    m.status = 'live';
    state.captainDecisionPending = state.captain;
  } else if (command.type === 'substitution') {
    if (!state.substitutionDecisionPending || !['accept', 'encourage'].includes(command.response))
      throw new Error('No substitution response pending');
    state.substitutionDecisionPending = false;
    if (command.response === 'encourage') state.managerTrustDelta += 1;
  } else if (command.type === 'captain') {
    if (!state.captainDecisionPending || !['push', 'calm'].includes(command.instruction))
      throw new Error('No captain decision pending');
    state.captainDecisionPending = false;
    m.tactics.mentality = command.instruction === 'push' ? 'attacking' : 'balanced';
    state.expectedGoals = rates(session.setup, m.tactics);
  } else throw new Error('Unknown match command');
  return next;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function validateMatchSession(value: unknown): MatchSession {
  validateJson(value);
  if (!value || typeof value !== 'object') throw new Error('Invalid match session');
  const session = value as MatchSession;
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
  const setup = session.setup;
  let replay = createMatchSession(setup, session.initialTactics);
  for (const command of session.commands) replay = applyMatchCommand(replay, command);
  if (canonical(replay) !== canonical(session))
    throw new Error('Match session differs from deterministic replay');
  return replay;
}
