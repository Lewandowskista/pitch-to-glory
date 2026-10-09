import { useAppStore } from './index';
import { sameTrainingContext, trainingContext } from './trainingDraftSlice';

/** Internal navigation keeps drafts; only an operation that replaces the session asks. */
export async function confirmTrainingAbandonment(): Promise<boolean> {
  const state = useAppStore.getState();
  if (!state.trainingDraft) return true;
  if (state.trainingAbandon || state.trainingAdvance || state.trainingSaving) return false;
  const context = trainingContext(state);
  const confirmed = await new Promise<boolean>((resolve) => {
    useAppStore.setState({ trainingAbandon: { resolve } });
  });
  return confirmed && sameTrainingContext(context, trainingContext(useAppStore.getState()));
}
export function resolveTrainingAbandonment(confirmed: boolean): void {
  const request = useAppStore.getState().trainingAbandon;
  useAppStore.setState({ trainingAbandon: null });
  request?.resolve(confirmed);
}

/** A failed save keeps both the request and draft available for retry. */
export async function resumeTrainingAdvance(saveDraft: boolean): Promise<boolean> {
  const state = useAppStore.getState();
  const request = state.trainingAdvance;
  if (!request || !sameTrainingContext(request.context, trainingContext(state))) return false;
  if (saveDraft) {
    const { saveTrainingDraft } = await import('../persistence/session');
    if (!(await saveTrainingDraft())) return false;
    // Back can cancel the pending advance even while a storage write is finishing.
    if (useAppStore.getState().trainingAdvance !== request) return false;
  } else {
    state.discardTrainingDraft();
    if (useAppStore.getState().trainingDraft) return false;
  }
  useAppStore.setState({ trainingAdvance: null });
  const { startWorldJob } = await import('../workers/client');
  const current = trainingContext(useAppStore.getState());
  if (!current || !sameTrainingContext({ ...request.context, original: current.original }, current))
    return false;
  await startWorldJob(request.type, { autoPlay: request.autoPlay });
  return true;
}
