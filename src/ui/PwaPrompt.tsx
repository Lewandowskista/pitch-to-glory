import { useRegisterSW } from 'virtual:pwa-register/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorCode, UnsavedWorldError } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { useAppStore } from '../store';
import { errorText, t } from '../i18n';
export function PwaPrompt() {
  const [error, setError] = useState('');
  const [activated, setActivated] = useState(false);
  const unsavedWorld = useAppStore((state) => !!state.world && !state.activeSave);
  const simulating = useAppStore((state) => !!state.worldJob);
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
    void persistence()
      .then((p) => p.updateApplication(async () => window.location.reload()))
      .catch(reportFailure);
  }
  if (!offline && !refresh && !error) return null;
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
                .then((p) => p.updateApplication(() => updateServiceWorker(true)))
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
