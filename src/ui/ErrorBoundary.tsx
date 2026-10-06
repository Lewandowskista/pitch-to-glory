import { Component, type ReactNode } from 'react';
import { t } from '../i18n';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="error-page">
        <h1>{t.errors.render}</h1>
        <button className="button" onClick={() => location.reload()}>
          {t.errors.reload}
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
