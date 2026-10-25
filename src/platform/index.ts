import { CONFIG } from '../engine/config';
export interface PlatformAdapter {
  saveFile(name: string, content: string | Blob, mime: string): Promise<void>;
  shareFile(name: string, content: string | Blob, mime: string): Promise<void>;
  /** Share a link through the system share sheet, or copy it; reports which happened. */
  shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'>;
  readFile(file: File): Promise<string>;
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
}
export type PreferenceScope = 'settings' | 'analytics';
const PREFERENCE_KEYS: Record<PreferenceScope, string> = {
  settings: 'ptg-preferences',
  analytics: 'ptg-analytics',
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
};
