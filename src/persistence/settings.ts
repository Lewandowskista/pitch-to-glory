import type { Settings } from '../model/domain';
import { CONFIG } from '../engine/config';
import { SaveError } from './errors';

/**
 * Player preferences: defaults and validation. Light enough for the app shell, which reads
 * stored preferences before the first render; the save schema reuses it for saved settings.
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontScale: 1,
  reducedMotion: false,
  backupReminder: true,
  simulationOnly: false,
  audio: { muted: false, master: 0.8, effects: 0.8, crowd: 0.6 },
  tutorial: { week: false, match: false },
};

const invalid = (): never => {
  throw new SaveError('invalid');
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
const boolean = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid());

export function validateSettings(value: unknown): Settings {
  const s = object(value);
  if (
    !['system', 'light', 'dark'].includes(String(s.theme)) ||
    typeof s.fontScale !== 'number' ||
    !Number.isFinite(s.fontScale) ||
    s.fontScale < CONFIG.accessibility.minFontScale ||
    s.fontScale > CONFIG.accessibility.maxFontScale
  )
    invalid();
  return {
    theme: s.theme as Settings['theme'],
    fontScale: s.fontScale as number,
    reducedMotion: boolean(s.reducedMotion),
    backupReminder: boolean(s.backupReminder),
    simulationOnly: boolean(s.simulationOnly),
    audio: validateAudio(s.audio),
    tutorial: validateTutorial(s.tutorial),
  };
}
/** Audio settings; preferences and saves from before milestone 9 get the defaults. */
function validateAudio(value: unknown): Settings['audio'] {
  if (value === undefined) return { ...DEFAULT_SETTINGS.audio };
  const a = object(value);
  const volume = (v: unknown) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) invalid();
    return v as number;
  };
  return {
    muted: boolean(a.muted),
    master: volume(a.master),
    effects: volume(a.effects),
    crowd: volume(a.crowd),
  };
}
function validateTutorial(value: unknown): Settings['tutorial'] {
  if (value === undefined) return { ...DEFAULT_SETTINGS.tutorial };
  const t = object(value);
  return { week: boolean(t.week), match: boolean(t.match) };
}
