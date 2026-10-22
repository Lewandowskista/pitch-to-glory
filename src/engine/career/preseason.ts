import type { LateCareerStep, Position, SeasonAmbition, World } from '../../model/domain';
import { CONFIG } from '../config';
import { playerAbility } from '../strength';
import { addXp } from './progression';
import { draftWorld } from './market/actions';
import { adjustRelationship, postMessage } from './market/records';
import {
  careerContract,
  currentRole,
  deservedRole,
  lineOf,
  managerTrust,
  slotCompetition,
  startChance,
  today,
} from './market/rules';
import { commitmentBlocked } from './commitments';
import { adjustCliques } from './social/dressing';
import { careerRoom } from './social/rules';

/**
 * Preseason (review phase 5, step 5.3): at a season's start, what the manager expects, the
 * competition for the player's place, and the player's ambition for the season, judged at its
 * end. From 31, one late-career step a season: a smaller role, a new position, mentoring, or a
 * club closer to home.
 */
const P = CONFIG.career.preseason;
const age = (world: World) =>
  world.date.season - world.players[world.career!.playerId]!.birthSeason;
const BACK_LINE = new Set<Position>(['GK', 'CB', 'LB', 'RB']);
/** Where a veteran can still play: one step back from where the legs are needed most. */
const RETRAIN: Partial<Record<Position, Position>> = {
  ST: 'AM',
  LW: 'AM',
  RW: 'AM',
  AM: 'CM',
  CM: 'DM',
  DM: 'CB',
  LB: 'CB',
  RB: 'CB',
};

/** Whether the briefing waits: early in a season, until the player has gone through it. */
export function preseasonDue(world: World): boolean {
  const career = world.career;
  if (!career || world.phase !== 'active' || world.date.week > P.weeks) return false;
  return !(career.preseason?.season === world.date.season && career.preseason.done);
}

/** The club's league fixtures this season, for a regular place. */
function leagueFixtures(world: World): number {
  const club = world.players[world.career!.playerId]!.clubId;
  const league = club ? world.leagues[world.clubs[club]!.leagueId] : undefined;
  if (!league) return 0;
  return league.fixtureIds.filter((id) => {
    const fixture = world.fixtures[id];
    return fixture && (fixture.homeId === club || fixture.awayId === club);
  }).length;
}
const seasonMatches = (world: World) =>
  world.career!.matches.filter((match) => match.season === world.date.season);
const backLine = (world: World) =>
  BACK_LINE.has(world.players[world.career!.playerId]!.primaryPosition);

/** What an ambition measures now. */
export function ambitionMeasure(world: World, ambition: Pick<SeasonAmbition, 'kind'>): number {
  const matches = seasonMatches(world);
  if (ambition.kind === 'place') return matches.filter((match) => match.minutes >= 60).length;
  if (ambition.kind === 'output')
    return backLine(world)
      ? matches.filter((match) => match.cleanSheet).length
      : matches.reduce((sum, match) => sum + match.goals + match.assists, 0);
  return Math.round(playerAbility(world.players[world.career!.playerId]!) * 10) / 10;
}

/** The three ambitions on offer this season, with their targets. */
export function ambitionOffers(world: World): SeasonAmbition[] {
  const player = world.players[world.career!.playerId]!;
  const line = lineOf(player.primaryPosition);
  const ability = ambitionMeasure(world, { kind: 'growth' });
  return [
    {
      kind: 'place',
      target: Math.max(1, Math.round(leagueFixtures(world) * P.placeShare)),
      baseline: 0,
    },
    {
      kind: 'output',
      target: backLine(world)
        ? P.cleanSheets[line === 'GK' ? 'GK' : 'DEF']
        : P.output[line as keyof typeof P.output],
      baseline: 0,
    },
    {
      kind: 'growth',
      // A veteran's growth is holding on to what they have.
      target: Math.round((age(world) >= P.holdAge ? ability : ability + P.growth) * 10) / 10,
      baseline: ability,
    },
  ];
}

/** Why a late-career step is out of reach now, or null when it is open. */
export function lateStepBlocked(
  world: World,
  step: LateCareerStep,
): 'age' | 'taken' | 'role' | 'position' | 'mentor' | 'home' | null {
  const career = world.career!;
  if (age(world) < P.lateAge) return 'age';
  if (career.preseason?.season === world.date.season && career.preseason.late) return 'taken';
  const player = world.players[career.playerId]!;
  switch (step) {
    case 'smaller-role':
      return ['key', 'rotation'].includes(careerContract(world).role) ? null : 'role';
    case 'new-position':
      return RETRAIN[player.primaryPosition] ? null : 'position';
    case 'mentor':
      return commitmentBlocked(world, 'mentoring') ? 'mentor' : null;
    case 'closer-to-home':
      return homeClubs(world).length ? null : 'home';
  }
}

/** Clubs in the player's home country a veteran could join, best first. */
function homeClubs(world: World) {
  const player = world.players[world.career!.playerId]!;
  const own = player.clubId ? world.clubs[player.clubId] : undefined;
  return Object.values(world.clubs)
    .filter(
      (club) =>
        club.id !== own?.id &&
        club.countryId === player.nationalityId &&
        world.leagues[club.leagueId] &&
        club.reputation <= (own?.reputation ?? 100) + 10,
    )
    .sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1))
    .slice(0, P.homeClubs);
}

/** The briefing: expectations, competition for a place, ambitions and late-career steps. */
export function preseasonBrief(world: World) {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const club = world.clubs[player.clubId!]!;
  const league = world.leagues[club.leagueId];
  const rivals = league
    ? league.clubIds.map((id) => world.clubs[id]!).sort((a, b) => b.reputation - a.reputation)
    : [club];
  const competition = slotCompetition(world, club, player);
  const role = currentRole(world);
  return {
    club,
    league,
    expectedPlace: rivals.findIndex((entry) => entry.id === club.id) + 1,
    leagueSize: rivals.length,
    role,
    deserved: deservedRole(world, club, player),
    competition,
    startChance: startChance(role, competition, player, managerTrust(world)).probability,
    ambitions: ambitionOffers(world),
    late:
      age(world) >= P.lateAge
        ? (['smaller-role', 'new-position', 'mentor', 'closer-to-home'] as const).map((step) => ({
            step,
            blocked: lateStepBlocked(world, step),
            ...(step === 'new-position'
              ? { position: RETRAIN[player.primaryPosition] ?? null }
              : {}),
          }))
        : [],
  };
}

export type PreseasonAction =
  | { type: 'ambition'; kind: SeasonAmbition['kind'] }
  | { type: 'late'; step: LateCareerStep }
  | { type: 'done' };

/** The player's preseason choices. Returns a new world; the input is untouched. */
export function applyPreseason(input: World, action: PreseasonAction): World {
  if (!input.career) throw new Error('No career in this world');
  const player = input.players[input.career.playerId]!;
  const contract = careerContract(input);
  const world = draftWorld(input, {
    players: [player.id],
    contracts: [contract.id],
    dressingRooms: [careerRoom(input).id],
  });
  const career = world.career!;
  const state = (career.preseason =
    career.preseason?.season === world.date.season
      ? career.preseason
      : { season: world.date.season, done: false, ambition: null, late: null });
  if (action.type === 'done') {
    state.done = true;
    return world;
  }
  if (action.type === 'ambition') {
    if (state.ambition) throw new Error('This season’s ambition is already set');
    state.ambition = ambitionOffers(world).find((offer) => offer.kind === action.kind)!;
    return world;
  }
  const blocked = lateStepBlocked(world, action.step);
  if (blocked) throw new Error('That step is not open now');
  const me = world.players[career.playerId]!;
  const club = world.clubs[me.clubId!]!;
  switch (action.step) {
    case 'smaller-role': {
      const own = world.contracts[contract.id]!;
      own.role = own.role === 'key' ? 'rotation' : 'backup';
      adjustRelationship(world, 'manager', club.managerId, P.smallerTrust);
      adjustCliques(world, { seniors: 4 });
      break;
    }
    case 'new-position': {
      const position = RETRAIN[me.primaryPosition]!;
      const entry = me.secondaryPositions.find((item) => item.position === position);
      if (entry) entry.familiarity = Math.min(100, entry.familiarity + P.retrain);
      else me.secondaryPositions.push({ position, familiarity: P.retrain });
      const sessions = career.training.sessions;
      sessions[sessions.length - 1] = { focus: `position:${position}`, intensity: 'normal' };
      break;
    }
    case 'mentor': {
      const commitments = (career.training.commitments ?? []).filter((k) => k !== 'mentoring');
      career.training.commitments = [
        'mentoring',
        ...commitments.slice(0, CONFIG.career.commitments.slots - 1),
      ];
      adjustCliques(world, { young: 4 });
      break;
    }
    case 'closer-to-home':
      for (const home of homeClubs(world)) {
        world.scouting = world.scouting.filter(
          (entry) => !(entry.clubId === home.id && entry.playerId === me.id),
        );
        world.scouting.push({
          id: `scouting:home:${home.id}:${world.date.season}`,
          clubId: home.id,
          playerId: me.id,
          kind: 'transfer',
          started: today(world),
          weeksObserved: 4,
          confidence: P.homeConfidence,
          stage: 'scouting',
          lastOffer: null,
        });
      }
      break;
  }
  state.late = action.step;
  return world;
}

/** The season's ambition judged at its end: met or missed, with what it brings. */
export function preseasonSeasonEnd(world: World): void {
  const career = world.career;
  const ambition =
    career?.preseason?.season === world.date.season ? career.preseason.ambition : null;
  if (!career || !ambition || ambition.met !== undefined) return;
  const value = ambitionMeasure(world, ambition);
  ambition.met = value >= ambition.target;
  const player = world.players[career.playerId]!;
  if (ambition.met) {
    addXp(career, P.reward.xp);
    career.fame += P.reward.fame;
    player.morale = Math.min(100, player.morale + P.reward.morale);
  } else player.morale = Math.max(0, player.morale + P.penalty);
  postMessage(world, ambition.met ? 'season-ambition-met' : 'season-ambition-missed', {
    goal: ambitionGoal(world, ambition),
    target: ambition.target,
    value,
  });
}

/** Which wording an ambition takes: by kind, and for output and growth, by the player. */
export function ambitionGoal(
  world: World,
  ambition: Pick<SeasonAmbition, 'kind' | 'target' | 'baseline'>,
): 'place' | 'contributions' | 'clean-sheets' | 'growth' | 'hold' {
  if (ambition.kind === 'place') return 'place';
  if (ambition.kind === 'output') return backLine(world) ? 'clean-sheets' : 'contributions';
  return ambition.target > ambition.baseline ? 'growth' : 'hold';
}
