import { useEffect } from 'react';
import { useAppStore } from '../store';
import { loadedPersistence, persistence } from '../persistence/lazy';

// A save only becomes active through the save system, so when there is one it is loaded.
const save = () => loadedPersistence() ?? null;
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
          void persistence()
            .then((p) => p.autosave.afterMatch())
            .catch(() => {});
        } else void persistence().then((p) => p.autosave.schedule());
      }
    });
    const flush = () => {
      void save()
        ?.autosave.flush()
        .catch(() => {});
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const leave = () => {
      const p = save();
      if (!p) return;
      void p.autosave
        .flush()
        .then(() => p.slotLocks.releaseAll())
        .catch(() => {});
    };
    // A page restored from the back/forward cache released its locks on pagehide.
    const restore = (event: PageTransitionEvent) => {
      const active = useAppStore.getState().activeSave;
      if (!event.persisted || !active) return;
      void persistence()
        .then((p) => p.slotLocks.acquire(active.slot))
        .then((owned) => {
          if (!owned) useAppStore.getState().setSaveStatus('error', 'locked');
        })
        .catch(() => useAppStore.getState().setSaveStatus('error', 'storage'));
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
    window.addEventListener('pageshow', restore);
    window.addEventListener('beforeunload', preventDirtyExit);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('beforeunload', preventDirtyExit);
      save()?.autosave.dispose();
    };
  }, []);
}
