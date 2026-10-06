import type { Id, World } from '../model/domain';
export type WorkerRequest =
  | { requestId: Id; type: 'generate'; seed: string }
  | { requestId: Id; type: 'simulate-week' | 'simulate-season' | 'next-season'; world: World }
  | { requestId: Id; type: 'ack'; completedWeeks: number }
  | { requestId: Id; type: 'cancel' };
export type WorkerResponse =
  | { requestId: Id; type: 'progress'; completedWeeks: number; totalWeeks: number }
  | { requestId: Id; type: 'checkpoint'; world: World; completedWeeks: number; totalWeeks: number }
  | { requestId: Id; type: 'result'; world: World }
  | { requestId: Id; type: 'complete'; phase: World['phase'] }
  | { requestId: Id; type: 'cancelled'; world: World | null }
  | { requestId: Id; type: 'error'; code: 'invalid' | 'busy' | 'simulation' };
