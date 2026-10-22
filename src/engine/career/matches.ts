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
  rolePosition,
  validateMatchSession,
  type MatchCommand,
  type MatchSession,
  type MatchSetup,
} from '../match';
import { expectedImpact } from '../match/decisions';
import { performanceFame, performanceXp } from '../match/rewards';
import { rolesForPosition } from '../match/roles';
import { commitPlayedFixture, type PlayedFixture } from '../world/simulate';
import { recordEvent } from '../world/events';
import { matchExposure } from '../world/finalize';
import { isKnockoutFixture } from '../world/continental';
import { suspendedFor, type FixtureCard } from '../world/discipline';
import { addXp } from './progression';
import { injure, injuryFactor, revealHidden } from './training';
import { fixtureImportance } from './fixtures';
import { accrueMatchBonuses } from './market/moves';
import { socialMatch } from './social/week';
import { celebrationFame } from './lifestyle/week';
import { honoursMatch } from './honours/week';
import { careerMatchSeed } from './objectives';
export * from './fixtures';
export { careerMatchSeed, previewObjectives } from './objectives';

const C = CONFIG.career;

/** Match setup for a scheduled fixture, seeded by the fixture so a replay is identical. */
export function careerMatchSetup(world: World, fixture: Fixture): MatchSetup {
  return createMatchSetup(
    world,
    fixture.homeId,
    fixture.awayId,
    world.career!.playerId,
    careerMatchSeed(world, fixture),
    {
      neutral: Boolean(fixture.neutral),
      fixture: {
        id: fixture.id,
        competitionId: fixture.competitionId,
        importance: fixtureImportance(world, fixture),
        ...shootoutLeadOf(world, fixture),
      },
      chemistry: Math.round(chemistry(world)),
      captain: world.career!.captaincy?.clubId === world.players[world.career!.playerId]!.clubId,
      // Players banned in this fixture's scope sit it out (the discipline phase).
      suspended: [fixture.homeId, fixture.awayId].flatMap((id) =>
        suspendedFor(world, world.clubs[id]!, fixture),
      ),
    },
  );
}
/**
 * For a match that, level on aggregate at full time, goes to extra time and penalties: the
 * home side's aggregate lead from earlier legs (0 for a single match). A league game, a group
 * game or a tie settled by ranking has none.
 */
export function shootoutLeadOf(
  world: World,
  fixture: Fixture,
): { shootoutLead?: number; extraTimeLead?: number } {
  const tie = fixture.tieId ? world.pyramid?.ties[fixture.tieId] : undefined;
  if (tie) {
    if (fixture.id !== tie.fixtureIds.at(-1)) return {};
    if (tie.drawRule === 'higher-rank') return {};
    let lead = 0;
    for (const id of tie.fixtureIds) {
      if (id === fixture.id) continue;
      const leg = world.fixtures[id]!;
      const score = world.results[id]?.score;
      if (!score) return {};
      lead += leg.homeId === fixture.homeId ? score[0] - score[1] : score[1] - score[0];
    }
    // As the background resolves it (finalize.ts): extra time unless the rule is penalties
    // alone, then penalties unless ranking decides after extra time.
    if (tie.drawRule === 'higher-rank-after-extra-time') return { extraTimeLead: lead };
    if (tie.drawRule === 'penalties') return { shootoutLead: lead };
    return { shootoutLead: lead, extraTimeLead: lead };
  }
  return isKnockoutFixture(world, fixture) ? { shootoutLead: 0 } : {};
}
/** The opening tactics: the first role for the job the setup gives the player (match-17). */
export function defaultTactics(world: World, setup?: MatchSetup): Tactics {
  const position = setup
    ? rolePosition(setup)
    : world.players[world.career!.playerId]!.primaryPosition;
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
  /**
   * A tournament match for the career player's nation (review phase 3): its international
   * match id. The record is the report's alone, not kept in the career's club matches.
   */
  internationalMatchId?: string;
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
  // Minutes from the substitutions (engine match-15 names who comes on, and both managers make
  // changes): a starter plays until taken off, a substitute from the minute they came on. The
  // career player's minutes are the session's own count. Earlier engines only ever replaced the
  // career player, by the one starter who was not on the pitch at kickoff.
  const initial = state.frames[0]!.players.map((p) => p.id);
  const kickoff = new Set(initial);
  const off = new Map<string, number>();
  const on = new Map<string, number>();
  for (const event of state.match.events)
    if (event.kind === 'substitution' && event.playerId) {
      off.set(
        event.playerId,
        event.playerId === playerId ? state.selectedPlayerMinutes : event.minute,
      );
      if (event.receiverId) on.set(event.receiverId, event.minute);
    }
  // A player sent off (match-16) plays until the card; the career player the session's count.
  const sentOff = new Map<string, number>();
  for (const event of state.match.events)
    if (event.kind === 'card' && event.card !== 'yellow' && event.playerId)
      sentOff.set(
        event.playerId,
        event.playerId === playerId ? state.selectedPlayerMinutes : event.minute,
      );
  const minutes = (club: { playerIds: string[] }, starterIds: string[]) => {
    const members = new Set(club.playerIds);
    const result: Record<string, number> = {};
    for (const id of initial)
      if (members.has(id)) result[id] = Math.min(90, sentOff.get(id) ?? off.get(id) ?? 90);
    for (const id of starterIds)
      if (!kickoff.has(id)) {
        const from = on.get(id) ?? state.selectedPlayerMinutes;
        // A substitute sent off plays from coming on until the card.
        result[id] = Math.max(1, Math.min(90, sentOff.get(id) ?? 90) - from);
      }
    return result;
  };
  const cards: FixtureCard[] | undefined = session.setup.discipline
    ? state.match.events.flatMap((event) =>
        event.kind === 'card' && event.card && event.playerId
          ? [
              {
                playerId: event.playerId,
                teamId: event.teamId,
                minute: Math.max(1, event.minute),
                card: event.card,
              },
            ]
          : [],
      )
    : undefined;
  const onPitch = (lineup: { starterIds: string[]; sentOffIds?: string[] }) =>
    lineup.starterIds.filter((id) => !lineup.sentOffIds?.includes(id));
  // Regulation is everything to 90 minutes; extra time played in the session (match-18) is
  // passed apart, as the background would otherwise draw it.
  const goalsOf = (from: number, to: number) =>
    state.match.events
      .filter(
        (event) =>
          event.kind === 'goal' && event.playerId && event.minute >= from && event.minute <= to,
      )
      .map((event) => ({
        playerId: event.playerId!,
        teamId: event.teamId,
        minute: Math.max(1, event.minute),
        ...(event.assistId ? { assistId: event.assistId } : {}),
      }));
  const regulation = state.regulation ?? state.match.score;
  const played: PlayedFixture = {
    score: [regulation[0], regulation[1]],
    goals: goalsOf(0, 90),
    minutes: {
      home: minutes(session.setup.home, state.match.home.starterIds),
      away: minutes(session.setup.away, state.match.away.starterIds),
    },
    onPitch: { home: onPitch(state.match.home), away: onPitch(state.match.away) },
    selected: { playerId, rating: state.report.rating },
    ...(cards ? { cards } : {}),
    ...(state.shootout
      ? {
          shootout: {
            teamId: world.players[playerId]!.clubId!,
            success: state.shootout.success,
          },
        }
      : {}),
    ...(state.regulation
      ? {
          extraTime: {
            score: [
              state.match.score[0] - state.regulation[0],
              state.match.score[1] - state.regulation[1],
            ] as [number, number],
            goals: goalsOf(91, Number.MAX_SAFE_INTEGER),
          },
        }
      : {}),
    ...(state.penalties
      ? { penalties: [state.penalties[0], state.penalties[1]] as [number, number] }
      : {}),
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
  // The same terms as the report's fame, from the finalized contributions.
  const backLine = ['GK', 'CB', 'LB', 'RB'].includes(rolePosition(session.setup));
  // A dismissal (match-16) costs fame and the clean sheet's, as the report shows.
  const dismissed = state.sentOff;
  const fame =
    performanceFame(me.rating, me.goals, me.assists, backLine && conceded === 0 && !dismissed) -
    (dismissed ? CONFIG.match.cards.fame : 0);
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
  // Decisions earn their XP only when the player makes them: a simulated match does not.
  const decisionXp = options.auto
    ? 0
    : decisions.reduce(
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
    ...(state.report.cards?.yellow ? { yellowCards: state.report.cards.yellow } : {}),
    ...(dismissed ? { sentOff: { ...dismissed } } : {}),
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
  careerNews(world, player, record);
  if (career.market.selection.season === world.date.season) career.market.selection.selected++;
  if (career.matches.length > C.historyLimit)
    career.matches.splice(0, career.matches.length - C.historyLimit);
  // Knocks and re-injury after a rushed return.
  const rng = createRng(`${world.seed}:career:match:${fixture.id}`);
  let injury: Injury | null = null;
  const exposure = matchExposure(minutesPlayed);
  if (career.reinjury && rng.next() < career.reinjury.risk * exposure)
    injury = injure(world, 'match', rng, career.reinjury.kind);
  else if (
    rng.next() <
    CONFIG.career.injuries.matchChance * exposure * injuryFactor(career, player)
  )
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

/**
 * The world's news notices a career's first steps (phase 7, C7): the debut and the first
 * goal, as the Chronicle does.
 */
function careerNews(world: World, player: Player, record: CareerMatchRecord): void {
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  const ids = club ? [player.id, club.id, record.opponentId] : [player.id, record.opponentId];
  const params = {
    name: player.name,
    club: club?.name ?? '',
    opponent: world.clubs[record.opponentId]?.name ?? '',
  };
  if (player.stats.appearances === 1) recordEvent(world, 'debut', ids, params);
  if (record.goals > 0 && player.stats.goals === record.goals)
    recordEvent(world, 'first-goal', ids, params);
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
  const setup = careerMatchSetup(world, fixture);
  let session = createMatchSession(setup, defaultTactics(world, setup));
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, autoPlayCommand(session));
  return commitCareerMatch(world, session, { auto: true });
}
