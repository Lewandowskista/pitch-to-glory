import { getSeasonWeeks } from '../engine/world/calendar';
import type { World } from '../model/domain';
import type { WorkerRequest, WorkerResponse } from './protocol';

export type JobRequest = Exclude<WorkerRequest, { type: 'ack' | 'cancel' }>;
export interface JobRuntime {
  emit(response: WorkerResponse): void;
  checkpoint(completedWeeks: number): Promise<void>;
  cancelled(): boolean;
  yieldControl(): Promise<void>;
}
export interface WorldOperations {
  generate(seed: string): World;
  week(world: World): World;
  nextSeason(world: World): World;
}
export async function runWorldJob(
  request: JobRequest,
  runtime: JobRuntime,
  operations: WorldOperations,
): Promise<void> {
  const requestId = request.requestId;
  let world: World | null = request.type === 'generate' ? null : request.world;
  try {
    const totalWeeks =
      request.type === 'simulate-season'
        ? Math.max(0, getSeasonWeeks(request.world) - request.world.date.week + 1)
        : 1;
    await runtime.emit({ requestId, type: 'progress', completedWeeks: 0, totalWeeks });
    await runtime.yieldControl();
    if (runtime.cancelled()) {
      runtime.emit({ requestId, type: 'cancelled', world });
      return;
    }
    if (request.type === 'generate') world = operations.generate(request.seed);
    else if (request.type === 'next-season') world = operations.nextSeason(request.world);
    else {
      let completedWeeks = 0;
      while (world!.phase === 'active' && completedWeeks < totalWeeks) {
        world = operations.week(world!);
        completedWeeks++;
        await runtime.emit({ requestId, type: 'checkpoint', world, completedWeeks, totalWeeks });
        // The UI acknowledges only after its weekly save has completed.
        await runtime.checkpoint(completedWeeks);
        if (runtime.cancelled()) {
          runtime.emit({ requestId, type: 'cancelled', world });
          return;
        }
        await runtime.yieldControl();
        if (runtime.cancelled()) {
          runtime.emit({ requestId, type: 'cancelled', world });
          return;
        }
      }
    }
    await runtime.emit({ requestId, type: 'result', world: world! });
  } catch {
    runtime.emit({ requestId, type: 'error', code: 'simulation' });
  }
}
