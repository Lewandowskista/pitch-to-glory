import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { errorCode, UnsavedWorldError } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { useAppStore } from '../store';
import { errorText, format, t } from '../i18n';
import { APP_VERSION } from '../release/version';
import { acknowledgeUpdate, startupUpdateNotice } from '../release/notice';
import { Icon } from './Icon';
import { buttonClass } from './kit/Button';
export function PwaPrompt() {
  const [error, setError] = useState('');
  // "Updated to x.y.z": decided once per start, cleared when seen. Only the version and a tiny
  // helper load here; the patch notes load with the What's new screen.
  const [updated, setUpdated] = useState(() => startupUpdateNotice(APP_VERSION) !== null);
  const onWhatsNew = useLocation().pathname === '/whats-new';
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
  // Opening What's new by any route counts as seeing the update.
  useEffect(() => {
    if (!updated || !onWhatsNew) return;
    acknowledgeUpdate(APP_VERSION);
    setUpdated(false);
  }, [updated, onWhatsNew]);
  const seen = () => {
    acknowledgeUpdate(APP_VERSION);
    setUpdated(false);
  };
  if (deciding) return null;
  if (!offline && !refresh && !error) {
    if (!updated || onWhatsNew) return null;
    // One prompt at a time: the service worker's prompts come first.
    return (
      <div className="pwa-prompt" role="status">
        <span className="pwa-prompt-icon update" aria-hidden="true">
          <Icon name="life" />
        </span>
        <p>{format(t.app.release.updated, { version: APP_VERSION })}</p>
        <Link className={buttonClass('primary')} to="/whats-new" onClick={seen}>
          {t.app.release.whatsNew}
        </Link>
        <button className="text-button" onClick={seen}>
          {t.app.dismiss}
        </button>
      </div>
    );
  }
  const kind = error ? 'error' : refresh ? 'update' : 'offline';
  return (
    <div className="pwa-prompt" role="status">
      <span className={`pwa-prompt-icon ${kind}`} aria-hidden="true">
        <Icon
          name={
            kind === 'error'
              ? 'alert'
              : kind === 'offline'
                ? 'check'
                : unsavedWorld
                  ? 'save'
                  : 'refresh'
          }
        />
      </span>
      <p>
        {error || (refresh ? (unsavedWorld ? t.app.updateSaveFirst : t.app.update) : t.app.offline)}
      </p>
      {refresh && unsavedWorld && (
        <Link className={buttonClass('primary')} to="/saves">
          {t.world.save}
        </Link>
      )}
      {refresh && !unsavedWorld && (
        <button
          className={buttonClass('primary')}
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
