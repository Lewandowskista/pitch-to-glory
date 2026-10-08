import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LazyMotion, MotionConfig } from 'framer-motion';

const motionFeatures = () => import('./motionFeatures').then((module) => module.default);
import { t, errorText, format } from '../i18n';
import { useAppStore } from '../store';
import { useAutosave } from '../hooks/useAutosave';
import { errorCode } from '../persistence/errors';
import { loadedPersistence, persistence, preloadPersistence } from '../persistence/lazy';
import { platform } from '../platform';
import { Icon, type IconName } from './Icon';
import { Dialog } from './Dialog';
import { PwaPrompt } from './PwaPrompt';
import { audio } from '../audio';
import type { AudioSettings } from '../model/domain';
import { navigationText as n } from '../i18n/navigation';
import { CAREER_GROUPS, careerGroupOf, groupHome } from '../screens/career/navigation';
import { TrainingDraftGuard } from './TrainingDraftGuard';
import { trainingDraftText } from '../i18n/trainingDraft';
type Item = { path: string; label: string; icon: IconName };
const home: Item = { path: '/', label: t.app.menu, icon: 'home' };
const careerItem: Item = { path: '/career', label: t.app.career, icon: 'career' };
const matchItem: Item = { path: '/match', label: t.app.match, icon: 'ball' };
const worldItem: Item = { path: '/world', label: t.app.world, icon: 'globe' };
/** Game utilities, set apart from the football in the sidebar and in More on phones. */
const utilities: Item[] = [
  { path: '/edit', label: t.app.edit, icon: 'edit' },
  { path: '/gallery', label: t.app.gallery, icon: 'gallery' },
  { path: '/saves', label: t.app.saves, icon: 'save' },
  { path: '/settings', label: t.app.settings, icon: 'settings' },
];
const items: Item[] = [home, careerItem, matchItem, worldItem, ...utilities];
const pageLabel = (pathname: string) => {
  const group = careerGroupOf(pathname);
  const label = t.app.careerPages[pathname] ?? items.find((item) => item.path === pathname)?.label;
  return group && label ? `${group.label} · ${label}` : label;
};
/** Arrow keys move along a list of links, wrapping at the ends. */
function arrowKeys(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
  event.preventDefault();
  const links = Array.from(container?.querySelectorAll<HTMLElement>('a, button') ?? []);
  const index = links.indexOf(event.currentTarget);
  const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : links.length - 1;
  links[(index + step) % links.length]?.focus();
}
export function Shell() {
  const settings = useAppStore((s) => s.settings);
  const active = useAppStore((s) => s.activeSave);
  const status = useAppStore((s) => s.saveStatus);
  const error = useAppStore((s) => s.saveError);
  const worldJob = useAppStore((s) => s.worldJob);
  const dirty = useAppStore((s) => Boolean(s.activeSave && s.change !== s.savedChange));
  const saveNotice = useAppStore((s) => s.saveNotice);
  const trainingPending = useAppStore((s) => Boolean(s.trainingDraft));
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Links to screens that restore a save keep it, so arriving never rewrites the history
  // entry afterwards (which a quick Back could land on).
  const keepSave = (path: string) => withSave(path, params.get('save'));
  const main = useRef<HTMLElement>(null);
  const helpPushed = useRef(false);
  const [recoverBusy, setRecoverBusy] = useState(false);
  const showHelp = () => {
    helpPushed.current = true;
    const next = new URLSearchParams(params);
    next.set('help', '1');
    setParams(next);
  };
  const closeHelp = () => {
    if (helpPushed.current) {
      helpPushed.current = false;
      navigate(-1);
    } else {
      const next = new URLSearchParams(params);
      next.delete('help');
      setParams(next, { replace: true });
    }
  };
  useAutosave();
  // The save system loads once the first screen is up, before anything needs it.
  useEffect(preloadPersistence, []);
  useAudio(settings.audio);
  // Before paint, so a page never shows one theme and then animates into the other.
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
      document.documentElement.style.fontSize = `${settings.fontScale * 100}%`;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#14251e' : '#f4f5ee');
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [settings]);
  useEffect(() => {
    const label = pageLabel(location.pathname) ?? t.app.menu;
    document.title = `${label} · ${t.app.name}`;
    if (!location.search) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    void loadedPersistence()
      ?.autosave.flush()
      .catch(() => {});
  }, [location.pathname, location.search]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.defaultPrevented ||
        target.closest('input,textarea,select,[contenteditable="true"]') ||
        document.querySelector('dialog[open]')
      )
        return;
      if (event.key === '?') {
        event.preventDefault();
        helpPushed.current = true;
        const next = new URLSearchParams(location.search);
        next.set('help', '1');
        setParams(next);
      }
      if (event.key === 'Escape' && location.pathname !== '/') {
        event.preventDefault();
        if (window.history.state?.idx > 0) navigate(-1);
        else navigate('/');
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [location.pathname, location.search, navigate, setParams]);
  const hasCareer = useAppStore((s) => Boolean(s.world?.career));
  const unread = useAppStore((s) =>
    s.world?.career ? s.world.inbox.filter((message) => !message.read).length : 0,
  );
  const group = careerGroupOf(location.pathname);
  const sidebarNav = useRef<HTMLElement>(null);
  const bottomNav = useRef<HTMLElement>(null);
  // The visible count and its spoken form are separate, so the count is always announced
  // after the destination's name ("Overview, 2 unread") wherever the badge sits.
  const badgeMark = (count: number) =>
    count > 0 && (
      <span aria-hidden="true" className="nav-badge">
        {count > 99 ? '99+' : count}
      </span>
    );
  const unreadText = (count: number) =>
    count > 0 && <span className="sr-only">, {format(n.unread, { count })}</span>;
  const badge = (count: number) => (
    <>
      {badgeMark(count)}
      {unreadText(count)}
    </>
  );
  const sidebarLink = (item: Item) => (
    <NavLink
      end={item.path === '/'}
      to={keepSave(item.path)}
      key={item.path}
      // On a career page its group link carries the highlight; Career itself stays quieter.
      className={({ isActive }) => (isActive ? (group ? 'active parent' : 'active') : '')}
      onKeyDown={(event) => arrowKeys(event, sidebarNav.current)}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  );
  // Phones: five destinations. With a career, its groups (History sits in More); without
  // one, the main places. Everything else is one tap away in More.
  const moreOpen = params.get('more') === '1';
  const bottomItems = hasCareer
    ? CAREER_GROUPS.filter((entry) => entry.id !== 'history').map((entry) => ({
        path: groupHome(entry),
        label: entry.label,
        icon: entry.icon,
        current: group?.id === entry.id,
        count: entry.id === 'overview' ? unread : 0,
      }))
    : [home, careerItem, matchItem, worldItem].map((item) => ({
        ...item,
        label: t.app.short[item.path] ?? item.label,
        current:
          item.path === '/'
            ? location.pathname === '/'
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
        count: 0,
      }));
  const moreCurrent = !moreOpen && !bottomItems.some((item) => item.current);
  const openMore = () => {
    const next = new URLSearchParams(params);
    next.set('more', '1');
    setParams(next);
  };
  const closeMore = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete('more');
      setParams(next, { replace: true });
    }
  };
  return (
    <LazyMotion features={motionFeatures} strict>
      <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
        <a href="#main" className="skip-link">
          {t.app.skip}
        </a>
        <aside className="sidebar">
          <Link to="/" className="brand">
            <img src="/icon.svg" width="42" height="42" alt="" />
            <span>
              {t.app.brandFirst}
              <span>{t.app.brandRest}</span>
            </span>
          </Link>
          <p className="brand-caption">{t.app.tagline}</p>
          <nav aria-label={t.app.navigation} ref={sidebarNav}>
            {sidebarLink(home)}
            {sidebarLink(careerItem)}
            {hasCareer && (
              <ul className="sidebar-groups" data-tour="career-nav">
                {CAREER_GROUPS.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      to={keepSave(groupHome(entry))}
                      className={group?.id === entry.id ? 'active' : undefined}
                      aria-current={group?.id === entry.id ? 'true' : undefined}
                      onKeyDown={(event) => arrowKeys(event, sidebarNav.current)}
                    >
                      <Icon name={entry.icon} />
                      <span>{entry.label}</span>
                      {entry.id === 'overview' && badge(unread)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {sidebarLink(matchItem)}
            {sidebarLink(worldItem)}
            <span className="sidebar-divider" aria-hidden="true" />
            {utilities.map((item) => sidebarLink(item))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-save">
              <Icon name="save" />
              <div>
                <strong>{active?.name ?? t.app.unsaved}</strong>
                <span>{active ? t.app.local : t.app.edition}</span>
              </div>
            </div>
            <button className="shortcut-button" onClick={showHelp}>
              <span>?</span>
              {t.app.help}
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span className="breadcrumb">
              {group ? (
                <>
                  {group.label}
                  {/* Phones show the group; the page title below names the page. */}
                  <span className="breadcrumb-page">
                    {' · '}
                    {t.app.careerPages[location.pathname]}
                  </span>
                </>
              ) : (
                (pageLabel(location.pathname) ?? t.app.name)
              )}
            </span>
            {worldJob && (
              <Link className="simulation-link" to="/world">
                {t.world.advancing}
              </Link>
            )}
            <div className="save-indicator">
              <Icon name={status === 'saved' && !dirty ? 'check' : 'save'} />
              <span>
                {status === 'saving'
                  ? t.app.saving
                  : dirty
                    ? t.app.dirty
                    : active
                      ? t.app.saved
                      : t.app.local}
              </span>
            </div>
            <Link
              to="/settings"
              aria-label={t.app.settings}
              title={t.app.settings}
              className="header-settings"
            >
              <Icon name="settings" />
            </Link>
          </header>
          {trainingPending && (
            <div className="global-notice" role="status">
              <Link className="text-button" to={keepSave('/career/training')}>
                {trainingDraftText.pending}
              </Link>
            </div>
          )}
          {error && (
            <div className="global-error" role="alert">
              {errorText(error)}
              <button
                className="text-button"
                onClick={() =>
                  void persistence()
                    .then((p) => p.autosave.flush())
                    .catch(() => {})
                }
              >
                {t.app.retry}
              </button>
              {active && (
                <>
                  <button
                    className="text-button"
                    onClick={() => {
                      // Validation and serialization of a large world run in the persistence worker.
                      void persistence()
                        .then((p) => p.saves.serialize(active.slot, active.name, p.snapshot()))
                        .then((file) =>
                          platform.saveFile(
                            'pitch-to-glory-unsaved.json',
                            file.json,
                            'application/json',
                          ),
                        )
                        .catch((error) =>
                          useAppStore.getState().setSaveStatus('error', errorCode(error)),
                        );
                    }}
                  >
                    {t.app.exportUnsaved}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set('recover', '1');
                      setParams(next);
                    }}
                  >
                    {t.app.reloadSave}
                  </button>
                </>
              )}
            </div>
          )}
          {saveNotice && (
            <div className="global-notice" role="status">
              {t.app.notices[saveNotice]}
              <button
                className="text-button"
                onClick={() => useAppStore.getState().dismissSaveNotice()}
              >
                {t.app.dismiss}
              </button>
            </div>
          )}
          <main id="main" ref={main} tabIndex={-1}>
            <Outlet />
          </main>
          <footer className="page-footer">
            <span>{t.app.name}</span>
            <span>{t.app.tagline}</span>
          </footer>
        </div>
        <nav
          className="bottom-nav"
          aria-label={t.app.navigation}
          ref={bottomNav}
          data-tour={hasCareer ? 'career-nav' : undefined}
        >
          {bottomItems.map((item) => (
            <Link
              key={item.path}
              to={keepSave(item.path)}
              className={item.current ? 'active' : undefined}
              aria-current={item.current ? 'page' : undefined}
              onKeyDown={(event) => arrowKeys(event, bottomNav.current)}
            >
              <span className="bottom-nav-icon">
                <Icon name={item.icon} />
                {badgeMark(item.count)}
              </span>
              <span>
                {item.label}
                {unreadText(item.count)}
              </span>
            </Link>
          ))}
          <button
            type="button"
            className={moreCurrent ? 'active' : undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={moreOpen ? closeMore : openMore}
            onKeyDown={(event) => arrowKeys(event, bottomNav.current)}
          >
            <span className="bottom-nav-icon">
              <Icon name="more" />
            </span>
            <span>{n.more}</span>
          </button>
        </nav>
        {moreOpen && (
          <MoreSheet
            hasCareer={hasCareer}
            pathname={location.pathname}
            keepSave={keepSave}
            onClose={closeMore}
          />
        )}
        <PwaPrompt />
        {params.get('help') === '1' && (
          <Dialog title={t.app.help} body={t.app.helpNav} onClose={closeHelp} />
        )}
        {params.get('recover') === '1' && active && (
          <Dialog
            title={t.app.recoverTitle}
            body={t.app.recoverBody}
            confirmLabel={t.app.reloadSave}
            busy={recoverBusy}
            onClose={() => {
              const next = new URLSearchParams(params);
              next.delete('recover');
              setParams(next, { replace: true });
            }}
            onConfirm={() => {
              setRecoverBusy(true);
              void persistence()
                .then((p) => p.reloadActiveSlot())
                .then(() => {
                  const next = new URLSearchParams(params);
                  next.delete('recover');
                  setParams(next, { replace: true });
                })
                .catch((error) => useAppStore.getState().setSaveStatus('error', errorCode(error)))
                .finally(() => setRecoverBusy(false));
            }}
          />
        )}
        <TrainingDraftGuard />
      </MotionConfig>
    </LazyMotion>
  );
}

/**
 * Audio starts with the first interaction (browser autoplay rules). Buttons, links and tabs
 * tap and switches toggle; an element can opt out with `data-sound="none"`.
 */
function useAudio(settings: AudioSettings): void {
  useEffect(() => audio.configure(settings), [settings]);
  useEffect(() => {
    const unlock = () => audio.unlock();
    const click = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest(
        'button, a[href], summary, [role="tab"], input[type="checkbox"], input[type="radio"]',
      );
      if (!target || target.closest('[data-sound="none"]')) return;
      if ((target as HTMLButtonElement).disabled) return;
      audio.play(target.matches('input, [role="switch"]') ? 'toggle' : 'tap');
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('click', click, true);
    };
  }, []);
}

/**
 * Phones: everything the bottom bar does not hold, as a sheet over the page. It lives in the
 * URL (`?more=1`), so Back and Escape close it; its links replace that entry, so Back from a
 * destination returns to the page the sheet was opened from.
 */
function MoreSheet({
  hasCareer,
  pathname,
  keepSave,
  onClose,
}: {
  hasCareer: boolean;
  pathname: string;
  keepSave: (path: string) => string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const history = CAREER_GROUPS.find((entry) => entry.id === 'history')!;
  const sections: { title: string; links: Item[] }[] = [
    ...(hasCareer
      ? [
          {
            title: history.label,
            links: history.pages.map((page) => ({ ...page, icon: history.icon })),
          },
          { title: n.play, links: [matchItem, worldItem, home] },
        ]
      : []),
    { title: n.app, links: utilities },
  ];
  return (
    <dialog
      ref={ref}
      className="more-sheet"
      aria-labelledby="more-title"
      // Escape is handled here and stopped, so it closes the sheet exactly once: WebKit can close
      // the dialog before the shell's own Escape shortcut ("back") sees the key.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="more-sheet-inner">
        <div className="more-sheet-head">
          <h2 id="more-title">{n.moreTitle}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            {n.close}
          </button>
        </div>
        {sections.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.links.map((item) => (
                <li key={item.path}>
                  <Link
                    to={keepSave(item.path)}
                    replace
                    aria-current={pathname === item.path ? 'page' : undefined}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  );
}

/** Screens that restore a save from the URL: career pages, Matchday and the world. */
function withSave(path: string, save: string | null): string {
  if (!save || !/^\/(career|match|world)(\/|$)/.test(path)) return path;
  return `${path}?save=${encodeURIComponent(save)}`;
}
