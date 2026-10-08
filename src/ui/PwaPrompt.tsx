import { useRegisterSW } from 'virtual:pwa-register/react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorCode, UnsavedWorldError } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { useAppStore } from '../store';
import { errorText, t } from '../i18n';
export function PwaPrompt() {
  const [error, setError] = useState('');
  const [activated, setActivated] = useState(false);
  const reloading = useRef(false);
  const unsavedWorld = useAppStore((state) => !!state.world && !state.activeSave);
  const simulating = useAppStore((state) => !!state.worldJob);
  // Never over a key moment's choices: the notice waits until the decision is made.
  const deciding = useAppStore((state) => !!state.matchSession?.state.currentMoment);
  const {
    offlineReady: [offline, setOffline],
    needRefresh: [refresh, setRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => setError(t.errors.storage),
    onNeedReload: () => {
      // Activation can arrive later, including after an update in another tab.
      setActivated(true);
      setRefresh(true);
      reloadSafely();
    },
  });
  function reportFailure(failure: unknown): void {
    setError(
      failure instanceof UnsavedWorldError ? t.app.updateSaveFirst : errorText(errorCode(failure)),
    );
  }
  function reloadSafely(): void {
    // Once: the library and our own controller-change listener can both ask.
    if (reloading.current) return;
    reloading.current = true;
    void persistence()
      .then((p) => p.updateApplication(async () => window.location.reload()))
      .catch((failure) => {
        reloading.current = false;
        reportFailure(failure);
      });
  }
  if ((!offline && !refresh && !error) || deciding) return null;
  return (
    <div className="pwa-prompt" role="status">
      <p>
        {error || (refresh ? (unsavedWorld ? t.app.updateSaveFirst : t.app.update) : t.app.offline)}
      </p>
      {refresh && unsavedWorld && (
        <Link className="button" to="/saves">
          {t.world.save}
        </Link>
      )}
      {refresh && !unsavedWorld && (
        <button
          className="button"
          disabled={simulating}
          title={simulating ? t.errors.busy : undefined}
          onClick={() => {
            setError('');
            if (activated) reloadSafely();
            else
              void persistence()
                .then((p) =>
                  p.updateApplication(async () => {
                    // A new worker found while the page was starting counts as "external" to
                    // the library, which then never reloads: reload when it takes control.
                    navigator.serviceWorker?.addEventListener('controllerchange', reloadSafely, {
                      once: true,
                    });
                    await updateServiceWorker(true);
                  }),
                )
                .catch(reportFailure);
          }}
        >
          {t.app.updateAction}
        </button>
      )}
      <button
        className="text-button"
        onClick={() => {
          setOffline(false);
          setRefresh(false);
          setError('');
        }}
      >
        {t.app.later}
      </button>
    </div>
  );
}
