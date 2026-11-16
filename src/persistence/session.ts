import type { FoundationState, WorldState, SlotId, World } from '../model/domain';
import { useAppStore } from '../store';
import { saves, slotLocks } from './runtime';
import { AutosaveQueue } from './autosave';
import { errorCode, SaveError } from './errors';
import { CONFIG, ENGINE_VERSION } from '../engine/config';
import {
  sameTrainingContext,
  trainingContext,
  trainingEditBlocked,
} from '../store/trainingDraftSlice';
import { confirmTrainingAbandonment } from '../store/trainingTransitions';
import { mentorFor, validFocus } from '../engine/career/training';
import { COMMITMENTS } from '../engine/career/commitments';
import type { AppSave } from './schema';
import type { LoadedSave, SaveWriteReceipt } from './localRepository';
import type { BackupFile } from './backup';
import type { BackupKind } from './backups';
import { backupFileName, recoveryFileName } from './files';
import { combineReceipt } from './receipts';
import { compactSession } from './matchRecord';
import { PersistenceInterrupted } from './workerClient';
import { diffWorld, patchSize } from '../workers/worldPatch';
import { loadedHost, loadHost } from '../workers/hostRef';
import type { CheckpointBytes } from '../workers/protocol';

export { errorCode } from './errors';
export function snapshot(): FoundationState | WorldState {
  const { gallery, settings, world, matchSession } = useAppStore.getState();
  const foundation = {
    kind: 'foundation' as const,
    gallery: { ...gallery },
    settings: { ...settings },
  };
  return world
    ? { ...foundation, kind: 'world', world, ...(matchSession ? { matchSession } : {}) }
    : foundation;
}
function assertNotSimulating(): void {
  if (useAppStore.getState().worldJob || useAppStore.getState().trainingSaving)
    throw new SaveError('busy');
}

/**
 * The world object known to equal the slot's stored world (with its stored patches), at the
 * slot's revision: what UI changes are diffed against to store them as patches (step 3.4). Only
 * writes and loads that prove it set it, and a write it does not describe moves the revision
 * on, so a stale one is never used: the next world change is then written whole.
 */
let stored: {
  slot: SlotId;
  revision: number;
  world: World;
  /**
   * Whether the stored world is exactly this object's JSON, so patches may follow. A world
   * migrated on load is not (its stored form is older), but is still the slot's world.
   */
  patchable: boolean;
  patches: number;
  patchBytes: number;
} | null = null;
const storedFor = (slot: SlotId, revision: number | null) =>
  stored && stored.slot === slot && stored.revision === revision ? stored : null;
function remember(
  save: AppSave,
  world: World | null,
  patchable = true,
  patches = 0,
  patchBytes = 0,
): void {
  stored = world
    ? { slot: save.slot, revision: save.revision, world, patchable, patches, patchBytes }
    : null;
}
/** After a load or import: patches may follow only when the world is stored as loaded. */
function rememberLoaded(save: LoadedSave): AppSave {
  const { stored: storage, ...rest } = save;
  remember(
    rest,
    rest.payload.kind === 'world' ? rest.payload.world : null,
    storage?.pristine ?? true,
    storage?.patches ?? 0,
    storage?.patchBytes ?? 0,
  );
  return rest;
}
/**
 * A write whose reply was lost when the persistence worker crashed or stopped answering (S9).
 * If the next write to the slot meets a conflict, the stored revision is checked first: one
 * past the lost write's means that write committed (the slot is this tab's, under its lock),
 * so the new write goes on from there instead of reporting a false conflict. It is written
 * whole, as the stored world is not known.
 */
let doubt: { slot: SlotId; expected: number | null } | null = null;
async function guarded<T>(
  slot: SlotId,
  expected: number | null,
  write: (expected: number | null) => Promise<T>,
): Promise<T> {
  try {
    const result = await write(expected);
    doubt = null;
    return result;
  } catch (error) {
    if (error instanceof PersistenceInterrupted && error.inDoubt) {
      doubt = { slot, expected };
      stored = null;
      throw error;
    }
    if (
      error instanceof SaveError &&
      error.code === 'conflict' &&
      doubt?.slot === slot &&
      doubt.expected === expected
    ) {
      doubt = null;
      const listing = (await saves.list())[slot - 1];
      if (listing?.status === 'ready' && listing.revision === (expected ?? 0) + 1)
        return write(listing.revision);
    }
    throw error;
  }
}
/**
 * Write a save the cheapest way the slot allows (steps 3.1–3.4):
 *
 * - no world, or the stored world unchanged: preferences and the match session only;
 * - a world changed in the UI, with the stored world known: the patches between them, beside
 *   the stored world (a few hundred bytes for a press answer or a purchase);
 * - otherwise the whole world, encoded in the world worker and stored as those bytes, without
 *   passing through this thread or being validated again (the engine made it; every load and
 *   import validates it).
 */
async function persist(
  value: AppSave,
  expected: number | null,
  options: { replace?: boolean } = {},
): Promise<AppSave> {
  const payload = value.payload;
  if (payload.kind !== 'world') return saves.write(value, expected);
  const world = payload.world;
  const base = options.replace || doubt ? null : storedFor(value.slot, expected);
  if (base && expected !== null) {
    if (base.world === world) {
      const save = await guarded(value.slot, expected, (revision) =>
        saves.writeWithoutWorldChange(value, revision!),
      );
      remember(save, world, base.patchable, base.patches, base.patchBytes);
      return save;
    }
    const patches = base.patchable
      ? diffWorld(base.world, world, {
          maxPatches: CONFIG.saves.maxWorldPatches - base.patches,
          maxVisits: 2_000_000,
        })
      : null;
    const size = patches ? patchSize(patches) : 0;
    if (patches && base.patchBytes + size <= CONFIG.saves.maxPatchBytes) {
      const save = await guarded(value.slot, expected, (revision) =>
        saves.writeWithoutWorldChange(value, revision!, patches),
      );
      remember(save, world, true, base.patches + patches.length, base.patchBytes + size);
      return save;
    }
  }
  stored = null;
  const save = await guarded(value.slot, expected, async (revision) => {
    // Encoded per attempt: the bytes move to the persistence worker and are gone afterwards.
    const { worldHost } = await loadHost();
    const encoded = await worldHost.encode(world);
    const receipt = await saves.writeWorld(
      {
        slot: value.slot,
        name: value.name,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        gallery: payload.gallery,
        settings: payload.settings,
        ...encoded,
        matchSession: payload.matchSession ? compactSession(payload.matchSession) : null,
        replace: Boolean(options.replace),
      },
      revision,
    );
    return combineReceipt(receipt, payload);
  });
  remember(save, world);
  return save;
}
export const autosave = new AutosaveQueue(async () => {
  // Keep later edits dirty until a subsequent write; each transaction checks its revision.
  const state = useAppStore.getState();
  const active = state.activeSave;
  // During a world job the world worker's checkpoints are the slot's writes; whatever is still
  // dirty when the job ends is written then.
  if (!active || state.trainingSaving || state.worldJob || state.savedChange === state.change)
    return;
  state.setSaveStatus('saving');
  try {
    if (!(await slotLocks.acquire(active.slot))) throw new SaveError('locked');
    const payload = snapshot();
    const value = { ...active, payload, updatedAt: new Date().toISOString() };
    const save = await persist(value, active.revision);
    useAppStore.getState().saved(save, state.change);
    if (useAppStore.getState().change !== state.change) autosave.schedule();
  } catch (error) {
    useAppStore.getState().setSaveStatus('error', errorCode(error));
    throw error;
  }
});
/**
 * Store one of the world worker's checkpoints (step 3.3), in the autosave queue so it never
 * interleaves with another write. The bytes go on to the persistence worker as they came,
 * moved rather than copied and never parsed on this thread. Resolves true once committed. The
 * tab's world object is replaced once, when the job publishes its world.
 */
export function commitCheckpoint(checkpoint: CheckpointBytes): Promise<boolean> {
  return autosave.run(async () => {
    const state = useAppStore.getState();
    const active = state.activeSave;
    if (!active || active.payload.kind !== 'world') return false;
    state.setSaveStatus('saving');
    try {
      if (!(await slotLocks.acquire(active.slot))) throw new SaveError('locked');
      stored = null;
      const receipt: SaveWriteReceipt = await guarded(active.slot, active.revision, (revision) =>
        saves.writeWorld(
          {
            slot: active.slot,
            name: active.name,
            createdAt: active.createdAt,
            updatedAt: new Date().toISOString(),
            gallery: state.gallery,
            settings: state.settings,
            worldId: checkpoint.worldId,
            summary: checkpoint.summary,
            bytes: checkpoint.bytes,
            matchSession: null,
            replace: false,
          },
          revision,
        ),
      );
      if (useAppStore.getState().activeSave?.slot === active.slot) {
        const { matchSession: _session, ...payload } = active.payload;
        void _session;
        useAppStore.setState({ activeSave: combineReceipt(receipt, payload) });
      }
      return true;
    } catch (error) {
      useAppStore.getState().setSaveStatus('error', errorCode(error));
      return false;
    }
  });
}
/** A job published `world` with its last checkpoint committed: it is the stored world. */
export function publishedStored(world: World): void {
  const active = useAppStore.getState().activeSave;
  stored = active
    ? {
        slot: active.slot,
        revision: active.revision,
        world,
        patchable: true,
        patches: 0,
        patchBytes: 0,
      }
    : null;
}
/**
 * The world worker stopped during a job after committing checkpoints this tab never received
 * as a world: load the slot's last committed week, so no simulated week is lost or simulated
 * twice.
 */
export async function recoverCommitted(): Promise<void> {
  const active = useAppStore.getState().activeSave;
  if (!active) return;
  await own(active.slot, async () => {
    const latest = await saves.load(active.slot);
    if (latest && useAppStore.getState().activeSave?.slot === active.slot) applyLoaded(latest);
  });
}
/** Write the proposed world first: a failed transaction never consumes pending intent. */
export async function saveTrainingDraft(): Promise<boolean> {
  const initial = useAppStore.getState();
  const draft = initial.trainingDraft;
  if (
    !draft ||
    trainingEditBlocked(initial) ||
    !sameTrainingContext(draft.context, trainingContext(initial))
  )
    return false;
  useAppStore.setState({ trainingSaving: true, saveStatus: 'saving', saveError: null });
  const current = () => {
    const state = useAppStore.getState();
    if (
      state.trainingDraft !== draft ||
      state.worldJob ||
      state.matchSession ||
      !sameTrainingContext(draft.context, trainingContext(state))
    )
      throw new SaveError('conflict');
    return state;
  };
  try {
    await autosave.settle();
    const slot = current().activeSave?.slot;
    if (slot && !(await slotLocks.acquire(slot))) throw new SaveError('locked');
    const before = current();
    const world = before.world!;
    const player = world.players[world.career!.playerId];
    if (
      !player ||
      draft.plan.sessions.length !== 3 ||
      draft.plan.sessions.some(
        (entry) =>
          !validFocus(player, entry.focus) || !['low', 'normal', 'high'].includes(entry.intensity),
      )
    )
      throw new SaveError('invalid');
    const commitments = draft.plan.commitments ?? [];
    if (
      commitments.length > CONFIG.career.commitments.slots ||
      new Set(commitments).size !== commitments.length ||
      commitments.some((kind) => !COMMITMENTS.includes(kind))
    )
      throw new SaveError('invalid');
    const mentor = draft.plan.extra ? mentorFor(world, draft.plan.extra.focus) : null;
    if (draft.plan.extra && (!mentor || !validFocus(player, draft.plan.extra.focus)))
      throw new SaveError('invalid');
    const training = structuredClone(draft.plan);
    if (training.extra && mentor) training.extra.mentorId = mentor.id;
    const proposed = { ...world, career: { ...world.career!, training } };
    const active = before.activeSave;
    const save = active
      ? await persist(
          {
            ...active,
            payload: { ...snapshot(), kind: 'world', world: proposed },
            updatedAt: new Date().toISOString(),
          },
          active.revision,
        )
      : null;
    current().setWorld(proposed);
    if (save) useAppStore.getState().saved(save, before.change + 1);
    else useAppStore.getState().setSaveStatus('idle');
    return true;
  } catch (error) {
    useAppStore.getState().setSaveStatus('error', errorCode(error));
    return false;
  } finally {
    useAppStore.setState({ trainingSaving: false });
    const state = useAppStore.getState();
    if (state.activeSave && state.change !== state.savedChange) autosave.schedule();
  }
}
async function own<T>(slot: SlotId, operation: () => Promise<T>): Promise<T> {
  if (!(await slotLocks.acquire(slot))) throw new SaveError('locked');
  try {
    return await operation();
  } finally {
    if (useAppStore.getState().activeSave?.slot !== slot) await slotLocks.release(slot);
  }
}
/**
 * Apply a loaded or imported save. The world worker held the previous world: it is stopped
 * (its memory freed), and a new one receives this world when the browser is next idle, so the
 * first Continue does not wait for it.
 */
function applyLoaded(loaded: LoadedSave): void {
  loadedHost()?.worldHost.retire();
  const save = rememberLoaded(loaded);
  useAppStore.getState().applySave(save);
  if (save.payload.kind !== 'world') return;
  const id = save.payload.world.id;
  // The world as it is by then (the hub may already have changed it): later changes go as
  // patches from it.
  const current = () => {
    const state = useAppStore.getState();
    return state.activeSave?.slot === save.slot && state.world?.id === id && !state.worldJob
      ? state.world
      : null;
  };
  const warm = () => {
    if (!current()) return;
    void loadHost()
      .then(({ worldHost }) => {
        const world = current();
        if (world) worldHost.prewarm(world);
      })
      .catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 5000 });
  else setTimeout(warm, 1000);
}
export async function loadSlot(slot: SlotId): Promise<boolean> {
  assertNotSimulating();
  if (!(await confirmTrainingAbandonment())) return false;
  assertNotSimulating();
  await autosave.flush();
  await own(slot, async () => {
    const loaded = await saves.load(slot);
    if (!loaded) throw new SaveError('invalid');
    const previous = useAppStore.getState().activeSave?.slot;
    if (previous && previous !== slot) await slotLocks.release(previous);
    applyLoaded(loaded);
  });
  return true;
}
export async function saveSlot(
  slot: SlotId,
  name: string,
  expected: number | null,
): Promise<boolean> {
  assertNotSimulating();
  if (!(await confirmTrainingAbandonment())) return false;
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    const previous = useAppStore.getState().activeSave?.slot;
    const current = (await saves.list())[slot - 1];
    const payload = snapshot();
    const now = new Date().toISOString();
    const save =
      current?.status === 'ready' || payload.kind === 'world'
        ? await persist(
            {
              format: 'pitch-to-glory',
              schemaVersion: CONFIG.saves.schemaVersion,
              engineVersion: ENGINE_VERSION,
              slot,
              name,
              createdAt: current?.status === 'ready' ? current.createdAt : now,
              updatedAt: now,
              revision: current?.status === 'ready' ? current.revision : 0,
              payload,
            },
            expected,
            { replace: true },
          )
        : await saves.create(slot, name, payload, expected);
    if (previous && previous !== slot) await slotLocks.release(previous);
    useAppStore.getState().applySave(save);
  });
  return true;
}
export async function importSlot(
  slot: SlotId,
  file: Blob,
  expected: number | null,
): Promise<boolean> {
  assertNotSimulating();
  if (!(await confirmTrainingAbandonment())) return false;
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    const previous = useAppStore.getState().activeSave?.slot;
    const save = await saves.import(file, slot, expected);
    if (previous && previous !== slot) await slotLocks.release(previous);
    applyLoaded(save);
  });
  return true;
}
export async function deleteSlot(slot: SlotId, expected: number | null): Promise<boolean> {
  assertNotSimulating();
  if (useAppStore.getState().activeSave?.slot === slot && !(await confirmTrainingAbandonment()))
    return false;
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    await saves.remove(slot, expected);
    if (useAppStore.getState().activeSave?.slot === slot) useAppStore.getState().clearSession();
  });
  return true;
}
/** A slot's backup file, compressed in the persistence worker where the browser can. */
export async function exportSlotBackup(slot: SlotId): Promise<BackupFile> {
  assertNotSimulating();
  await autosave.flush();
  return own(slot, () => saves.exportBackup(slot));
}
/**
 * Replace a slot that will not load with one of its rotating backups (step 4.3) and load it.
 * The persistence worker checks the backup in full before replacing anything.
 */
export async function restoreSlot(
  slot: SlotId,
  backup: BackupKind,
  expected: number | null,
): Promise<boolean> {
  assertNotSimulating();
  if (!(await confirmTrainingAbandonment())) return false;
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    const previous = useAppStore.getState().activeSave?.slot;
    const restored = await saves.restore(slot, backup, expected);
    if (previous && previous !== slot) await slotLocks.release(previous);
    applyLoaded(restored);
  });
  return true;
}
/** One backup generation as a file, assembled like a recovery copy (never validated). */
export async function exportBackupGeneration(slot: SlotId, backup: BackupKind) {
  await autosave.settle();
  return saves.exportGeneration(slot, backup);
}
/**
 * A backup file of this tab's session, saved or not: checked where it passes, otherwise an
 * unchecked recovery copy (named so). For when a save failed, storage being full among others.
 */
export async function exportUnsavedCopy(): Promise<{ name: string; backup: BackupFile } | null> {
  const active = useAppStore.getState().activeSave;
  if (!active) return null;
  const payload = snapshot();
  const { slot, name } = active;
  try {
    const backup = await saves.serialize(slot, name, payload);
    return { name: backupFileName('unsaved', backup.compressed), backup };
  } catch (error) {
    // Too large is not a failed check: an unchecked copy is no smaller.
    if (errorCode(error) === 'large') throw error;
    const backup = await saves.serializeUnvalidated(slot, name, payload);
    return { name: recoveryFileName('unsaved', backup.compressed), backup };
  }
}
/**
 * A recovery copy of a slot that will not load: its stored records, unvalidated. Waits for a
 * write in flight so the copy is consistent, but never starts one and never takes the slot.
 */
export async function exportSlotRecovery(slot: SlotId): Promise<BackupFile> {
  await autosave.settle();
  return saves.exportRecovery(slot);
}
async function flushExpected(slot: SlotId, expected: number | null): Promise<number | null> {
  const before = useAppStore.getState().activeSave;
  await autosave.flush();
  const after = useAppStore.getState().activeSave;
  return before?.slot === slot && before.revision === expected && after?.slot === slot
    ? after.revision
    : expected;
}
export async function reloadActiveSlot(): Promise<void> {
  assertNotSimulating();
  if (!(await confirmTrainingAbandonment())) return;
  assertNotSimulating();
  // Explicitly confirmed recovery; preserve the snapshot first via the export control.
  await autosave.settle();
  const active = useAppStore.getState().activeSave;
  if (!active) return;
  await own(active.slot, async () => {
    const latest = await saves.load(active.slot);
    if (latest) applyLoaded(latest);
    else useAppStore.getState().clearSession();
  });
}
