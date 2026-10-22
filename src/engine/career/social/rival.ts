import type {
  Club,
  Fixture,
  Player,
  Position,
  Rivalry,
  RivalryEntry,
  SeasonLine,
  World,
} from '../../../model/domain';
import type { Rng } from '../../rng';
import { playerAbility } from '../../strength';
import { recordEvent } from '../../world/events';
import { isActiveClub, refreshDressingRoom } from '../../world/dressing';
import { joinSquad } from '../../world/squadNumbers';
import {
  bonusesFor,
  clubLevel,
  deservedRole,
  lineOf,
  marketValue,
  marketWage,
  money,
  today,
  windowState,
} from '../market/rules';
import { ageAt, careerPlayer, S } from './rules';
import { chronicle } from '../honours/chronicle';

const R = S.rival;
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const rivalryOf = (world: World): Rivalry | undefined => world.rivalries[0];
export const rivalOf = (world: World): Player | undefined => {
  const rivalry = rivalryOf(world);
  return rivalry ? world.players[rivalry.rivalPlayerId] : undefined;
};

export function addTimeline(
  world: World,
  rivalry: Rivalry,
  kind: RivalryEntry['kind'],
  params: RivalryEntry['params'],
): void {
  rivalry.timeline.push({ date: today(world), kind, params });
  if (rivalry.timeline.length > R.timelineLimit)
    rivalry.timeline.splice(0, rivalry.timeline.length - R.timelineLimit);
}
export function adjustIntensity(rivalry: Rivalry, delta: number): void {
  rivalry.intensity = Math.round(Math.max(0, Math.min(100, rivalry.intensity + delta)));
}

/**
 * Choose the rival from the world's own players: same line, born within a year of the
 * career player, a similar level, at another club, preferably in the same country. Their
 * potential is set close to the player's so the two careers can run side by side.
 */
export function startRivalry(world: World, rng: Rng): Rivalry | null {
  const player = careerPlayer(world);
  const club = world.clubs[player.clubId!]!;
  const ability = playerAbility(player);
  const line = lineOf(player.primaryPosition);
  const age = ageAt(world, player);
  const score = (candidate: Player) => {
    const candidateClub = world.clubs[candidate.clubId!]!;
    return (
      Math.abs(ageAt(world, candidate) - age) * 5 +
      Math.abs(playerAbility(candidate) - ability) +
      (candidate.primaryPosition === player.primaryPosition ? 0 : 3) +
      (candidateClub.countryId === club.countryId ? 0 : 10)
    );
  };
  const candidates = Object.values(world.players).filter((candidate) => {
    if (candidate.id === player.id || candidate.retired || !candidate.clubId) return false;
    const candidateClub = world.clubs[candidate.clubId]!;
    return (
      candidate.clubId !== club.id &&
      isActiveClub(world, candidateClub) &&
      !candidateClub.identity?.reserveParentId &&
      lineOf(candidate.primaryPosition) === line &&
      Math.abs(ageAt(world, candidate) - age) <= R.ageRange &&
      Math.abs(playerAbility(candidate) - ability) <= R.abilityRange * 2
    );
  });
  const rival = candidates.sort((a, b) => score(a) - score(b) || byId(a, b))[0];
  if (!rival) return null;
  rival.potential = Math.max(
    Math.ceil(playerAbility(rival)),
    Math.min(99, player.potential + rng.int(-R.potentialSpread, R.potentialSpread)),
  );
  rival.personality.ambition = Math.max(rival.personality.ambition, 70);
  const rivalry: Rivalry = {
    id: `rivalry:${player.id}`,
    careerPlayerId: player.id,
    rivalPlayerId: rival.id,
    intensity: R.startIntensity,
    started: today(world),
    headToHead: { played: 0, won: 0, drawn: 0, lost: 0 },
    seasons: [],
    seasonStart: {
      appearances: rival.stats.appearances,
      goals: rival.stats.goals,
      assists: rival.stats.assists,
      ratingTotal: rival.stats.ratingTotal,
      cleanSheets: rival.stats.cleanSheets,
    },
    lastGoals: rival.stats.goals,
    timeline: [],
  };
  addTimeline(world, rivalry, 'started', {
    rival: rival.name,
    club: world.clubs[rival.clubId!]!.name,
  });
  // The world's news notices the pairing (phase 7, C7).
  recordEvent(world, 'rivalry', [player.id, rival.id], {
    name: player.name,
    rival: rival.name,
    club: world.clubs[rival.clubId!]!.name,
  });
  world.rivalries = [rivalry];
  return rivalry;
}

/** The career player's and the rival's lines for the season so far (or a finished season). */
export function seasonLines(
  world: World,
  season = world.date.season,
): { career: SeasonLine; rival: SeasonLine } | null {
  const rivalry = rivalryOf(world);
  const rival = rivalOf(world);
  if (!rivalry || !rival) return null;
  const career = world.career!;
  const matches = career.matches.filter((m) => m.season === season);
  const apps = rival.stats.appearances - rivalry.seasonStart.appearances;
  return {
    career: {
      clubId: careerPlayer(world).clubId!,
      appearances: matches.length,
      goals: matches.reduce((sum, m) => sum + m.goals, 0),
      assists: matches.reduce((sum, m) => sum + m.assists, 0),
      rating: matches.length
        ? Math.round((matches.reduce((sum, m) => sum + m.rating, 0) / matches.length) * 100) / 100
        : 0,
      cleanSheets: matches.filter((m) => m.cleanSheet).length,
    },
    rival: {
      clubId: rival.clubId!,
      appearances: apps,
      goals: rival.stats.goals - rivalry.seasonStart.goals,
      assists: rival.stats.assists - rivalry.seasonStart.assists,
      rating: apps
        ? Math.round(((rival.stats.ratingTotal - rivalry.seasonStart.ratingTotal) / apps) * 100) /
          100
        : 0,
      // A rivalry saved before clean sheets were tracked counts them from the next season.
      cleanSheets:
        rival.stats.cleanSheets - (rivalry.seasonStart.cleanSheets ?? rival.stats.cleanSheets),
    },
  };
}

/** Whether a position is judged by clean sheets: keepers and defenders. */
export const backLine = (position: Position): boolean => ['GK', 'DEF'].includes(lineOf(position));

/**
 * What a season is worth for the comparison, by the line both play in (review phase 3, step
 * 3.4): keepers by clean sheets (and the odd assist), defenders by clean sheets as well as goals
 * and assists, everyone else by goals and assists.
 */
export function rivalOutput(line: SeasonLine, position: Position): number {
  const sheets = line.cleanSheets ?? 0;
  const L = lineOf(position);
  if (L === 'GK') return sheets * R.output.keeperCleanSheet + line.assists;
  if (L === 'DEF') return sheets * R.output.defenderCleanSheet + line.goals + line.assists;
  return line.goals + line.assists;
}

/** Where the rival would move: a bigger club whose first team they would walk into. */
function rivalDestination(world: World, rival: Player, rng: Rng): Club | null {
  const current = world.clubs[rival.clubId!]!;
  const ability = playerAbility(rival);
  const careerClubId = careerPlayer(world).clubId;
  const candidates = Object.values(world.clubs)
    .filter(
      (club) =>
        club.id !== current.id &&
        club.id !== careerClubId &&
        isActiveClub(world, club) &&
        !club.identity?.reserveParentId &&
        club.reputation > current.reputation &&
        club.playerIds.length < 36 &&
        club.finances.transferBudget >= marketValue(world, rival),
    )
    .map((club) => ({ club, level: clubLevel(world, club) }))
    .filter(({ level }) => level <= ability + 2 && level >= ability - 6)
    .sort(
      (a, b) =>
        Number(b.club.countryId === current.countryId) -
          Number(a.club.countryId === current.countryId) ||
        b.club.reputation - a.club.reputation ||
        byId(a.club, b.club),
    )
    .slice(0, 3);
  return candidates.length ? rng.pick(candidates).club : null;
}

/** The rival moves on in a window once they have outgrown their club. Returns the fee. */
export function rivalTransfer(world: World, rng: Rng): { club: Club; fee: number } | null {
  const rivalry = rivalryOf(world);
  const rival = rivalOf(world);
  if (!rivalry || !rival?.clubId || !windowState(world).open) return null;
  const current = world.clubs[rival.clubId]!;
  if (current.playerIds.length <= 19) return null;
  if (playerAbility(rival) < clubLevel(world, current) + R.outgrown || rng.next() >= R.moveChance)
    return null;
  const destination = rivalDestination(world, rival, rng);
  if (!destination) return null;
  const fee = marketValue(world, rival);
  destination.finances.balance -= fee;
  destination.finances.transferBudget = money(destination.finances.transferBudget - fee);
  current.finances.balance += fee;
  current.playerIds = current.playerIds.filter((id) => id !== rival.id);
  destination.playerIds.push(rival.id);
  rival.clubId = destination.id;
  joinSquad(world, rival, destination);
  const contract = world.contracts[rival.contractId!]!;
  const role = deservedRole(world, destination, rival);
  const weeklyWage = marketWage(destination, rival, role);
  Object.assign(contract, {
    clubId: destination.id,
    start: today(world),
    end: { ...contract.end, season: Math.max(contract.end.season, world.date.season + 3) },
    weeklyWage,
    role,
    ...bonusesFor(weeklyWage),
  });
  refreshDressingRoom(world, current);
  refreshDressingRoom(world, destination);
  recordEvent(world, 'transfer', [rival.id, current.id, destination.id], {
    name: rival.name,
    old: current.name,
    new: destination.name,
    fee,
  });
  addTimeline(world, rivalry, 'transfer', {
    rival: rival.name,
    old: current.name,
    club: destination.name,
    fee,
  });
  return { club: destination, fee };
}

/** A meeting between the two clubs in which the career player played. */
export function recordHeadToHead(world: World, fixture: Fixture): 'won' | 'drawn' | 'lost' | null {
  const rivalry = rivalryOf(world);
  const rival = rivalOf(world);
  const clubId = careerPlayer(world).clubId;
  if (!rivalry || !rival?.clubId || !clubId) return null;
  const sides = [fixture.homeId, fixture.awayId];
  if (!sides.includes(rival.clubId) || !sides.includes(clubId)) return null;
  const winner = world.results[fixture.id]?.winnerId;
  const outcome = winner === clubId ? 'won' : winner === null ? 'drawn' : 'lost';
  rivalry.headToHead.played++;
  rivalry.headToHead[outcome]++;
  adjustIntensity(rivalry, R.headToHead);
  addTimeline(world, rivalry, 'head-to-head', {
    rival: rival.name,
    outcome,
    score: `${world.results[fixture.id]!.score[0]}–${world.results[fixture.id]!.score[1]}`,
  });
  return outcome;
}

/** Close the season's comparison; whoever did better feeds the rivalry. */
export function rivalSeasonEnd(world: World, season: number): void {
  const rivalry = rivalryOf(world);
  const rival = rivalOf(world);
  const lines = seasonLines(world, season);
  if (!rivalry || !rival || !lines) return;
  rivalry.seasons.push({ season, career: lines.career, rival: lines.rival });
  const position = careerPlayer(world).primaryPosition;
  const ahead =
    rivalOutput(lines.career, position) -
    rivalOutput(lines.rival, position) +
    (lines.career.rating - lines.rival.rating) * 5;
  adjustIntensity(rivalry, R.seasonEnd);
  if (ahead >= 0 && lines.career.appearances)
    chronicle(
      world,
      'rival',
      backLine(position)
        ? {
            rival: rival.name,
            season,
            cleanSheets: lines.career.cleanSheets ?? 0,
            rivalCleanSheets: lines.rival.cleanSheets ?? 0,
          }
        : { rival: rival.name, season, goals: lines.career.goals, rivalGoals: lines.rival.goals },
    );
  addTimeline(world, rivalry, 'season', {
    season,
    rival: rival.name,
    ahead: ahead >= 0 ? 1 : 0,
  });
  rivalry.seasonStart = {
    appearances: rival.stats.appearances,
    goals: rival.stats.goals,
    assists: rival.stats.assists,
    ratingTotal: rival.stats.ratingTotal,
    cleanSheets: rival.stats.cleanSheets,
  };
  rivalry.lastGoals = rival.stats.goals;
}
