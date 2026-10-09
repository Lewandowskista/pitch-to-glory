import type { StateCreator } from 'zustand';
import type { SlotId, TrainingPlan, World } from '../model/domain';
import type { AppStore } from './index';

export interface TrainingContext {
  slot: SlotId | null;
  session: number;
  seed: string;
  playerId: string;
  season: number;
  week: number;
  original: string;
}
export interface TrainingDraft {
  context: TrainingContext;
  plan: TrainingPlan;
}
export type TrainingAdvance = {
  type: 'simulate-week' | 'simulate-to-match' | 'simulate-season' | 'next-season';
  autoPlay?: boolean;
  context: TrainingContext;
};
export interface TrainingDraftSlice {
  trainingDraft: TrainingDraft | null;
  trainingSaving: boolean;
  trainingSession: number;
  trainingAdvance: TrainingAdvance | null;
  trainingAbandon: { resolve: (confirmed: boolean) => void } | null;
  editTrainingDraft: (plan: TrainingPlan) => void;
  discardTrainingDraft: () => void;
}
type ContextState = Pick<AppStore, 'world' | 'activeSave' | 'trainingSession'>;
export const sameTrainingPlan = (a: TrainingPlan, b: TrainingPlan): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
export function trainingContext(state: ContextState, world = state.world): TrainingContext | null {
  if (!world?.career) return null;
  return {
    slot: state.activeSave?.slot ?? null,
    session: state.trainingSession,
    seed: world.seed,
    playerId: world.career.playerId,
    season: world.date.season,
    week: world.date.week,
    original: JSON.stringify(world.career.training),
  };
}
export function sameTrainingContext(a: TrainingContext | null, b: TrainingContext | null): boolean {
  return Boolean(
    a &&
    b &&
    a.slot === b.slot &&
    a.session === b.session &&
    a.seed === b.seed &&
    a.playerId === b.playerId &&
    a.season === b.season &&
    a.week === b.week &&
    a.original === b.original,
  );
}
export function retainedTrainingDraft(state: AppStore, world: World): TrainingDraft | null {
  return sameTrainingContext(state.trainingDraft?.context ?? null, trainingContext(state, world))
    ? state.trainingDraft
    : null;
}
/** Small, shared check: persistence also verifies exclusive slot ownership before a write. */
export function trainingEditBlocked(state: AppStore): boolean {
  return Boolean(
    state.worldJob ||
    state.matchSession ||
    state.trainingSaving ||
    (state.saveStatus === 'error' && ['locked', 'conflict'].includes(state.saveError ?? '')),
  );
}
export const trainingDraftSlice: StateCreator<AppStore, [], [], TrainingDraftSlice> = (set) => ({
  trainingDraft: null,
  trainingSaving: false,
  trainingSession: 0,
  trainingAdvance: null,
  trainingAbandon: null,
  editTrainingDraft: (plan) =>
    set((state) => {
      const context = trainingContext(state);
      if (!context || trainingEditBlocked(state)) return {};
      return {
        trainingDraft: sameTrainingPlan(plan, state.world!.career!.training)
          ? null
          : { context, plan: structuredClone(plan) },
      };
    }),
  discardTrainingDraft: () => set((state) => (state.trainingSaving ? {} : { trainingDraft: null })),
});
