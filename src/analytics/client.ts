import type { PlatformAdapter } from '../platform';
import { ANALYTICS, type AnalyticsConfig } from './config';
import { readConsent, subscribeConsent, type ConsentStore } from './consent';
import {
  COMMON_PROPERTIES,
  EVENTS,
  TEXT_PROPERTIES,
  type EventName,
  type PropertyValue,
} from './events';

/**
 * The analytics client (docs/ANALYTICS.md): a few hundred lines instead of the PostHog SDK. It
 * holds events in memory, checks them against the allow-list and the player's consent, and sends
 * them in batches to PostHog's batch endpoint through the platform adapter. Failures are silent:
 * a failed batch is retried once, at the next flush, and then dropped.
 */
export interface QueuedEvent {
  event: EventName;
  properties: Record<string, unknown>;
  /** Epoch milliseconds when it happened. */
  time: number;
  retried?: boolean;
}
export interface ClientOptions {
  config: AnalyticsConfig;
  platform: Pick<PlatformAdapter, 'send'> & ConsentStore;
  /** Properties every event carries (versions, device class, route); read at send time. */
  context?: () => Record<string, PropertyValue | undefined>;
  /** The in-memory identifier of this page load, for personless events. */
  pageId: string;
  /** Called with a callback and delay to schedule a flush (setTimeout outside tests). */
  schedule?: (callback: () => void, ms: number) => unknown;
}
export interface AnalyticsClient {
  capture(event: EventName, properties?: Record<string, unknown>, time?: number): void;
  /** Send what is waiting; `hiding` when the page is being hidden. */
  flush(hiding?: boolean): void;
  /** Events waiting to be sent. */
  pending(): number;
  /** Stop listening for consent changes. */
  close(): void;
}

const SAFE = /^[\w.:/+-]{1,64}$/;
const IDENTIFIER = /^'[A-Za-z_$][\w$]*'$|^"[A-Za-z_$][\w$]*"$/;

/**
 * An error message without what could identify a player or their device: addresses, file paths
 * and quoted text become placeholders, digits become `#`, and the result is cut to 120
 * characters. Quoted single identifiers, such as the property in "reading 'skills'", stay.
 */
export function scrubMessage(message: unknown): string {
  return String(message ?? '')
    .replace(/\b[a-z][\w+.-]*:\/\/\S*/gi, '<url>')
    .replace(/(['"`])(?:(?!\1).)*\1/g, (quoted) => (IDENTIFIER.test(quoted) ? quoted : '<text>'))
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@~-]+){2,}[\\/]?/g, '<path>')
    .replace(/\S+@\S+\.\w+/g, '<email>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ANALYTICS.errorLength);
}

/** The allow-listed, well-formed properties of an event; everything else is dropped. */
export function allowedProperties(
  event: EventName,
  properties: Record<string, unknown> = {},
): Record<string, PropertyValue> {
  const allowed = (EVENTS[event] ?? []) as readonly string[];
  const result: Record<string, PropertyValue> = {};
  for (const key of allowed) {
    const value = properties[key];
    if (typeof value === 'boolean') result[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value))
      result[key] = Math.round(value * 1000) / 1000;
    else if (typeof value === 'string') {
      if (TEXT_PROPERTIES.includes(key)) result[key] = scrubMessage(value);
      else if (SAFE.test(value)) result[key] = value;
    }
  }
  return result;
}

export function createClient(options: ClientOptions): AnalyticsClient {
  const { config, platform } = options;
  const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  const url = `${config.host}/batch/`;
  let queue: QueuedEvent[] = [];
  let timer = false;
  let consent = readConsent(platform);
  const unsubscribe = subscribeConsent(() => {
    consent = readConsent(platform);
    // Opting out also forgets what was waiting to be sent.
    if (!consent.anonymous) queue = [];
  });

  /** Queue events; a retry goes first and waits for the next scheduled flush. */
  function enqueue(events: QueuedEvent[], retry = false): void {
    queue = retry ? [...events, ...queue] : [...queue, ...events];
    if (queue.length > ANALYTICS.queueLimit) queue = queue.slice(-ANALYTICS.queueLimit);
    if (!retry && queue.length >= ANALYTICS.batchSize) flush();
    else if (!timer && queue.length) {
      timer = true;
      schedule(() => {
        timer = false;
        flush();
      }, config.flushMs);
    }
  }

  function payload(item: QueuedEvent) {
    const personal = consent.personal && consent.installId;
    const context: Record<string, unknown> = { ...options.context?.() };
    const common: Record<string, unknown> = {
      ...Object.fromEntries(
        COMMON_PROPERTIES.map((key) => [key, context[key]]).filter(
          ([, value]) => value !== undefined,
        ),
      ),
      distinct_id: personal ? consent.installId : options.pageId,
      $process_person_profile: Boolean(personal),
      $lib: 'ptg',
      environment: config.environment,
    };
    return {
      event: item.event,
      properties: { ...allowedProperties(item.event, item.properties), ...common },
      timestamp: new Date(item.time).toISOString(),
    };
  }

  function flush(hiding = false): void {
    if (!consent.anonymous) {
      queue = [];
      return;
    }
    while (queue.length) {
      const batch = queue.splice(0, ANALYTICS.maxBatch);
      const body = JSON.stringify({ api_key: config.key, batch: batch.map(payload) });
      void platform
        .send(url, body, hiding)
        .catch(() => false)
        .then((sent) => {
          // One more try at the next flush, never more: no retry storms.
          if (!sent)
            enqueue(
              batch.filter((item) => !item.retried).map((item) => ({ ...item, retried: true })),
              true,
            );
        });
    }
  }

  return {
    capture(event, properties = {}, time = Date.now()) {
      if (!consent.anonymous || !(event in EVENTS)) return;
      enqueue([{ event, properties, time }]);
    },
    flush,
    pending: () => queue.length,
    close: unsubscribe,
  };
}
