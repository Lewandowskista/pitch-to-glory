import { useEffect } from 'react';
import { useAppStore } from '../store';
import { autosave } from '../persistence/session';
import { slotLocks } from '../persistence/runtime';
export function useAutosave(): void {
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (
        state.activeSave &&
        state.change !== previous.change &&
        state.change !== state.savedChange
      ) {
        if (
          state.matchSession?.state.match.status === 'finished' &&
          previous.matchSession?.state.match.status !== 'finished'
        ) {
          void autosave.afterMatch().catch(() => {});
        } else autosave.schedule();
      }
    });
    const flush = () => {
      void autosave.flush().catch(() => {});
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const leave = () => {
      void autosave
        .flush()
        .then(() => slotLocks.releaseAll())
        .catch(() => {});
    };
    const preventDirtyExit = (event: BeforeUnloadEvent) => {
      const state = useAppStore.getState();
      if (
        (state.activeSave && state.change !== state.savedChange) ||
        (state.world && !state.activeSave)
      ) {
        event.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    window.addEventListener('beforeunload', preventDirtyExit);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('beforeunload', preventDirtyExit);
      autosave.dispose();
    };
  }, []);
}
