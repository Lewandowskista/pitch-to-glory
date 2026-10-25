import { useSyncExternalStore } from 'react';
import { platform, type PlatformAdapter } from '../platform';

/**
 * The player's analytics choices on this device (docs/ANALYTICS.md), kept in the platform
 * adapter's device preferences and never in a save, so an exported save carries none of it.
 *
 * - `anonymous` (tier 1, on by default): personless statistics with an identifier that lives
 *   only in memory for one page load.
 * - `personal` (tier 2, opt-in): the same events tied to a random install id stored here, so
 *   play can be followed over time. Withdrawing deletes the id; consenting again makes a new one.
 * - `prompted`: the one-time invitation to tier 2 has been answered or dismissed.
 */
export interface AnalyticsConsent {
  anonymous: boolean;
  personal: boolean;
  prompted: boolean;
  installId?: string;
}
export type ConsentStore = Pick<PlatformAdapter, 'readPreferences' | 'writePreferences'>;

export const DEFAULT_CONSENT: AnalyticsConsent = {
  anonymous: true,
  personal: false,
  prompted: false,
};
const ID = /^[0-9a-f-]{16,40}$/;

/** A random identifier with no link to the player, the device or the time. */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The stored choices, or the defaults when nothing valid is stored. */
export function readConsent(store: ConsentStore = platform): AnalyticsConsent {
  const value = store.readPreferences('analytics') as Partial<AnalyticsConsent> | null;
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONSENT };
  const anonymous = value.anonymous !== false;
  // An install id is only valid alongside tier-2 consent; anything else is ignored.
  const personal = anonymous && value.personal === true && ID.test(String(value.installId));
  return {
    anonymous,
    personal,
    prompted: value.prompted === true,
    ...(personal ? { installId: value.installId } : {}),
  };
}

const listeners = new Set<() => void>();
let snapshot: AnalyticsConsent | null = null;

/**
 * Change the choices. Tier 2 includes tier 1: turning tier 1 off withdraws tier 2, and opting in
 * to tier 2 turns tier 1 on. A new tier-2 consent gets a new install id; withdrawing deletes it.
 */
export function updateConsent(
  patch: Partial<Pick<AnalyticsConsent, 'anonymous' | 'personal' | 'prompted'>>,
  store: ConsentStore = platform,
): AnalyticsConsent {
  const current = readConsent(store);
  let anonymous = patch.anonymous ?? current.anonymous;
  let personal = patch.personal ?? current.personal;
  if (patch.personal) anonymous = true;
  if (!anonymous) personal = false;
  const next: AnalyticsConsent = {
    anonymous,
    personal,
    prompted: patch.prompted ?? current.prompted,
    ...(personal ? { installId: current.installId ?? randomId() } : {}),
  };
  store.writePreferences(next, 'analytics');
  snapshot = next;
  for (const listener of listeners) listener();
  return next;
}

/** Call `listener` after every change of the choices on this page. */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choices, re-rendering on every change (Settings, the invitation). */
export function useAnalyticsConsent(): AnalyticsConsent {
  const current = () => (snapshot ??= readConsent());
  return useSyncExternalStore(subscribeConsent, current, current);
}
