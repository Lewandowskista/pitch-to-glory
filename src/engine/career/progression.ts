import type { Career, Player, World } from '../../model/domain';
import { CONFIG } from '../config';
import {
  ATTRIBUTE_KEYS,
  KEEPER_KEYS,
  ageCategory,
  careerCap,
  isKeeperKey,
  isUntrained,
  type AnyAttribute,
} from '../ageing';
import { SKILL_BY_ID } from './catalogue';

const C = CONFIG.career;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(C.levelXpBase * C.levelXpGrowth ** (level - 1));
}
/** Total XP at which `level` is reached (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let current = 1; current < level; current++) total += xpToNext(current);
  return total;
}
export function levelForXp(xp: number): number {
  let level = 1;
  let total = 0;
  while (level < C.maximumLevel && total + xpToNext(level) <= xp) {
    total += xpToNext(level);
    level++;
  }
  return level;
}
/** Progress within the current level, for the XP bar. */
export function levelProgress(career: Pick<Career, 'xp' | 'level'>) {
  const start = xpForLevel(career.level);
  const needed = career.level >= C.maximumLevel ? 0 : xpToNext(career.level);
  return { into: career.xp - start, needed };
}

export const careerPlayer = (world: World): Player => {
  const career = world.career;
  if (!career) throw new Error('This world has no career');
  return world.players[career.playerId]!;
};
export const careerAge = (world: World) => world.date.season - careerPlayer(world).birthSeason;

/** Attributes the career player can develop: outfield or goalkeeping sets plus mental. */
export function trainableAttributes(player: Pick<Player, 'primaryPosition'>): AnyAttribute[] {
  return [...ATTRIBUTE_KEYS, ...KEEPER_KEYS].filter(
    (key) => !isUntrained(player.primaryPosition, key),
  );
}
export function attributeValue(player: Player, key: AnyAttribute): number {
  return isKeeperKey(key) ? player.keeperAttributes[key] : player.attributes[key];
}
function setAttribute(player: Player, key: AnyAttribute, value: number): void {
  const bounded = Math.max(1, Math.min(99, Math.round(value)));
  if (isKeeperKey(key)) player.keeperAttributes[key] = bounded;
  else player.attributes[key] = bounded;
}

/**
 * Attribute points needed to raise `key` by one, or null when it cannot be raised. Costs rise
 * at the age-adjusted soft cap and again beyond it; physical attributes cost more from 29.
 */
export function attributeCost(world: World, key: AnyAttribute): number | null {
  const player = careerPlayer(world);
  if (isUntrained(player.primaryPosition, key)) return null;
  const value = attributeValue(player, key);
  if (value >= 99) return null;
  const age = careerAge(world);
  const cap = careerCap(player, key, age);
  const base =
    value < cap
      ? C.costs.belowCap
      : value < cap + C.costs.capMargin
        ? C.costs.nearCap
        : C.costs.beyondCap;
  const category = ageCategory(key);
  const physical = category === 'pace' || category === 'physical';
  return base + (physical && age >= C.costs.physicalAge ? C.costs.physicalSurcharge : 0);
}

/** Copy only the career record and the career player, sharing the rest of the world. */
export function withCareerChange(
  world: World,
  change: (career: Career, player: Player) => void,
): World {
  const career = structuredClone(world.career!);
  const player = structuredClone(world.players[career.playerId]!);
  change(career, player);
  return { ...world, career, players: { ...world.players, [player.id]: player } };
}

export function raiseAttribute(world: World, key: AnyAttribute): World {
  const cost = attributeCost(world, key);
  if (cost === null || cost > world.career!.attributePoints)
    throw new Error('Not enough attribute points');
  return withCareerChange(world, (career, player) => {
    career.attributePoints -= cost;
    setAttribute(player, key, attributeValue(player, key) + 1);
  });
}

export type SkillState = 'unlocked' | 'available' | 'locked' | 'unavailable';
export function skillState(world: World, id: string): SkillState {
  const career = world.career!;
  const skill = SKILL_BY_ID[id];
  if (!skill) return 'unavailable';
  if (career.skills.includes(id)) return 'unlocked';
  const keeper = careerPlayer(world).primaryPosition === 'GK';
  if ((skill.for === 'keeper' && !keeper) || (skill.for === 'outfield' && keeper))
    return 'unavailable';
  return skill.prerequisites.every((p) => career.skills.includes(p)) &&
    career.level >= skill.minimumLevel &&
    career.skillPoints >= skill.pointCost
    ? 'available'
    : 'locked';
}
function grantSkill(career: Career, player: Player, id: string): void {
  const skill = SKILL_BY_ID[id]!;
  career.skills.push(id);
  player.traits = [...career.skills];
  for (const [key, bonus] of Object.entries(skill.attributeBonuses) as [AnyAttribute, number][])
    setAttribute(player, key, attributeValue(player, key) + bonus);
}
export function unlockSkill(world: World, id: string): World {
  if (skillState(world, id) !== 'available') throw new Error('Skill unavailable');
  return withCareerChange(world, (career, player) => {
    career.skillPoints -= SKILL_BY_ID[id]!.pointCost;
    grantSkill(career, player, id);
  });
}
/** The archetype's first skill is granted free at creation. */
export function grantStartingSkill(career: Career, player: Player, id: string): void {
  grantSkill(career, player, id);
}

/** Add XP, applying every level-up it reaches. Returns the levels gained. */
export function addXp(career: Career, xp: number): number {
  const before = career.level;
  career.xp += Math.max(0, Math.round(xp));
  career.level = levelForXp(career.xp);
  const gained = career.level - before;
  career.attributePoints += gained * C.attributePointsPerLevel;
  career.skillPoints += gained * C.skillPointsPerLevel;
  return gained;
}
