/**
 * The match engine's public surface without the decision chains (chains.ts), for the match
 * screen's first load: it fetches them once the screen is up (`loadChains`) and plays every
 * command once they are in (`whenChainsReady`). Everything else imports `index.ts`, which loads
 * them too. The engine itself is split by concern; the module map is in docs/ARCHITECTURE.md
 * ("Interactive match sessions").
 */
import { chainsReady } from './chainRuntime';

let loading: Promise<void> | undefined;
/** Fetch the decision chains (once); they register with the engine as they load. */
export function loadChains(): Promise<void> {
  loading ??= import('./chains').then(
    () => undefined,
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}
export { chainsReady };
export * from './types';
export { SITUATIONS } from './situations';
// Both catalogues: match-21's situations and match-22's (a match-21 session names only the first).
export { SITUATION_22_BY_ID as SITUATION_BY_ID, situationOf, templateOf } from './situations22';
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
export { rolePosition } from './shared';
export { sessionPenalties } from './extraTime';
export { applyMatchCommand } from './commands';
// The occasions (match-22): stoppage time, the bench, injuries, the shootout, the touchline.
export { benchHazard } from './bench';
export { canComeOff } from './injuries';
export { shootoutTally, shootoutWinner } from './shootout';
export {
  demandTrust,
  halftimeChoice,
  motivateLift,
  ownMargin,
  requestableRoles,
  roleAgainstScore,
  roleRefusal,
  touchlinePolicy,
  type HalftimeAnswer,
} from './touchline';
export { onBench } from './shared';
export { validateMatchSession } from './replay';
