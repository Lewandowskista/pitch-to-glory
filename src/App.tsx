import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Shell } from './ui/Shell';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { t } from './i18n';
const Menu = lazy(() => import('./screens/Menu'));
const Gallery = lazy(() => import('./screens/Gallery'));
const Saves = lazy(() => import('./screens/Saves'));
const Settings = lazy(() => import('./screens/Settings'));
const World = lazy(() => import('./screens/World'));
const Match = lazy(() => import('./screens/Match'));
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="loading-page" role="status">
              {t.app.loading}
            </div>
          }
        >
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Menu />} />
              <Route path="gallery" element={<Gallery />} />
              <Route path="saves" element={<Saves />} />
              <Route path="settings" element={<Settings />} />
              <Route path="world" element={<World />} />
              <Route path="match" element={<Match />} />
              <Route
                path="*"
                element={
                  <div className="page page-heading">
                    <h1>{t.app.notFound}</h1>
                    <p>{t.app.notFoundBody}</p>
                    <Link className="button" to="/">
                      {t.app.back}
                    </Link>
                  </div>
                }
              />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
