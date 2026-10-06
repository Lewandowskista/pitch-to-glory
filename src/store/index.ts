import { create, type StateCreator } from 'zustand';
import type { GalleryState, Settings, World } from '../model/domain';
import { DEFAULT_SETTINGS, validateSettings, type AppSave } from '../persistence/schema';
import { platform } from '../platform';
import type { MatchSession } from '../engine/match/types';

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
  applySave: (save: AppSave) => void;
  saved: (save: AppSave, change: number) => void;
  setSaveStatus: (status: SessionSlice['saveStatus'], error?: string) => void;
  clearSession: () => void;
}
export interface WorldJob {
  type: 'generate' | 'simulate-week' | 'simulate-season' | 'next-season';
  completedWeeks: number;
  totalWeeks: number;
  cancelling: boolean;
}
interface WorldSlice {
  world: World | null;
  worldJob: WorldJob | null;
  worldNotice: 'generated' | 'advanced' | 'finished' | 'cancelled' | 'newSeason' | null;
  worldError: string | null;
  setWorld: (world: World) => void;
  setWorldJob: (job: WorldJob | null) => void;
  worldFeedback: (notice: WorldSlice['worldNotice'], error?: string) => void;
}
interface MatchSlice {
  matchSession: MatchSession | null;
  setMatchSession: (session: MatchSession | null) => void;
}
export type AppStore = SettingsSlice & GallerySlice & SessionSlice & WorldSlice & MatchSlice;
let preferences: Settings;
try {
  preferences = validateSettings(platform.readPreferences());
} catch {
  preferences = { ...DEFAULT_SETTINGS };
}
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
  applySave: (save) =>
    set((state) => ({
      activeSave: save,
      world: save.payload.kind === 'world' ? save.payload.world : null,
      matchSession: save.payload.kind === 'world' ? (save.payload.matchSession ?? null) : null,
      gallery: save.payload.gallery,
      settings: save.payload.settings,
      preferencesStored: platform.writePreferences(save.payload.settings),
      change: state.change + 1,
      savedChange: state.change + 1,
      saveStatus: 'saved',
      saveError: null,
    })),
  saved: (save, change) =>
    set({ activeSave: save, savedChange: change, saveStatus: 'saved', saveError: null }),
  setSaveStatus: (saveStatus, saveError) => set({ saveStatus, saveError: saveError ?? null }),
  clearSession: () => set({ activeSave: null, saveStatus: 'idle', saveError: null }),
});
const worldSlice: StateCreator<AppStore, [], [], WorldSlice> = (set) => ({
  world: null,
  worldJob: null,
  worldNotice: null,
  worldError: null,
  setWorld: (world) => set((state) => ({ world, matchSession: null, change: state.change + 1 })),
  setWorldJob: (worldJob) => set({ worldJob }),
  worldFeedback: (worldNotice, worldError) => set({ worldNotice, worldError: worldError ?? null }),
});
const matchSlice: StateCreator<AppStore, [], [], MatchSlice> = (set) => ({
  matchSession: null,
  setMatchSession: (matchSession) => set((state) => ({ matchSession, change: state.change + 1 })),
});
export const useAppStore = create<AppStore>()((...args) => ({
  ...settingsSlice(...args),
  ...gallerySlice(...args),
  ...sessionSlice(...args),
  ...worldSlice(...args),
  ...matchSlice(...args),
}));
