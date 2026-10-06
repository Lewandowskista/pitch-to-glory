import { useState } from 'react';
import { useAppStore } from '../store';
import { DEFAULT_SETTINGS } from '../persistence/schema';
import { format, t } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { generateGallery } from '../engine/assets/gallery';
import { renderCrest } from '../engine/assets/crest';
const sample = generateGallery('settings');
export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const stored = useAppStore((s) => s.preferencesStored);
  const [notice, setNotice] = useState('');
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
          <button
            className="button secondary"
            onClick={() => {
              update({ ...DEFAULT_SETTINGS });
              setNotice(t.settings.resetDone);
            }}
          >
            {t.settings.reset}
          </button>
          <p className="settings-status" role="status">
            {notice || t.settings.saved}
          </p>
          {!stored && (
            <p role="alert" className="inline-error">
              {t.app.preferencesError}
            </p>
          )}
        </div>
        <aside className="settings-preview">
          <div className="preview-art">
            <Artwork svg={renderCrest(sample.clubs[0]!.crest)} alt="" />
            <Artwork svg={renderCrest(sample.clubs[1]!.crest)} alt="" />
          </div>
          <h2>{t.settings.preview}</h2>
          <p>{t.settings.previewBody}</p>
        </aside>
      </div>
    </Page>
  );
}
