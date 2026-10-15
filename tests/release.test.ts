import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PATCH_NOTES, type ReleaseNotes } from '../src/i18n/patchNotes';
import { changelogIsCurrent, renderChangelog } from '../src/release/changelog';
import {
  acknowledgeUpdate,
  browserVersionStore,
  LAST_SEEN_KEY,
  shouldShowUpdateNotice,
  startupUpdateNotice,
  type VersionStore,
} from '../src/release/notice';
import { compareVersions, isVersion, parseVersion } from '../src/release/semver';
import { isIsoDate, patchNoteProblems } from '../src/release/validate';
import { APP_VERSION } from '../src/release/version';

const packageVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string })
  .version;

describe('versions', () => {
  it('reads only plain major.minor.patch versions', () => {
    expect(parseVersion('0.2.0')).toEqual([0, 2, 0]);
    expect(parseVersion('10.0.12')).toEqual([10, 0, 12]);
    for (const bad of [
      '',
      '1',
      '1.2',
      '1.2.3.4',
      'v1.2.3',
      '01.2.3',
      '1.2.3-beta',
      ' 1.2.3',
      '1.2.x',
    ])
      expect(isVersion(bad), bad).toBe(false);
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(() => compareVersions('1.2', '1.2.3')).toThrow();
  });

  it('builds with package.json’s version', () => {
    expect(APP_VERSION).toBe(packageVersion);
  });
});

describe('patch notes', () => {
  it('follow every release rule, with package.json’s version first', () => {
    expect(patchNoteProblems(PATCH_NOTES, packageVersion)).toEqual([]);
    expect(PATCH_NOTES[0]!.version).toBe(packageVersion);
  });

  it('keep CHANGELOG.md in step', () => {
    expect(changelogIsCurrent(readFileSync('CHANGELOG.md', 'utf8'), PATCH_NOTES)).toBe(true);
    expect(
      changelogIsCurrent(renderChangelog(PATCH_NOTES).replace(/\n/g, '\r\n'), PATCH_NOTES),
    ).toBe(true);
    expect(changelogIsCurrent(renderChangelog(PATCH_NOTES.slice(1)), PATCH_NOTES)).toBe(false);
  });

  const release = (overrides: Partial<ReleaseNotes> = {}): ReleaseNotes => ({
    version: '1.0.0',
    date: '2026-11-01',
    title: 'A release',
    summary: 'Something for players.',
    new: ['A new thing.'],
    ...overrides,
  });
  const older = release({ version: '0.9.0', date: '2026-10-01' });

  it('accept well-formed notes', () => {
    expect(patchNoteProblems([release(), older], '1.0.0')).toEqual([]);
  });

  it.each([
    ['no entry for the package version', [release(), older], '1.1.0', /has no patch-notes entry/],
    ['a newer entry than the package', [release(), older], '0.9.0', /newest patch-notes entry/],
    ['ascending order', [older, release()], undefined, /keep newest first/],
    ['a duplicate version', [release(), release()], undefined, /must be unique/],
    ['an invalid version', [release({ version: '1.0' })], undefined, /not a major.minor.patch/],
    ['an invalid date', [release({ date: '2026-02-30' })], undefined, /valid YYYY-MM-DD/],
    [
      'a date older than the next entry',
      [release({ date: '2026-09-01' }), older],
      undefined,
      /before the older/,
    ],
    ['an empty title', [release({ title: ' ' })], undefined, /title is empty/],
    ['an empty summary', [release({ summary: '' })], undefined, /summary is empty/],
    ['no sections', [release({ new: undefined })], undefined, /no sections/],
    ['an empty section', [release({ fixed: [] })], undefined, /"fixed" section is empty/],
    ['an empty line', [release({ new: ['Fine.', ''] })], undefined, /line 2 is empty/],
    [
      'a milestone number',
      [release({ new: ['Finished milestone 4.'] })],
      undefined,
      /internal wording/,
    ],
    ['a phase number', [release({ title: 'Phase 6' })], undefined, /internal wording/],
    ['a file name', [release({ fixed: ['Fixed Match.tsx.'] })], undefined, /internal wording/],
  ] as const)('reject %s', (_, notes, version, problem) => {
    expect(patchNoteProblems(notes, version).join('\n')).toMatch(problem);
  });

  it('reject an empty list', () => {
    expect(patchNoteProblems([])).toEqual(['There are no patch notes.']);
  });

  it('accept only real calendar dates', () => {
    expect(isIsoDate('2026-10-15')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    for (const bad of ['2026-13-01', '2026-02-29', '15/10/2026', '2026-10-5', '2026-10-15T00:00'])
      expect(isIsoDate(bad), bad).toBe(false);
  });

  it('render the changelog newest first with only the sections present', () => {
    const text = renderChangelog([release({ improved: ['Better.'] }), older]);
    expect(text.indexOf('## 1.0.0')).toBeLessThan(text.indexOf('## 0.9.0'));
    expect(text).toContain('### Improved\n\n- Better.');
    expect(text).not.toContain('### Fixed');
    expect(text.endsWith('\n')).toBe(true);
  });
});

/** A last-seen version held in memory, recording writes. */
function memoryStore(initial: string | null): VersionStore & { value: string | null } {
  const store = {
    value: initial,
    read: () => store.value,
    write: vi.fn((version: string) => {
      store.value = version;
    }),
  };
  return store;
}

describe('the "Updated" notice', () => {
  it('shows only for a newer version than the last one seen', () => {
    expect(shouldShowUpdateNotice('0.2.0', '0.1.0')).toBe(true);
    expect(shouldShowUpdateNotice('0.2.0', '0.2.0')).toBe(false);
    expect(shouldShowUpdateNotice('0.1.0', '0.2.0')).toBe(false);
    expect(shouldShowUpdateNotice('0.2.0', null)).toBe(false);
    expect(shouldShowUpdateNotice('0.2.0', 'garbage')).toBe(false);
  });

  it('never shows on a first visit, and remembers the version for next time', () => {
    const store = memoryStore(null);
    expect(startupUpdateNotice('0.2.0', store)).toBeNull();
    expect(store.value).toBe('0.2.0');
  });

  it('stays quiet on the same version without writing', () => {
    const store = memoryStore('0.2.0');
    expect(startupUpdateNotice('0.2.0', store)).toBeNull();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('shows after an update until the player acknowledges it', () => {
    const store = memoryStore('0.1.0');
    expect(startupUpdateNotice('0.2.0', store)).toBe('0.1.0');
    // Reloading before acknowledging still shows it.
    expect(startupUpdateNotice('0.2.0', store)).toBe('0.1.0');
    acknowledgeUpdate('0.2.0', store);
    expect(startupUpdateNotice('0.2.0', store)).toBeNull();
  });

  it('replaces an unreadable stored value without showing', () => {
    const store = memoryStore('not-a-version');
    expect(startupUpdateNotice('0.2.0', store)).toBeNull();
    expect(store.value).toBe('0.2.0');
  });

  it('survives storage that throws on every access', () => {
    const throwing = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    vi.stubGlobal('localStorage', throwing);
    try {
      expect(browserVersionStore.read()).toBeNull();
      expect(() => browserVersionStore.write('0.2.0')).not.toThrow();
      expect(startupUpdateNotice('0.2.0')).toBeNull();
      expect(() => acknowledgeUpdate('0.2.0')).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('survives storage that is missing altogether', () => {
    // No storage at all: every access throws inside the store.
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(startupUpdateNotice('0.2.0')).toBeNull();
      expect(() => acknowledgeUpdate('0.2.0')).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses its own storage key', () => {
    const values = new Map<string, string>([[LAST_SEEN_KEY, '0.1.0']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    try {
      expect(startupUpdateNotice('0.2.0')).toBe('0.1.0');
      acknowledgeUpdate('0.2.0');
      expect(values.get(LAST_SEEN_KEY)).toBe('0.2.0');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
