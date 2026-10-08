import type { Legacy, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import { playerAbility } from '../../strength';
import { refreshDressingRoom } from '../../world/dressing';
import { today } from '../market/rules';
import { chronicle } from './chronicle';

/**
 * Retirement and legacy (AGENTS.md §8, §9.2). The player chooses when to retire from age 32
 * once a season is complete, and must retire at 40. The career becomes a legacy record; the
 * world carries on, with the retired player kept for the history, and a new career (or the
 * player's child) can start in the same world.
 */
const H = CONFIG.career.honours;

export function retirementAge(world: World): number {
  const player = world.players[world.career!.playerId]!;
  return world.date.season - player.birthSeason;
}
export type RetirementState = 'young' | 'season' | 'available' | 'forced';
/** Whether the player may (or must) retire now. */
export function retirementState(world: World): RetirementState {
  const age = retirementAge(world);
  if (age >= H.retirement.forcedAge) return 'forced';
  // Decline forces it too: past the decline age, a player well below their peak is done.
  const career = world.career!;
  const player = world.players[career.playerId]!;
  if (
    age >= H.retirement.declineAge &&
    world.phase === 'complete' &&
    career.honours.peakAbility > 0 &&
    playerAbility(player) < career.honours.peakAbility * H.retirement.declineShare
  )
    return 'forced';
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

/**
 * Rank a score among every player the world remembers, active, retired or archived, each
 * once. A former career is compared by its saved honour-inclusive legacy score, the same
 * criteria the new score uses, never by its club numbers alone.
 */
export function hallOfFameRank(
  world: World,
  score: number,
  excludeId: string,
): { rank: number; of: number } {
  let better = 0;
  let of = 1;
  const counted = new Set<string>([excludeId]);
  const compare = (id: string, value: number) => {
    if (counted.has(id)) return;
    counted.add(id);
    of++;
    if (value > score) better++;
  };
  for (const legacy of world.legacies) compare(legacy.playerId, legacy.hallOfFame.score);
  // Other players count their awards too (their trophies are not recorded).
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
    );
  for (const [id, record] of Object.entries(world.archive?.players ?? {}))
    compare(id, hallOfFameScore(record.stats));
  return { rank: better + 1, of };
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
  const goldenBalls = world.awards.filter(
    (award) => award.kind === 'golden-ball' && award.winnerIds[0] === player.id,
  ).length;
  const caps = Object.values(career.honours.caps).reduce((sum, value) => sum + value, 0);
  const internationalGoals = Object.values(career.honours.internationalGoals).reduce(
    (sum, value) => sum + value,
    0,
  );
  // Caps at every level count, as the legacy's statistics record them.
  const score = hallOfFameScore(player.stats, {
    caps,
    trophies: trophyIds.length,
    awards: awardPoints(world, awardIds, player.id),
    goldenBalls,
  });
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
  for (const room of Object.values(world.dressingRooms)) room.cliques = [];
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
