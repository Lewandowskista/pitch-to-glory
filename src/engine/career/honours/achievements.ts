/**
 * One Hall of Fame record for every player (achievement record 1). Club contributions accrue
 * at each season's end from its statistics, weighted by the level they came at; trophies when a
 * title is decided, for everyone who played in the campaign; awards when given; caps when won.
 * The career player earns by exactly the same rules, so a score means the same for an active,
 * retired or archived player and for a legacy. Points live on the player (`hallOfFame`) and
 * survive archiving. Pure apart from the world it is given.
 */
import type { Award, Player, Position, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import { hasSeasonStatistics } from '../../world/statistics';
import { decidedTitles, type Title } from '../../world/titles';
import { CONTINENTAL_IDS } from '../../world/continental';

const F = CONFIG.career.honours.hallOfFame;
const C = F.contribution;
type Line = 'GK' | 'DEF' | 'MID' | 'ATT';
const LINE: Record<Position, Line> = {
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
const round = (value: number) => Math.round(value * 10) / 10;

export const usesAchievements = (world: World): boolean => world.achievements?.version === 1;

/** The weight of a level: tier 1 counts in full, lower tiers less. */
export function tierWeight(tier: number): number {
  return F.tiers[Math.max(1, Math.min(F.tiers.length, tier)) - 1]!;
}
const clubTier = (world: World, clubId: string | null | undefined): number => {
  const club = clubId ? world.clubs[clubId] : undefined;
  return (club && world.leagues[club.leagueId]?.tier) ?? F.untrackedTier;
};

/** Club contribution of a stat line, before its level's weight. */
export function contribution(
  position: Position,
  stats: { appearances: number; goals: number; assists: number; cleanSheets: number },
): number {
  const line = LINE[position];
  return (
    stats.appearances * F.appearance +
    stats.goals * C.goal[line] +
    stats.assists * C.assist[line] +
    stats.cleanSheets * C.cleanSheet[line]
  );
}

/** Add points to a player's record, active or archived. */
export function addAchievement(world: World, playerId: string, points: number): void {
  if (!points) return;
  const holder: { hallOfFame?: number } | undefined =
    world.players[playerId] ?? world.archive?.players[playerId];
  if (holder) holder.hallOfFame = round((holder.hallOfFame ?? 0) + points);
}

/** A competition's level weight for a club's numbers in it. */
function competitionWeight(world: World, competitionId: string, clubId: string): number {
  const league = world.leagues[competitionId];
  if (league) return tierWeight(league.tier);
  if ((CONTINENTAL_IDS as readonly string[]).includes(competitionId)) return F.continental;
  return tierWeight(clubTier(world, clubId));
}

/** This season's club contributions so far, by player, from complete season statistics. */
export function seasonContributions(world: World): Map<string, number> {
  const points = new Map<string, number>();
  if (!hasSeasonStatistics(world)) return points;
  for (const [competitionId, clubs] of Object.entries(world.seasonStats!.competitions))
    for (const [clubId, players] of Object.entries(clubs)) {
      const weight = competitionWeight(world, competitionId, clubId);
      for (const [playerId, [appearances, , goals, assists, cleanSheets]] of Object.entries(
        players,
      )) {
        const player = world.players[playerId];
        if (!player || !appearances) continue;
        const value =
          weight *
          contribution(player.primaryPosition, { appearances, goals, assists, cleanSheets });
        points.set(playerId, (points.get(playerId) ?? 0) + value);
      }
    }
  return points;
}

/** The season's end, once its tables are archived: club contributions join the record. */
export function accrueSeason(world: World): void {
  if (!usesAchievements(world)) return;
  for (const [playerId, points] of seasonContributions(world))
    addAchievement(world, playerId, points);
}

/** What a title is worth: its level's weight, more for continental cups, less for others. */
function titleWeight(world: World, title: Title): number {
  const league = world.leagues[title.competitionId];
  if (league) return tierWeight(league.tier);
  if (title.divisionId) {
    const group = Object.values(world.leagues).find((l) => l.divisionId === title.divisionId);
    return tierWeight(group?.tier ?? F.untrackedTier);
  }
  const continental = F.continentalTrophy[title.competitionId];
  return continental ?? F.domesticCup;
}

/**
 * Titles decided this week: everyone who played for the winning club in the campaign earns
 * the trophy, as the career player does (`recordCareerTrophies`). Each title is credited once.
 */
export function creditTitles(world: World): void {
  const state = world.achievements;
  const stats = world.seasonStats;
  if (state?.version !== 1 || !stats || !hasSeasonStatistics(world)) return;
  for (const title of decidedTitles(world)) {
    const id = `${world.date.season}:${title.competitionId}`;
    if (state.titles.includes(id)) continue;
    state.titles.push(id);
    const points = F.trophy * titleWeight(world, title);
    const winners = new Set<string>();
    for (const competitionId of title.campaign)
      for (const [playerId, line] of Object.entries(
        stats.competitions[competitionId]?.[title.clubId] ?? {},
      ))
        if (line[0] > 0) winners.add(playerId);
    for (const playerId of winners) addAchievement(world, playerId, points);
  }
}

/** What an award adds: a Golden Ball its own weight, a month nothing, others by kind. */
export function awardAchievement(award: Pick<Award, 'kind'>): number {
  if (award.kind === 'golden-ball') return F.goldenBall;
  if (award.kind === 'month') return 0;
  return (F.awardWeights as Record<string, number>)[award.kind] ?? F.award;
}
export function creditAward(world: World, award: Award): void {
  if (!usesAchievements(world)) return;
  const points = awardAchievement(award);
  const winners = award.kind === 'golden-ball' ? award.winnerIds.slice(0, 1) : award.winnerIds;
  for (const playerId of winners) addAchievement(world, playerId, points);
}

/** Caps for players who started an international (the career player is credited by `credit`). */
export function creditCaps(world: World, playerIds: readonly string[], caps = 1): void {
  if (!usesAchievements(world)) return;
  const careerId = world.career?.playerId;
  for (const id of playerIds) if (id !== careerId) addAchievement(world, id, caps * F.cap);
}

/** A player's current score: the record plus this season's contribution while it runs. */
export function achievementScore(
  world: World,
  player: Pick<Player, 'id' | 'hallOfFame'>,
  season: Map<string, number> = world.phase === 'active' ? seasonContributions(world) : new Map(),
): number {
  return Math.round((player.hallOfFame ?? 0) + (season.get(player.id) ?? 0));
}

/**
 * Season start: a world without the record adopts it. Earlier numbers are seeded from what was
 * kept, weighted by the player's current level (archived players, whose level was not kept,
 * at `untrackedTier`), with the awards still on record. Other players' trophies and caps were
 * never recorded, so they count from `since`; the career's own trophies and caps are kept.
 * Legacies are rescored by the same rules from their saved record.
 */
export function adoptAchievements(world: World): void {
  if (usesAchievements(world)) {
    world.achievements!.titles = [];
    return;
  }
  world.achievements = { version: 1, since: world.date.season, titles: [] };
  const awards = new Map<string, number>();
  for (const award of world.awards) {
    const points = awardAchievement(award);
    const winners = award.kind === 'golden-ball' ? award.winnerIds.slice(0, 1) : award.winnerIds;
    for (const id of winners) awards.set(id, (awards.get(id) ?? 0) + points);
  }
  for (const player of Object.values(world.players)) {
    const tier = player.retired ? F.untrackedTier : clubTier(world, player.clubId);
    const value =
      tierWeight(tier) * contribution(player.primaryPosition, player.stats) +
      (awards.get(player.id) ?? 0);
    delete player.hallOfFame;
    addAchievement(world, player.id, value);
  }
  for (const record of Object.values(world.archive?.players ?? {})) {
    delete record.hallOfFame;
    addAchievement(
      world,
      record.id,
      tierWeight(F.untrackedTier) * contribution(record.primaryPosition, record.stats) +
        (awards.get(record.id) ?? 0),
    );
  }
  const career = world.career;
  if (career) {
    const trophies = world.trophies.filter((trophy) => trophy.playerIds.includes(career.playerId));
    const caps = Object.values(career.honours.caps).reduce((sum, value) => sum + value, 0);
    addAchievement(world, career.playerId, trophies.length * F.trophy + caps * F.cap);
  }
  for (const legacy of world.legacies) {
    const goldenBalls = world.awards.filter(
      (award) => award.kind === 'golden-ball' && award.winnerIds[0] === legacy.playerId,
    ).length;
    const others = world.awards
      .filter((award) => legacy.awardIds.includes(award.id) && award.kind !== 'golden-ball')
      .reduce((sum, award) => sum + awardAchievement(award), 0);
    legacy.hallOfFame.score = Math.round(
      tierWeight(F.untrackedTier) * contribution(legacy.position, legacy.stats) +
        legacy.trophyIds.length * F.trophy +
        legacy.stats.caps * F.cap +
        others +
        goldenBalls * F.goldenBall,
    );
  }
}
