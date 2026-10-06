import { CONFIG } from '../engine/config';
export interface PlatformAdapter {
  saveFile(name: string, content: string, mime: string): Promise<void>;
  shareFile(name: string, content: string, mime: string): Promise<void>;
  readFile(file: File): Promise<string>;
  requestPersistentStorage(): Promise<boolean>;
  isStoragePersistent(): Promise<boolean>;
  haptic(kind: 'selection' | 'success'): Promise<void>;
  onBack(handler: () => void): () => void;
  wakeLock(): Promise<() => Promise<void>>;
  notify(title: string, body: string): Promise<boolean>;
  readPreferences(): unknown;
  writePreferences(value: unknown): boolean;
}
const saveFile: PlatformAdapter['saveFile'] = async (name, content, mime) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
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
  readPreferences() {
    try {
      return JSON.parse(localStorage.getItem('ptg-preferences') ?? 'null');
    } catch {
      return null;
    }
  },
  writePreferences(value) {
    try {
      localStorage.setItem('ptg-preferences', JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
