import type { FoundationState, WorldState, SlotId } from '../model/domain';
import { useAppStore } from '../store';
import { saves, slotLocks } from './runtime';
import { AutosaveQueue } from './autosave';
import { SaveError, type AppSave } from './schema';

export function errorCode(error: unknown): string {
  return error instanceof SaveError
    ? error.code
    : error instanceof Error && error.message === 'large'
      ? 'large'
      : 'storage';
}
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
  if (useAppStore.getState().worldJob) throw new SaveError('busy');
}
export const autosave = new AutosaveQueue(async () => {
  // Keep later edits dirty until a subsequent write; each transaction checks its revision.
  const state = useAppStore.getState();
  const active = state.activeSave;
  if (!active || state.savedChange === state.change) return;
  state.setSaveStatus('saving');
  try {
    if (!(await slotLocks.acquire(active.slot))) throw new SaveError('locked');
    const payload = snapshot();
    const value = { ...active, payload, updatedAt: new Date().toISOString() };
    // Minute checkpoints send only the compact match; the worker retains the 959-club graph.
    const matchOnly =
      payload.kind === 'world' &&
      active.payload.kind === 'world' &&
      payload.world === active.payload.world &&
      JSON.stringify(payload.settings) === JSON.stringify(active.payload.settings) &&
      JSON.stringify(payload.gallery) === JSON.stringify(active.payload.gallery);
    const save = matchOnly
      ? await saves.writeMatchCheckpoint(value, active.revision)
      : await saves.write(value, active.revision);
    useAppStore.getState().saved(save, state.change);
    if (useAppStore.getState().change !== state.change) autosave.schedule();
  } catch (error) {
    useAppStore.getState().setSaveStatus('error', errorCode(error));
    throw error;
  }
});
async function own<T>(slot: SlotId, operation: () => Promise<T>): Promise<T> {
  if (!(await slotLocks.acquire(slot))) throw new SaveError('locked');
  try {
    return await operation();
  } finally {
    if (useAppStore.getState().activeSave?.slot !== slot) await slotLocks.release(slot);
  }
}
export async function loadSlot(slot: SlotId): Promise<void> {
  assertNotSimulating();
  await autosave.flush();
  await own(slot, async () => {
    const save = await saves.read(slot);
    if (!save) throw new SaveError('invalid');
    const previous = useAppStore.getState().activeSave?.slot;
    if (previous && previous !== slot) await slotLocks.release(previous);
    useAppStore.getState().applySave(save);
  });
}
export async function saveSlot(slot: SlotId, name: string, expected: number | null): Promise<void> {
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    const previous = useAppStore.getState().activeSave?.slot;
    const current = await saves.read(slot);
    const save = current
      ? await saves.write(
          { ...current, name, payload: snapshot(), updatedAt: new Date().toISOString() },
          expected,
        )
      : await saves.create(slot, name, snapshot(), expected);
    if (previous && previous !== slot) await slotLocks.release(previous);
    useAppStore.getState().applySave(save);
  });
}
export async function importSlot(
  slot: SlotId,
  json: string,
  expected: number | null,
): Promise<void> {
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    const previous = useAppStore.getState().activeSave?.slot;
    const save = await saves.import(json, slot, expected);
    if (previous && previous !== slot) await slotLocks.release(previous);
    useAppStore.getState().applySave(save);
  });
}
export async function deleteSlot(slot: SlotId, expected: number): Promise<void> {
  assertNotSimulating();
  expected = (await flushExpected(slot, expected))!;
  await own(slot, async () => {
    await saves.remove(slot, expected);
    if (useAppStore.getState().activeSave?.slot === slot) useAppStore.getState().clearSession();
  });
}
export async function exportSlot(slot: SlotId): Promise<AppSave> {
  assertNotSimulating();
  await autosave.flush();
  return own(slot, async () => {
    const save = await saves.read(slot);
    if (!save) throw new SaveError('invalid');
    return save;
  });
}
export async function exportSlotJSON(slot: SlotId): Promise<{ name: string; json: string }> {
  assertNotSimulating();
  await autosave.flush();
  return own(slot, () => saves.exportJSON(slot));
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
  // Explicitly confirmed recovery; preserve the snapshot first via the export control.
  await autosave.settle();
  const active = useAppStore.getState().activeSave;
  if (!active) return;
  await own(active.slot, async () => {
    const latest = await saves.read(active.slot);
    if (latest) useAppStore.getState().applySave(latest);
    else useAppStore.getState().clearSession();
  });
}
