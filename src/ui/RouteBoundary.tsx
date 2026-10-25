import { Component, Fragment, type ReactNode } from 'react';
import { t } from '../i18n';
import { recordFailure } from '../diagnostics';
import { loadedPersistence } from '../persistence/lazy';
import { useAppStore } from '../store';
import { FootballIllustration } from './FootballIllustration';
import { Icon } from './Icon';
import { exportUnsavedCopy } from './exportUnsaved';
import { isLoadFailure, retryFailedPages } from './lazyPage';

/** Write what is waiting to be saved now, rather than after the autosave's delay. */
export function flushAutosave(): Promise<void> {
  return (
    loadedPersistence()
      ?.autosave.flush()
      .catch(() => {}) ?? Promise.resolve()
  );
}

/**
 * Journeys force a page failure through `window.__ptgForceFailure.route` (only under automation,
 * like the analytics test hook), to check the boundary and its Retry without breaking a screen.
 */
function ForcedFailure() {
  const forced =
    typeof navigator !== 'undefined' &&
    navigator.webdriver === true &&
    (window as { __ptgForceFailure?: { route?: boolean } }).__ptgForceFailure?.route === true;
  if (forced) throw new Error('Forced page failure');
  return null;
}

interface Props {
  children: ReactNode;
  /** The page's address: moving to another page clears a failure. */
  resetKey: string;
}
interface State {
  failed: boolean;
  error: unknown;
  resetKey: string;
  attempt: number;
}
/**
 * The page's error boundary (release 1.0 step 4.2), inside the shell: a page that fails takes
 * only itself down. Navigation, the save indicator and the autosave stay alive, what was
 * waiting to be saved is written at once, and the player can try again, export an unsaved copy
 * or reload. A page whose code failed to download (after one automatic retry) says so.
 */
export class RouteBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null, resetKey: this.props.resetKey, attempt: 0 };
  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error };
  }
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, error: null, resetKey: props.resetKey };
  }
  componentDidCatch(error: unknown): void {
    recordFailure('boundary', error, 'route');
    void flushAutosave();
  }
  private retry = () => {
    retryFailedPages();
    this.setState((state) => ({ failed: false, error: null, attempt: state.attempt + 1 }));
  };
  render() {
    if (!this.state.failed)
      return (
        <Fragment key={this.state.attempt}>
          <ForcedFailure />
          {this.props.children}
        </Fragment>
      );
    return <PageFailure load={isLoadFailure(this.state.error)} onRetry={this.retry} />;
  }
}

function PageFailure({ load, onRetry }: { load: boolean; onRetry: () => void }) {
  const active = useAppStore((s) => s.activeSave);
  const b = t.app.boundary;
  return (
    <div className="page">
      <section className="state-page" role="alert" aria-labelledby="page-failure-title">
        <FootballIllustration kind="error" />
        <h1 id="page-failure-title" className="state-title">
          {load ? b.loadTitle : b.title}
        </h1>
        <p className="state-body">{load ? b.loadBody : b.body}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="button" onClick={onRetry}>
            <Icon name="refresh" />
            {b.retry}
          </button>
          {active && (
            <button
              type="button"
              className="button secondary"
              onClick={() => void exportUnsavedCopy(active)}
            >
              <Icon name="save" />
              {t.app.exportUnsaved}
            </button>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => void flushAutosave().finally(() => location.reload())}
          >
            {b.reload}
          </button>
        </div>
      </section>
    </div>
  );
}
