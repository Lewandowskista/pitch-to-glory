/**
 * The match engine's public surface. The engine itself is split by concern; the module map is
 * in docs/ARCHITECTURE.md ("Interactive match sessions").
 */
export * from './types';
export { SITUATIONS, SITUATION_BY_ID } from './situations';
export { rolesForPosition, positionFamily } from './roles';
export { span, attacksRightAt } from './motion';
export { NARRATION_FAMILIES, NARRATION_VARIANTS, CUT_FAMILIES } from './narration';
export {
  buildChoices,
  expectedImpact,
  momentBudget,
  situationWeights,
  type DecisionContext,
} from './decisions';
export { pitchEffect, weatherEffect } from './conditions';
export { PARKED, OFF_ANIMATION } from './parked';
export { slotPosition } from '../selection/lineup';
export { OutdatedMatchSessionError, createMatchSetup, createMatchSession } from './setup';
export { rolePosition, fullTime } from './shared';
export { sessionPenalties } from './extraTime';
export { applyMatchCommand } from './commands';
// The occasions (match-22): stoppage time, the bench, injuries, the shootout, the touchline.
export { benchHazard } from './bench';
export { canComeOff } from './injuries';
export { shootoutTally, shootoutWinner } from './shootout';
export {
  demandTrust,
  motivateLift,
  ownMargin,
  requestableRoles,
  roleAgainstScore,
  roleRefusal,
  touchlinePolicy,
} from './touchline';
export { onBench } from './shared';
export { validateMatchSession } from './replay';
