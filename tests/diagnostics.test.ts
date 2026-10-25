import { describe, expect, it } from 'vitest';
import {
  addEntry,
  appOriginated,
  createDiagnostics,
  DIAGNOSTICS_LIMIT,
  errorMessage,
  parseEntries,
  routeOf,
  type DiagnosticEntry,
} from '../src/diagnostics';
import { scrubMessage } from '../src/diagnostics/scrub';
import { browserEngine, type DeviceContext } from '../src/diagnostics/device';
import { bugReportUrl, diagnosticsReport, ISSUES_URL } from '../src/diagnostics/report';
import { CONFIG } from '../src/engine/config';
import { MATCH_ENGINE_VERSION } from '../src/engine/match/types';
import { APP_VERSION } from '../src/release/version';
import type { DeviceRecord } from '../src/platform';
import type { AppSave } from '../src/persistence/schema';
import type { World } from '../src/model/domain';

function memoryStore() {
  const records = new Map<DeviceRecord, string>();
  return {
    records,
    readRecord: (key: DeviceRecord) => records.get(key) ?? null,
    writeRecord: (key: DeviceRecord, value: string | null) => {
      if (value === null) records.delete(key);
      else records.set(key, value);
      return true;
    },
  };
}
const entry = (message: string, extra: Partial<DiagnosticEntry> = {}) => ({
  kind: 'error' as const,
  source: 'window' as const,
  message,
  route: '/',
  version: '1.0.0',
  time: '2026-10-26T10:00:00.000Z',
  ...extra,
});

describe('the diagnostics log', () => {
  it('keeps the newest entries up to its limit', () => {
    let entries: DiagnosticEntry[] = [];
    for (let i = 0; i < DIAGNOSTICS_LIMIT + 7; i++)
      entries = addEntry(entries, entry(`failure-${i}`));
    expect(entries).toHaveLength(DIAGNOSTICS_LIMIT);
    expect(entries.at(-1)!.message).toBe(`failure-${DIAGNOSTICS_LIMIT + 6}`);
    expect(entries[0]!.message).toBe('failure-7');
  });

  it('counts a repeated failure instead of filling the log with it', () => {
    let entries: DiagnosticEntry[] = [];
    for (let i = 0; i < 200; i++)
      entries = addEntry(entries, entry('loop', { time: `2026-10-26T10:00:${i % 60}.000Z` }));
    entries = addEntry(entries, entry('other'));
    expect(entries.map((item) => [item.message, item.count])).toEqual([
      ['loop', 200],
      ['other', 1],
    ]);
  });

  it('reads only well-formed stored entries', () => {
    const good = { ...entry('fine'), count: 2 };
    expect(parseEntries(JSON.stringify([good, { kind: 'nope' }, 4, null]))).toEqual([good]);
    expect(parseEntries('not json')).toEqual([]);
    expect(parseEntries(JSON.stringify({ entries: [good] }))).toEqual([]);
    expect(parseEntries(null)).toEqual([]);
  });

  it('records scrubbed failures on the device, and clears them', () => {
    const store = memoryStore();
    const log = createDiagnostics(store, () => new Date('2026-10-26T12:00:00Z'));
    log.record(
      'unhandledrejection',
      new TypeError(
        "Cannot read properties of undefined (reading 'skills') at https://pitch.example/assets/a-1.js:3:9 for 'Robin Vale' in /Users/robin/saves/slot-2.json",
      ),
      'window',
      '/career/profile',
    );
    const [stored] = parseEntries(store.records.get('diagnostics') ?? null);
    expect(stored).toEqual({
      kind: 'unhandledrejection',
      source: 'window',
      message:
        "TypeError: Cannot read properties of undefined (reading 'skills') at <url> for <text> in <path>",
      route: '/career/profile',
      version: APP_VERSION,
      time: '2026-10-26T12:00:00.000Z',
      count: 1,
    });
    // A fresh page reads what the last one left.
    expect(createDiagnostics(store).entries()).toEqual([stored]);
    log.clear();
    expect(store.records.has('diagnostics')).toBe(false);
    expect(log.entries()).toEqual([]);
  });

  it('never stores free text beyond the scrubbed message', () => {
    const store = memoryStore();
    const log = createDiagnostics(store);
    log.record('error', 'Player robin@example.com in slot 3', 'route', '/career/Robin Vale');
    log.record('worker', { weird: true }, 'world', '/match');
    log.record('error', undefined, 'app', '/');
    const entries = log.entries();
    expect(entries.map((item) => item.message)).toEqual([
      'Player <email> in slot #',
      'A object value',
      'No reason given',
    ]);
    expect(entries[0]!.route).toBe('other');
    expect(store.records.get('diagnostics')).not.toMatch(/robin|Vale/i);
  });

  it('tells listeners about this page load’s failures, including earlier ones', () => {
    const log = createDiagnostics(memoryStore());
    log.record('preload', new Error('Failed to fetch dynamically imported module'), 'app');
    const heard: string[] = [];
    log.onRecord((item) => heard.push(`${item.kind}:${item.message}`));
    log.record('boundary', new Error('Forced page failure'), 'route');
    expect(heard).toEqual([
      'preload:Error: Failed to fetch dynamically imported module',
      'boundary:Error: Forced page failure',
    ]);
  });

  it('describes errors by class and message, and routes by pattern', () => {
    expect(errorMessage(new RangeError('bad'))).toBe('RangeError: bad');
    expect(errorMessage({ name: '<script>', message: 'x' })).toBe('Error: x');
    expect(errorMessage(42)).toBe('A number value');
    expect(routeOf('/career/transfers')).toBe('/career/transfers');
    expect(routeOf('/career/new/extra')).toBe('other');
    expect(scrubMessage('x'.repeat(500))).toHaveLength(120);
  });

  it('claims only rejections thrown by the game’s own scripts', () => {
    const origin = 'https://pitchtoglory.example';
    const own = new Error('boom');
    own.stack = `Error: boom\n    at load (${origin}/assets/index-abc.js:1:2)`;
    const extension = new Error('boom');
    extension.stack = `Error: boom\n    at x (chrome-extension://abc/content.js:1:2)\n    at y (${origin}/assets/index.js:1:1)`;
    const elsewhere = new Error('boom');
    elsewhere.stack = 'Error: boom\n    at https://cdn.example/widget.js:1:1';
    expect(appOriginated(own, origin)).toBe(true);
    expect(appOriginated(extension, origin)).toBe(false);
    expect(appOriginated(elsewhere, origin)).toBe(false);
    expect(appOriginated('a string', origin)).toBe(false);
    expect(appOriginated(undefined, origin)).toBe(false);
  });
});

describe('the diagnostics export and the bug report', () => {
  const device: DeviceContext = {
    device_class: 'mid',
    cores: 4,
    viewport: 'lg',
    input: 'pointer',
  };
  const chrome =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const world = {
    seed: 'seed-of-the-career',
    format: 'national-v1',
    identityVersion: 2,
    date: { season: 3, week: 12 },
    career: { playerId: 'p' },
  } as unknown as World;
  const save = {
    slot: 2,
    revision: 41,
    schemaVersion: 23,
    engineVersion: 'match-21',
    name: 'Robin Vale',
    payload: { kind: 'world', world },
  } as unknown as AppSave;

  it('holds versions, the device class, the save’s seed and revision and the log', () => {
    const log = [{ ...entry('TypeError: x'), count: 1 }];
    const report = diagnosticsReport(log, {
      activeSave: save,
      world,
      device,
      userAgent: chrome,
      installed: true,
      now: new Date('2026-10-26T09:00:00Z'),
    });
    expect(report).toEqual({
      format: 'pitch-to-glory-diagnostics',
      version: 1,
      createdAt: '2026-10-26T09:00:00.000Z',
      app: {
        version: APP_VERSION,
        schema: CONFIG.saves.schemaVersion,
        engine: MATCH_ENGINE_VERSION,
      },
      device: {
        class: 'mid',
        input: 'pointer',
        viewport: 'lg',
        browser: 'chromium',
        installed: true,
      },
      save: {
        slot: 2,
        revision: 41,
        schema: 23,
        engine: 'match-21',
        seed: 'seed-of-the-career',
        world: { format: 'national-v1', identity: 2, season: 3, week: 12, career: true },
      },
      entries: log,
    });
    // The save's name (the player's) is never part of it.
    expect(JSON.stringify(report)).not.toContain('Robin');
  });

  it('has no save section without a loaded save', () => {
    const report = diagnosticsReport([], {
      activeSave: null,
      world: null,
      device,
      userAgent: chrome,
      installed: false,
      now: new Date(),
    });
    expect(report.save).toBeNull();
    expect(report.entries).toEqual([]);
  });

  it('opens a prefilled issue with versions and device, and asks for the file', () => {
    const url = new URL(bugReportUrl({ device, userAgent: chrome, installed: false }));
    expect(`${url.origin}${url.pathname}`).toBe(ISSUES_URL);
    const body = url.searchParams.get('body')!;
    expect(url.searchParams.get('title')).toBe('Bug: ');
    expect(body).toContain(`Version: ${APP_VERSION}`);
    expect(body).toContain(`Save schema: ${CONFIG.saves.schemaVersion}`);
    expect(body).toContain(`Match engine: ${MATCH_ENGINE_VERSION}`);
    expect(body).toContain('Device: mid · pointer · lg');
    expect(body).toContain('Browser: chromium');
    expect(body).toContain('Export diagnostics');
  });

  it('names browser engines coarsely', () => {
    expect(browserEngine(chrome)).toBe('chromium');
    expect(browserEngine('Mozilla/5.0 (Macintosh; rv:144.0) Gecko/20100101 Firefox/144.0')).toBe(
      'firefox',
    );
    expect(
      browserEngine(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('webkit');
    expect(browserEngine('curl/8')).toBe('other');
  });
});
