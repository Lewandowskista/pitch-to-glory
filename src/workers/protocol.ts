import type { Id, World } from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import type { CareerDraft } from '../engine/career/create';
import type { CareerMatchOutcome } from '../engine/career/matches';
import type { WorldSummary } from '../persistence/summary';
import type { WorldPatch } from './worldPatch';
import type { WorldPart } from './worldCodec';

/**
 * The messages between a tab and its world worker (docs/RELEASE-1.0-PLAN.md steps 3.2–3.3).
 * The worker lives as long as the loaded world and holds its own copy of it. Every world it
 * holds has a token chosen by the tab: `sync` replaces it, `patch` changes it (only from the
 * token it names), and a job names the token it expects and the token its result will have.
 */
export type JobSpec =
  | { type: 'generate'; seed: string }
  | { type: 'simulate-week' | 'simulate-to-match' | 'next-season' }
  /** In a career world, `autoPlay` plays the career player's fixtures with the headless policy. */
  | { type: 'simulate-season'; autoPlay: boolean }
  | { type: 'commit-match'; session: MatchSession }
  /**
   * The tournament between seasons, on to the career player's next match; `simulateCareer`
   * simulates that match too (review phase 3).
   */
  | { type: 'tournament'; simulateCareer: boolean }
  | { type: 'create-career'; seed: string; draft: CareerDraft; clubId: Id };

/** A world as UTF-8 JSON bytes, as written to storage (worldCodec.ts). */
export interface CheckpointBytes {
  worldId: string;
  summary: WorldSummary;
  bytes: Uint8Array;
}
export type HostRequest =
  | { type: 'sync'; token: number; world: World }
  | { type: 'patch'; from: number; token: number; patches: WorldPatch[] }
  | {
      type: 'job';
      requestId: Id;
      job: JobSpec;
      /** The world the job runs on (null for `generate`). */
      token: number | null;
      /** The token of the world the job leaves. */
      resultToken: number;
      /** Write a checkpoint after every changed step (a saved world). */
      checkpoints: boolean;
    }
  | { type: 'committed'; requestId: Id; checkpoint: number }
  | { type: 'commit-failed'; requestId: Id; checkpoint: number }
  | { type: 'cancel'; requestId: Id }
  /** The world as bytes for a whole save. */
  | { type: 'encode'; requestId: Id; token: number }
  | { type: 'drop' };
export type HostResponse =
  | { type: 'synced'; token: number }
  /** A patch named a world the worker no longer holds: the tab sends the whole world. */
  | { type: 'sync-failed'; token: number }
  | { type: 'progress'; requestId: Id; completedWeeks: number; totalWeeks: number }
  | ({ type: 'checkpoint'; requestId: Id; checkpoint: number } & CheckpointBytes)
  | {
      type: 'result';
      requestId: Id;
      end: 'done' | 'cancelled' | 'stopped';
      /** The job's world, when it changed; null when the tab's world still stands. */
      world: { bytes: Uint8Array; parts: WorldPart[]; token: number } | null;
      /** Checkpoints posted, and whether the last of them is this world. */
      checkpoints: number;
      checkpointed: boolean;
      completedWeeks: number;
      totalWeeks: number;
      phase: World['phase'] | null;
      pendingFixtureId: Id | null;
      outcome?: CareerMatchOutcome;
      /** A tournament job: whether a tournament is still running. */
      tournamentLive?: boolean;
    }
  | ({ type: 'encoded'; requestId: Id } & CheckpointBytes)
  | { type: 'error'; requestId: Id; code: 'busy' | 'stale' | 'simulation' };
