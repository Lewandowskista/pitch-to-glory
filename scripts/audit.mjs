import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

/**
 * Lighthouse on the entry pages, then (with `--populated`) on career pages holding the real
 * saves from `npm run perf:fixtures`: Playwright imports a save into a browser profile through
 * the Saves screen, then Lighthouse audits that same browser without resetting its storage.
 * Nothing in the shipped game exists for the audit.
 */
const populated = process.argv.includes('--populated') || process.argv.includes('--populated-only');
const ENTRY_PAGES = [
  ['menu-mobile', '/', 'mobile'],
  ['menu-desktop', '/', 'desktop'],
  ['gallery-mobile', '/gallery', 'mobile'],
  ['settings-mobile', '/settings', 'mobile'],
  ['match-mobile', '/match', 'mobile'],
  ['saves-mobile', '/saves', 'mobile'],
  ['world-mobile', '/world', 'mobile'],
  ['career-mobile', '/career', 'mobile'],
  ['career-new-mobile', '/career/new', 'mobile'],
  ['edit-mobile', '/edit', 'mobile'],
  ['moment-mobile', '/moment', 'mobile'],
];
const run = promisify(execFile);
const url = 'http://127.0.0.1:4180';
await mkdir('artifacts', { recursive: true });
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4180',
    '--strictPort',
  ],
  { stdio: 'ignore', windowsHide: true },
);
let exited = false;
server.on('exit', () => {
  exited = true;
});
try {
  let ready = false;
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The preview may still be starting; retry within the bounded readiness loop.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready || exited) throw new Error('Could not start audit preview on port 4180');
  const results = [];
  // `--populated-only` skips the entry pages, to iterate on the career pages alone.
  const entryPages = process.argv.includes('--populated-only') ? [] : ENTRY_PAGES;
  for (const [name, path, preset] of entryPages) {
    const output = `artifacts/lighthouse-${name}.json`;
    const args = [
      'node_modules/lighthouse/cli/index.js',
      url + path,
      '--chrome-flags=--headless --no-sandbox',
      '--only-categories=performance,accessibility',
      '--output=json',
      `--output-path=${output}`,
      '--quiet',
    ];
    if (preset === 'desktop') args.push('--preset=desktop');
    await run(process.execPath, args, {
      env: { ...process.env, CHROME_PATH: chromium.executablePath() },
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
    const report = JSON.parse(await readFile(output, 'utf8'));
    const performance = report.categories.performance.score * 100;
    const accessibility = report.categories.accessibility.score * 100;
    const row = {
      name,
      performance,
      accessibility,
      fcp: report.audits['first-contentful-paint'].displayValue,
      lcp: report.audits['largest-contentful-paint'].displayValue,
      tti: report.audits.interactive.displayValue,
      tbt: report.audits['total-blocking-time'].displayValue,
      bytes: report.audits['total-byte-weight'].displayValue,
      passed: performance > (preset === 'desktop' ? 90 : 85) && accessibility > 95,
    };
    results.push(row);
    console.log(
      `${name}: performance ${performance}, accessibility ${accessibility}, FCP ${row.fcp}, LCP ${row.lcp}, TTI ${row.tti}, TBT ${row.tbt}, ${row.bytes}`,
    );
  }
  if (populated) await auditPopulated(results);
  await writeFile('artifacts/lighthouse-summary.json', JSON.stringify(results, null, 2));
  // Report every page first, then fail if any misses the targets (AGENTS.md §11).
  const failed = results.filter((row) => !row.passed).map((row) => row.name);
  if (failed.length) throw new Error(`Below the quality target: ${failed.join(', ')}`);
} finally {
  server.kill();
}

async function auditPopulated(results) {
  for (const [index, fixture] of ['populated', 'late'].entries()) {
    const save = `artifacts/performance/${fixture}.json`;
    if (!existsSync(save)) throw new Error(`Missing ${save}: run npm run perf:fixtures`);
    const profile = await mkdtemp(join(tmpdir(), 'ptg-audit-'));
    const port = 9320 + index;
    const context = await chromium.launchPersistentContext(profile, {
      headless: true,
      args: [`--remote-debugging-port=${port}`],
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(`${url}/saves`);
      // The guided tour is for players, not audits: mark it seen, as the browser tests do.
      await page.evaluate(() => {
        const key = 'ptg-preferences';
        const stored = JSON.parse(localStorage.getItem(key) ?? 'null') ?? {
          theme: 'system',
          fontScale: 1,
          reducedMotion: false,
          backupReminder: true,
          simulationOnly: false,
        };
        localStorage.setItem(
          key,
          JSON.stringify({ ...stored, tutorial: { week: true, match: true } }),
        );
      });
      await page.reload();
      await page
        .locator('.slot-card')
        .nth(0)
        .getByLabel('Import backup — Slot 1')
        .setInputFiles(save);
      await page
        .locator('.notice', { hasText: 'Collection imported.' })
        .waitFor({ timeout: 120000 });
      // A save belongs to one tab: close this one so the audited page can open it.
      await page.close();
      for (const [name, path, preset] of [
        ['hub-mobile', '/career?save=1', 'mobile'],
        ['hub-desktop', '/career?save=1', 'desktop'],
        ['calendar-mobile', '/career/calendar?save=1', 'mobile'],
        ['inbox-mobile', '/career/inbox?save=1', 'mobile'],
      ]) {
        const runner = await lighthouse(
          url + path,
          {
            port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: ['performance', 'accessibility'],
            disableStorageReset: true,
          },
          preset === 'desktop' ? desktopConfig : undefined,
        );
        const report = runner.lhr;
        const performance = Math.round(report.categories.performance.score * 100);
        const accessibility = Math.round(report.categories.accessibility.score * 100);
        const row = {
          name: `${fixture}-${name}`,
          performance,
          accessibility,
          fcp: report.audits['first-contentful-paint'].displayValue,
          lcp: report.audits['largest-contentful-paint'].displayValue,
          tti: report.audits.interactive.displayValue,
          tbt: report.audits['total-blocking-time'].displayValue,
          bytes: report.audits['total-byte-weight'].displayValue,
          passed: performance > (preset === 'desktop' ? 90 : 85) && accessibility > 95,
        };
        await writeFile(`artifacts/lighthouse-${row.name}.json`, JSON.stringify(report));
        results.push(row);
        console.log(
          `${row.name}: performance ${performance}, accessibility ${accessibility}, FCP ${row.fcp}, LCP ${row.lcp}, TTI ${row.tti}, TBT ${row.tbt}, ${row.bytes}`,
        );
      }
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
}
