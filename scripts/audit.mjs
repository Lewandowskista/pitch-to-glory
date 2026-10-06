import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
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
  for (const [name, path, preset] of [
    ['menu-mobile', '/', 'mobile'],
    ['menu-desktop', '/', 'desktop'],
    ['gallery-mobile', '/gallery', 'mobile'],
    ['settings-mobile', '/settings', 'mobile'],
    ['match-mobile', '/match', 'mobile'],
    ['saves-mobile', '/saves', 'mobile'],
    ['world-mobile', '/world', 'mobile'],
  ]) {
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
      lcp: report.audits['largest-contentful-paint'].displayValue,
      tti: report.audits.interactive.displayValue,
    };
    results.push(row);
    console.log(
      `${name}: performance ${performance}, accessibility ${accessibility}, LCP ${row.lcp}, TTI ${row.tti}`,
    );
    if (performance <= (preset === 'desktop' ? 90 : 85) || accessibility <= 95)
      throw new Error(`${name} does not meet the quality target`);
  }
  await writeFile('artifacts/lighthouse-summary.json', JSON.stringify(results, null, 2));
} finally {
  server.kill();
}
