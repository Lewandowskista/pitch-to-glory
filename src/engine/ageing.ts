/**
 * Ageing curves and attribute targets shared by AI development, world generation and the
 * career player's soft caps. Pure and deterministic.
 *
 * A player's peak value for an attribute is `potential + positional emphasis + offset`, where
 * `offset` is a stable deviation derived from the player id, so every player keeps a distinct
 * profile without storing a second attribute set. The value expected at a given age is the
 * peak scaled by that attribute category's age curve.
 */
import type { Attributes, KeeperAttributes, Player, Position } from '../model/domain';
import { CONFIG } from './config';
import { hashSeed, type Rng } from './rng';

const D = CONFIG.world.development;
export type AttributeKey = keyof Attributes;
export type KeeperKey = keyof KeeperAttributes;
export type AnyAttribute = AttributeKey | KeeperKey;
export type AgeCategory = keyof typeof D.curves;

export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  'finishing',
  'passing',
  'dribbling',
  'firstTouch',
  'crossing',
  'heading',
  'tackling',
  'longShots',
  'setPieces',
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'jumping',
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
  'aggression',
];
export const KEEPER_KEYS: readonly KeeperKey[] = [
  'handling',
  'reflexes',
  'diving',
  'oneOnOnes',
  'kicking',
  'commandOfArea',
  'aerialReach',
];
const PACE: readonly AttributeKey[] = ['pace', 'acceleration'];
const PHYSICAL: readonly AttributeKey[] = ['stamina', 'strength', 'agility', 'jumping'];
const MENTAL: readonly AttributeKey[] = [
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
  'aggression',
];
export const isKeeperKey = (key: string): key is KeeperKey =>
  (KEEPER_KEYS as readonly string[]).includes(key);

export function ageCategory(key: AnyAttribute): AgeCategory {
  if (isKeeperKey(key)) return 'keeper';
  if (PACE.includes(key)) return 'pace';
  if (PHYSICAL.includes(key)) return 'physical';
  if (MENTAL.includes(key)) return 'mental';
  return 'technical';
}

/** Multiplier of peak value at an age, linearly interpolated between the configured points. */
export function ageCurve(category: AgeCategory, age: number): number {
  const points = D.curves[category];
  if (age <= points[0]![0]) return points[0]![1];
  for (let index = 1; index < points.length; index++) {
    const [toAge, toValue] = points[index]!;
    if (age <= toAge) {
      const [fromAge, fromValue] = points[index - 1]!;
      return fromValue + ((toValue - fromValue) * (age - fromAge)) / (toAge - fromAge);
    }
  }
  return points[points.length - 1]![1];
}

/** The attributes a position relies on receive extra emphasis at peak. */
export function positionalEmphasis(position: Position, key: AnyAttribute): number {
  const emphasised: readonly AnyAttribute[] =
    position === 'GK'
      ? ['reflexes', 'handling', 'positioning']
      : position === 'ST'
        ? ['finishing', 'heading', 'composure']
        : ['CB', 'LB', 'RB', 'DM'].includes(position)
          ? ['tackling', 'positioning', 'strength']
          : ['passing', 'dribbling', 'vision'];
  return emphasised.includes(key) ? D.positionalEmphasis : 0;
}

/** Stable, id-derived deviation of one attribute from the player's peak level. */
export function profileOffset(playerId: string, key: AnyAttribute, spread = D.profileSpread) {
  const unit = hashSeed(`${playerId}:${key}`) / 4294967296;
  return Math.round((unit * 2 - 1) * spread);
}

/** Attributes a player never trains: an outfielder's goalkeeping and a keeper's outfield craft. */
export function isUntrained(position: Position, key: AnyAttribute): boolean {
  return position === 'GK' ? !isKeeperKey(key) && ageCategory(key) !== 'mental' : isKeeperKey(key);
}

const clamp = (value: number) => Math.max(1, Math.min(99, Math.round(value)));

type Profiled = Pick<Player, 'id' | 'primaryPosition' | 'potential'>;

/** Static value for untrained attributes, inside the configured low band. */
export function untrainedValue(player: Pick<Player, 'id'>, key: AnyAttribute): number {
  const [low, high] = D.untrainedRange;
  const unit = hashSeed(`${player.id}:untrained:${key}`) / 4294967296;
  return Math.round(low + unit * (high - low));
}

/** Peak value of an attribute for an AI player, before ageing. */
export function peakValue(player: Profiled, key: AnyAttribute): number {
  return clamp(
    player.potential +
      positionalEmphasis(player.primaryPosition, key) +
      profileOffset(player.id, key),
  );
}

/** Value an AI player's attribute tends toward at an age. */
export function attributeTarget(player: Profiled, key: AnyAttribute, age: number): number {
  if (isUntrained(player.primaryPosition, key)) return untrainedValue(player, key);
  return clamp(peakValue(player, key) * ageCurve(ageCategory(key), age));
}

/**
 * Career soft cap: potential plus positional emphasis, scaled by the age curve. No hidden
 * offset, so the player's own allocation decides their profile.
 */
export function careerCap(
  player: Pick<Player, 'primaryPosition' | 'potential'>,
  key: AnyAttribute,
  age: number,
): number {
  return clamp(
    (player.potential + positionalEmphasis(player.primaryPosition, key)) *
      ageCurve(ageCategory(key), age),
  );
}

/** Generate attribute sets on the age curve for a new AI player. */
export function generateAttributes(
  player: Profiled,
  age: number,
  rng: Rng,
): { attributes: Attributes; keeperAttributes: KeeperAttributes } {
  const value = (key: AnyAttribute) =>
    isUntrained(player.primaryPosition, key)
      ? untrainedValue(player, key)
      : clamp(attributeTarget(player, key, age) + rng.int(-D.generationNoise, D.generationNoise));
  return {
    attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, value(key)])) as Attributes,
    keeperAttributes: Object.fromEntries(
      KEEPER_KEYS.map((key) => [key, value(key)]),
    ) as KeeperAttributes,
  };
}

/**
 * One week of AI development: every trained attribute moves one point toward its age
 * target with a probability proportional to the gap, so a gap closes by roughly
 * `growthPerSeason` (or `declinePerSeason`) of itself each season.
 */
export function developWeek(player: Player, age: number, seasonWeeks: number, rng: Rng): void {
  const professionalism = D.professionalismBase + player.hidden.professionalism / 100;
  const step = (values: Record<string, number>, key: AnyAttribute) => {
    if (isUntrained(player.primaryPosition, key)) return;
    const current = values[key]!;
    const gap = attributeTarget(player, key, age) - current;
    if (!gap) return;
    const rate = gap > 0 ? D.growthPerSeason * professionalism : D.declinePerSeason;
    if (rng.next() < Math.min(0.9, (Math.abs(gap) * rate) / seasonWeeks))
      values[key] = clamp(current + Math.sign(gap));
  };
  for (const key of ATTRIBUTE_KEYS) step(player.attributes, key);
  for (const key of KEEPER_KEYS) step(player.keeperAttributes, key);
}

/** Mean ability over the attributes a player develops (keeper or outfield set). */
function trainedAbility(
  player: Pick<Player, 'primaryPosition' | 'attributes' | 'keeperAttributes'>,
) {
  const values = Object.values(
    player.primaryPosition === 'GK' ? player.keeperAttributes : player.attributes,
  );
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
/** Weighted curve of the attribute set used for a player's headline ability. */
function abilityCurve(position: Position, age: number): number {
  const keys: readonly AnyAttribute[] = position === 'GK' ? KEEPER_KEYS : ATTRIBUTE_KEYS;
  return keys.reduce((sum, key) => sum + ageCurve(ageCategory(key), age), 0) / keys.length;
}

/**
 * Worlds generated before development version 2 used `potential` as an attribute ceiling
 * well above eventual ability, which made the world drift upward. Re-estimate it as the
 * peak overall ability implied by current ability and age, once.
 */
export function recalibratePotential(player: Player, age: number): number {
  const emphasis = (position: Position) =>
    (position === 'GK' ? KEEPER_KEYS : ATTRIBUTE_KEYS).reduce(
      (sum, key) => sum + positionalEmphasis(position, key),
      0,
    ) / (position === 'GK' ? KEEPER_KEYS : ATTRIBUTE_KEYS).length;
  return clamp(
    trainedAbility(player) / abilityCurve(player.primaryPosition, age) -
      emphasis(player.primaryPosition),
  );
}
