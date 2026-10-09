import { Suspense } from 'react';
import { lazyPage } from './ui/lazyPage';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Shell } from './ui/Shell';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { t } from './i18n';
const Menu = lazyPage(() => import('./screens/Menu'));
const Gallery = lazyPage(() => import('./screens/Gallery'));
const Saves = lazyPage(() => import('./screens/Saves'));
const Settings = lazyPage(() => import('./screens/Settings'));
const World = lazyPage(() => import('./screens/World'));
const EditMode = lazyPage(() => import('./screens/EditMode'));
const Match = lazyPage(() => import('./screens/Match'));
const CareerNew = lazyPage(() => import('./screens/career/CareerNew'));
const CareerHub = lazyPage(() => import('./screens/career/CareerHub'));
const CareerProfile = lazyPage(() => import('./screens/career/CareerProfile'));
const CareerSkills = lazyPage(() => import('./screens/career/CareerSkills'));
const CareerTraining = lazyPage(() => import('./screens/career/CareerTraining'));
const CareerTransfers = lazyPage(() => import('./screens/career/CareerTransfers'));
const CareerAgent = lazyPage(() => import('./screens/career/CareerAgent'));
const CareerInbox = lazyPage(() => import('./screens/career/CareerInbox'));
const CareerCalendar = lazyPage(() => import('./screens/career/CareerCalendar'));
const CareerClub = lazyPage(() => import('./screens/career/CareerClub'));
const CareerMedia = lazyPage(() => import('./screens/career/CareerMedia'));
const CareerRival = lazyPage(() => import('./screens/career/CareerRival'));
const CareerLifestyle = lazyPage(() => import('./screens/career/CareerLifestyle'));
const CareerWardrobe = lazyPage(() => import('./screens/career/CareerWardrobe'));
const CareerNational = lazyPage(() => import('./screens/career/CareerNational'));
const CareerTrophies = lazyPage(() => import('./screens/career/CareerTrophies'));
const CareerChronicle = lazyPage(() => import('./screens/career/CareerChronicle'));
const CareerMoments = lazyPage(() => import('./screens/career/CareerMoments'));
const CareerLegacy = lazyPage(() => import('./screens/career/CareerLegacy'));
const MomentViewer = lazyPage(() => import('./screens/MomentViewer'));
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
