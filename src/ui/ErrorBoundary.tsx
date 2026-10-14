import { Component, type ReactNode } from 'react';
import { t } from '../i18n';
import { FootballIllustration } from './FootballIllustration';
import { Icon } from './Icon';

/** The last resort: no shell and no store, just the art, the reason and a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
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
