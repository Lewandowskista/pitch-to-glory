import type { Career, Legacy, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import { playerAbility } from '../../strength';
import { refreshDressingRoom } from '../../world/dressing';
import { today } from '../market/rules';
import { adjustRelationship, postMessage } from '../market/records';
import { chronicle } from './chronicle';
import { achievementScore, seasonContributions, usesAchievements } from './achievements';

/**
 * Retirement and legacy (AGENTS.md §8, §9.2). The player chooses when to retire from age 32
 * once a season is complete, and must retire at 38, or from 33 once ability has fallen well
 * below its peak (`retirement` in the honours config). The career becomes a legacy record; the
 * world carries on, with the retired player kept for the history, and a new career (or the
 * player's child) can start in the same world.
 */
const H = CONFIG.career.honours;

/** Whether this season can be announced as the last: old enough, in season, not yet said. */
export function canAnnounceFarewell(world: World): boolean {
  const career = world.career;
  if (!career || career.farewell || world.phase !== 'active') return false;
  const age = retirementAge(world);
  return age >= H.retirement.optionalAge - 1 && age + 1 < H.retirement.forcedAge;
}
/**
 * Announce a farewell season (engagement review, late-career arc): the career ends when this
 * season is complete. Fans everywhere the player has been take note; former clubs' matches
 * become farewell visits. Returns a new world.
 */
export function announceFarewell(input: World): World {
  if (!canAnnounceFarewell(input)) throw new Error('A farewell cannot be announced now');
  const world: World = {
    ...input,
    career: structuredClone(input.career!),
    inbox: [...input.inbox],
    chronicle: [...input.chronicle],
  };
  const career = world.career!;
  career.farewell = { season: world.date.season, announced: today(world) };
  career.fame += H.farewell.fame;
  chronicle(world, 'farewell', { season: world.date.season });
  postMessage(world, 'farewell', { season: world.date.season });
  return world;
}
/** Seasons the player has spent at their current club, the current one when complete. */
export function seasonsAtClub(world: World): number {
  const career = world.career!;
  const clubId = world.players[career.playerId]!.clubId;
  const move = [...career.market.moves]
    .reverse()
    .find((entry) => entry.toClubId === clubId && entry.kind !== 'renewal');
  const joined = move?.date.season ?? career.startSeason;
  return Math.max(0, world.date.season - joined + (world.phase === 'complete' ? 1 : 0));
}
/**
 * A testimonial for long service: at a season's end, a player with `testimonial.seasons` at the
 * club is honoured once per club, with fame, the fans' affection and a Chronicle page.
 */
export function testimonialCheck(world: World): void {
  const career = world.career!;
  const clubId = world.players[career.playerId]!.clubId;
  if (!clubId || (career.testimonials ?? []).includes(clubId)) return;
  if (seasonsAtClub(world) < H.testimonial.seasons) return;
  (career.testimonials ??= []).push(clubId);
  career.fame += H.testimonial.fame;
  adjustRelationship(world, 'fans', clubId, H.testimonial.fans);
  const club = world.clubs[clubId]!.name;
  chronicle(world, 'testimonial', { club, seasons: seasonsAtClub(world) });
  postMessage(world, 'testimonial', { club, seasons: seasonsAtClub(world) });
}

export function retirementAge(world: World): number {
  const player = world.players[world.career!.playerId]!;
  return world.date.season - player.birthSeason;
}
export type RetirementState = 'young' | 'season' | 'available' | 'forced';
/**
 * Whether the player may (or must) retire now. Only age forces it. Decline no longer ends a
 * career by itself: under development rules 2, late-career decline makes playing on costly
 * instead, and the player decides when to stop.
 */
export function retirementState(world: World): RetirementState {
  const age = retirementAge(world);
  if (age >= H.retirement.forcedAge) return 'forced';
  if (age < H.retirement.optionalAge) return 'young';
  return world.phase === 'complete' ? 'available' : 'season';
}
/** What an award is worth in the Hall of Fame, by kind. */
export function awardWeight(kind: string): number {
  return (H.hallOfFame.awardWeights as Record<string, number>)[kind] ?? 10;
}

/** Award points for the Hall of Fame: each award's weight, in units of a season honour. */
export function awardPoints(world: World, awardIds: readonly string[], playerId: string): number {
  let points = 0;
  for (const id of awardIds) {
    const award = world.awards.find((entry) => entry.id === id);
    if (!award || award.kind === 'golden-ball') continue;
    if (!award.winnerIds.includes(playerId)) continue;
    points += awardWeight(award.kind) / H.hallOfFame.award;
  }
  return Math.round(points * 100) / 100;
}
/** Hall of Fame score: what any player's record is worth, with honours for careers. */
export function hallOfFameScore(
  stats: { appearances: number; goals: number; assists: number },
  extras = { caps: 0, trophies: 0, awards: 0, goldenBalls: 0 },
): number {
  const F = H.hallOfFame;
  return Math.round(
    stats.appearances * F.appearance +
      stats.goals * F.goal +
      stats.assists * F.assist +
      extras.caps * F.cap +
      extras.trophies * F.trophy +
      extras.awards * F.award +
      extras.goldenBalls * F.goldenBall,
  );
}

/** Where a score stands among every player the world remembers, and who is just above it. */
export interface HallOfFameStanding {
  rank: number;
  of: number;
  /** The lowest score above this one: the next name to pass. */
  next: { id: string; name: string; score: number } | null;
}
/**
 * Rank a score among every player the world remembers, active, retired or archived, each
 * once. A former career is compared by its saved honour-inclusive legacy score, the same
 * criteria the new score uses, never by its club numbers alone.
 */
export function hallOfFameStanding(
  world: World,
  score: number,
  excludeId: string,
): HallOfFameStanding {
  let better = 0;
  let of = 1;
  let next: HallOfFameStanding['next'] = null;
  const counted = new Set<string>([excludeId]);
  const compare = (id: string, value: number, name: () => string) => {
    if (counted.has(id)) return;
    counted.add(id);
    of++;
    if (value <= score) return;
    better++;
    if (!next || value < next.score || (value === next.score && id < next.id))
      next = { id, name: name(), score: value };
  };
  for (const legacy of world.legacies)
    compare(legacy.playerId, legacy.hallOfFame.score, () => legacy.name);
  if (usesAchievements(world)) {
    // One record for everyone: the same rules for active, retired and archived players.
    const season =
      world.phase === 'active' ? seasonContributions(world) : new Map<string, number>();
    for (const player of Object.values(world.players))
      compare(player.id, achievementScore(world, player, season), () => player.name);
    for (const [id, record] of Object.entries(world.archive?.players ?? {}))
      compare(id, Math.round(record.hallOfFame ?? 0), () => record.name);
    return { rank: better + 1, of, next };
  }
  // Before the record: other players count their awards too (their trophies were not recorded).
  const awards = new Map<string, number>();
  for (const award of world.awards)
    for (const id of award.winnerIds)
      awards.set(
        id,
        (awards.get(id) ?? 0) +
          (award.kind === 'golden-ball' && award.winnerIds[0] === id
            ? H.hallOfFame.goldenBall / H.hallOfFame.award
            : awardWeight(award.kind) / H.hallOfFame.award),
      );
  for (const player of Object.values(world.players))
    compare(
      player.id,
      hallOfFameScore(player.stats, {
        caps: 0,
        trophies: 0,
        awards: awards.get(player.id) ?? 0,
        goldenBalls: 0,
      }),
      () => player.name,
    );
  for (const [id, record] of Object.entries(world.archive?.players ?? {}))
    compare(id, hallOfFameScore(record.stats), () => record.name);
  return { rank: better + 1, of, next };
}
export function hallOfFameRank(
  world: World,
  score: number,
  excludeId: string,
): { rank: number; of: number } {
  const { rank, of } = hallOfFameStanding(world, score, excludeId);
  return { rank, of };
}
/** Caps at every national level (U19, U21 and senior): the count legacies and the Hall of Fame use. */
export const totalCaps = (career: Career) =>
  Object.values(career.honours.caps).reduce((sum, value) => sum + value, 0);

/**
 * Headline numbers for a player's story, from the authoritative record: the active career's
 * honours, a retired career's legacy, or club statistics alone for anyone else. Chronicle
 * entries are landmarks (one cap entry per national level), never totals.
 */
export function careerTotals(
  world: World,
  playerId: string,
): { appearances: number; goals: number; caps: number } {
  const legacy = world.legacies.find((entry) => entry.playerId === playerId);
  if (legacy) {
    const { appearances, goals, caps } = legacy.stats;
    return { appearances, goals, caps };
  }
  const stats = world.players[playerId]?.stats;
  const career = world.career?.playerId === playerId ? world.career : undefined;
  return {
    appearances: stats?.appearances ?? 0,
    goals: stats?.goals ?? 0,
    caps: career ? totalCaps(career) : 0,
  };
}
/** The career player's Hall of Fame score as it stands, honours included, as retirement adds it. */
export function careerHallOfFameScore(world: World): number {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  if (usesAchievements(world)) return achievementScore(world, player);
  const trophies = world.trophies.filter((trophy) => trophy.playerIds.includes(player.id)).length;
  const awardIds = world.awards
    .filter((award) => award.winnerIds.includes(player.id))
    .map((award) => award.id);
  const goldenBalls = world.awards.filter(
    (award) => award.kind === 'golden-ball' && award.winnerIds[0] === player.id,
  ).length;
  return hallOfFameScore(player.stats, {
    caps: totalCaps(career),
    trophies,
    awards: awardPoints(world, awardIds, player.id),
    goldenBalls,
  });
}
/** The career's place in the Hall of Fame right now, for the hub and ambitions. */
export function liveHallOfFame(world: World): HallOfFameStanding & { score: number } {
  const score = careerHallOfFameScore(world);
  return { score, ...hallOfFameStanding(world, score, world.career!.playerId) };
}

/**
 * Retire the career player: write the legacy, release them from their club, and clear the
 * career's own records (agents, offers, relationships, inbox, media, rivalry, sponsors,
 * challenges, call-ups). Chronicle, moments, awards, trophies and records stay. Mutates the
 * given world.
 */
export function retireCareer(world: World): Legacy {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const age = retirementAge(world);
  const clubIds: string[] = [];
  const firstClub = career.market.moves[0]?.fromClubId ?? player.clubId;
  for (const id of [firstClub, ...career.market.moves.map((move) => move.toClubId), player.clubId])
    if (id && !clubIds.includes(id)) clubIds.push(id);
  const trophyIds = world.trophies
    .filter((trophy) => trophy.playerIds.includes(player.id))
    .map((trophy) => trophy.id);
  const awardIds = world.awards
    .filter((award) => award.winnerIds.includes(player.id))
    .map((award) => award.id);
  const caps = totalCaps(career);
  const internationalGoals = Object.values(career.honours.internationalGoals).reduce(
    (sum, value) => sum + value,
    0,
  );
  const score = careerHallOfFameScore(world);
  const teammateIds = world.relationships
    .filter((r) => r.kind === 'teammate')
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
    .map((r) => r.targetId);
  chronicle(world, 'retirement', {
    age,
    appearances: player.stats.appearances,
    goals: player.stats.goals,
  });
  const legacy: Legacy = {
    id: `legacy:${player.id}`,
    playerId: player.id,
    name: player.name,
    avatar: { ...player.avatar },
    nationalityId: player.nationalityId,
    position: player.primaryPosition,
    startSeason: career.startSeason,
    retiredAt: today(world),
    age,
    clubIds,
    stats: {
      appearances: player.stats.appearances,
      goals: player.stats.goals,
      assists: player.stats.assists,
      cleanSheets: player.stats.cleanSheets,
      caps,
      internationalGoals,
    },
    trophyIds,
    awardIds,
    records: world.records
      .filter((record) => record.playerId === player.id)
      .map((record) => record.kind),
    hallOfFame: { score, ...hallOfFameRank(world, score, player.id) },
    peakAbility: Math.round(Math.max(career.honours.peakAbility, playerAbility(player))),
    fame: Math.round(career.fame),
    level: career.level,
    earnings: career.market.finances.lifetimeEarnings,
    savings: career.market.finances.cash,
    teammateIds,
    childPlayerId: null,
  };
  world.legacies.push(legacy);
  // Release the player from their club; the retired player stays for the history.
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  if (club) {
    club.playerIds = club.playerIds.filter((id) => id !== player.id);
    refreshDressingRoom(world, club);
  }
  for (const loan of world.loans) {
    const parent = world.clubs[loan.parentClubId];
    if (parent) parent.playerIds = parent.playerIds.filter((id) => id !== player.id);
  }
  if (player.contractId) delete world.contracts[player.contractId];
  player.contractId = null;
  player.clubId = null;
  player.retired = true;
  player.injuryId = null;
  // Only rooms with cliques were copied by the caller; the rest are shared and already empty.
  for (const room of Object.values(world.dressingRooms)) if (room.cliques.length) room.cliques = [];
  world.agents = {};
  world.scouting = [];
  world.offers = [];
  world.negotiations = {};
  world.loans = [];
  world.relationships = [];
  world.inbox = [];
  world.media = [];
  world.rivalries = [];
  world.sponsorships = [];
  world.challenges = [];
  world.callUps = [];
  delete world.awardState;
  delete world.career;
  return legacy;
}

/** People the world keeps for its history: every legacy's player and their child. */
/**
 * Retired teammates of past careers, old enough to manage and not yet in a dugout: the
 * candidates when a club changes manager (AGENTS.md §9.2).
 */
export function formerTeammates(world: World) {
  const employed = new Set(Object.values(world.managers).map((m) => m.formerPlayerId));
  return [...new Set(world.legacies.flatMap((legacy) => legacy.teammateIds))]
    .map((id) => world.archive?.players[id] ?? world.players[id])
    .filter(
      (person): person is NonNullable<typeof person> =>
        Boolean(person) &&
        !employed.has(person!.id) &&
        (!('retired' in person!) || person.retired) &&
        world.date.season - person!.birthSeason >= 34,
    );
}

export const keptPlayerIds = (world: World) =>
  new Set(
    world.legacies.flatMap((legacy) => [
      legacy.playerId,
      ...(legacy.childPlayerId ? [legacy.childPlayerId] : []),
    ]),
  );
