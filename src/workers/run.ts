import { getSeasonWeeks } from '../engine/world/calendar';
import type { Id, World } from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import type { CareerDraft } from '../engine/career/create';
import type { CareerMatchOutcome } from '../engine/career/matches';
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
  /** One week; in a career world, stops (returning the fixture id) or auto-plays its fixture. */
  week(world: World, autoPlay: boolean): { world: World; pendingFixtureId: Id | null };
  nextSeason(world: World): World;
  commit(world: World, session: MatchSession): { world: World; outcome: CareerMatchOutcome };
  createCareer(world: World, seed: string, draft: CareerDraft, clubId: Id): World;
}
export async function runWorldJob(
  request: JobRequest,
  runtime: JobRuntime,
  operations: WorldOperations,
): Promise<void> {
  const requestId = request.requestId;
  let world: World | null = request.type === 'generate' ? null : request.world;
  try {
    const remaining =
      request.type === 'generate'
        ? 1
        : Math.max(0, getSeasonWeeks(request.world) - request.world.date.week + 1);
    const totalWeeks =
      request.type === 'simulate-season' || request.type === 'simulate-to-match' ? remaining : 1;
    await runtime.emit({ requestId, type: 'progress', completedWeeks: 0, totalWeeks });
    await runtime.yieldControl();
    if (runtime.cancelled()) {
      runtime.emit({ requestId, type: 'cancelled', world });
      return;
    }
    if (request.type === 'generate') world = operations.generate(request.seed);
    else if (request.type === 'next-season') world = operations.nextSeason(request.world);
    else if (request.type === 'create-career')
      world = operations.createCareer(request.world, request.seed, request.draft, request.clubId);
    else if (request.type === 'commit-match') {
      const committed = operations.commit(request.world, request.session);
      await runtime.emit({
        requestId,
        type: 'result',
        world: committed.world,
        outcome: committed.outcome,
      });
      return;
    } else {
      const autoPlay = request.type === 'simulate-season' && request.autoPlay;
      let completedWeeks = 0;
      let pendingFixtureId: Id | null = null;
      while (world!.phase === 'active' && completedWeeks < totalWeeks) {
        const step = operations.week(world!, autoPlay);
        if (step.pendingFixtureId) {
          // The career player has a match to play before this week can be simulated.
          pendingFixtureId = step.pendingFixtureId;
          break;
        }
        world = step.world;
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
      await runtime.emit({ requestId, type: 'complete', phase: world!.phase, pendingFixtureId });
      return;
    }
    await runtime.emit({ requestId, type: 'result', world: world! });
  } catch {
    runtime.emit({ requestId, type: 'error', code: 'simulation' });
  }
}
