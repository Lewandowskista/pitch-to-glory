import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { t, errorText } from '../i18n';
import { useAppStore } from '../store';
import { useAutosave } from '../hooks/useAutosave';
import { autosave, errorCode, reloadActiveSlot, snapshot } from '../persistence/session';
import { saves } from '../persistence/runtime';
import { platform } from '../platform';
import { Icon, type IconName } from './Icon';
import { Dialog } from './Dialog';
import { PwaPrompt } from './PwaPrompt';
const items: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: t.app.menu, icon: 'home' },
  { path: '/world', label: t.app.world, icon: 'globe' },
  { path: '/match', label: t.app.match, icon: 'ball' },
  { path: '/gallery', label: t.app.gallery, icon: 'gallery' },
  { path: '/saves', label: t.app.saves, icon: 'save' },
  { path: '/settings', label: t.app.settings, icon: 'settings' },
];
export function Shell() {
  const settings = useAppStore((s) => s.settings);
  const active = useAppStore((s) => s.activeSave);
  const status = useAppStore((s) => s.saveStatus);
  const error = useAppStore((s) => s.saveError);
  const worldJob = useAppStore((s) => s.worldJob);
  const dirty = useAppStore((s) => Boolean(s.activeSave && s.change !== s.savedChange));
  const saveNotice = useAppStore((s) => s.saveNotice);
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
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
  useEffect(() => {
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
    const label = items.find((item) => item.path === location.pathname)?.label ?? t.app.menu;
    document.title = `${label} · ${t.app.name}`;
    if (!location.search) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    void autosave.flush().catch(() => {});
  }, [location.pathname, location.search]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
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
  const links = items.map((item) => (
    <NavLink
      end={item.path === '/'}
      to={item.path}
      key={item.path}
      onKeyDown={(event) => {
        if (
          event.key === 'ArrowDown' ||
          event.key === 'ArrowRight' ||
          event.key === 'ArrowUp' ||
          event.key === 'ArrowLeft'
        ) {
          event.preventDefault();
          const links = Array.from(
            event.currentTarget.parentElement?.querySelectorAll<HTMLAnchorElement>('a') ?? [],
          );
          const index = links.indexOf(event.currentTarget);
          links[
            (index +
              (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : links.length - 1)) %
              links.length
          ]?.focus();
        }
      }}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  ));
  return (
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
        <nav aria-label={t.app.navigation}>{links}</nav>
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
            {items.find((item) => item.path === location.pathname)?.label ?? t.app.name}
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
        {error && (
          <div className="global-error" role="alert">
            {errorText(error)}
            <button className="text-button" onClick={() => void autosave.flush().catch(() => {})}>
              {t.app.retry}
            </button>
            {active && (
              <>
                <button
                  className="text-button"
                  onClick={() => {
                    // Validation and serialization of a large world run in the persistence worker.
                    void saves
                      .serialize(active.slot, active.name, snapshot())
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
      <nav className="bottom-nav" aria-label={t.app.navigation}>
        {links}
      </nav>
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
            void reloadActiveSlot()
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
    </MotionConfig>
  );
}
