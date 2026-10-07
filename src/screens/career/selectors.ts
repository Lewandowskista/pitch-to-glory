/**
 * Pure UI selectors and world helpers for the career screens. No React or browser APIs.
 */
import type {
  Career,
  CareerMatchRecord,
  Club,
  Player,
  Position,
  TrainingPlan,
  World,
} from '../../model/domain';
import {
  ATTRIBUTE_KEYS,
  KEEPER_KEYS,
  ageCategory,
  isUntrained,
  type AnyAttribute,
} from '../../engine/ageing';

export const POSITIONS: readonly Position[] = [
  'GK',
  'CB',
  'LB',
  'RB',
  'DM',
  'CM',
  'AM',
  'LW',
  'RW',
  'ST',
];

/** Replace the career's training plan, sharing the rest of the world. */
export function withTraining(world: World, training: TrainingPlan): World {
  const career = world.career;
  if (!career) throw new Error('This world has no career');
  return { ...world, career: { ...career, training: structuredClone(training) } };
}

export interface SeasonLine {
  season: number;
  apps: number;
  goals: number;
  assists: number;
  rating: number;
  cleanSheets: number;
  xp: number;
}
export function seasonLines(career: Career): SeasonLine[] {
  const lines = new Map<number, SeasonLine & { ratingTotal: number }>();
  for (const match of career.matches) {
    const line = lines.get(match.season) ?? {
      season: match.season,
      apps: 0,
      goals: 0,
      assists: 0,
      rating: 0,
      ratingTotal: 0,
      cleanSheets: 0,
      xp: 0,
    };
    line.apps++;
    line.goals += match.goals;
    line.assists += match.assists;
    line.ratingTotal += match.rating;
    line.cleanSheets += match.cleanSheet ? 1 : 0;
    line.xp += match.xp;
    lines.set(match.season, line);
  }
  return [...lines.values()]
    .map(({ ratingTotal, ...line }) => ({
      ...line,
      rating: line.apps ? Math.round((ratingTotal / line.apps) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.season - a.season);
}
export function seasonLine(career: Career, season: number): SeasonLine {
  return (
    seasonLines(career).find((line) => line.season === season) ?? {
      season,
      apps: 0,
      goals: 0,
      assists: 0,
      rating: 0,
      cleanSheets: 0,
      xp: 0,
    }
  );
}
/** A season's league matches only, wherever the player played them (regular-season fixtures). */
export function leagueSeasonLine(
  world: World,
  career: Career,
  season: number,
): { apps: number; goals: number; assists: number } {
  const matches = career.matches.filter(
    (match) => match.season === season && Boolean(world.leagues[match.competitionId]),
  );
  return {
    apps: matches.length,
    goals: matches.reduce((sum, match) => sum + match.goals, 0),
    assists: matches.reduce((sum, match) => sum + match.assists, 0),
  };
}
export function recentForm(career: Career, count = 5): CareerMatchRecord[] {
  return career.matches.slice(-count);
}

/** The club's place in its league table, when it plays in a simulated league. */
export function leaguePosition(
  world: World,
  clubId: string,
): { rank: number; total: number; points: number; played: number; leagueName: string } | null {
  const club = world.clubs[clubId];
  const league = club ? world.leagues[club.leagueId] : undefined;
  if (!league) return null;
  const index = league.standings.findIndex((row) => row.clubId === clubId);
  if (index < 0) return null;
  const row = league.standings[index]!;
  return {
    rank: index + 1,
    total: league.standings.length,
    points: row.points,
    played: row.played,
    leagueName: league.name,
  };
}
export function competitionName(world: World, competitionId: string): string {
  return (
    world.leagues[competitionId]?.name ??
    world.competitions[competitionId]?.name ??
    world.pyramid?.phases[competitionId]?.name ??
    world.pyramid?.ties[competitionId]?.name ??
    competitionId
  );
}
export function clubOf(world: World, player: Player): Club | undefined {
  return player.clubId ? world.clubs[player.clubId] : undefined;
}

/** Qualitative potential band (index into the copy's band list). */
export function potentialBand(potential: number): number {
  return potential >= 88 ? 4 : potential >= 84 ? 3 : potential >= 80 ? 2 : potential >= 76 ? 1 : 0;
}

export type AttributeGroup = 'technical' | 'physical' | 'mental' | 'keeper';
/** Attribute groups the player trains, in display order, plus the untrained set. */
export function attributeGroups(player: Pick<Player, 'primaryPosition'>): {
  trained: { group: AttributeGroup; keys: AnyAttribute[] }[];
  untrained: AnyAttribute[];
} {
  const all: AnyAttribute[] = [...ATTRIBUTE_KEYS, ...KEEPER_KEYS];
  const groupOf = (key: AnyAttribute): AttributeGroup => {
    const category = ageCategory(key);
    return category === 'pace' ? 'physical' : category;
  };
  const order: AttributeGroup[] =
    player.primaryPosition === 'GK' ? ['keeper', 'mental'] : ['technical', 'physical', 'mental'];
  return {
    trained: order.map((group) => ({
      group,
      keys: all.filter(
        (key) => groupOf(key) === group && !isUntrained(player.primaryPosition, key),
      ),
    })),
    untrained: all.filter((key) => isUntrained(player.primaryPosition, key)),
  };
}

/** Training plans compare by value, to show unsaved changes. */
export function samePlan(a: TrainingPlan, b: TrainingPlan): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
