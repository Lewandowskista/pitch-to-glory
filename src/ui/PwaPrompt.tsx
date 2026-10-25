import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { errorCode } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { useAppStore } from '../store';
import { errorText, format, t } from '../i18n';
import { APP_VERSION } from '../release/version';
import { acknowledgeUpdate, startupUpdateNotice } from '../release/notice';
import { Icon } from './Icon';
import { buttonClass } from './kit/Button';
import { useConsentInvitation } from '../analytics';
import { afterLoadAndIdle, useServiceWorker } from './serviceWorker';
import { UpdateBlockedError } from '../release/busy';
import type { UpdateTabs } from '../release/updateTabs';
const ConsentInvitation = lazy(() => import('./ConsentInvitation'));
export function PwaPrompt() {
  const [error, setError] = useState('');
  // "Updated to x.y.z": decided once per start, cleared when seen. Only the version and a tiny
  // helper load here; the patch notes load with the What's new screen.
  const [updated, setUpdated] = useState(() => startupUpdateNotice(APP_VERSION) !== null);
  const onWhatsNew = useLocation().pathname === '/whats-new';
  const [activated, setActivated] = useState(false);
  const [checking, setChecking] = useState(false);
  const reloading = useRef(false);
  // Coordinated updates across tabs (release 1.0 step 4.1): loaded once the page is idle, or
  // when the player asks to update first.
  const tabs = useRef<UpdateTabs | null>(null);
  const tabsLoading = useRef<Promise<UpdateTabs | null> | null>(null);
  const closed = useRef(false);
  const loadTabs = (): Promise<UpdateTabs | null> =>
    (tabsLoading.current ??= import('../release/tabUpdates').then(
      ({ startUpdateTabs }) => {
        if (closed.current) return null;
        tabs.current = startUpdateTabs(() => {
          // Another tab activated the update; this one reloads when nothing would be lost.
          setActivated(true);
          setRefresh(true);
          reloadSafely();
        });
        return tabs.current;
      },
      () => {
        tabsLoading.current = null;
        return null;
      },
    ));
  const unsavedWorld = useAppStore((state) => !!state.world && !state.activeSave);
  const simulating = useAppStore((state) => !!state.worldJob);
  // Never over a key moment's choices: the notice waits until the decision is made.
  const deciding = useAppStore((state) => !!state.matchSession?.state.currentMoment);
  // The one-time analytics invitation (docs/ANALYTICS.md) waits for every other prompt.
  const invited = useConsentInvitation();
  const {
    offlineReady: [offline, setOffline],
    needRefresh: [refresh, setRefresh],
    updateServiceWorker,
  } = useServiceWorker({
    onRegisterError: () => setError(t.errors.storage),
    onNeedReload: () => {
      // Activation can arrive later, including after an update in another tab.
      setActivated(true);
      setRefresh(true);
      reloadSafely();
    },
  });
  function reportFailure(failure: unknown): void {
    if (failure instanceof UpdateBlockedError)
      // The wording loads with the update coordinator (already loaded when the player asked).
      void import('../release/tabUpdates').then(
        ({ blockedText }) => setError(blockedText(failure)),
        () => setError(t.errors.busy),
      );
    else setError(errorText(errorCode(failure)));
  }
  /** The new version is active: reload this tab, and ask the others to, once it is safe. */
  function reloadSafely(): void {
    // Once: the library, the controller change and another tab can all ask.
    if (reloading.current) return;
    reloading.current = true;
    tabs.current?.announceReload();
    void persistence()
      .then((p) => p.updateApplication(async () => window.location.reload()))
      .catch((failure) => {
        reloading.current = false;
        reportFailure(failure);
      });
  }
  useEffect(() => {
    closed.current = false;
    const cancel = afterLoadAndIdle(() => void loadTabs());
    // A new version taking control after another tab (or the library) activated it. The first
    // install also takes control (clientsClaim), which is no reason to reload.
    const container = navigator.serviceWorker;
    let controller = container?.controller ?? null;
    const changed = () => {
      const previous = controller;
      controller = container?.controller ?? null;
      if (!previous) return;
      setActivated(true);
      setRefresh(true);
      reloadSafely();
    };
    container?.addEventListener('controllerchange', changed);
    return () => {
      container?.removeEventListener('controllerchange', changed);
      cancel();
      closed.current = true;
      tabs.current?.close();
      tabs.current = null;
      tabsLoading.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per shell; reads refs
  }, []);
  /**
   * Save every tab, refuse while any is busy (and say which and why), then activate the new
   * version; each tab reloads once it takes control.
   */
  function startUpdate(): void {
    setError('');
    setChecking(true);
    void persistence()
      .then((p) =>
        p.updateApplication(async () => {
          const coordinator = await loadTabs();
          const blocker = (await coordinator?.poll()) ?? null;
          if (blocker) throw new UpdateBlockedError(blocker.busy, blocker.page);
          // A new worker found while the page was starting counts as "external" to the
          // library, which then never reloads: reload when it takes control.
          navigator.serviceWorker?.addEventListener('controllerchange', reloadSafely, {
            once: true,
          });
          await updateServiceWorker(true);
        }),
      )
      .catch(reportFailure)
      .finally(() => setChecking(false));
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
    if (!updated || onWhatsNew)
      return invited ? (
        <Suspense fallback={null}>
          <ConsentInvitation />
        </Suspense>
      ) : null;
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
        {error ||
          (refresh
            ? checking
              ? t.app.updateChecking
              : unsavedWorld
                ? t.app.updateSaveFirst
                : t.app.update
            : t.app.offline)}
      </p>
      {refresh && unsavedWorld && (
        <Link className={buttonClass('primary')} to="/saves">
          {t.world.save}
        </Link>
      )}
      {refresh && !unsavedWorld && (
        <button
          className={buttonClass('primary')}
          disabled={simulating || checking}
          title={simulating ? t.errors.busy : undefined}
          onClick={() => {
            setError('');
            if (activated) reloadSafely();
            else startUpdate();
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
