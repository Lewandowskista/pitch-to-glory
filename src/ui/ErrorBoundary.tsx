import { Component, type ReactNode } from 'react';
import { t } from '../i18n';
import { FootballIllustration } from './FootballIllustration';
import { Icon } from './Icon';
import { recordFailure } from '../diagnostics';
import { flushAutosave } from './RouteBoundary';

/**
 * The last resort, when the shell itself fails: no shell and no store, just the art, the reason
 * and a reload. Pages fail inside the shell instead (`RouteBoundary`).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    recordFailure('boundary', error, 'app');
    // The shell has gone: write what was waiting before the player reloads.
    void flushAutosave();
  }
  render() {
    return this.state.failed ? (
      <main className="error-page">
        <FootballIllustration kind="error" />
        <h1 className="state-title">{t.errors.render}</h1>
        <p className="state-body">{t.errors.renderBody}</p>
        <button type="button" className="button" onClick={() => location.reload()}>
          <Icon name="refresh" />
          {t.errors.reload}
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
