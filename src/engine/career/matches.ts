import type {
  Player,
  CareerMatchRecord,
  Fixture,
  Injury,
  Objective,
  Tactics,
  World,
} from '../../model/domain';
import { matchDecisions, recordDecisions } from './coaching';
import { adjustRelationship } from './market/records';
import { chemistry } from './social/dressing';
import { assetEffects } from './lifestyle/catalogue';
import { FORMATION_SLOTS, type Formation } from '../selection/formations';
import { CONFIG } from '../config';
import { createRng } from '../rng';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  validateMatchSession,
  type MatchCommand,
  type MatchSession,
  type MatchSetup,
} from '../match';
import { expectedImpact } from '../match/decisions';
import { performanceFame, performanceXp } from '../match/rewards';
import { rolesForPosition } from '../match/roles';
import { commitPlayedFixture, type PlayedFixture } from '../world/simulate';
import { addXp } from './progression';
import { injure, injuryFactor, revealHidden } from './training';
import { fixtureImportance } from './fixtures';
import { accrueMatchBonuses } from './market/moves';
import { socialMatch } from './social/week';
import { celebrationFame } from './lifestyle/week';
import { honoursMatch } from './honours/week';
export * from './fixtures';

const C = CONFIG.career;

/** Match setup for a scheduled fixture, seeded by the fixture so a replay is identical. */
export function careerMatchSetup(world: World, fixture: Fixture): MatchSetup {
  return createMatchSetup(
    world,
    fixture.homeId,
    fixture.awayId,
    world.career!.playerId,
    `${world.seed}:career:${fixture.id}`,
    {
      neutral: Boolean(fixture.neutral),
      fixture: {
        id: fixture.id,
        competitionId: fixture.competitionId,
        importance: fixtureImportance(world, fixture),
      },
      chemistry: Math.round(chemistry(world)),
    },
  );
}
export function defaultTactics(world: World): Tactics {
  const position = world.players[world.career!.playerId]!.primaryPosition;
  return { role: rolesForPosition(position)[0]!, risk: 'balanced', mentality: 'balanced' };
}

/**
 * The career player's finalized match, own side first: what the report shows and what every
 * reward was derived from. Extra time is simulated after the interactive 90 minutes.
 */
export interface CareerMatchFinal {
  score: [number, number];
  regulation: [number, number];
  extraTime: [number, number] | null;
  penalties: [number, number] | null;
  /** Performance XP before the opposition and importance multipliers. */
  xp: number;
  fame: number;
  rating: number;
  objectives: Objective[];
  extraTimeMinutes: number;
  extraTimeGoals: number;
  extraTimeAssists: number;
}
export interface CareerMatchOutcome {
  record: CareerMatchRecord;
  final: CareerMatchFinal;
  previousLevel: number;
  levelsGained: number;
  injury: Injury | null;
  /** Fame from the signature celebration in a big match. */
  celebrationFame: number;
}

/**
 * Commit a finished career match to the world it was played in: result, standings, every
 * player's statistics, then the career's XP, levels and history. The single write path for
 * the career player's fixtures; the background simulation never resolves a fixture that
 * already has a result. Mutates `world`, which the caller owns.
 */
export function commitCareerMatch(
  world: World,
  session: MatchSession,
  options: { auto?: boolean } = {},
): CareerMatchOutcome {
  const career = world.career;
  const state = session.state;
  const fixtureId = session.setup.fixture?.id;
  const fixture = fixtureId ? world.fixtures[fixtureId] : undefined;
  if (!career || !fixture || state.match.status !== 'finished' || !state.report)
    throw new Error('Not a finished career match');
  if (
    world.results[fixture.id] ||
    session.setup.selectedPlayerId !== career.playerId ||
    session.setup.home.id !== fixture.homeId ||
    session.setup.away.id !== fixture.awayId ||
    session.setup.season !== world.date.season
  )
    throw new Error('Match does not belong to this world');
  if (!options.auto) validateMatchSession(session);
  const playerId = career.playerId;
  const player = world.players[playerId]!;
  const ownHome = player.clubId === fixture.homeId;
  // Minutes: initial starters play 90, except the career player if substituted and the
  // teammate who replaced them.
  const initial = new Set(state.frames[0]!.players.map((p) => p.id));
  const minutes = (starterIds: string[]) => {
    const result: Record<string, number> = {};
    for (const id of starterIds)
      result[id] = initial.has(id) ? 90 : Math.max(1, 90 - state.selectedPlayerMinutes);
    if (
      state.substituted &&
      starterIds === (ownHome ? state.match.home : state.match.away).starterIds
    )
      result[playerId] = state.selectedPlayerMinutes;
    return result;
  };
  const played: PlayedFixture = {
    score: [state.match.score[0], state.match.score[1]],
    goals: state.match.events
      .filter((event) => event.kind === 'goal' && event.playerId)
      .map((event) => ({
        playerId: event.playerId!,
        teamId: event.teamId,
        minute: Math.max(1, event.minute),
        ...(event.assistId ? { assistId: event.assistId } : {}),
      })),
    minutes: {
      home: minutes(state.match.home.starterIds),
      away: minutes(state.match.away.starterIds),
    },
    onPitch: {
      home: [...state.match.home.starterIds],
      away: [...state.match.away.starterIds],
    },
    selected: { playerId, rating: state.report.rating },
  };
  const finalized = commitPlayedFixture(world, fixture.id, played);
  const result = world.results[fixture.id]!;
  const own = ownHome ? 0 : 1;
  const ownSide = <T>(pair: [T, T]): [T, T] => [pair[own]!, pair[1 - own]!];
  // Every reward below is derived from the finalized contributions, extra time included.
  const me = finalized.participants.find((participant) => participant.playerId === playerId)!;
  const conceded = (me.extraTimeMinutes ? finalized.score : finalized.regulation)[1 - own]!;
  const objectives = state.report.objectives.map((objective) => ({
    ...objective,
    progress:
      objective.kind === 'rating'
        ? me.rating
        : objective.kind === 'clean-sheet'
          ? conceded === 0
            ? 1
            : 0
          : objective.progress,
  }));
  const minutesPlayed = me.minutes + me.extraTimeMinutes;
  const performance = performanceXp({
    minutes: minutesPlayed,
    rating: me.rating,
    goals: me.goals,
    assists: me.assists,
    objectives: objectives.filter((objective) => objective.progress >= objective.target).length,
  });
  const fame = performanceFame(me.rating, me.goals);
  const opponentId = ownHome ? fixture.awayId : fixture.homeId;
  const outcome =
    result.winnerId === player.clubId ? 'win' : result.winnerId === opponentId ? 'loss' : 'draw';
  // XP: the report's performance XP plus the key decisions that came off, weighted by the
  // opposition's standing and the occasion.
  const [low, high] = C.oppositionRange;
  const opposition = Math.min(
    high,
    Math.max(low, C.oppositionBase + world.clubs[opponentId]!.reputation * C.oppositionSlope),
  );
  const decisions = matchDecisions(session, world.date);
  const analyst = assetEffects(career.style?.assets ?? []).decisionXp;
  const decisionXp = decisions.reduce(
    (sum, decision) =>
      sum +
      (decision.success
        ? (decision.probability < 0.5 ? C.decisionXp.underdog : C.decisionXp.success) + analyst
        : 0),
    0,
  );
  const importance = session.setup.fixture!.importance;
  const xp = Math.round((performance + decisionXp) * opposition * importance);
  const previousLevel = career.level;
  const levelsGained = addXp(career, xp);
  career.fame += fame;
  const record: CareerMatchRecord = {
    fixtureId: fixture.id,
    season: world.date.season,
    week: world.date.week,
    competitionId: fixture.competitionId,
    opponentId,
    home: ownHome,
    score: [result.score[own]!, result.score[1 - own]!],
    result: outcome,
    ...(result.penalties
      ? { decided: 'penalties' as const }
      : result.extraTime
        ? { decided: 'extra-time' as const }
        : {}),
    minutes: minutesPlayed,
    rating: me.rating,
    goals: me.goals,
    assists: me.assists,
    cleanSheet: result.score[1 - own] === 0,
    xp,
    auto: Boolean(options.auto),
    passes: [state.stats.passesCompleted, state.stats.passesAttempted],
    tackles: state.stats.tackles,
  };
  career.matches.push(record);
  recordDecisions(career, decisions);
  // The half-time talk and the response to a substitution reach the manager.
  if (session.state.managerTrustDelta)
    adjustRelationship(
      world,
      'manager',
      world.clubs[player.clubId!]!.managerId,
      session.state.managerTrustDelta,
    );
  learnSlot(session, player, minutesPlayed);
  accrueMatchBonuses(world, record.goals, record.cleanSheet);
  socialMatch(world, record, fixture);
  const signature = celebrationFame(world, record.goals, importance);
  honoursMatch(world, session, record, importance);
  if (career.market.selection.season === world.date.season) career.market.selection.selected++;
  if (career.matches.length > C.historyLimit)
    career.matches.splice(0, career.matches.length - C.historyLimit);
  // Knocks and re-injury after a rushed return.
  const rng = createRng(`${world.seed}:career:match:${fixture.id}`);
  let injury: Injury | null = null;
  if (career.reinjury && rng.next() < career.reinjury.risk)
    injury = injure(world, 'match', rng, career.reinjury.kind);
  else if (rng.next() < CONFIG.career.injuries.matchChance * injuryFactor(career, player))
    injury = injure(world, 'match', rng);
  revealHidden(player);
  const final: CareerMatchFinal = {
    score: ownSide(finalized.score),
    regulation: ownSide(finalized.regulation),
    extraTime: finalized.extraTime && ownSide(finalized.extraTime),
    penalties: finalized.penalties && ownSide(finalized.penalties),
    xp: performance,
    fame,
    rating: me.rating,
    objectives,
    extraTimeMinutes: me.extraTimeMinutes,
    extraTimeGoals: me.extraTimeGoals,
    extraTimeAssists: me.extraTimeAssists,
  };
  return { record, final, previousLevel, levelsGained, injury, celebrationFame: signature };
}

/** Minutes in a secondary position teach it: familiarity grows with time played there. */
function learnSlot(session: MatchSession, player: Player, minutes: number): void {
  const own =
    player.clubId === session.setup.home.id ? session.state.match.home : session.state.match.away;
  const index = own.starterIds.indexOf(player.id);
  const formation = own.formation as Formation | undefined;
  if (index < 0 || !formation || !FORMATION_SLOTS[formation] || minutes <= 0) return;
  const slot = FORMATION_SLOTS[formation][index]?.position;
  if (
    !slot ||
    slot === player.primaryPosition ||
    (slot === 'GK') !== (player.primaryPosition === 'GK')
  )
    return;
  const gain = Math.round(
    (CONFIG.career.training.familiarityPerMatch * Math.min(90, minutes)) / 90,
  );
  if (!gain) return;
  const entry = player.secondaryPositions.find((p) => p.position === slot);
  const familiarity = Math.min(100, (entry?.familiarity ?? 0) + gain);
  if (entry) entry.familiarity = familiarity;
  else player.secondaryPositions.push({ position: slot, familiarity });
}
/** Headless decision policy for simulated career matches: best expected goal difference. */
export function autoPlayCommand(session: MatchSession): MatchCommand {
  const s = session.state;
  if (s.match.status === 'preview') return { type: 'kickoff' };
  if (s.match.status === 'halftime') return { type: 'halftime', response: 'motivate' };
  if (s.substitutionDecisionPending) return { type: 'substitution', response: 'accept' };
  if (s.captainDecisionPending) {
    const own =
      session.setup.players[session.setup.selectedPlayerId]!.clubId === session.setup.home.id
        ? 0
        : 1;
    const behind = s.match.score[own]! < s.match.score[1 - own]!;
    return { type: 'captain', instruction: behind ? 'push' : 'calm' };
  }
  if (s.currentMoment) {
    // Any choice close to the best in expected goals is a reasonable one; which of them is
    // taken is drawn by the moment's seed, so simulated careers shoot, pass and carry the way
    // a player would rather than always making the single best call.
    const ranked = [...s.currentMoment.choices]
      .map((choice) => ({ choice, net: expectedImpact(choice).net }))
      .sort((a, b) => b.net - a.net || (a.choice.id < b.choice.id ? -1 : 1));
    const best = ranked[0]!.net;
    const margin = CONFIG.match.autoPlayMargin;
    const near = ranked.filter((entry) => entry.net >= best - margin);
    const pick = createRng(`${session.setup.seed}:auto:${s.currentMoment.id}`).int(
      0,
      near.length - 1,
    );
    return { type: 'choose', choiceId: near[pick]!.choice.id };
  }
  return { type: 'advance' };
}
/** Play the pending career fixture with the headless policy and commit it. */
export function autoPlayCareerFixture(world: World, fixture: Fixture): CareerMatchOutcome {
  let session = createMatchSession(careerMatchSetup(world, fixture), defaultTactics(world));
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, autoPlayCommand(session));
  return commitCareerMatch(world, session, { auto: true });
}
