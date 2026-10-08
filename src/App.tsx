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
const EditMode = lazy(() => import('./screens/EditMode'));
const Match = lazy(() => import('./screens/Match'));
const CareerNew = lazy(() => import('./screens/career/CareerNew'));
const CareerHub = lazy(() => import('./screens/career/CareerHub'));
const CareerProfile = lazy(() => import('./screens/career/CareerProfile'));
const CareerSkills = lazy(() => import('./screens/career/CareerSkills'));
const CareerTraining = lazy(() => import('./screens/career/CareerTraining'));
const CareerTransfers = lazy(() => import('./screens/career/CareerTransfers'));
const CareerAgent = lazy(() => import('./screens/career/CareerAgent'));
const CareerInbox = lazy(() => import('./screens/career/CareerInbox'));
const CareerCalendar = lazy(() => import('./screens/career/CareerCalendar'));
const CareerClub = lazy(() => import('./screens/career/CareerClub'));
const CareerMedia = lazy(() => import('./screens/career/CareerMedia'));
const CareerRival = lazy(() => import('./screens/career/CareerRival'));
const CareerLifestyle = lazy(() => import('./screens/career/CareerLifestyle'));
const CareerWardrobe = lazy(() => import('./screens/career/CareerWardrobe'));
const CareerNational = lazy(() => import('./screens/career/CareerNational'));
const CareerTrophies = lazy(() => import('./screens/career/CareerTrophies'));
const CareerChronicle = lazy(() => import('./screens/career/CareerChronicle'));
const CareerMoments = lazy(() => import('./screens/career/CareerMoments'));
const CareerLegacy = lazy(() => import('./screens/career/CareerLegacy'));
const MomentViewer = lazy(() => import('./screens/MomentViewer'));
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
              <Route path="edit" element={<EditMode />} />
              <Route path="match" element={<Match />} />
              <Route path="career" element={<CareerHub />} />
              <Route path="career/new" element={<CareerNew />} />
              <Route path="career/profile" element={<CareerProfile />} />
              <Route path="career/skills" element={<CareerSkills />} />
              <Route path="career/training" element={<CareerTraining />} />
              <Route path="career/transfers" element={<CareerTransfers />} />
              <Route path="career/agent" element={<CareerAgent />} />
              <Route path="career/inbox" element={<CareerInbox />} />
              <Route path="career/calendar" element={<CareerCalendar />} />
              <Route path="career/club" element={<CareerClub />} />
              <Route path="career/media" element={<CareerMedia />} />
              <Route path="career/rival" element={<CareerRival />} />
              <Route path="career/lifestyle" element={<CareerLifestyle />} />
              <Route path="career/wardrobe" element={<CareerWardrobe />} />
              <Route path="career/national" element={<CareerNational />} />
              <Route path="career/trophies" element={<CareerTrophies />} />
              <Route path="career/chronicle" element={<CareerChronicle />} />
              <Route path="career/moments" element={<CareerMoments />} />
              <Route path="career/legacy" element={<CareerLegacy />} />
              <Route path="moment" element={<MomentViewer />} />
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
