import { Suspense, useEffect, useState } from 'react';
import { lazyPage } from '../ui/lazyPage';
import { t } from '../i18n';
import { Page } from '../ui/Page';

// The slots need the whole save system; the heading should not wait for it.
const SavesContent = lazyPage(() => import('./SavesContent'));

/**
 * On a fresh page load, run once the first content has painted and the browser is idle, so
 * heavy loading never competes with the first paint; later in the session, run at once.
 * Falls back to a timer where paint timing or idle callbacks are missing (Safari has no
 * requestIdleCallback).
 */
function afterFirstPaint(run: () => void): () => void {
  // Navigating here inside the app: the page has long painted, so start at once.
  if (performance.getEntriesByName('first-contentful-paint').length) {
    run();
    return () => undefined;
  }
  let done = false;
  let idle = 0;
  const idleSupported = typeof window.requestIdleCallback === 'function';
  const go = () => {
    if (done) return;
    done = true;
    idle = idleSupported
      ? window.requestIdleCallback(run, { timeout: 300 })
      : Number(globalThis.setTimeout(run, 50));
  };
  const fallback = globalThis.setTimeout(go, 1000);
  let observer: PerformanceObserver | null = null;
  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver(() => go());
      observer.observe({ type: 'paint', buffered: true });
    } catch {
      // Paint timing unsupported: the fallback timer starts the work.
    }
  }
  return () => {
    done = true;
    observer?.disconnect();
    globalThis.clearTimeout(fallback);
    if (idleSupported) window.cancelIdleCallback(idle);
    else globalThis.clearTimeout(idle);
  };
}

export default function Saves() {
  const [painted, setPainted] = useState(false);
  useEffect(() => afterFirstPaint(() => setPainted(true)), []);
  const loading = (
    <p role="status" className="muted">
      {t.saves.loading}
    </p>
  );
  return (
    <Page>
      <div className="page-heading">
        <h1>{t.saves.title}</h1>
        <p>{t.saves.description}</p>
      </div>
      {painted ? (
        <Suspense fallback={loading}>
          <SavesContent />
        </Suspense>
      ) : (
        loading
      )}
    </Page>
  );
}
