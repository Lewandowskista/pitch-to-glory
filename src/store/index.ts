import { create, type StateCreator } from 'zustand';
import type { GalleryState, Settings, World } from '../model/domain';
import { DEFAULT_SETTINGS, validateSettings } from '../persistence/settings';
import type { AppSave, SaveRecovery } from '../persistence/schema';
import { platform } from '../platform';
import type { MatchSession } from '../engine/match/types';
import type { CareerMatchOutcome } from '../engine/career/matches';
import {
  trainingDraftSlice,
  retainedTrainingDraft,
  type TrainingDraftSlice,
} from './trainingDraftSlice';

interface SettingsSlice {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  preferencesStored: boolean;
}
interface GallerySlice {
  gallery: GalleryState;
  reseed: () => void;
  setSeed: (seed: string) => void;
}
interface SessionSlice {
  activeSave: AppSave | null;
  change: number;
  savedChange: number;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  /** Explains a repair made while loading, such as a discarded outdated match. */
  saveNotice: SaveRecovery | null;
  dismissSaveNotice: () => void;
  applySave: (save: AppSave) => void;
  saved: (save: AppSave, change: number) => void;
  setSaveStatus: (status: SessionSlice['saveStatus'], error?: string) => void;
  clearSession: () => void;
}
export interface WorldJob {
  type:
    | 'generate'
    | 'simulate-week'
    | 'simulate-season'
    | 'simulate-to-match'
    | 'next-season'
    | 'commit-match'
    | 'create-career';
  completedWeeks: number;
  totalWeeks: number;
  cancelling: boolean;
}
interface WorldSlice {
  world: World | null;
  worldJob: WorldJob | null;
  worldNotice:
    | 'generated'
    | 'advanced'
    | 'finished'
    | 'cancelled'
    | 'newSeason'
    | 'matchday'
    | 'careerCreated'
    | 'recorded'
    | null;
  worldError: string | null;
  setWorld: (world: World) => void;
  setWorldJob: (job: WorldJob | null) => void;
  worldFeedback: (notice: WorldSlice['worldNotice'], error?: string) => void;
}
interface MatchSlice {
  matchSession: MatchSession | null;
  setMatchSession: (session: MatchSession | null) => void;
  /** The last committed career match, kept in memory for its report (not saved). */
  careerResult: { session: MatchSession; outcome: CareerMatchOutcome } | null;
  setCareerResult: (result: MatchSlice['careerResult']) => void;
}
export type AppStore = SettingsSlice &
  GallerySlice &
  SessionSlice &
  WorldSlice &
  MatchSlice &
  TrainingDraftSlice;
/**
 * A retained report belongs to a world only while that world's career has the report's match
 * as its latest record: loading another save, a later state of the same career or a new world
 * drops it, while edits and saving the same career elsewhere keep it.
 */
function reportFor(
  result: MatchSlice['careerResult'],
  world: World | null,
): MatchSlice['careerResult'] {
  if (!result) return null;
  const career = world?.career;
  const last = career?.matches.at(-1);
  const record = result.outcome.record;
  const same =
    career &&
    last &&
    career.playerId === result.session.setup.selectedPlayerId &&
    last.fixtureId === record.fixtureId &&
    last.season === record.season &&
    last.week === record.week &&
    last.minutes === record.minutes &&
    last.rating === record.rating &&
    last.goals === record.goals &&
    last.assists === record.assists &&
    last.xp === record.xp &&
    last.score[0] === record.score[0] &&
    last.score[1] === record.score[1];
  return same ? result : null;
}
let preferences: Settings;
try {
  preferences = validateSettings(platform.readPreferences());
} catch {
  preferences = { ...DEFAULT_SETTINGS };
}
/** A tutorial seen on this device stays seen when a save from before is loaded. */
const withDeviceTutorial = (saved: Settings, device: Settings): Settings => ({
  ...saved,
  tutorial: {
    week: saved.tutorial.week || device.tutorial.week,
    match: saved.tutorial.match || device.tutorial.match,
  },
});
const settingsSlice: StateCreator<AppStore, [], [], SettingsSlice> = (set) => ({
  settings: preferences,
  preferencesStored: true,
  updateSettings: (patch) =>
    set((state) => {
      const settings = validateSettings({ ...state.settings, ...patch });
      return {
        settings,
        preferencesStored: platform.writePreferences(settings),
        change: state.change + 1,
      };
    }),
});
const gallerySlice: StateCreator<AppStore, [], [], GallerySlice> = (set) => ({
  gallery: { seed: 'pitch-to-glory', generation: 0 },
  reseed: () =>
    set((state) => {
      const generation = state.gallery.generation + 1;
      return {
        gallery: { seed: `glory-${generation}-${state.gallery.seed.slice(-32)}`, generation },
        change: state.change + 1,
      };
    }),
  setSeed: (seed) =>
    set((state) => ({
      gallery: { seed: seed.trim() || 'pitch-to-glory', generation: 0 },
      change: state.change + 1,
    })),
});
const sessionSlice: StateCreator<AppStore, [], [], SessionSlice> = (set) => ({
  activeSave: null,
  change: 0,
  savedChange: 0,
  saveStatus: 'idle',
  saveError: null,
  saveNotice: null,
  dismissSaveNotice: () => set({ saveNotice: null }),
  applySave: ({ recovery, ...save }) =>
    set((state) => {
      state.trainingAbandon?.resolve(false);
      return {
        trainingDraft: null,
        trainingAdvance: null,
        trainingAbandon: null,
        trainingSession: state.trainingSession + 1,
        activeSave: save,
        saveNotice: recovery ?? null,
        world: save.payload.kind === 'world' ? save.payload.world : null,
        careerResult: reportFor(
          state.careerResult,
          save.payload.kind === 'world' ? save.payload.world : null,
        ),
        matchSession: save.payload.kind === 'world' ? (save.payload.matchSession ?? null) : null,
        gallery: save.payload.gallery,
        settings: withDeviceTutorial(save.payload.settings, state.settings),
        preferencesStored: platform.writePreferences(
          withDeviceTutorial(save.payload.settings, state.settings),
        ),
        change: state.change + 1,
        savedChange: state.change + 1,
        saveStatus: 'saved',
        saveError: null,
      };
    }),
  saved: (save, change) =>
    set({ activeSave: save, savedChange: change, saveStatus: 'saved', saveError: null }),
  setSaveStatus: (saveStatus, saveError) => set({ saveStatus, saveError: saveError ?? null }),
  clearSession: () =>
    set((state) => {
      state.trainingAbandon?.resolve(false);
      return {
        activeSave: null,
        saveStatus: 'idle',
        saveError: null,
        trainingDraft: null,
        trainingAdvance: null,
        trainingAbandon: null,
        trainingSession: state.trainingSession + 1,
      };
    }),
});
const worldSlice: StateCreator<AppStore, [], [], WorldSlice> = (set) => ({
  world: null,
  worldJob: null,
  worldNotice: null,
  worldError: null,
  setWorld: (world) =>
    set((state) => ({
      world,
      trainingDraft: retainedTrainingDraft(state, world),
      trainingAdvance:
        state.trainingSaving || retainedTrainingDraft(state, world) ? state.trainingAdvance : null,
      matchSession: null,
      careerResult: reportFor(state.careerResult, world),
      change: state.change + 1,
    })),
  setWorldJob: (worldJob) => set({ worldJob }),
  worldFeedback: (worldNotice, worldError) => set({ worldNotice, worldError: worldError ?? null }),
});
const matchSlice: StateCreator<AppStore, [], [], MatchSlice> = (set) => ({
  matchSession: null,
  setMatchSession: (matchSession) => set((state) => ({ matchSession, change: state.change + 1 })),
  careerResult: null,
  setCareerResult: (careerResult) => set({ careerResult }),
});
export const useAppStore = create<AppStore>()((...args) => ({
  ...settingsSlice(...args),
  ...gallerySlice(...args),
  ...sessionSlice(...args),
  ...worldSlice(...args),
  ...matchSlice(...args),
  ...trainingDraftSlice(...args),
}));
