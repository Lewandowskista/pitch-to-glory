import { Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { lazyPage } from '../ui/lazyPage';
import { matchText as m } from '../i18n/match';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { FootballIllustration } from '../ui/FootballIllustration';
import '../styles/match.css';

/**
 * Matchday's engine and live panels are most of its code. With no world loaded and no save in
 * the address, the page only points to the World screen, so the rest loads when there is
 * something to play.
 */
const MatchBody = lazyPage(() => import('./MatchBody'));

export default function MatchScreen() {
  const world = useAppStore((store) => store.world);
  const [params] = useSearchParams();
  const saved = ['1', '2', '3'].includes(params.get('save') ?? '');
  if (world || saved)
    return (
      <Suspense fallback={<MatchShell busy />}>
        <MatchBody />
      </Suspense>
    );
  return <MatchShell />;
}

/** The page without a world: its heading, and the way to the World screen. */
function MatchShell({ busy = false }: { busy?: boolean }) {
  return (
    <Page className="match-page">
      <header className="page-heading match-heading">
        <div>
          <span className="eyebrow">{m.friendly}</span>
          <h1>{m.title}</h1>
          <p>{m.description}</p>
        </div>
        <Link className="match-back" to="/world">
          <Icon name="arrow" />
          {m.backWorld}
        </Link>
      </header>
      <span className="sr-only" data-testid="match-state" data-status="selection" data-minute={0}>
        {m.selection}
      </span>
      {busy ? (
        <section className="match-panel match-loading">
          <span className="match-spinner" aria-hidden="true" />
          <p role="status">{m.loading}</p>
        </section>
      ) : (
        <section className="match-panel match-empty illustrated-empty max-w-3xl">
          <div className="grid justify-items-start gap-4">
            <span className="match-empty-icon" aria-hidden="true">
              <Icon name="globe" />
            </span>
            <h2>{m.empty}</h2>
            <p>{m.emptyBody}</p>
            <Link className="button" to="/world">
              {m.world}
            </Link>
          </div>
          <FootballIllustration kind="match" />
        </section>
      )}
    </Page>
  );
}
