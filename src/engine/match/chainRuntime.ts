/**
 * Where the engine reaches the decision chains (chains.ts, engine match-22, release 1.0 X1a).
 * The chains register themselves here when their module loads. The engine's public entry
 * (`index.ts`) loads them with everything else, so the workers, the career and the tests see
 * one synchronous engine; the match screen uses `core.ts` instead, which leaves the chains out
 * of the Matchday route's first load and fetches them once the screen is up (`loadChains`).
 * Every command that may open or answer a chain waits for them (`whenChainsReady`).
 */
import type { MatchSession } from './types';

export interface ChainRuntime {
  /** A chain comes due: its finish is drawn and its first step opens. */
  openChain(next: MatchSession): void;
  /** The current step is answered: the next step opened ('continued'), or the chain ended. */
  answerChainStep(next: MatchSession, choiceId: string): 'continued' | 'ended';
  /** The breaks the other way the player's chains give away in a match, at the reference. */
  expectedCounters(next: MatchSession): number;
}

let runtime: ChainRuntime | undefined;

/** Called once by chains.ts as it loads. */
export function provideChains(chains: ChainRuntime): void {
  runtime = chains;
}
export const chainsReady = (): boolean => runtime !== undefined;
export function chainRuntime(): ChainRuntime {
  if (!runtime) throw new Error('The decision chains are not loaded (see loadChains)');
  return runtime;
}
