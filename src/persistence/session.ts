import type { FoundationState, WorldState, SlotId } from '../model/domain';
import { useAppStore } from '../store';
import { saves, slotLocks } from './runtime';
import { AutosaveQueue } from './autosave';
import { errorCode, SaveError } from './errors';
import { CONFIG, ENGINE_VERSION } from '../engine/config';

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
    // When the world graph is the one already stored, write only preferences and the match
    // session. Match checkpoints run every simulated minute and must not rewrite the world.
    const worldUnchanged =
      payload.kind === 'world' &&
      active.payload.kind === 'world' &&
      payload.world === active.payload.world;
    const save = worldUnchanged
      ? await saves.writeWithoutWorldChange(value, active.revision)
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
    const current = (await saves.list())[slot - 1];
    const save =
      current?.status === 'ready'
        ? await saves.write(
            {
              format: 'pitch-to-glory',
              schemaVersion: CONFIG.saves.schemaVersion,
              engineVersion: ENGINE_VERSION,
              slot,
              name,
              createdAt: current.createdAt,
              updatedAt: new Date().toISOString(),
              revision: current.revision,
              payload: snapshot(),
            },
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
export async function deleteSlot(slot: SlotId, expected: number | null): Promise<void> {
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    await saves.remove(slot, expected);
    if (useAppStore.getState().activeSave?.slot === slot) useAppStore.getState().clearSession();
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
