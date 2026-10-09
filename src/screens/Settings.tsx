import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { DEFAULT_SETTINGS } from '../persistence/settings';
import { format, t } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Dialog } from '../ui/Dialog';
import { audio, type SoundName } from '../audio';
import type { AudioSettings } from '../model/domain';
import { useUrlDialog } from './career/useUrlDialog';
export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const stored = useAppStore((s) => s.preferencesStored);
  const [notice, setNotice] = useState('');
  // Restoring defaults asks first; the question lives in the URL, so Back closes it.
  const reset = useUrlDialog('reset');
  return (
    <Page>
      <div className="page-heading">
        <h1>{t.settings.title}</h1>
        <p>{t.settings.description}</p>
      </div>
      <div className="settings-layout">
        <div className="settings-controls">
          <section className="setting-section">
            <h2>{t.settings.appearance}</h2>
            <p>{t.settings.appearanceBody}</p>
            <fieldset className="theme-selector">
              <legend className="sr-only">{t.settings.theme}</legend>
              {(['system', 'light', 'dark'] as const).map((theme) => (
                <label key={theme} className={settings.theme === theme ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="theme"
                    value={theme}
                    checked={settings.theme === theme}
                    onChange={() => update({ theme })}
                  />
                  <Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'settings'} />
                  <span>{t.settings[theme]}</span>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="setting-section">
            <h2>{t.settings.reading}</h2>
            <p>{t.settings.readingBody}</p>
            <div className="range-label">
              <label htmlFor="font-scale">{t.settings.fontScale}</label>
              <output htmlFor="font-scale">
                {format(t.settings.fontValue, { percent: Math.round(settings.fontScale * 100) })}
              </output>
            </div>
            <input
              id="font-scale"
              type="range"
              min="85"
              max="130"
              step="5"
              value={Math.round(settings.fontScale * 100)}
              aria-valuetext={format(t.settings.fontValue, {
                percent: Math.round(settings.fontScale * 100),
              })}
              onChange={(event) => update({ fontScale: Number(event.target.value) / 100 })}
            />
          </section>
          <section className="setting-section motion-setting">
            <div>
              <h2>
                <label htmlFor="reduced-motion">{t.settings.motion}</label>
              </h2>
              <p>{t.settings.motionBody}</p>
            </div>
            <input
              id="reduced-motion"
              className="switch"
              type="checkbox"
              role="switch"
              checked={settings.reducedMotion}
              onChange={(event) => update({ reducedMotion: event.target.checked })}
            />
          </section>
          <section className="setting-section motion-setting">
            <div>
              <h2>
                <label htmlFor="simulation-only">{t.settings.simulation}</label>
              </h2>
              <p>{t.settings.simulationBody}</p>
            </div>
            <input
              id="simulation-only"
              className="switch"
              type="checkbox"
              role="switch"
              checked={settings.simulationOnly}
              onChange={(event) => update({ simulationOnly: event.target.checked })}
            />
          </section>
          <SoundSettings />
          <section className="setting-section">
            <h2>{t.settings.tutorial}</h2>
            <p>{t.settings.tutorialBody}</p>
            <button
              className="button secondary setting-action"
              disabled={!settings.tutorial.week && !settings.tutorial.match}
              onClick={() => {
                update({ tutorial: { week: false, match: false, replay: true } });
                setNotice(t.settings.tutorialDone);
              }}
            >
              {t.settings.tutorialReset}
            </button>
          </section>
          <div className="settings-footer">
            <button className="button secondary" onClick={() => reset.open()}>
              <Icon name="refresh" />
              {t.settings.reset}
            </button>
            <p className="settings-status" role="status">
              {notice || t.settings.saved}
            </p>
          </div>
          {!stored && (
            <p role="alert" className="inline-error">
              {t.app.preferencesError}
            </p>
          )}
        </div>
      </div>
      {reset.value === '1' && (
        <Dialog
          title={t.settings.resetTitle}
          body={t.settings.resetBody}
          confirmLabel={t.settings.reset}
          cancelLabel={t.saves.keepSettings}
          onClose={reset.close}
          onConfirm={() => {
            update({ ...DEFAULT_SETTINGS });
            setNotice(t.settings.resetDone);
            reset.close();
          }}
        />
      )}
    </Page>
  );
}

const PREVIEWS: { sound: SoundName | 'crowd'; label: string }[] = [
  { sound: 'tap', label: t.settings.previews.tap },
  { sound: 'toggle', label: t.settings.previews.toggle },
  { sound: 'confirm', label: t.settings.previews.confirm },
  { sound: 'error', label: t.settings.previews.error },
  { sound: 'reward', label: t.settings.previews.reward },
  { sound: 'levelUp', label: t.settings.previews.levelUp },
  { sound: 'moment', label: t.settings.previews.moment },
  { sound: 'whistleLong', label: t.settings.previews.whistle },
  { sound: 'whistle', label: t.settings.previews.whistleShort },
  { sound: 'whistleFull', label: t.settings.previews.whistleFull },
  { sound: 'kick', label: t.settings.previews.kick },
  { sound: 'net', label: t.settings.previews.net },
  { sound: 'roar', label: t.settings.previews.roar },
  { sound: 'ooh', label: t.settings.previews.ooh },
  { sound: 'crowd', label: t.settings.previews.crowd },
];
/** A small play triangle: each chip plays a sample of that sound. */
function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 5.5V18.5L18.5 12Z" />
    </svg>
  );
}
function SoundSettings() {
  const sound = useAppStore((s) => s.settings.audio);
  const update = useAppStore((s) => s.updateSettings);
  const crowdPreview = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(false);
  const previewVersion = useRef(0);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (crowdPreview.current !== undefined) {
        clearTimeout(crowdPreview.current);
        audio.crowd(null);
      }
    };
  }, []);
  useEffect(() => {
    if (sound.muted) {
      previewVersion.current++;
      clearTimeout(crowdPreview.current);
      crowdPreview.current = undefined;
      audio.crowd(null);
    }
  }, [sound.muted]);
  const set = (patch: Partial<AudioSettings>) => update({ audio: { ...sound, ...patch } });
  const volumes = [
    ['master', t.settings.master],
    ['effects', t.settings.effects],
    ['crowd', t.settings.crowd],
    ['music', t.settings.musicVolume],
  ] as const;
  return (
    <>
      <section className="setting-section motion-setting">
        <div>
          <h2>
            <label htmlFor="mute">{t.settings.mute}</label>
          </h2>
          <p>{t.settings.muteBody}</p>
        </div>
        <input
          id="mute"
          className="switch"
          type="checkbox"
          role="switch"
          checked={sound.muted}
          onChange={(event) => set({ muted: event.target.checked })}
        />
      </section>
      <section className="setting-section motion-setting">
        <div>
          <h2>
            <label htmlFor="background-music">{t.settings.music}</label>
          </h2>
          <p>{t.settings.musicBody}</p>
        </div>
        <input
          id="background-music"
          className="switch"
          type="checkbox"
          role="switch"
          checked={sound.musicEnabled}
          disabled={sound.muted}
          onChange={(event) => set({ musicEnabled: event.target.checked })}
        />
      </section>
      <section className="setting-section">
        <h2>{t.settings.sound}</h2>
        <p>{t.settings.soundBody}</p>
        {volumes.map(([key, label]) => {
          const percent = Math.round(sound[key] * 100);
          return (
            <div key={key} className="volume-setting">
              <div className="range-label">
                <label htmlFor={`volume-${key}`}>{label}</label>
                <output htmlFor={`volume-${key}`}>
                  {format(t.settings.volumeValue, { percent })}
                </output>
              </div>
              <input
                id={`volume-${key}`}
                type="range"
                min="0"
                max="100"
                step="5"
                value={percent}
                disabled={sound.muted || (key === 'music' && !sound.musicEnabled)}
                aria-valuetext={format(t.settings.volumeValue, { percent })}
                onChange={(event) => set({ [key]: Number(event.target.value) / 100 })}
              />
            </div>
          );
        })}
        <p id="sound-previews-label" className="sound-previews-label">
          {t.settings.previewSounds}
        </p>
        <div className="sound-previews" role="group" aria-labelledby="sound-previews-label">
          {PREVIEWS.map(({ sound: name, label }) => (
            <button
              key={name}
              className="button secondary"
              data-sound="none"
              disabled={
                sound.muted ||
                previewing ||
                sound.master === 0 ||
                (name === 'crowd' || name === 'roar' || name === 'ooh'
                  ? sound.crowd === 0
                  : sound.effects === 0)
              }
              onClick={async () => {
                const version = ++previewVersion.current;
                setPreviewing(true);
                try {
                  await audio.unlock();
                  await audio.prepare([name]);
                  if (!mounted.current || version !== previewVersion.current) return;
                  clearTimeout(crowdPreview.current);
                  if (crowdPreview.current !== undefined) audio.crowd(null);
                  crowdPreview.current = undefined;
                  if (name !== 'crowd') {
                    audio.play(name);
                    return;
                  }
                  audio.crowd(0.5);
                  crowdPreview.current = setTimeout(() => {
                    audio.crowd(null);
                    crowdPreview.current = undefined;
                  }, 4000);
                } finally {
                  if (mounted.current) setPreviewing(false);
                }
              }}
            >
              <PlayGlyph />
              {label}
            </button>
          ))}
        </div>
        <p className="settings-status" role="status">
          {previewing ? t.settings.previewLoading : ''}
        </p>
      </section>
    </>
  );
}
