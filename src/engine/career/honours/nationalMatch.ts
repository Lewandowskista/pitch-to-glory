import type {
  CareerMatchRecord,
  Club,
  Hex,
  InternationalMatch,
  Nation,
  Player,
  Position,
  TournamentFixture,
  WindowFixture,
  World,
} from '../../../model/domain';
import { CONFIG } from '../../config';
import { createRng } from '../../rng';
import { generateCrest } from '../../assets/crest';
import { generateKits } from '../../assets/kit';
import { generatePlayer } from '../../world/generate';
import { STYLES } from '../../world/catalog';
import { FORMATIONS, type Formation } from '../../selection/formations';
import type { MatchSession, MatchSetup } from '../../match/types';
import { sessionPenalties, validateMatchSession } from '../../match';
import { performanceXp } from '../../match/rewards';
import { matchDecisions, recordDecisions } from '../coaching';
import { assetEffects } from '../lifestyle/catalogue';
import { chronicle } from './chronicle';
import { captureMoments } from './moments';
import type { CareerMatchOutcome } from '../matches';
import {
  nationOf,
  pendingTournamentFixture,
  pendingWindowFixture,
  recordTournamentMatch,
  recordWindowMatch,
  selectSquad,
  tournamentStakes,
} from './international';

/**
 * A tournament match the career player plays (review phase 3, step 3.2): the two nations as
 * the match engine's sides. A nation is shaped like a club from its colours; its squad is its
 * selected players, and a guest nation (or a home nation short of players) is completed with
 * generated players of its rating, the same for the whole tournament.
 */
const I = CONFIG.career.honours.international;
const X = CONFIG.career;
const LINES = {
  GK: ['GK'],
  DEF: ['CB', 'CB', 'LB', 'RB', 'CB', 'LB', 'RB', 'CB'],
  MID: ['CM', 'DM', 'AM', 'CM', 'DM', 'CM', 'AM'],
  ATT: ['ST', 'LW', 'RW', 'ST', 'LW'],
} as const satisfies Record<keyof typeof I.squad, readonly Position[]>;
const LINE_OF: Record<Position, keyof typeof LINES> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};
const G = CONFIG.world.generation;

/** A nation's third kit colour: white, or near-black against a white. */
const third = (colors: [Hex, Hex]): Hex =>
  colors.some((color) => color.toLowerCase() === '#ffffff') ? '#16181d' : '#ffffff';

/**
 * A nation's way of playing, drawn once per nation and seed. Tournaments opened before nations
 * had styles keep them all balanced, so a match saved part-way through keeps its sides; window
 * matches came with styles.
 */
export const nationStyle = (world: World, nation: Nation): Club['playingStyle'] =>
  world.international?.live?.styled || world.international?.window
    ? createRng(`${world.seed}:${nation.id}:style`).pick(STYLES)
    : 'balanced';

/** A nation as a club for the match engine: its colours, a plain kit, its style and rating. */
export function nationClub(world: World, nation: Nation, playerIds: string[]): Club {
  const rng = createRng(`${world.seed}:${nation.id}:shirt`);
  const palette: [Hex, Hex, Hex] = [nation.colors[0], nation.colors[1], third(nation.colors)];
  const kits = generateKits(rng, palette);
  const crest = { ...generateCrest(rng), colors: palette };
  return {
    id: nation.id,
    name: nation.name,
    city: nation.name,
    countryId: nation.countryId ?? nation.id,
    leagueId: nation.id,
    crest,
    // National shirts are plain: the nation's colours, its pattern and trims drawn once.
    kits: {
      home: { ...kits.home, pattern: 'solid' },
      away: { ...kits.away, pattern: 'solid' },
      third: kits.third,
    },
    stadium: {
      id: `${nation.id}:stadium`,
      name: nation.name,
      capacity: 60000,
      pitchQuality: 90,
    },
    reputation: nation.rating,
    finances: { balance: 0, weeklyIncome: 0, weeklyCosts: 0, transferBudget: 0, wageBudget: 0 },
    youthFocus: 50,
    playingStyle: nationStyle(world, nation),
    culture: { youth: 50, winNow: 50, fanOwned: false, discipline: 50, attacking: 50 },
    managerId: `${nation.id}:manager`,
    playerIds,
    dressingRoomId: `${nation.id}:dressing-room`,
  };
}

/** A nation's shape: drawn once per nation and seed. */
export const nationFormation = (world: World, nation: Nation): Formation =>
  createRng(`${world.seed}:${nation.id}:formation`).pick(FORMATIONS);

/**
 * A nation's tournament squad as match players, each a copy wearing the nation's id as club:
 * the selected players of a home nation (the career player always among them when named),
 * completed with generated players of the nation's rating.
 */
export function nationSquad(world: World, nation: Nation, tournamentId: string): Player[] {
  const career = world.career;
  const own = career ? world.players[career.playerId] : undefined;
  const selected = nation.countryId ? selectSquad(world, nation.countryId, 'senior') : [];
  const squad = [...selected];
  if (
    own &&
    nation.countryId === own.nationalityId &&
    !squad.some((player) => player.id === own.id)
  )
    squad.push(own);
  // Generated players to complete each line, at about the nation's rating at their peak.
  const rng = createRng(`${world.seed}:${tournamentId}:${nation.id}:squad`);
  const reputation = Math.max(
    1,
    Math.min(99, (nation.rating - G.peakBase) / G.peakReputationWeight),
  );
  const host: Club = { ...nationClub(world, nation, []), reputation };
  let index = 0;
  for (const line of ['GK', 'DEF', 'MID', 'ATT'] as const) {
    const have = squad.filter((player) => LINE_OF[player.primaryPosition] === line).length;
    for (let slot = have; slot < I.squad[line]; slot++) {
      const position = LINES[line][slot % LINES[line].length]!;
      const { player } = generatePlayer(
        `${tournamentId}:${nation.id}:${index++}`,
        host,
        position,
        rng.int(24, 30),
        world.date,
        rng,
        0,
      );
      squad.push({ ...player, contractId: null });
    }
  }
  return squad.map((player, number) => ({
    ...(JSON.parse(JSON.stringify(player)) as Player),
    clubId: nation.id,
    squadNumber: number + 1,
  }));
}

/** The career player's tournament match as a match setup, the two nations as its sides. */
export function tournamentMatchSetup(world: World, fixture: TournamentFixture): MatchSetup {
  const live = world.international?.live;
  if (!live || !world.career || pendingTournamentFixture(world)?.id !== fixture.id)
    throw new Error('This tournament match is not the career player’s to play');
  const stakes = tournamentStakes(fixture);
  return nationMatchSetup(world, fixture, {
    squadId: live.id,
    // Tournaments are played at a host's grounds: no side is at home.
    neutral: true,
    competitionId: live.id,
    importance: stakes.importance,
    knockout: fixture.stage !== 'group',
  });
}

/** The career player's window match (version 0.9.0): the home nation at home. */
export function windowMatchSetup(world: World, fixture: WindowFixture): MatchSetup {
  const window = world.international?.window;
  if (!window || !world.career || pendingWindowFixture(world)?.id !== fixture.id)
    throw new Error('This window match is not the career player’s to play');
  return nationMatchSetup(world, fixture, {
    squadId: window.id,
    neutral: false,
    competitionId: window.id,
    importance: I.window.importance[fixture.kind],
    knockout: false,
  });
}

function nationMatchSetup(
  world: World,
  fixture: { id: string; homeId: string; awayId: string },
  options: {
    /** Seeds the generated players completing each squad. */
    squadId: string;
    neutral: boolean;
    competitionId: string;
    importance: number;
    knockout: boolean;
  },
): MatchSetup {
  const career = world.career!;
  const home = nationOf(world, fixture.homeId);
  const away = nationOf(world, fixture.awayId);
  const homeSquad = nationSquad(world, home, options.squadId);
  const awaySquad = nationSquad(world, away, options.squadId);
  const players = Object.fromEntries(
    [...homeSquad, ...awaySquad].map((player) => [player.id, player]),
  );
  const own = players[career.playerId];
  if (!own || own.injuryId || own.fitness <= 0) throw new Error('Selected player unavailable');
  return {
    version: 1,
    seed: `${world.seed}:${fixture.id}:session`,
    season: world.date.season,
    home: nationClub(
      world,
      home,
      homeSquad.map((player) => player.id),
    ),
    away: nationClub(
      world,
      away,
      awaySquad.map((player) => player.id),
    ),
    players,
    selectedPlayerId: career.playerId,
    neutral: options.neutral,
    fixture: {
      id: fixture.id,
      competitionId: options.competitionId,
      importance: options.importance,
      ...(options.knockout ? { shootoutLead: 0, extraTimeLead: 0 } : {}),
    },
    formations: [nationFormation(world, home), nationFormation(world, away)],
    slotMoments: true,
    dramaMoments: true,
    occasions: true,
    discipline: true,
    roleSlot: true,
    extraTimePlay: true,
    identity: true,
    defending: true,
    screening: true,
    decidingHeadline: true,
    strengthBonus: [0, 0],
  };
}

/**
 * Record the career player's finished tournament match: the result as the fixture's, and
 * their cap, goals and fame as a simulated match counts them. XP is a club match's: the
 * performance and the decisions that came off, weighted by the opposition and the occasion.
 * Returns the outcome the match report shows. Throws for a match that is not theirs to record,
 * or was recorded already.
 */
export function commitTournamentMatch(world: World, session: MatchSession): CareerMatchOutcome {
  const live = world.international?.live;
  const fixture = live?.fixtures.find((entry) => entry.id === session.setup.fixture?.id);
  if (!live || !fixture || !live.careerNationId) throw new Error('Not a tournament match');
  const stakes = tournamentStakes(fixture);
  return commitNationMatch(world, session, {
    fixture,
    nationId: live.careerNationId,
    ...stakes,
    tournamentId: live.id,
    competitionId: live.id,
    home: false,
    record: (match, xp) => recordTournamentMatch(world, fixture, match, xp),
  });
}

/**
 * Record the career player's window match (version 0.9.0), as a tournament match is recorded:
 * a qualifier's result counts in the campaign.
 */
export function commitWindowMatch(world: World, session: MatchSession): CareerMatchOutcome {
  const window = world.international?.window;
  const fixture = window?.fixtures.find((entry) => entry.id === session.setup.fixture?.id);
  if (!window || !fixture) throw new Error('Not a window match');
  return commitNationMatch(world, session, {
    fixture,
    nationId: window.nationId,
    kind: fixture.kind,
    importance: I.window.importance[fixture.kind],
    tournamentId: null,
    competitionId: window.id,
    home: fixture.homeId === window.nationId,
    record: (match, xp) => recordWindowMatch(world, fixture, match, xp),
  });
}

/** What a nation's match records beside the shared path: its fixture, stakes and store. */
interface NationMatchPart {
  fixture: { id: string; homeId: string; awayId: string; matchId: string | null };
  nationId: string;
  kind: InternationalMatch['kind'];
  importance: number;
  tournamentId: string | null;
  competitionId: string;
  home: boolean;
  record: (match: InternationalMatch, xp: number) => void;
}
function commitNationMatch(
  world: World,
  session: MatchSession,
  part: NationMatchPart,
): CareerMatchOutcome {
  const career = world.career;
  const state = session.state;
  const fixture = part.fixture;
  if (!career || state.match.status !== 'finished' || !state.report)
    throw new Error('Not a finished international match');
  if (
    fixture.matchId ||
    session.setup.selectedPlayerId !== career.playerId ||
    session.setup.home.id !== fixture.homeId ||
    session.setup.away.id !== fixture.awayId ||
    session.setup.season !== world.date.season
  )
    throw new Error('Match does not belong to this world');
  validateMatchSession(session);
  const playerId = career.playerId;
  const own = fixture.homeId === part.nationId ? 0 : 1;
  const ownSide = <T>(pair: readonly [T, T]): [T, T] => [pair[own]!, pair[1 - own]!];
  const events = state.match.events.filter((event) => event.kind === 'goal');
  const scored = events.filter((event) => event.playerId === playerId);
  const assisted = events.filter((event) => event.assistId === playerId);
  const score = ownSide(state.match.score);
  const regulation = ownSide(state.regulation ?? state.match.score);
  const extraTime: [number, number] | null = state.regulation
    ? [score[0] - regulation[0], score[1] - regulation[1]]
    : null;
  // A level knockout always has its shootout (0.9.1): settled in the session, or drawn here the
  // same way when the player was off the pitch for it.
  const shootout = sessionPenalties(session);
  const penalties = shootout ? ownSide(shootout) : null;
  const rating = state.report.rating;
  const objectives = state.report.objectives;
  const minutes = state.selectedPlayerMinutes;
  const performance = performanceXp({
    minutes,
    rating,
    goals: scored.length,
    assists: assisted.length,
    objectives: objectives.filter((objective) => objective.progress >= objective.target).length,
  });
  const decisions = matchDecisions(session, world.date);
  const analyst = assetEffects(career.style?.assets ?? []).decisionXp;
  const decisionXp = decisions.reduce(
    (sum, decision) =>
      sum +
      (decision.success
        ? (decision.probability < 0.5 ? X.decisionXp.underdog : X.decisionXp.success) + analyst
        : 0),
    0,
  );
  const opponent = nationOf(world, own === 0 ? fixture.awayId : fixture.homeId);
  const [low, high] = X.oppositionRange;
  const opposition = Math.min(
    high,
    Math.max(low, X.oppositionBase + opponent.rating * X.oppositionSlope),
  );
  const xp = Math.round((performance + decisionXp) * opposition * part.importance);
  const match: InternationalMatch = {
    id: `intl:${world.date.season}:${world.date.week}:senior:${part.kind}:${fixture.homeId}:${fixture.awayId}`,
    date: { ...world.date },
    level: 'senior',
    kind: part.kind,
    tournamentId: part.tournamentId,
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    score: [state.match.score[0], state.match.score[1]],
    penalties: shootout,
    career: { rating, goals: scored.length, assists: assisted.length },
  };
  const international = world.international!;
  international.matches.push(match);
  if (international.matches.length > I.matchLimit)
    international.matches.splice(0, international.matches.length - I.matchLimit);
  const previousLevel = career.level;
  const fame = career.fame;
  const before = new Set(world.chronicle.map((entry) => entry.id));
  part.record(match, xp);
  recordDecisions(career, decisions);
  // Moments, as a club match keeps them: the first goal's Chronicle entry points at the clip,
  // otherwise the clip gets an entry of its own.
  const momentId = captureMoments(world, session, part.importance)[0];
  if (momentId) {
    const index = world.chronicle.findIndex(
      (entry) => entry.kind === 'international-goal' && !before.has(entry.id),
    );
    if (index >= 0) world.chronicle[index] = { ...world.chronicle[index]!, momentId };
    else {
      const moment = world.moments.find((entry) => entry.id === momentId)!;
      chronicle(
        world,
        'moment',
        { opponent: opponent.name, kind: moment.kind, minute: moment.minute },
        { momentId },
      );
    }
  }
  const won = penalties ? penalties[0] > penalties[1] : score[0] > score[1];
  const lost = penalties ? penalties[0] < penalties[1] : score[0] < score[1];
  const record: CareerMatchRecord = {
    fixtureId: fixture.id,
    season: world.date.season,
    week: world.date.week,
    competitionId: part.competitionId,
    opponentId: opponent.id,
    home: part.home,
    score,
    result: won ? 'win' : lost ? 'loss' : 'draw',
    ...(penalties
      ? { decided: 'penalties' as const }
      : extraTime
        ? { decided: 'extra-time' as const }
        : {}),
    minutes,
    rating,
    goals: scored.length,
    assists: assisted.length,
    cleanSheet: score[1] === 0,
    xp,
    auto: false,
  };
  return {
    record,
    final: {
      score,
      regulation,
      extraTime,
      penalties,
      xp: performance + decisionXp,
      fame: Math.round(career.fame - fame),
      rating,
      objectives,
      extraTimeMinutes: Math.max(0, minutes - 90),
      extraTimeGoals: scored.filter((event) => event.minute > 90).length,
      extraTimeAssists: assisted.filter((event) => event.minute > 90).length,
    },
    previousLevel,
    levelsGained: career.level - previousLevel,
    injury: null,
    celebrationFame: 0,
    internationalMatchId: match.id,
  };
}
