import { getSeasonWeeks } from '../engine/world/calendar';
import type { Id, World } from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import type { CareerDraft } from '../engine/career/create';
import type { CareerMatchOutcome } from '../engine/career/matches';
import type { JobSpec } from './protocol';

export type JobRequest = JobSpec & { requestId: Id };
/** The light per-week report for the progress indicator. */
export interface JobProgress {
  completedWeeks: number;
  totalWeeks: number;
}
/** A checkpoint that storage refused: the job stops, keeping the weeks it has simulated. */
export class CheckpointFailed extends Error {
  constructor() {
    super('checkpoint');
  }
}
export interface JobRuntime {
  progress(progress: JobProgress): void;
  /**
   * The world after a step (a week, or a whole job's result). The world worker writes it as a
   * checkpoint and resolves once simulation may go on (a bounded number of checkpoints may be
   * uncommitted); it throws CheckpointFailed when storage refused one.
   */
  checkpoint(world: World, progress: JobProgress): Promise<void>;
  cancelled(): boolean;
  yieldControl(): Promise<void>;
}
/**
 * How a job ended. `world` is the job's world (the same object it started with, changed in
 * place, or a new one); `changed` says whether anything was simulated or committed.
 */
export type JobOutcome =
  | {
      kind: 'done' | 'cancelled' | 'stopped';
      world: World;
      changed: boolean;
      completedWeeks: number;
      totalWeeks: number;
      pendingFixtureId: Id | null;
      outcome?: CareerMatchOutcome;
    }
  | { kind: 'error' };
export interface WorldOperations {
  generate(seed: string): World;
  /** One week; in a career world, stops (returning the fixture id) or auto-plays its fixture. */
  week(world: World, autoPlay: boolean): { world: World; pendingFixtureId: Id | null };
  nextSeason(world: World): World;
  commit(world: World, session: MatchSession): { world: World; outcome: CareerMatchOutcome };
  /** The tournament between seasons, to the career player's next match or its end. */
  tournament(world: World, simulateCareer: boolean): { world: World; pendingFixtureId: Id | null };
  createCareer(world: World, seed: string, draft: CareerDraft, clubId: Id): World;
  /** The ids of the decisions waiting for the player (review phase 5, step 5.1). */
  pending?(world: World): string[];
  /**
   * Before simulating a further week: true when a decision falls due in it, or one arrived
   * that was not waiting (`before`) when Continue was pressed.
   */
  continueStops?(world: World, before: ReadonlySet<string>): boolean;
}
/** Weeks a job may simulate: the rest of the season for a season or Continue, else one. */
export function jobWeeks(type: JobSpec['type'], world: World | null): number {
  if (!world || (type !== 'simulate-season' && type !== 'simulate-to-match')) return 1;
  return Math.max(0, getSeasonWeeks(world) - world.date.week + 1);
}
/**
 * Run one job on `world` (null for a new world). Every changed world is handed to
 * `runtime.checkpoint` before the job goes on or ends, so a job's result is never ahead of what
 * it asked storage to keep. Never throws: a failure is the `error` outcome, after which the
 * world may be half-changed and must be discarded.
 */
export async function runWorldJob(
  request: JobRequest,
  input: World | null,
  runtime: JobRuntime,
  operations: WorldOperations,
): Promise<JobOutcome> {
  let world = input;
  const totalWeeks = jobWeeks(request.type, world);
  let completedWeeks = 0;
  let changed = false;
  const end = (
    kind: 'done' | 'cancelled' | 'stopped',
    extra: { pendingFixtureId?: Id | null; outcome?: CareerMatchOutcome } = {},
  ): JobOutcome => ({
    kind,
    world: world!,
    changed,
    completedWeeks,
    totalWeeks,
    pendingFixtureId: extra.pendingFixtureId ?? null,
    ...(extra.outcome ? { outcome: extra.outcome } : {}),
  });
  try {
    runtime.progress({ completedWeeks: 0, totalWeeks });
    await runtime.yieldControl();
    if (runtime.cancelled() && world) return end('cancelled');
    if (request.type === 'generate') {
      world = operations.generate(request.seed);
      changed = true;
      completedWeeks = 1;
      return end('done');
    }
    if (!world) return { kind: 'error' };
    if (
      request.type === 'next-season' ||
      request.type === 'create-career' ||
      request.type === 'tournament' ||
      request.type === 'commit-match'
    ) {
      let pendingFixtureId: Id | null = null;
      let outcome: CareerMatchOutcome | undefined;
      if (request.type === 'next-season') world = operations.nextSeason(world);
      else if (request.type === 'create-career')
        world = operations.createCareer(world, request.seed, request.draft, request.clubId);
      else if (request.type === 'tournament') {
        const step = operations.tournament(world, request.simulateCareer);
        world = step.world;
        pendingFixtureId = step.pendingFixtureId;
      } else if (request.type === 'commit-match') {
        const committed = operations.commit(world, request.session);
        world = committed.world;
        outcome = committed.outcome;
      }
      changed = true;
      completedWeeks = 1;
      runtime.progress({ completedWeeks, totalWeeks });
      try {
        await runtime.checkpoint(world, { completedWeeks, totalWeeks });
      } catch (error) {
        if (error instanceof CheckpointFailed) return end('stopped', { pendingFixtureId, outcome });
        throw error;
      }
      return end('done', { pendingFixtureId, outcome });
    }
    const autoPlay = request.type === 'simulate-season' && request.autoPlay;
    let pendingFixtureId: Id | null = null;
    const before = new Set(operations.pending?.(world) ?? []);
    while (world.phase === 'active' && completedWeeks < totalWeeks) {
      // Continue (not a season simulation) stops for a decision: on its deadline day, or
      // when a new one arrives. The week always moves on once, so pressing it again lets a
      // deadline pass.
      if (
        request.type === 'simulate-to-match' &&
        completedWeeks > 0 &&
        operations.continueStops?.(world, before)
      )
        break;
      const step = operations.week(world, autoPlay);
      if (step.pendingFixtureId) {
        // The career player has a match to play before this week can be simulated.
        pendingFixtureId = step.pendingFixtureId;
        break;
      }
      world = step.world;
      completedWeeks++;
      changed = true;
      runtime.progress({ completedWeeks, totalWeeks });
      try {
        await runtime.checkpoint(world, { completedWeeks, totalWeeks });
      } catch (error) {
        if (error instanceof CheckpointFailed) return end('stopped');
        throw error;
      }
      if (runtime.cancelled()) return end('cancelled');
      await runtime.yieldControl();
      if (runtime.cancelled()) return end('cancelled');
    }
    return end('done', { pendingFixtureId });
  } catch {
    return { kind: 'error' };
  }
}
