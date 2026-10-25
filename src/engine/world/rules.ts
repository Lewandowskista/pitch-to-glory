/**
 * The world and career rule flags (docs/COMPATIBILITY.md) and their one-time adoption when an
 * older save is loaded: the 1.0 compatibility cut (docs/RELEASE-1.0-PLAN.md step 2.4, decision
 * D3). New worlds and careers start on every current rule; a save from an earlier release adopts
 * them in the schema 23 migration (src/persistence/schema.ts), part-way through a season if need
 * be, instead of at its next season start. Pure and deterministic: no random draws.
 *
 * - `developmentVersion` 2: potentials re-estimated from ability and age, once.
 * - `selectionVersion` 1: formation-aware selection, for background results, the career's
 *   place in the side and the match engine alike.
 * - `economyVersion` 1: the club economy; running costs are set from what peers pay now.
 * - `achievements` 1: the shared Hall of Fame record (`adoptAchievementsNow`), unless the season's
 *   statistics are incomplete or the world is between seasons: then at the next season start.
 * - `career.developmentRules` 3: late decline, availability-based playing time and focus-weighted
 *   growth (`adoptDevelopmentRules`).
 *
 * `identityVersion` is not a rule but an identity: worlds made with fictional countries keep
 * them (legacy worlds, `world/legacy.ts`).
 */
import type { World } from '../../model/domain';
import { CONFIG } from '../config';
import { recalibratePotential } from '../ageing';
import { setSeasonCosts, usesEconomy } from './economy';
import { adoptAchievementsNow } from '../career/honours/achievements';
import { adoptDevelopmentRules } from '../career/training';

/** The current value of each rule flag, as new worlds and careers carry them. */
export const RULE_FLAGS = {
  developmentVersion: 2,
  selectionVersion: CONFIG.selection.version,
  economyVersion: 1,
  achievements: 1,
  developmentRules: 3,
} as const;
export type RuleFlag = keyof typeof RULE_FLAGS;

/**
 * Worlds generated before development version 2 treated potential as a ceiling well above
 * eventual ability, which made the world drift upward. Re-estimate it once from current
 * ability and age, so these worlds follow the same equilibrium as new ones.
 */
function recalibrateDevelopment(world: World): void {
  for (const player of Object.values(world.players))
    if (!player.retired && player.id !== world.career?.playerId)
      player.potential = recalibratePotential(player, world.date.season - player.birthSeason);
  world.developmentVersion = RULE_FLAGS.developmentVersion;
}

/**
 * Adopt every current rule the world and its career do not yet follow, and return the flags
 * adopted. Idempotent: a world on the current rules is left untouched.
 */
export function adoptCurrentRules(world: World): RuleFlag[] {
  const adopted: RuleFlag[] = [];
  if (world.developmentVersion !== RULE_FLAGS.developmentVersion) {
    recalibrateDevelopment(world);
    adopted.push('developmentVersion');
  }
  if (world.selectionVersion !== RULE_FLAGS.selectionVersion) {
    world.selectionVersion = RULE_FLAGS.selectionVersion;
    adopted.push('selectionVersion');
  }
  if (!usesEconomy(world)) {
    world.economyVersion = RULE_FLAGS.economyVersion;
    setSeasonCosts(world);
    adopted.push('economyVersion');
  }
  if (world.achievements?.version !== RULE_FLAGS.achievements && adoptAchievementsNow(world))
    adopted.push('achievements');
  if (world.career && (world.career.developmentRules ?? 0) < RULE_FLAGS.developmentRules) {
    adoptDevelopmentRules(world);
    adopted.push('developmentRules');
  }
  return adopted;
}
