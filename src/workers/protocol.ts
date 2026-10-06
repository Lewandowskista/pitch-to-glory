import type { Id, World } from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import type { CareerDraft } from '../engine/career/create';
import type { CareerMatchOutcome } from '../engine/career/matches';

export type WorkerRequest =
  | { requestId: Id; type: 'generate'; seed: string }
  | { requestId: Id; type: 'simulate-week' | 'simulate-to-match' | 'next-season'; world: World }
  /** In a career world, `autoPlay` plays the career player's fixtures with the headless policy. */
  | { requestId: Id; type: 'simulate-season'; world: World; autoPlay: boolean }
  | { requestId: Id; type: 'commit-match'; world: World; session: MatchSession }
  | {
      requestId: Id;
      type: 'create-career';
      world: World;
      seed: string;
      draft: CareerDraft;
      clubId: Id;
    }
  | { requestId: Id; type: 'ack'; completedWeeks: number }
  | { requestId: Id; type: 'cancel' };
export type WorkerResponse =
  | { requestId: Id; type: 'progress'; completedWeeks: number; totalWeeks: number }
  | { requestId: Id; type: 'checkpoint'; world: World; completedWeeks: number; totalWeeks: number }
  | { requestId: Id; type: 'result'; world: World; outcome?: CareerMatchOutcome }
  /** End of a simulation job. The final world was the last checkpoint. */
  | { requestId: Id; type: 'complete'; phase: World['phase']; pendingFixtureId: Id | null }
  | { requestId: Id; type: 'cancelled'; world: World | null }
  | { requestId: Id; type: 'error'; code: 'invalid' | 'busy' | 'simulation' };
