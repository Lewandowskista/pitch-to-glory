import { expect, test, type Page } from '@playwright/test';
import { cpus, totalmem } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { skipTutorial } from './support';

/**
 * Performance on real play states (Phase 4.2). Runs only as the `performance` project
 * (`npm run test:performance`, after `npm run perf:fixtures`), alone, in Chromium, against the
 * production preview. Each fixture is a save the endurance policy reached; nothing in the
 * shipped game exists for benchmarking. Results, with the machine and profile, go to
 * artifacts/performance/results.json; budgets fail the run rather than being averaged away.
 */
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, cpu: 1 },
  // A mid-range phone: a phone viewport with the CPU slowed four times.
  phone: { viewport: { width: 390, height: 844 }, cpu: 4 },
} as const;
/**
 * Budgets in milliseconds, about twice what the reference machine measured (docs/VERIFICATION.md,
 * Phase 4.2), so a real regression fails while ordinary variation between runners does not.
 * Interactions use the 200 ms "good" threshold; frames require at least 30 fps at the 95th
 * percentile. `advance` covers Continue to the next matchday: several simulated weeks, each saved.
 */
const BUDGETS = {
  desktop: { hubReady: 3000, interaction: 200, advance: 10000, frameP95: 34 },
  phone: { hubReady: 6000, interaction: 200, advance: 30000, frameP95: 34 },
} as const;
const FIXTURES = ['populated', 'late'] as const;

interface Row {
  fixture: string;
  profile: string;
  importMs: number;
  hubReadyMs: number;
  calendarMs: number;
  inboxMs: number;
  /** The slowest interaction's event duration (Event Timing), a stand-in for INP. */
  interactionMs: number;
  advanceMs: number;
  saveMs: number;
  longTasks: number;
  longestTaskMs: number;
  frames: { renderer: string; fps: number; p95: number; p99: number; longest: number };
  heapMB: number | null;
  budget: Record<string, boolean>;
}
const rows: Row[] = [];

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  // Observers installed before any script, so every page load is measured from its start.
  await page.addInitScript(() => {
    const state = { longTasks: [] as number[], events: [] as number[] };
    (window as Window & { __perf?: typeof state }).__perf = state;
    const observe = (type: string, onEntry: (entry: PerformanceEntry) => void, extra = {}) => {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({
        type,
        buffered: true,
        ...extra,
      });
    };
    observe('longtask', (entry) => state.longTasks.push(entry.duration));
    observe('event', (entry) => state.events.push(entry.duration), { durationThreshold: 16 });
  });
});
test.afterAll(async () => {
  if (!rows.length) return;
  await mkdir('artifacts/performance', { recursive: true });
  await writeFile(
    'artifacts/performance/results.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        machine: { cpu: cpus()[0]?.model, cores: cpus().length, memoryGB: totalmem() / 2 ** 30 },
        profiles: PROFILES,
        budgets: BUDGETS,
        rows,
      },
      null,
      2,
    ),
  );
});

const perf = (page: Page) =>
  page.evaluate(() => {
    const state = (window as Window & { __perf?: { longTasks: number[]; events: number[] } })
      .__perf!;
    const result = { longTasks: [...state.longTasks], events: [...state.events] };
    state.longTasks.length = 0;
    state.events.length = 0;
    return result;
  });
async function timed(action: () => Promise<unknown>): Promise<number> {
  const started = Date.now();
  await action();
  return Date.now() - started;
}

for (const fixture of FIXTURES)
  for (const [profile, settings] of Object.entries(PROFILES) as [
    keyof typeof PROFILES,
    (typeof PROFILES)[keyof typeof PROFILES],
  ][])
    test(`${fixture} career · ${profile}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'CPU throttling and memory are Chromium-only');
      const path = `artifacts/performance/${fixture}.json`;
      test.skip(!existsSync(path), `Run npm run perf:fixtures to create ${path}`);
      test.setTimeout(600000);
      await page.setViewportSize(settings.viewport);
      const cdp = await page.context().newCDPSession(page);

      await page.goto('/saves');
      const importMs = await timed(async () => {
        await page
          .locator('.slot-card')
          .nth(0)
          .getByLabel('Import backup — Slot 1')
          .setInputFiles(path);
        await expect(page.locator('.notice')).toHaveText('Save imported.', {
          timeout: 120000,
        });
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: settings.cpu });

      // The hub, from a cold load of the saved career.
      const hubReadyMs = await timed(async () => {
        await page.goto('/career?save=1');
        await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({
          timeout: 120000,
        });
      });
      await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 60000 });
      const loading = await perf(page);

      // The agenda and a long inbox, through the page tabs.
      const tabs = page.getByRole('navigation', { name: 'Overview pages' });
      const calendarMs = await timed(async () => {
        await tabs.getByRole('link', { name: 'Calendar' }).click();
        await expect(page.getByRole('tabpanel')).toBeVisible();
      });
      const inboxMs = await timed(async () => {
        await tabs.getByRole('link', { name: /^Inbox/ }).click();
        await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
      });
      const inbox = page.getByRole('main').getByRole('link');
      if (await inbox.count()) await inbox.nth(1).click();
      await tabs.getByRole('link', { name: 'Hub' }).click();
      await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible();
      const interactions = await perf(page);

      // Continue: the world simulates to the next matchday and saves each week.
      const advanceMs = await timed(async () => {
        await page.getByRole('button', { name: 'Continue to next matchday' }).click();
        await expect(page.getByRole('link', { name: 'Play matchday' })).toBeVisible({
          timeout: 300000,
        });
      });
      const saveMs = await timed(() =>
        expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 60000 }),
      );
      const advancing = await perf(page);

      // The live pitch: frame pacing over six seconds of play at normal speed.
      await page.getByRole('link', { name: 'Play matchday' }).click();
      await page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }).click();
      await page.getByRole('button', { name: 'Kick off', exact: true }).click();
      await page.waitForTimeout(1000);
      const frames = await page.evaluate(async () => {
        const gaps: number[] = [];
        let last = performance.now();
        const end = last + 6000;
        await new Promise<void>((resolve) => {
          const frame = (now: number) => {
            gaps.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        const sorted = [...gaps].sort((a, b) => a - b);
        const at = (q: number) =>
          sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
        return {
          renderer: document.querySelector('.match-page canvas') ? 'pixi' : 'svg',
          fps: Math.round((gaps.length / 6) * 10) / 10,
          p95: Math.round(at(0.95) * 10) / 10,
          p99: Math.round(at(0.99) * 10) / 10,
          longest: Math.round(sorted.at(-1)! * 10) / 10,
        };
      });
      const heapMB = await page.evaluate(() => {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } })
          .memory;
        return memory ? Math.round(memory.usedJSHeapSize / 1e6) : null;
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

      const tasks = [...loading.longTasks, ...interactions.longTasks, ...advancing.longTasks];
      const budget = BUDGETS[profile];
      const interactionMs = Math.round(Math.max(0, ...interactions.events));
      const row: Row = {
        fixture,
        profile,
        importMs,
        hubReadyMs,
        calendarMs,
        inboxMs,
        interactionMs,
        advanceMs,
        saveMs,
        longTasks: tasks.length,
        longestTaskMs: Math.round(Math.max(0, ...tasks)),
        frames,
        heapMB,
        budget: {
          hubReady: hubReadyMs <= budget.hubReady,
          interaction: interactionMs <= budget.interaction,
          advance: advanceMs <= budget.advance,
          frames: frames.p95 <= budget.frameP95,
        },
      };
      rows.push(row);
      console.log(JSON.stringify(row));
      expect(row.budget, `${fixture} · ${profile}`).toEqual({
        hubReady: true,
        interaction: true,
        advance: true,
        frames: true,
      });
    });
