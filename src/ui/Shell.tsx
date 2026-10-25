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
import { recoveryFileName } from '../persistence/files';
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
import { ShellPortrait } from './ShellPortrait';
import { CountBadge } from './kit/Chip';
import { IconButtonLink, Spinner } from './kit/Button';
import { KeyHint } from './kit/KeyHint';
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
/**
 * Where the player is, for the top bar: a career page reads "Overview / Hub"; the wizard
 * "Career / New career"; every other page its own name.
 */
const crumbOf = (pathname: string): { group?: string; page: string } => {
  const group = careerGroupOf(pathname);
  if (group) return { group: group.label, page: n.pages[pathname] ?? group.label };
  if (pathname.startsWith('/career/'))
    return { group: t.app.career, page: t.app.careerPages[pathname] ?? t.app.career };
  return {
    page:
      t.app.careerPages[pathname] ??
      items.find((item) => item.path === pathname)?.label ??
      t.app.name,
  };
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
/** The pitch-to-glory shield: the logo in the sidebar and the phone app bar. */
function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 48" aria-hidden="true" focusable="false" className={className}>
      <path d="M22 2L41 9V24Q41 39 22 46Q3 39 3 24V9Z" fill="#075e45" />
      <path
        d="M22 7L36 12V24Q36 35 22 41Q8 35 8 24V12Z"
        fill="none"
        stroke="#efcf63"
        strokeWidth="2"
      />
      <circle cx="22" cy="24" r="8" fill="#fff7e4" />
      <path d="M22 19.5L26 22.4L24.5 27H19.5L18 22.4Z" fill="#075e45" />
    </svg>
  );
}
type SaveState = 'saved' | 'saving' | 'dirty' | 'local';
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
  const workspace = useRef<HTMLDivElement>(null);
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
  const moreOpen = params.get('more') === '1';
  const closeMore = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete('more');
      setParams(next, { replace: true });
    }
  };
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
  // The page behind the More sheet is out of reach while it is open (the tab bar stays live).
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    if (moreOpen) element.setAttribute('inert', '');
    else element.removeAttribute('inert');
  }, [moreOpen]);
  const hasCareer = useAppStore((s) => Boolean(s.world?.career));
  const unread = useAppStore((s) =>
    s.world?.career ? s.world.inbox.filter((message) => !message.read).length : 0,
  );
  const group = careerGroupOf(location.pathname);
  const crumb = crumbOf(location.pathname);
  const sidebarNav = useRef<HTMLElement>(null);
  const bottomNav = useRef<HTMLElement>(null);
  // The visible count and its spoken form are separate, so the count is always announced
  // after the destination's name ("Overview, 2 unread") wherever the badge sits.
  const unreadText = (count: number) =>
    count > 0 && <span className="sr-only">, {format(n.unread, { count })}</span>;
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
  const saveState: SaveState =
    status === 'saving' ? 'saving' : dirty ? 'dirty' : active ? 'saved' : 'local';
  const saveText = {
    saving: t.app.saving,
    dirty: t.app.dirty,
    saved: t.app.saved,
    local: t.app.local,
  }[saveState];
  const [hintBefore, hintAfter] = t.app.shortcutHint.split('{key}');
  return (
    <LazyMotion features={motionFeatures} strict>
      <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
        <a href="#main" className="skip-link">
          {t.app.skip}
        </a>
        <aside className="sidebar">
          <Link to="/" className="brand">
            <Logo className="brand-logo" />
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
                      {entry.id === 'overview' && (
                        <>
                          <CountBadge count={unread} />
                          {unreadText(unread)}
                        </>
                      )}
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
              <ShellPortrait className="local-save-portrait" />
              <div>
                <strong>{active?.name ?? t.app.unsaved}</strong>
                <span>
                  {active ? format(t.app.slotLocal, { slot: active.slot }) : t.app.edition}
                </span>
              </div>
            </div>
            <button type="button" className="shortcut-button" onClick={showHelp}>
              <span aria-hidden="true">?</span>
              {t.app.help}
            </button>
          </div>
        </aside>
        <div className="workspace" ref={workspace}>
          <header className="topbar">
            <Logo className="topbar-logo" />
            <span className="breadcrumb">
              {crumb.group && (
                <span className="breadcrumb-group">
                  {crumb.group}
                  <span className="breadcrumb-separator" aria-hidden="true">
                    /
                  </span>
                </span>
              )}
              <span className="breadcrumb-page">{crumb.page}</span>
            </span>
            {worldJob && (
              <Link className="simulation-link" to="/world">
                <Spinner />
                <span>{t.world.advancing}</span>
              </Link>
            )}
            <div className="save-indicator" data-state={saveState}>
              <span className="save-dot" aria-hidden="true" />
              <Icon name={saveState === 'saved' ? 'check' : 'save'} />
              <span className="save-label">{saveText}</span>
            </div>
            <IconButtonLink
              to="/settings"
              label={t.app.settings}
              icon="settings"
              className="header-settings"
            />
          </header>
          {trainingPending && (
            <div className="global-notice" role="status">
              <Icon name="edit" />
              <Link className="text-button" to={keepSave('/career/training')}>
                {trainingDraftText.pending}
              </Link>
            </div>
          )}
          {error && (
            <div className="global-error" role="alert">
              <Icon name={error === 'locked' ? 'lock' : 'alert'} />
              <span className="banner-text">{errorText(error)}</span>
              <button
                type="button"
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
                    type="button"
                    className="text-button"
                    onClick={() => {
                      // Validation and serialization of a large world run in the persistence worker.
                      void persistence()
                        .then(async (p) => {
                          const snapshot = p.snapshot();
                          const file = await p.saves
                            .serialize(active.slot, active.name, snapshot)
                            .then((checked) => ({
                              name: 'pitch-to-glory-unsaved.json',
                              json: checked.json,
                            }))
                            // A session that no longer passes its checks is still worth keeping:
                            // download it unchecked, named as a recovery copy.
                            .catch(async () => ({
                              name: recoveryFileName('unsaved'),
                              json: (
                                await p.saves.serializeUnvalidated(
                                  active.slot,
                                  active.name,
                                  snapshot,
                                )
                              ).json,
                            }));
                          await platform.saveFile(file.name, file.json, 'application/json');
                        })
                        .catch((error) =>
                          useAppStore.getState().setSaveStatus('error', errorCode(error)),
                        );
                    }}
                  >
                    {t.app.exportUnsaved}
                  </button>
                  <button
                    type="button"
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
              <Icon name="ball" />
              <span className="banner-text">{t.app.notices[saveNotice]}</span>
              <button
                type="button"
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
        {moreOpen && (
          <MoreSheet
            hasCareer={hasCareer}
            pathname={location.pathname}
            keepSave={keepSave}
            onClose={closeMore}
          />
        )}
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
              className={item.current && !moreOpen ? 'active' : undefined}
              aria-current={item.current ? 'page' : undefined}
              onKeyDown={(event) => arrowKeys(event, bottomNav.current)}
            >
              <span className="bottom-nav-icon">
                <Icon name={item.icon} />
                <CountBadge count={item.count} />
              </span>
              <span>
                {item.label}
                {unreadText(item.count)}
              </span>
            </Link>
          ))}
          <button
            type="button"
            className={moreCurrent || moreOpen ? 'active' : undefined}
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
        <PwaPrompt />
        {params.get('help') === '1' && (
          <Dialog title={t.app.help} onClose={closeHelp}>
            <p className="shortcut-intro">
              {hintBefore}
              <KeyHint keys="?" />
              {hintAfter}
            </p>
            <dl className="shortcut-list">
              {t.app.shortcuts.map((entry) => (
                <div key={entry.does}>
                  <dt>
                    <KeyHint keys={entry.keys} />
                  </dt>
                  <dd>{entry.does}</dd>
                </div>
              ))}
            </dl>
          </Dialog>
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
 * Phones: everything the bottom bar does not hold, as a sheet docked on top of the tab bar.
 * The bar stays visible and live above the sheet's backdrop (More shows as current), and the
 * page behind is inert. It lives in the URL (`?more=1`), so Back and Escape close it; its links
 * replace that entry, so Back from a destination returns to the page the sheet was opened from.
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
  const ref = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const sheet = ref.current;
    heading.current?.focus({ preventScroll: true });
    // Escape closes the sheet from anywhere, including the tab bar beneath it, exactly once.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      // Back to the More button when the sheet closes without leaving the page.
      if (opener?.isConnected && !sheet?.contains(opener)) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; onClose reads the URL
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
    <>
      <div className="more-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="false"
        aria-labelledby="more-title"
        className="more-sheet"
      >
        <span className="more-handle" aria-hidden="true" />
        <div className="more-sheet-head">
          <h2 id="more-title" ref={heading} tabIndex={-1}>
            {n.moreTitle}
          </h2>
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
        {!hasCareer && (
          <p className="more-hint">
            <Icon name="career" />
            <span>{n.moreHint}</span>
          </p>
        )}
      </div>
    </>
  );
}

/** Screens that restore a save from the URL: career pages, Matchday and the world. */
function withSave(path: string, save: string | null): string {
  if (!save || !/^\/(career|match|world)(\/|$)/.test(path)) return path;
  return `${path}?save=${encodeURIComponent(save)}`;
}
