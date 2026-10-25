import { CONFIG } from '../engine/config';
export interface PlatformAdapter {
  saveFile(name: string, content: string | Blob, mime: string): Promise<void>;
  shareFile(name: string, content: string | Blob, mime: string): Promise<void>;
  /** Share a link through the system share sheet, or copy it; reports which happened. */
  shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'>;
  readFile(file: File): Promise<string>;
  /**
   * A picked file's contents as a `Blob`, for a worker to read (save backups, which may be
   * gzip): size-checked here, never read on the main thread.
   */
  readFileBlob(file: File): Promise<Blob>;
  requestPersistentStorage(): Promise<boolean>;
  isStoragePersistent(): Promise<boolean>;
  haptic(kind: 'selection' | 'success'): Promise<void>;
  onBack(handler: () => void): () => void;
  wakeLock(): Promise<() => Promise<void>>;
  notify(title: string, body: string): Promise<boolean>;
  /**
   * Device preferences: the player's settings, or another device-only record such as analytics
   * consent (`scope`). Writing `null` removes the record.
   */
  readPreferences(scope?: PreferenceScope): unknown;
  writePreferences(value: unknown, scope?: PreferenceScope): boolean;
  /**
   * POST a JSON body to `url` (analytics), resolving whether it was accepted. Never rejects.
   * `hiding`: the page is being hidden, so a failed request may be handed to the browser to
   * finish after the page has gone.
   */
  send(url: string, body: string, hiding?: boolean): Promise<boolean>;
  /** Whether the device asks sites to save data (Save-Data, or `prefers-reduced-data`). */
  prefersReducedData(): boolean;
  /**
   * Small device-only records kept outside the saves, as text (the caller encodes them): the
   * last version seen, the diagnostics log, each slot's last match report, and the new-career
   * draft, which lasts only for this tab's session. Reads never throw and return null when the
   * record is missing or storage is unavailable; writing `null` removes the record, and a
   * write reports whether it was stored.
   */
  readRecord(key: DeviceRecord): string | null;
  writeRecord(key: DeviceRecord, value: string | null): boolean;
  /**
   * Open an address outside the game (the bug report form) in a new browser tab or the
   * system browser. Nothing is sent: the player sees the page and decides.
   */
  openExternal(url: string): Promise<boolean>;
}
export type PreferenceScope = 'settings' | 'analytics';
const PREFERENCE_KEYS: Record<PreferenceScope, string> = {
  settings: 'ptg-preferences',
  analytics: 'ptg-analytics',
};
export type DeviceRecord =
  | 'release-seen'
  | 'diagnostics'
  | 'career-draft'
  | 'match-report-1'
  | 'match-report-2'
  | 'match-report-3';
/**
 * Where each record lives on the web. The release and draft keys predate the adapter
 * (release 1.0 step 4.8 moved them behind it) and keep their names, so nothing is lost.
 */
const RECORDS: Record<DeviceRecord, { key: string; session?: true }> = {
  'release-seen': { key: 'ptg-last-version' },
  diagnostics: { key: 'ptg-diagnostics' },
  'career-draft': { key: 'pitch-to-glory:career-draft', session: true },
  'match-report-1': { key: 'ptg-match-report-1' },
  'match-report-2': { key: 'ptg-match-report-2' },
  'match-report-3': { key: 'ptg-match-report-3' },
};
/** Private windows and blocked storage can throw on any access, including the lookup. */
const recordStorage = (key: DeviceRecord): Storage => {
  const where = RECORDS[key];
  return where.session ? sessionStorage : localStorage;
};
const saveFile: PlatformAdapter['saveFile'] = async (name, content, mime) => {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type: mime }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const platform: PlatformAdapter = {
  saveFile,
  async shareFile(name, content, mime) {
    const file = new File([content], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          await saveFile(name, content, mime);
      }
    } else await saveFile(name, content, mime);
  },
  async shareLink(url, title) {
    if (navigator.share) {
      try {
        await navigator.share({ url, title });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'failed';
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  },
  async readFile(file) {
    if (file.size > CONFIG.saves.maxFileBytes) throw new Error('large');
    return file.text();
  },
  async readFileBlob(file) {
    // The plain-JSON limit; a gzip backup's own, smaller limit is checked where it is read.
    if (file.size > CONFIG.saves.maxFileBytes) throw new Error('large');
    return file;
  },
  async requestPersistentStorage() {
    return (await navigator.storage?.persist?.()) ?? false;
  },
  async isStoragePersistent() {
    try {
      return (await navigator.storage?.persisted?.()) ?? false;
    } catch {
      return false;
    }
  },
  async haptic(kind) {
    navigator.vibrate?.(kind === 'success' ? [15, 30, 15] : 8);
  },
  onBack(handler) {
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  },
  async wakeLock() {
    if (!navigator.wakeLock) return async () => {};
    try {
      const lock = await navigator.wakeLock.request('screen');
      return async () => {
        if (!lock.released) await lock.release();
      };
    } catch {
      return async () => {};
    }
  },
  async notify(title, body) {
    if (!('Notification' in window)) return false;
    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== 'granted') return false;
    new Notification(title, { body });
    return true;
  },
  readPreferences(scope = 'settings') {
    try {
      return JSON.parse(localStorage.getItem(PREFERENCE_KEYS[scope]) ?? 'null');
    } catch {
      return null;
    }
  },
  writePreferences(value, scope = 'settings') {
    try {
      if (value === null) localStorage.removeItem(PREFERENCE_KEYS[scope]);
      else localStorage.setItem(PREFERENCE_KEYS[scope], JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  send(url, body, hiding = false) {
    return fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    }).then(
      (response) => response.ok,
      // A page being hidden can still hand the body to the browser to deliver later.
      () => {
        try {
          return hiding && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
        } catch {
          return false;
        }
      },
    );
  },
  readRecord(key) {
    try {
      return recordStorage(key).getItem(RECORDS[key].key);
    } catch {
      return null;
    }
  },
  writeRecord(key, value) {
    try {
      const storage = recordStorage(key);
      if (value === null) storage.removeItem(RECORDS[key].key);
      else storage.setItem(RECORDS[key].key, value);
      return true;
    } catch {
      return false;
    }
  },
  async openExternal(url) {
    try {
      // `noopener`: the opened page gets no handle on the game's window.
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    } catch {
      return false;
    }
  },
  prefersReducedData() {
    try {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection;
      return (
        connection?.saveData === true ||
        (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches)
      );
    } catch {
      return false;
    }
  },
};
