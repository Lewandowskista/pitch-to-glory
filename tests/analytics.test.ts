import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import {
  autoPlayCommand,
  careerMatchSetup,
  commitCareerMatch,
  defaultTactics,
} from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession, type MatchSession } from '../src/engine/match';
import { ANALYTICS, resolveConfig, type AnalyticsConfig } from '../src/analytics/config';
import { allowedProperties, createClient, scrubMessage } from '../src/analytics/client';
import { readConsent, updateConsent, type ConsentStore } from '../src/analytics/consent';
import { COMMON_PROPERTIES, EVENTS, type EventName } from '../src/analytics/events';
import { createObserver, keyMomentEvents, seasonSummary } from '../src/analytics/observe';
import { useAppStore, type AppStore } from '../src/store';
import * as stub from '../src/analytics/index';

vi.mock('../src/analytics/index', async (original) => ({
  ...(await original<typeof import('../src/analytics/index')>()),
  setConsentInvitation: vi.fn(),
}));

/** A device's preferences and network, recorded. */
function fakeDevice(accept = true) {
  const preferences: Record<string, unknown> = {};
  const requests: { url: string; body: { api_key: string; batch: Payload[] }; hiding: boolean }[] =
    [];
  const device = {
    preferences,
    requests,
    accept,
    readPreferences: (scope = 'settings') => preferences[scope] ?? null,
    writePreferences(value: unknown, scope = 'settings') {
      if (value === null) delete preferences[scope];
      else preferences[scope] = JSON.parse(JSON.stringify(value));
      return true;
    },
    send: async (url: string, body: string, hiding = false) => {
      requests.push({ url, body: JSON.parse(body), hiding });
      return device.accept;
    },
  };
  return device;
}
interface Payload {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
}
const CONFIG: AnalyticsConfig = {
  key: 'phc_test',
  host: 'https://eu.i.posthog.com',
  environment: 'ci',
  flushMs: 30000,
};
const events = (device: ReturnType<typeof fakeDevice>) =>
  device.requests.flatMap((request) => request.body.batch);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function client(device = fakeDevice()) {
  const timers: (() => void)[] = [];
  const instance = createClient({
    config: CONFIG,
    platform: device,
    pageId: 'page-id-0000000000000000',
    context: () => ({ app_version: '1.0.0', route: '/career', device_class: 'mid' }),
    schedule: (callback) => timers.push(callback),
  });
  return { instance, device, timers };
}

describe('configuration', () => {
  const env = { VITE_POSTHOG_KEY: 'phc_real', VITE_ANALYTICS_ENV: 'production' };
  it('is off without a key, and under automation unless a test asks', () => {
    expect(resolveConfig({ env: {}, webdriver: false })).toBeNull();
    expect(resolveConfig({ env: { VITE_POSTHOG_KEY: '  ' }, webdriver: false })).toBeNull();
    expect(resolveConfig({ env, webdriver: true })).toBeNull();
    expect(resolveConfig({ env, webdriver: true, override: { key: '' } })).toBeNull();
    // The override is ignored outside automation.
    expect(resolveConfig({ env, webdriver: false, override: { key: 'phc_other' } })?.key).toBe(
      'phc_real',
    );
    expect(
      resolveConfig({ env, webdriver: true, override: { key: 'phc_test', flushMs: 200 } }),
    ).toMatchObject({ key: 'phc_test', flushMs: 200 });
  });
  it('defaults to the EU host and the development environment', () => {
    expect(resolveConfig({ env: { VITE_POSTHOG_KEY: 'k' }, webdriver: false })).toEqual({
      key: 'k',
      host: ANALYTICS.defaultHost,
      environment: 'development',
      flushMs: ANALYTICS.flushMs,
    });
    expect(
      resolveConfig({
        env: {
          VITE_POSTHOG_KEY: 'k',
          VITE_POSTHOG_HOST: 'https://x.test/',
          VITE_ANALYTICS_ENV: 'nope',
        },
        webdriver: false,
      }),
    ).toMatchObject({ host: 'https://x.test', environment: 'development' });
  });
  it('sends nothing from the always-loaded stub in a browser without a key', () => {
    // Node has no window: the stub is off, and tracking is a no-op that never throws.
    expect(() => stub.track('route_viewed', { route: '/' })).not.toThrow();
    expect(() => stub.startAnalytics()).not.toThrow();
  });
});

describe('consent', () => {
  let device: ConsentStore & { preferences: Record<string, unknown> };
  beforeEach(() => {
    device = fakeDevice();
  });
  it('starts anonymous, with nothing stored', () => {
    expect(readConsent(device)).toEqual({ anonymous: true, personal: false, prompted: false });
    expect(device.preferences).toEqual({});
  });
  it('stores an install id only with tier-2 consent, and deletes it on withdrawal', () => {
    updateConsent({ prompted: true }, device);
    expect(JSON.stringify(device.preferences)).not.toMatch(/installId/);
    const first = updateConsent({ personal: true }, device).installId!;
    expect(first).toMatch(/^[0-9a-f-]{16,40}$/);
    expect(readConsent(device).installId).toBe(first);
    // Stable while consent holds.
    expect(updateConsent({ prompted: true }, device).installId).toBe(first);
    updateConsent({ personal: false }, device);
    expect(readConsent(device).installId).toBeUndefined();
    expect(JSON.stringify(device.preferences)).not.toMatch(/installId/);
    const second = updateConsent({ personal: true }, device).installId!;
    expect(second).not.toBe(first);
  });
  it('treats tier 2 as part of tier 1', () => {
    updateConsent({ personal: true }, device);
    expect(updateConsent({ anonymous: false }, device)).toEqual({
      anonymous: false,
      personal: false,
      prompted: false,
    });
    expect(updateConsent({ personal: true }, device)).toMatchObject({
      anonymous: true,
      personal: true,
    });
  });
  it('ignores a stored id without consent, or one that is not ours', () => {
    device.writePreferences(
      { anonymous: true, personal: false, installId: 'abcdef0123456789' },
      'analytics',
    );
    expect(readConsent(device).installId).toBeUndefined();
    device.writePreferences(
      { anonymous: true, personal: true, installId: 'Robin Vale' },
      'analytics',
    );
    expect(readConsent(device)).toMatchObject({ personal: false });
  });
});

describe('client', () => {
  it('sends personless events with an in-memory id by default', async () => {
    const { instance, device, timers } = client();
    instance.capture('route_viewed', { route: '/career' }, Date.UTC(2026, 9, 25));
    expect(device.requests).toHaveLength(0);
    timers.shift()!();
    await settle();
    expect(device.requests).toHaveLength(1);
    expect(device.requests[0]!.url).toBe('https://eu.i.posthog.com/batch/');
    expect(device.requests[0]!.body.api_key).toBe('phc_test');
    const [event] = events(device);
    expect(event).toEqual({
      event: 'route_viewed',
      timestamp: '2026-10-25T00:00:00.000Z',
      properties: {
        route: '/career',
        app_version: '1.0.0',
        device_class: 'mid',
        distinct_id: 'page-id-0000000000000000',
        $process_person_profile: false,
        $lib: 'ptg',
        environment: 'ci',
      },
    });
    expect(device.preferences).toEqual({});
  });
  it('sends nothing at all when tier 1 is off, and forgets what was waiting', async () => {
    const { instance, device } = client();
    instance.capture('route_viewed', { route: '/' });
    updateConsent({ anonymous: false }, device);
    expect(instance.pending()).toBe(0);
    for (let i = 0; i < 30; i++) instance.capture('route_viewed', { route: '/' });
    instance.flush();
    await settle();
    expect(device.requests).toHaveLength(0);
    instance.close();
  });
  it('carries the install id with person profiles only with tier-2 consent', async () => {
    const { instance, device } = client();
    const id = updateConsent({ personal: true }, device).installId!;
    instance.capture('match_finished', { count: 1, played: true });
    instance.flush();
    updateConsent({ personal: false }, device);
    instance.capture('match_finished', { count: 2, played: true });
    instance.flush();
    await settle();
    const [opted, withdrawn] = events(device);
    expect(opted!.properties).toMatchObject({ distinct_id: id, $process_person_profile: true });
    expect(withdrawn!.properties).toMatchObject({
      distinct_id: 'page-id-0000000000000000',
      $process_person_profile: false,
    });
    instance.close();
  });
  it('flushes at the batch size, and on demand when the page hides', async () => {
    const { instance, device, timers } = client();
    for (let i = 0; i < ANALYTICS.batchSize - 1; i++)
      instance.capture('route_viewed', { route: '/' });
    expect(device.requests).toHaveLength(0);
    expect(timers).toHaveLength(1);
    instance.capture('route_viewed', { route: '/' });
    await settle();
    expect(device.requests).toHaveLength(1);
    expect(device.requests[0]!.body.batch).toHaveLength(ANALYTICS.batchSize);
    instance.capture('session_ended', { seconds: 12, screens: 3 });
    instance.flush(true);
    await settle();
    expect(device.requests[1]!.hiding).toBe(true);
    instance.close();
  });
  it('caps the queue by dropping the oldest events', () => {
    const device = fakeDevice();
    const instance = createClient({
      config: CONFIG,
      platform: { ...device, send: async () => false },
      pageId: 'page-id-0000000000000000',
      schedule: () => undefined,
    });
    // Every flush fails, so the queue only grows by retries and new events.
    for (let i = 0; i < ANALYTICS.queueLimit * 3; i++)
      instance.capture('wizard_step', { step: 'identity', index: i });
    expect(instance.pending()).toBeLessThanOrEqual(ANALYTICS.queueLimit);
    instance.close();
  });
  it('retries a failed batch once, at the next flush, then drops it', async () => {
    const { instance, device, timers } = client(fakeDevice(false));
    instance.capture('save_failed', { kind: 'quota' });
    timers.shift()!();
    await settle();
    expect(device.requests).toHaveLength(1);
    expect(instance.pending()).toBe(1);
    timers.shift()!();
    await settle();
    expect(device.requests).toHaveLength(2);
    expect(instance.pending()).toBe(0);
    expect(timers).toHaveLength(0);
    instance.close();
  });
  it('never throws when sending fails', async () => {
    const device = fakeDevice();
    const instance = createClient({
      config: CONFIG,
      platform: { ...device, send: () => Promise.reject(new Error('offline')) },
      pageId: 'page-id-0000000000000000',
      schedule: () => undefined,
    });
    instance.capture('route_viewed', { route: '/' });
    expect(() => instance.flush()).not.toThrow();
    await settle();
    expect(instance.pending()).toBe(1);
    instance.close();
  });
});

describe('allow-list', () => {
  it('lists plain, distinct property names for every event', () => {
    for (const [event, keys] of Object.entries(EVENTS)) {
      expect(new Set(keys).size, event).toBe(keys.length);
      for (const key of keys) {
        expect(key, event).toMatch(/^[a-z][a-z0-9_]*$/);
        // The client's own properties win; only the viewed route is both (and the same).
        if (event !== 'route_viewed')
          expect(COMMON_PROPERTIES as readonly string[], event).not.toContain(key);
      }
    }
  });
  it('drops anything not listed, and values that are not ids, flags or numbers', () => {
    for (const event of Object.keys(EVENTS) as EventName[]) {
      const keys = EVENTS[event] as readonly string[];
      const properties: Record<string, unknown> = {
        name: 'Robin Vale',
        seed: 'my-world',
        save: { world: {} },
        distinct_id: 'spoofed',
      };
      for (const key of keys) properties[key] = key === 'message' ? 'boom 42' : 'ok';
      const sent = allowedProperties(event, properties);
      expect(Object.keys(sent).sort(), event).toEqual([...keys].sort());
    }
    expect(
      allowedProperties('wizard_step', {
        step: 'Robin Vale',
        index: Number.NaN,
      }),
    ).toEqual({});
    expect(allowedProperties('wizard_step', { step: { id: 1 }, index: [1] })).toEqual({});
    expect(allowedProperties('match_result', { rating: 7.123456, played: true })).toEqual({
      rating: 7.123,
      played: true,
    });
  });
  it('scrubs error messages of addresses, paths, quoted text and digits', () => {
    expect(
      scrubMessage(
        'Failed to fetch https://example.com/a?b=1 at /Users/robin/game/src/x.ts:12:3 for "Robin Vale"',
      ),
    ).toBe('Failed to fetch <url> at <path>:#:# for <text>');
    expect(scrubMessage("Cannot read properties of undefined (reading 'skills')")).toBe(
      "Cannot read properties of undefined (reading 'skills')",
    );
    expect(scrubMessage('mail robin@example.com now')).toBe('mail <email> now');
    expect(scrubMessage('x'.repeat(500))).toHaveLength(ANALYTICS.errorLength);
    expect(scrubMessage(undefined)).toBe('');
  });
});

describe('events derived from play', () => {
  const draft: CareerDraft = {
    name: 'Robin Vale',
    avatar: {
      face: 1,
      skin: 2,
      hair: 3,
      hairColor: 4,
      facialHair: 0,
      eyebrows: 1,
      eyes: 2,
      accessory: 3,
    },
    nationalityId: 'country:0',
    position: 'ST',
    foot: 'left',
    age: 17,
    archetype: 'finisher',
  };
  let base: World;
  let career: World;
  let committed: World;
  let session: MatchSession;
  let outcome: ReturnType<typeof commitCareerMatch>;
  beforeAll(() => {
    base = generateWorld('analytics-tests', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'analytics-tests')[0]!;
    career = createCareer(base, draft, trial.id, 'analytics-tests');
    const setup = careerMatchSetup(career, nextCareerFixture(career)!);
    session = createMatchSession(setup, defaultTactics(career, setup));
    while (session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    committed = JSON.parse(JSON.stringify(career)) as World;
    outcome = commitCareerMatch(committed, session);
  }, 120000);

  /** Every captured event, checked against the allow-list as it arrives. */
  function recorder() {
    const captured: { event: EventName; properties: Record<string, unknown> }[] = [];
    let now = 1000;
    const observe = createObserver(
      (event, properties) => {
        // Nothing the allow-list would drop: every property is listed and well formed.
        expect(allowedProperties(event, properties), event).toEqual(properties);
        expect(JSON.stringify(properties)).not.toMatch(/Robin|analytics-tests/);
        captured.push({ event, properties });
      },
      () => (now += 250),
    );
    return { captured, observe };
  }
  const store = (patch: Partial<AppStore>): AppStore => ({
    ...useAppStore.getState(),
    change: 1,
    savedChange: 0,
    ...patch,
  });

  it('reports a new career from the create-career job', () => {
    const { captured, observe } = recorder();
    const job = {
      type: 'create-career' as const,
      completedWeeks: 0,
      totalWeeks: 1,
      cancelling: false,
    };
    observe(
      store({ world: base, worldJob: job }),
      store({ world: career, worldJob: job, change: 2 }),
    );
    expect(captured).toEqual([
      {
        event: 'career_created',
        properties: expect.objectContaining({
          position: 'ST',
          archetype: 'finisher',
          child: false,
        }),
      },
    ]);
  });

  it('reports a finished match, its decisions and the invitation, but not a loaded save', () => {
    const { captured, observe } = recorder();
    const result = { session, outcome };
    observe(store({ world: career }), store({ world: career, careerResult: result }));
    observe(
      store({ world: career, careerResult: result }),
      store({ world: committed, careerResult: result, change: 2 }),
    );
    const names = captured.map((entry) => entry.event);
    const decisions = keyMomentEvents(session.state.match, 'ST');
    expect(decisions.length).toBeGreaterThan(0);
    expect(names.filter((name) => name === 'key_moment')).toHaveLength(decisions.length);
    expect(names).toContain('match_result');
    expect(captured.find((entry) => entry.event === 'match_finished')!.properties).toEqual({
      count: 1,
      played: true,
    });
    const moment = captured.find((entry) => entry.event === 'key_moment')!.properties;
    expect(Number(moment.best_ev)).toBeGreaterThanOrEqual(Number(moment.chosen_ev));
    expect(stub.setConsentInvitation).toHaveBeenCalledWith(true);

    const loaded = recorder();
    loaded.observe(
      store({ world: career, change: 4, savedChange: 4 }),
      store({ world: committed, change: 5, savedChange: 5 }),
    );
    expect(loaded.captured).toEqual([]);
  });

  it('summarises a season and a retirement in bands', () => {
    const summary = seasonSummary({ ...committed, phase: 'complete' })!;
    expect(allowedProperties('season_summary', summary)).toEqual(summary);
    expect(summary).toMatchObject({ season_index: 1, apps: 1, level: committed.career!.level });

    const { captured, observe } = recorder();
    const retired = JSON.parse(JSON.stringify(committed)) as World;
    const player = retired.players[retired.career!.playerId]!;
    retired.legacies.push({
      playerId: player.id,
      position: 'ST',
      age: 35,
      startSeason: retired.career!.startSeason,
      retiredAt: { season: retired.career!.startSeason + 17, week: 1, day: 1 },
      hallOfFame: { score: 900, rank: 7, of: 400 },
    } as World['legacies'][number]);
    delete retired.career;
    observe(store({ world: committed }), store({ world: retired, change: 2 }));
    expect(captured).toEqual([
      {
        event: 'retired',
        properties: { position: 'ST', age: 35, seasons: 18, hof_band: 'top10' },
      },
    ]);
  });

  it('times jobs and reports save failures', async () => {
    const { captured, observe } = recorder();
    const job = { type: 'generate' as const, completedWeeks: 0, totalWeeks: 1, cancelling: false };
    observe(store({}), store({ worldJob: job }));
    useAppStore.setState({ worldNotice: 'generated', worldError: null });
    observe(store({ worldJob: job }), store({ worldJob: null }));
    await settle();
    expect(captured).toEqual([{ event: 'world_built', properties: { ms: 250 } }]);
    observe(store({ saveStatus: 'saving' }), store({ saveStatus: 'error', saveError: 'large' }));
    expect(captured.at(-1)).toEqual({ event: 'save_failed', properties: { kind: 'large' } });
  });
});
