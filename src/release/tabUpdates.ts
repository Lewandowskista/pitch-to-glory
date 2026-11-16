import { loadedPersistence } from '../persistence/lazy';
import { useAppStore } from '../store';
import { t } from '../i18n';
import { format } from '../i18n/locale';
import { updateText } from '../i18n/update';
import { busyReason, type UpdateBlockedError } from './busy';
import { UPDATE_CHANNEL, UpdateTabs, type ChannelLike } from './updateTabs';

/** This tab's id among open tabs (in memory only). */
const tabId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');

/** Where this tab is: its page title without the game's name ("Overview · Career hub"). */
export function pageName(): string {
  const suffix = ` · ${t.app.name}`;
  const title = typeof document === 'undefined' ? '' : document.title;
  return (title.endsWith(suffix) ? title.slice(0, -suffix.length) : title) || t.app.name;
}

/**
 * This tab's part in coordinated updates (`updateTabs.ts`): it answers other tabs by writing its
 * pending autosave and saying what still holds it, and reloads when another tab activates an
 * update (`onReload`, which reloads only when safe).
 */
export function startUpdateTabs(onReload: () => void): UpdateTabs {
  let channel: ChannelLike | null = null;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(UPDATE_CHANNEL) : null;
  } catch {
    channel = null;
  }
  return new UpdateTabs({
    tabId: tabId(),
    channel,
    page: pageName,
    onReload,
    async prepare() {
      // A job or an unsaved world holds the tab whatever the autosave does.
      const before = busyReason(useAppStore.getState(), false);
      if (before) return before;
      await loadedPersistence()?.autosave.flush();
      return busyReason(useAppStore.getState(), true);
    },
  });
}

/** Why the update waits, naming the other tab when it is another tab that holds it. */
export const blockedText = (failure: UpdateBlockedError): string =>
  failure.page === null
    ? updateText.here[failure.reason]
    : format(updateText.other[failure.reason], { page: failure.page });
