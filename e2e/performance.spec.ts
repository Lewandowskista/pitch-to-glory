import { expect, test, type Page } from '@playwright/test';
import { cpus, totalmem } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { skipTutorial } from './support';
import { attachWorkers, samplePeak, traceThreads, type ThreadTime } from './threads';

/**
 * Performance on real play states (Phase 4.2). Runs only as the `performance` project
 * (`npm run test:performance`, after `npm run perf:fixtures`), alone, in Chromium, against the
 * production preview. Each fixture is a save the endurance policy reached; nothing in the
 * shipped game exists for benchmarking. Results, with the machine and profile, go to
 * artifacts/performance/results.json; budgets fail the run rather than being averaged away.
 */
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, cpu: 1 },
  // A mid-range phone: a phone viewport with the CPU slowed four times. Chromium slows only the
  // page's main thread (finding P2); the workers are asked too (e2e/threads.ts), and when Chromium
  // refuses, their traced CPU time is reported apart and scaled by the same factor.
  phone: { viewport: { width: 390, height: 844 }, cpu: 4 },
} as const;
/**
 * Two different kinds of number (review phase 6, step 6.1); never read one as the other.
 *
 * Regression tolerances, ASSERTED: about twice what the reference machine measured
 * (docs/VERIFICATION.md, Phase 4.2), so a real regression fails while ordinary variation between
 * runners does not. They are not the product's targets, and passing them proves nothing about
 * the targets. `advance` covers Continue to the next matchday: several simulated weeks, each saved.
 */
const TOLERANCES = {
  desktop: { hubReady: 3000, interaction: 200, advance: 10000, frameP95: 34 },
  phone: { hubReady: 6000, interaction: 200, advance: 30000, frameP95: 34 },
} as const;
/**
 * Product targets, REPORTED and not asserted (AGENTS.md §3, §10, §2): every action within
 * 100 ms, interactive within 3 s on a mid-range phone, the pitch at 60 fps (95th-percentile frame
 * within 17.5 ms). Headless Chromium with a throttled CPU is only an approximation of a phone
 * (no network shaping, no real GPU), so these are evidence to read, and real devices
 * (docs/DEVICE-ACCEPTANCE.md) are the acceptance.
 */
const TARGETS = { interaction: 100, hubReady: 3000, frameP95: 17.5 } as const;
/**
 * The 1.0 performance budget (docs/RELEASE-1.0-PLAN.md, Phase 3), on the late save: REPORTED
 * until phase 3 meets it and sets `asserted`. Phone figures use the honest measure: when the
 * workers could not be throttled, their CPU time scaled by the phone's factor is added.
 * The rest of the budget is measured elsewhere: shell + route JS ≤ 280 KB gzip
 * (scripts/check-bundle.mjs), season simulation ≤ 75 s and the save after 34 seasons ≤ 90 MB
 * (the world drift gate, `npm run drift`), first-session audio CPU ≤ 100 ms (not yet measured
 * by a harness).
 */
const BUDGET_1_0 = {
  asserted: false,
  phase: 3,
  fixture: 'late',
  values: {
    /** Main-thread JavaScript the hub loads, gzip. */
    hubMainJsKB: 350,
    /** Continue to the next matchday, and until saved: desktop. */
    continueDesktopMs: 1200,
    continueDesktopSavedMs: 2000,
    /** Continue until saved on the phone profile (workers scaled when unthrottled). */
    continuePhoneSavedMs: 5000,
    /** The longest main-thread task during Continue. */
    longestTaskMs: 200,
    /**
     * Peak JavaScript heap across the page and its workers during Continue (a lower bound on
     * the plan's peak memory across threads).
     */
    peakHeapMB: 400,
  },
} as const;
const FIXTURES = ['populated', 'late'] as const;

interface Row {
  fixture: string;
  profile: string;
  importMs: number;
  hubReadyMs: number;
  /** The cold hub load until its first-of-the-day challenge refresh is saved. */
  hubSavedMs: number;
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
  /** Whether Chromium throttled the workers on this profile (P2). */
  workerThrottling: string;
  /** CPU time by thread during the hub load and during Continue (tracing, top-level tasks). */
  threads: { hub: ThreadTime; advance: ThreadTime };
  /**
   * The phone's honest figures: measured time plus the workers' CPU time scaled by the
   * profile's factor, when Chromium could not throttle them (null otherwise).
   */
  scaled: { hubReadyMs: number; advanceMs: number; advanceSavedMs: number } | null;
  /** Each Continue press until the matchday, in ms. */
  presses: number[];
  /** The longest main-thread task during Continue. */
  advanceLongestTaskMs: number;
  /** Main-thread JavaScript loaded for the hub, gzip KB (from dist). */
  hubMainJsKB: number | null;
  /** Peak JavaScript heap across the page and its workers during Continue, MB. */
  peakHeapMB: number;
  /** Regression tolerances: asserted. */
  tolerances: Record<string, boolean>;
  /** Product targets: reported, never asserted. */
  targets: Record<string, boolean>;
  /** The 1.0 budget (Phase 3), on the late save: reported until phase 3 asserts it. */
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
        tolerances: { asserted: true, values: TOLERANCES },
        targets: { asserted: false, values: TARGETS },
        budget: BUDGET_1_0,
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
/** Gzip size of the JavaScript files the page loaded itself (workers load theirs apart). */
async function mainThreadJsKB(page: Page): Promise<number | null> {
  // A worker's own script is fetched by the page (initiator "other") but runs in the worker.
  const paths = await page.evaluate(() =>
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((entry) => entry.initiatorType !== 'other')
      .map((entry) => new URL(entry.name).pathname)
      .filter((path) => path.endsWith('.js') && !/\.worker-/.test(path)),
  );
  if (process.env.PERF_DEBUG) console.log(`hub main-thread scripts: ${paths.join(', ')}`);
  const files = [...new Set(paths)].map((path) => `dist${path}`).filter((file) => existsSync(file));
  if (!files.length) return null;
  const bytes = files.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
  return Math.round((bytes / 1024) * 10) / 10;
}

for (const fixture of FIXTURES)
  for (const [profile, settings] of Object.entries(PROFILES) as [
    keyof typeof PROFILES,
    (typeof PROFILES)[keyof typeof PROFILES],
  ][])
    test(`${fixture} career · ${profile}`, async ({ page, browser, browserName }) => {
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
      // The workers too, where Chromium allows it (P2); their heaps are sampled either way.
      const workers = await attachWorkers(cdp, settings.cpu);

      // The hub, from a cold load of the saved career, traced by thread.
      let hubReadyMs = 0;
      let hubStarted = 0;
      const hubThreads = await traceThreads(browser, page, async () => {
        hubStarted = Date.now();
        hubReadyMs = await timed(async () => {
          await page.goto('/career?save=1');
          await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({
            timeout: 120000,
          });
        });
      });
      const hubMainJsKB = await mainThreadJsKB(page);
      // The first hub load of a day refreshes the daily challenges, a world change that is
      // saved (finding P3, step 3.4): past the autosave delay, until saved.
      await page.waitForTimeout(600);
      await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 60000 });
      const hubSavedMs = Date.now() - hubStarted;
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

      // Continue: the world simulates to the next matchday and saves each week. Continue also
      // stops for a decision that arrives or falls due (review phase 5), so it is pressed again
      // until the matchday; the time covers every press.
      const presses: number[] = [];
      let advanceMs = 0;
      let saveMs = 0;
      const stopHeap = samplePeak(workers.heap);
      const advanceThreads = await traceThreads(browser, page, async () => {
        advanceMs = await timed(async () => {
          const play = page.getByRole('link', { name: 'Play matchday' });
          const go = page.getByRole('button', { name: 'Continue to next matchday' });
          for (let press = 0; press < 12 && !(await play.isVisible()); press++) {
            await expect(go.or(play)).toBeVisible({ timeout: 300000 });
            if (await play.isVisible()) break;
            await expect(go).toBeEnabled({ timeout: 300000 });
            const started = Date.now();
            await go.click();
            await expect(go.or(play)).toBeEnabled({ timeout: 300000 });
            presses.push(Date.now() - started);
          }
          await expect(play).toBeVisible({ timeout: 300000 });
        });
        saveMs = await timed(() =>
          expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 60000 }),
        );
      });
      const peakHeapMB = Math.round((await stopHeap()) / 1e6);
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
      const budget = TOLERANCES[profile];
      const interactionMs = Math.round(Math.max(0, ...interactions.events));
      const workerThrottling = workers.throttling();
      // Unthrottled worker time on the phone, scaled by the profile's factor (P2).
      const unthrottled = settings.cpu > 1 && workerThrottling !== 'applied';
      const extra = (threads: ThreadTime) =>
        unthrottled ? (settings.cpu - 1) * threads.workersMs : 0;
      const scaled = unthrottled
        ? {
            hubReadyMs: hubReadyMs + extra(hubThreads),
            advanceMs: advanceMs + extra(advanceThreads),
            advanceSavedMs: advanceMs + saveMs + extra(advanceThreads),
          }
        : null;
      const advanceLongestTaskMs = Math.round(Math.max(0, ...advancing.longTasks));
      const B = BUDGET_1_0.values;
      const honestSaved = scaled?.advanceSavedMs ?? advanceMs + saveMs;
      const row: Row = {
        fixture,
        profile,
        importMs,
        hubReadyMs,
        hubSavedMs,
        calendarMs,
        inboxMs,
        interactionMs,
        advanceMs,
        saveMs,
        longTasks: tasks.length,
        longestTaskMs: Math.round(Math.max(0, ...tasks)),
        frames,
        heapMB,
        workerThrottling,
        threads: { hub: hubThreads, advance: advanceThreads },
        scaled,
        presses,
        advanceLongestTaskMs,
        hubMainJsKB,
        peakHeapMB,
        tolerances: {
          hubReady: hubReadyMs <= budget.hubReady,
          interaction: interactionMs <= budget.interaction,
          advance: advanceMs <= budget.advance,
          frames: frames.p95 <= budget.frameP95,
        },
        targets: {
          interaction: interactionMs <= TARGETS.interaction,
          // The 3 s target is for a phone; the desktop row is reported against it too.
          hubReady: hubReadyMs <= TARGETS.hubReady,
          frames: frames.p95 <= TARGETS.frameP95,
        },
        budget:
          fixture !== BUDGET_1_0.fixture
            ? {}
            : profile === 'desktop'
              ? {
                  hubMainJsKB: hubMainJsKB !== null && hubMainJsKB <= B.hubMainJsKB,
                  continue: advanceMs <= B.continueDesktopMs,
                  continueSaved: advanceMs + saveMs <= B.continueDesktopSavedMs,
                  longestTask: advanceLongestTaskMs <= B.longestTaskMs,
                  peakHeap: peakHeapMB <= B.peakHeapMB,
                }
              : {
                  continueSaved: honestSaved <= B.continuePhoneSavedMs,
                  longestTask: advanceLongestTaskMs <= B.longestTaskMs,
                  peakHeap: peakHeapMB <= B.peakHeapMB,
                },
      };
      rows.push(row);
      console.log(JSON.stringify(row));
      const met = Object.entries(row.targets)
        .map(([key, ok]) => `${key} ${ok ? 'met' : 'NOT met'}`)
        .join(', ');
      console.log(`${fixture} · ${profile} · product targets (reported, not asserted): ${met}`);
      const thread = (t: ThreadTime) => `main ${t.mainMs} ms, workers ${t.workersMs} ms`;
      console.log(
        `${fixture} · ${profile} · threads: hub ${thread(hubThreads)}; Continue ${thread(advanceThreads)}, longest worker task ${advanceThreads.longestWorkerTaskMs} ms; worker throttling ${workerThrottling}` +
          (scaled
            ? `; scaled: hub ${scaled.hubReadyMs} ms, Continue ${scaled.advanceMs} ms, saved ${scaled.advanceSavedMs} ms`
            : ''),
      );
      const owed = Object.entries(row.budget)
        .map(([key, ok]) => `${key} ${ok ? 'met' : 'NOT met'}`)
        .join(', ');
      if (owed)
        console.log(
          `${fixture} · ${profile} · 1.0 budget (reported, asserted from phase ${BUDGET_1_0.phase}): ${owed}`,
        );
      expect(row.tolerances, `${fixture} · ${profile} regression tolerances`).toEqual({
        hubReady: true,
        interaction: true,
        advance: true,
        frames: true,
      });
    });

/**
 * Season simulation on the late save (the 1.0 budget's "season simulation, desktop" row): the
 * rest of the season auto-played from the hub, until the season is complete and saved. The late
 * fixture stands in week 34 of 60, so the per-week time is reported too, with the whole
 * 60-week season it implies.
 */
test('late career · season · desktop', async ({ page, browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Tracing and memory are Chromium-only');
  const path = 'artifacts/performance/late.json';
  test.skip(!existsSync(path), `Run npm run perf:fixtures to create ${path}`);
  test.setTimeout(900000);
  await page.setViewportSize(PROFILES.desktop.viewport);
  const cdp = await page.context().newCDPSession(page);
  await page.goto('/saves');
  await page.locator('.slot-card').nth(0).getByLabel('Import backup — Slot 1').setInputFiles(path);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 120000 });
  const workers = await attachWorkers(cdp, 1);
  await page.goto('/career?save=1');
  await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 60000 });
  const stopHeap = samplePeak(workers.heap);
  let seasonMs = 0;
  let savedMs = 0;
  const threads = await traceThreads(browser, page, async () => {
    const started = Date.now();
    await page.getByRole('button', { name: 'Simulate the season', exact: true }).click();
    await page.getByRole('button', { name: 'Auto-play my matches', exact: true }).click();
    await expect(page.getByText('Season complete', { exact: true }).first()).toBeVisible({
      timeout: 840000,
    });
    seasonMs = Date.now() - started;
    await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 60000 });
    savedMs = Date.now() - started;
  });
  const peakHeapMB = Math.round((await stopHeap()) / 1e6);
  const weeks = 60 - 34 + 1;
  const result = {
    fixture: 'late',
    profile: 'desktop',
    season: {
      weeks,
      seasonMs,
      savedMs,
      perWeekMs: Math.round(savedMs / weeks),
      fullSeasonMs: Math.round((savedMs / weeks) * 60),
      threads,
      peakHeapMB,
      budgetMs: 75000,
    },
  };
  console.log(JSON.stringify(result));
  await mkdir('artifacts/performance', { recursive: true });
  await writeFile('artifacts/performance/season.json', JSON.stringify(result, null, 2));
});
