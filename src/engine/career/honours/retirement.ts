import type { Career, Legacy, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import { playerAbility } from '../../strength';
import { refreshDressingRoom } from '../../world/dressing';
import { today } from '../market/rules';
import { adjustRelationship, postMessage } from '../market/records';
import { chronicle } from './chronicle';
import { leaveInternationalFootball } from './international';
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
/** One person in the Hall of Fame table: who, and what their record is worth. */
interface HallOfFameEntry {
  id: string;
  score: number;
}
/**
 * Every player the world remembers, active, retired or archived, each once, sorted by score
 * and then id (ascending). A former career is listed with its saved honour-inclusive legacy
 * score, the same criteria a new score uses, never with its club numbers alone. Everyone else
 * is scored from the shared achievement record (`achievements.ts`); in a world that has not yet
 * adopted it, by club numbers and awards (their trophies were not recorded).
 */
export function hallOfFameTable(world: World): readonly HallOfFameEntry[] {
  return [...hallOfFameScores(world)]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** Everyone's Hall of Fame score by id, unsorted (see `hallOfFameTable`). */
function hallOfFameScores(world: World): Map<string, number> {
  const scores = new Map<string, number>();
  const add = (id: string, value: number) => {
    if (!scores.has(id)) scores.set(id, value);
  };
  for (const legacy of world.legacies) add(legacy.playerId, legacy.hallOfFame.score);
  if (usesAchievements(world)) {
    // One record for everyone: the same rules for active, retired and archived players.
    const season =
      world.phase === 'active' ? seasonContributions(world) : new Map<string, number>();
    for (const player of Object.values(world.players))
      add(player.id, achievementScore(world, player, season));
    for (const [id, record] of Object.entries(world.archive?.players ?? {}))
      add(id, Math.round(record.hallOfFame ?? 0));
    return scores;
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
    add(
      player.id,
      hallOfFameScore(player.stats, {
        caps: 0,
        trophies: 0,
        awards: awards.get(player.id) ?? 0,
        goldenBalls: 0,
      }),
    );
  for (const [id, record] of Object.entries(world.archive?.players ?? {}))
    add(id, hallOfFameScore(record.stats));
  return scores;
}
/** The name the world remembers someone by: a legacy, a current player or the archive. */
function rememberedName(world: World, id: string): string {
  return (
    world.legacies.find((legacy) => legacy.playerId === id)?.name ??
    world.players[id]?.name ??
    world.archive?.players[id]?.name ??
    id
  );
}
/** The first index in the sorted table whose score passes the test (scores ascend). */
function firstWhere(table: readonly HallOfFameEntry[], test: (value: number) => boolean): number {
  let low = 0;
  let high = table.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (test(table[middle]!.score)) high = middle;
    else low = middle + 1;
  }
  return low;
}
const firstAbove = (table: readonly HallOfFameEntry[], score: number) =>
  firstWhere(table, (value) => value > score);
const firstAtLeast = (table: readonly HallOfFameEntry[], score: number) =>
  firstWhere(table, (value) => value >= score);
/** Rank a score within a table, leaving out one person (the score's own owner). */
function standingIn(
  world: World,
  table: readonly HallOfFameEntry[],
  score: number,
  excludeId: string,
): HallOfFameStanding {
  const above = firstAbove(table, score);
  let better = table.length - above;
  let of = table.length + 1;
  let next: HallOfFameStanding['next'] = null;
  for (let index = above; index < table.length; index++) {
    const entry = table[index]!;
    if (entry.id === excludeId) continue;
    next = { id: entry.id, name: rememberedName(world, entry.id), score: entry.score };
    break;
  }
  if (table.some((entry) => entry.id === excludeId)) {
    of--;
    const own = table.find((entry) => entry.id === excludeId)!;
    if (own.score > score) better--;
  }
  return { rank: better + 1, of, next };
}
/**
 * Rank a score among every player the world remembers, active, retired or archived, each
 * once (`hallOfFameTable`), leaving out `excludeId`. Always worked out afresh: retirement and
 * the invariants use it. Screens use the memoised `liveHallOfFame` instead.
 */
export function hallOfFameStanding(
  world: World,
  score: number,
  excludeId: string,
): HallOfFameStanding {
  return standingIn(world, hallOfFameTable(world), score, excludeId);
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

/**
 * The table changes only when matches are played, awards are given or careers end: the
 * memoised copy is kept per world state (`world.id`, the date and phase, and those counts),
 * so the hub, the Trophies page and the Legacy page share one pass over every player a week.
 */
let cachedTable: { key: string; table: readonly HallOfFameEntry[] } | null = null;
function tableKey(world: World): string {
  const { season, week, day } = world.date;
  return [
    world.id,
    season,
    week,
    day,
    world.phase,
    world.career?.matches.length ?? -1,
    Object.keys(world.results).length,
    world.awards.length,
    world.legacies.length,
    world.legacies.reduce((sum, legacy) => sum + legacy.hallOfFame.score, 0),
    Object.keys(world.archive?.players ?? {}).length,
  ].join('|');
}
/** The Hall of Fame table for a world state, worked out once per week (see `tableKey`). */
const tables = new WeakMap<World, readonly HallOfFameEntry[]>();
export function memoisedHallOfFameTable(world: World): readonly HallOfFameEntry[] {
  // The same world object is the same state: no need to work out its key again.
  const known = tables.get(world);
  if (known) return known;
  const key = tableKey(world);
  if (cachedTable?.key !== key) cachedTable = { key, table: hallOfFameTable(world) };
  tables.set(world, cachedTable.table);
  return cachedTable.table;
}
/**
 * The person just below a score, with the rank they hold: "ahead of Kai Mercer, #9". The
 * table may include `excludeId` (the score's owner), who is skipped. Null at the bottom.
 */
export function hallOfFameBelow(
  world: World,
  score: number,
  excludeId: string,
): { id: string; name: string; score: number; rank: number } | null {
  const table = memoisedHallOfFameTable(world);
  // The highest score below this one; among equal scores the lowest id, as `next` does.
  let index = firstAtLeast(table, score) - 1;
  while (index >= 0 && table[index]!.id === excludeId) index--;
  if (index < 0) return null;
  let first = firstAtLeast(table, table[index]!.score);
  while (table[first]!.id === excludeId) first++;
  const entry = table[first]!;
  // Their rank: everyone else above them, plus the score's owner.
  const owner = table.find((other) => other.id === excludeId);
  const above =
    table.length - firstAbove(table, entry.score) - (owner && owner.score > entry.score ? 1 : 0);
  return {
    id: entry.id,
    name: rememberedName(world, entry.id),
    score: entry.score,
    rank: above + 2,
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
/**
 * The career's place in the Hall of Fame right now, for ambitions. Worked out afresh, so the
 * engine never depends on what a screen happened to cache.
 */
export function liveHallOfFame(world: World): HallOfFameStanding & { score: number } {
  const score = careerHallOfFameScore(world);
  return { score, ...hallOfFameStanding(world, score, world.career!.playerId) };
}
/**
 * The same standing for screens ("#4 of 3,812" on the hub, the Trophies page and ambitions),
 * from the memoised table: the career's own score is always current, everyone else's is the
 * week's. Identical to `liveHallOfFame` for the same world state.
 */
const ranks = new WeakMap<World, HallOfFameStanding & { score: number }>();
export function liveHallOfFameRank(world: World): HallOfFameStanding & { score: number } {
  // The hub's honours card and ambitions ask for the same world's standing.
  const known = ranks.get(world);
  if (known) return known;
  const score = careerHallOfFameScore(world);
  const id = world.career!.playerId;
  // One rank needs no sorted table: a pass over the scores finds it (the hub's first paint).
  const table = tables.get(world);
  const standing = {
    score,
    ...(table ? standingIn(world, table, score, id) : standingAmong(world, score, id)),
  };
  ranks.set(world, standing);
  return standing;
}
/**
 * Everyone's scores for screens, kept while the records they come from are the same objects:
 * a screen action copies only what it changes (`draftWorld`), so taking a challenge or
 * answering the press does not score every player again.
 */
let sharedScores: { sources: readonly unknown[]; scores: Map<string, number> } | null = null;
function screenScores(world: World): Map<string, number> {
  const sources = [
    world.players,
    world.archive,
    world.seasonStats,
    world.legacies,
    world.awards,
    world.achievements,
    world.leagues,
    world.clubs,
    world.phase,
  ];
  if (!sharedScores || sharedScores.sources.some((source, index) => source !== sources[index]))
    sharedScores = { sources, scores: hallOfFameScores(world) };
  return sharedScores.scores;
}
/** `standingIn` from unsorted scores, in one pass: the same rank, total and next name. */
function standingAmong(world: World, score: number, excludeId: string): HallOfFameStanding {
  const scores = screenScores(world);
  let better = 0;
  let next: { id: string; score: number } | null = null;
  for (const [id, value] of scores) {
    if (id === excludeId || value <= score) continue;
    better++;
    if (!next || value < next.score || (value === next.score && id < next.id))
      next = { id, score: value };
  }
  return {
    rank: better + 1,
    of: scores.size + (scores.has(excludeId) ? 0 : 1),
    next: next && { id: next.id, name: rememberedName(world, next.id), score: next.score },
  };
}
/**
 * Who a retired career is just ahead of in the Hall of Fame, for the Legacy page. The legacy
 * keeps the rank it retired with; while the world's table still agrees with it, the next name
 * down is shown. Once others have moved past (the world plays on), there is no line rather
 * than one that mixes two moments.
 */
export function legacyNeighbour(
  world: World,
  legacy: Pick<Legacy, 'playerId' | 'hallOfFame'>,
): { name: string; rank: number } | null {
  const { score, rank } = legacy.hallOfFame;
  if (standingIn(world, memoisedHallOfFameTable(world), score, legacy.playerId).rank !== rank)
    return null;
  const below = hallOfFameBelow(world, score, legacy.playerId);
  return below ? { name: below.name, rank: below.rank } : null;
}

/**
 * Retire the career player: write the legacy, release them from their club, and clear the
 * career's own records (agents, offers, relationships, inbox, media, rivalry, sponsors,
 * challenges, call-ups, and its place in a tournament or window). Chronicle, moments, awards,
 * trophies and records stay. Mutates the given world.
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
    // Youngsters mentored (review phase 5): one may become a manager in the world to come.
    ...(() => {
      const menteeIds = [
        ...new Set(
          (career.facts ?? [])
            .filter((fact) => fact.kind === 'mentored' && fact.playerId)
            .map((fact) => fact.playerId!),
        ),
      ];
      return menteeIds.length ? { menteeIds } : {};
    })(),
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
  leaveInternationalFootball(world);
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
  // Mentees first (review phase 5): the youngsters a past career took under its wing.
  const mentees = world.legacies.flatMap((legacy) => legacy.menteeIds ?? []);
  return [...new Set([...mentees, ...world.legacies.flatMap((legacy) => legacy.teammateIds)])]
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
