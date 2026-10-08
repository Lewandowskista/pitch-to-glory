import type { FoundationState, WorldState, SlotId } from '../model/domain';
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
export const autosave = new AutosaveQueue(async () => {
  // Keep later edits dirty until a subsequent write; each transaction checks its revision.
  const state = useAppStore.getState();
  const active = state.activeSave;
  if (!active || state.trainingSaving || state.savedChange === state.change) return;
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
    const mentor = draft.plan.extra ? mentorFor(world, draft.plan.extra.focus) : null;
    if (draft.plan.extra && (!mentor || !validFocus(player, draft.plan.extra.focus)))
      throw new SaveError('invalid');
    const training = structuredClone(draft.plan);
    if (training.extra && mentor) training.extra.mentorId = mentor.id;
    const proposed = { ...world, career: { ...world.career!, training } };
    const active = before.activeSave;
    const save = active
      ? await saves.write(
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
export async function loadSlot(slot: SlotId): Promise<boolean> {
  assertNotSimulating();
  if (!(await confirmTrainingAbandonment())) return false;
  assertNotSimulating();
  await autosave.flush();
  await own(slot, async () => {
    const save = await saves.read(slot);
    if (!save) throw new SaveError('invalid');
    const previous = useAppStore.getState().activeSave?.slot;
    if (previous && previous !== slot) await slotLocks.release(previous);
    useAppStore.getState().applySave(save);
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
  return true;
}
export async function importSlot(
  slot: SlotId,
  json: string,
  expected: number | null,
): Promise<boolean> {
  assertNotSimulating();
  if (!(await confirmTrainingAbandonment())) return false;
  assertNotSimulating();
  expected = await flushExpected(slot, expected);
  await own(slot, async () => {
    const previous = useAppStore.getState().activeSave?.slot;
    const save = await saves.import(json, slot, expected);
    if (previous && previous !== slot) await slotLocks.release(previous);
    useAppStore.getState().applySave(save);
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
  if (!(await confirmTrainingAbandonment())) return;
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
