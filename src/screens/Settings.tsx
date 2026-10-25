import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { DEFAULT_SETTINGS } from '../persistence/settings';
import { format, t } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Dialog } from '../ui/Dialog';
import {
  Button,
  ButtonLink,
  CardTitle,
  PageHeader,
  Panel,
  Spinner,
  StatusLine,
  cx,
} from '../ui/kit';
import { APP_VERSION } from '../release/version';
import { SwitchRow } from '../ui/kit/ToggleSwitch';
import { RangeSlider } from '../ui/kit/RangeSlider';
import { RadioTile } from '../ui/kit/RadioTile';
import { audio, type SoundName } from '../audio';
import type { AudioSettings, Settings as Preferences } from '../model/domain';
import { useUrlDialog } from './career/useUrlDialog';
import { analyticsConfig } from '../analytics/config';
import { updateConsent, useAnalyticsConsent } from '../analytics/consent';
import { privacyText } from '../i18n/privacy';

type Theme = Preferences['theme'];
const THEMES: { theme: Theme; icon: 'settings' | 'sun' | 'moon' }[] = [
  { theme: 'system', icon: 'settings' },
  { theme: 'light', icon: 'sun' },
  { theme: 'dark', icon: 'moon' },
];
const FONT_TICKS = [85, 100, 115, 130].map((percent) => format(t.settings.fontValue, { percent }));
const cardBody = 'mt-1 text-muted';

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const stored = useAppStore((s) => s.preferencesStored);
  const [restored, setRestored] = useState(false);
  const [tutorialQueued, setTutorialQueued] = useState(false);
  // Restoring defaults asks first; the question lives in the URL, so Back closes it.
  const reset = useUrlDialog('reset');
  const fontPercent = Math.round(settings.fontScale * 100);
  const fontText = format(t.settings.fontValue, { percent: fontPercent });
  const tourWaiting = !settings.tutorial.week && !settings.tutorial.match;
  return (
    <Page>
      <PageHeader title={t.settings.title} description={t.settings.description} />
      <div className="flex max-w-[77.5rem] flex-col gap-5">
        {/* Two topic columns on wide screens (look, reading and play; sound and the tour), one
            below that, each card at a comfortable reading width. */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel aria-labelledby="settings-appearance" className="flex flex-col gap-4">
              <div>
                <CardTitle id="settings-appearance">{t.settings.appearance}</CardTitle>
                <p className={cardBody}>{t.settings.appearanceBody}</p>
              </div>
              <fieldset className="m-0 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-3 border-0 p-0">
                <legend className="sr-only">{t.settings.theme}</legend>
                {THEMES.map(({ theme, icon }) => (
                  <RadioTile
                    key={theme}
                    name="theme"
                    value={theme}
                    checked={settings.theme === theme}
                    onChange={() => update({ theme })}
                    label={t.settings[theme]}
                    icon={icon}
                  >
                    <ThemePreview theme={theme} />
                  </RadioTile>
                ))}
              </fieldset>
            </Panel>
            <Panel aria-labelledby="settings-reading" className="flex flex-col gap-4">
              <div>
                <CardTitle id="settings-reading">{t.settings.reading}</CardTitle>
                <p className={cardBody}>{t.settings.readingBody}</p>
              </div>
              <RangeSlider
                id="font-scale"
                label={t.settings.fontScale}
                size="lg"
                min={85}
                max={130}
                step={5}
                value={fontPercent}
                valueText={fontText}
                ticks={FONT_TICKS}
                onChange={(percent) => update({ fontScale: percent / 100 })}
              />
              {/* Rem-based, so it grows with the setting it previews. */}
              <figure className="m-0 flex flex-col gap-1.5 rounded-control bg-surface-soft px-4.5 py-4">
                <span className="text-[0.6875rem] font-extrabold tracking-[0.12em] text-muted uppercase">
                  {t.settings.sample}
                </span>
                <blockquote className="m-0 text-[1.0625rem] leading-[1.45] font-semibold">
                  {t.settings.sampleQuote}
                </blockquote>
                <figcaption className="text-sm text-muted">{t.settings.sampleSource}</figcaption>
              </figure>
            </Panel>
            <Panel aria-label={t.settings.preferences} className="flex flex-col gap-4">
              <SwitchRow
                id="reduced-motion"
                headingLevel="h2"
                title={t.settings.motion}
                description={t.settings.motionBody}
                checked={settings.reducedMotion}
                onChange={(reducedMotion) => update({ reducedMotion })}
              />
              <SwitchRow
                id="simulation-only"
                headingLevel="h2"
                divided
                title={t.settings.simulation}
                description={t.settings.simulationBody}
                checked={settings.simulationOnly}
                onChange={(simulationOnly) => update({ simulationOnly })}
              />
              <SwitchRow
                id="backup-reminder"
                headingLevel="h2"
                divided
                title={t.settings.backups}
                description={t.settings.backupsBody}
                checked={settings.backupReminder}
                onChange={(backupReminder) => update({ backupReminder })}
              />
            </Panel>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <SoundSettings />
            <Panel aria-labelledby="settings-tutorial" className="flex flex-col gap-4">
              <div>
                <CardTitle id="settings-tutorial">{t.settings.tutorial}</CardTitle>
                <p className={cardBody}>{t.settings.tutorialBody}</p>
              </div>
              <Button
                variant="secondary"
                icon="play"
                className="self-start"
                disabled={tourWaiting}
                aria-describedby={tourWaiting && !tutorialQueued ? 'tutorial-queued' : undefined}
                onClick={() => {
                  update({ tutorial: { week: false, match: false, replay: true } });
                  setTutorialQueued(true);
                }}
              >
                {t.settings.tutorialReset}
              </Button>
              {tourWaiting && !tutorialQueued && (
                <p id="tutorial-queued" className="-mt-2 text-xs text-muted">
                  {t.settings.tutorialQueued}
                </p>
              )}
              <StatusLine tone="success" className="self-start">
                {tutorialQueued ? t.settings.tutorialDone : ''}
              </StatusLine>
            </Panel>
            <PrivacySettings />
            <Panel aria-labelledby="settings-about" className="flex flex-col gap-4">
              <div>
                <CardTitle id="settings-about">{t.settings.about}</CardTitle>
                <p className={cardBody}>{t.settings.aboutBody}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-soft py-2 pr-2 pl-4">
                <p className="font-bold">
                  {format(t.app.release.version, { version: APP_VERSION })}
                </p>
                <ButtonLink to="/whats-new" variant="secondary" iconEnd="arrow">
                  {t.app.release.link}
                </ButtonLink>
              </div>
            </Panel>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-4.5">
          <Button variant="secondary" icon="refresh" onClick={() => reset.open()}>
            {t.settings.reset}
          </Button>
          <p
            role="status"
            className={cx(
              'flex items-center gap-1.5 text-[0.8125rem]',
              restored ? 'font-semibold text-accent' : 'text-muted',
            )}
          >
            <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-accent" />
            {restored ? t.settings.resetDone : t.settings.saved}
          </p>
        </div>
        {!stored && <StatusLine tone="error">{t.app.preferencesError}</StatusLine>}
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
            setRestored(true);
            setTutorialQueued(false);
            reset.close();
          }}
        />
      )}
    </Page>
  );
}

/**
 * A miniature of the clubhouse in a theme: sidebar, a heading bar, a card and the gold call to
 * action. The colours are fixed (light chrome, night chrome), so each card always shows its own
 * theme whatever the current one is; "System" shows both halves.
 */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <span className="flex h-[5.375rem] overflow-hidden rounded-chip border border-line">
      {theme !== 'dark' && <PreviewHalf dark={false} sidebar />}
      {theme !== 'light' && <PreviewHalf dark sidebar={theme === 'dark'} />}
    </span>
  );
}
function PreviewHalf({ dark, sidebar }: { dark: boolean; sidebar: boolean }) {
  return (
    <span className={cx('flex flex-1', dark ? 'bg-night' : 'bg-hero-muted')}>
      {sidebar && (
        <span
          className={cx(
            'w-[1.125rem] border-r',
            dark ? 'border-night-line bg-night-soft' : 'border-hero-muted bg-white',
          )}
        />
      )}
      <span className="flex flex-1 flex-col gap-[5px] px-1.5 py-2">
        <span className={cx('h-1.5 w-3/5 rounded-full', dark ? 'bg-mint' : 'bg-field')} />
        <span
          className={cx(
            'flex-1 rounded-chip border',
            dark ? 'border-night-line bg-night-raised' : 'border-hero-muted bg-white',
          )}
        />
        <span className="h-2 w-[1.625rem] rounded-full bg-gold" />
      </span>
    </span>
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
/** A small filled play triangle in a mint disc: each chip plays a sample of that sound. */
function PlayGlyph() {
  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
    >
      <svg viewBox="0 0 24 24" width="12" height="12">
        <path
          d="M8 5.5V18.5L18.5 12Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
function SoundSettings() {
  const sound = useAppStore((s) => s.settings.audio);
  const update = useAppStore((s) => s.updateSettings);
  const crowdPreview = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(false);
  const previewVersion = useRef(0);
  const [previewing, setPreviewing] = useState<SoundName | 'crowd' | null>(null);
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
  const preview = async (name: SoundName | 'crowd') => {
    if (previewing) return;
    const version = ++previewVersion.current;
    setPreviewing(name);
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
      if (mounted.current) setPreviewing(null);
    }
  };
  return (
    <Panel aria-labelledby="settings-sound" className="flex flex-col gap-4">
      <div>
        <CardTitle id="settings-sound">{t.settings.sound}</CardTitle>
        <p className={cardBody}>{t.settings.soundBody}</p>
      </div>
      <SwitchRow
        id="mute"
        divided
        title={t.settings.mute}
        description={t.settings.muteBody}
        checked={sound.muted}
        onChange={(muted) => set({ muted })}
      />
      <SwitchRow
        id="background-music"
        divided
        title={t.settings.music}
        description={t.settings.musicBody}
        checked={sound.musicEnabled}
        disabled={sound.muted}
        onChange={(musicEnabled) => set({ musicEnabled })}
      />
      <div className="flex flex-col gap-1">
        {volumes.map(([key, label]) => {
          const percent = Math.round(sound[key] * 100);
          return (
            <RangeSlider
              key={key}
              id={`volume-${key}`}
              label={label}
              min={0}
              max={100}
              step={5}
              value={percent}
              valueText={format(t.settings.volumeValue, { percent })}
              disabled={sound.muted || (key === 'music' && !sound.musicEnabled)}
              onChange={(value) => set({ [key]: value / 100 })}
            />
          );
        })}
      </div>
      <div className="flex flex-col gap-2.5">
        <p id="sound-previews-label" className="text-[0.8125rem] font-extrabold">
          {t.settings.previewSounds}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="sound-previews-label">
          {PREVIEWS.map(({ sound: name, label }) => {
            const busy = previewing === name;
            const off =
              sound.muted ||
              sound.master === 0 ||
              (name === 'crowd' || name === 'roar' || name === 'ooh'
                ? sound.crowd === 0
                : sound.effects === 0);
            return (
              <button
                key={name}
                type="button"
                data-sound="none"
                disabled={off || (previewing !== null && !busy)}
                aria-busy={busy || undefined}
                aria-disabled={busy || undefined}
                onClick={() => void preview(name)}
                className={cx(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border pr-3 pl-2.5 text-[0.8125rem] transition-colors',
                  busy
                    ? 'border-accent bg-accent-soft font-bold text-accent shadow-[inset_0_0_0_1px_var(--accent)]'
                    : 'cursor-pointer border-line bg-surface font-semibold text-ink hover:bg-surface-soft disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-muted',
                )}
              >
                {busy ? <Spinner className="h-[1.125rem] w-[1.125rem]" /> : <PlayGlyph />}
                {label}
              </button>
            );
          })}
        </div>
        <p role="status" className="min-h-5 text-[0.8125rem] font-semibold text-accent">
          {previewing ? t.settings.previewLoading : ''}
        </p>
      </div>
    </Panel>
  );
}

/** Analytics consent (docs/ANALYTICS.md): anonymous statistics, and sharing play over time. */
const analyticsEnabled = analyticsConfig() !== null;
function PrivacySettings() {
  const p = privacyText.settings;
  const consent = useAnalyticsConsent();
  return (
    <Panel aria-labelledby="settings-privacy" className="flex flex-col gap-4">
      <div>
        <CardTitle id="settings-privacy">{p.title}</CardTitle>
        <p className={cardBody}>{p.body}</p>
      </div>
      {analyticsEnabled ? (
        <>
          <SwitchRow
            id="privacy-anonymous"
            headingLevel="h3"
            divided
            title={p.anonymous}
            description={p.anonymousBody}
            checked={consent.anonymous}
            onChange={(anonymous) => updateConsent({ anonymous })}
          />
          <SwitchRow
            id="privacy-personal"
            headingLevel="h3"
            divided
            title={p.personal}
            description={p.personalBody}
            checked={consent.personal}
            // Answering here also answers the one-time invitation.
            onChange={(personal) => updateConsent({ personal, prompted: true })}
          />
        </>
      ) : (
        <p className="m-0 rounded-control bg-surface-soft px-4 py-3 text-sm text-muted">{p.off}</p>
      )}
      <ButtonLink to="/privacy" variant="secondary" iconEnd="arrow" className="self-start">
        {p.link}
      </ButtonLink>
    </Panel>
  );
}
