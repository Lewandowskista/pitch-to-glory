/**
 * Vitest global setup: makes the shared national test worlds (tests/support/fixtures.ts)
 * available before any test file starts. The fresh world and career take about a second and are
 * written here; the played fixtures (a season of auto-play, about a minute) are written by a
 * background process while the first tests run, and tests that need them wait for them. Every
 * fixture is cached per source revision (tests/support/store.ts), so an unchanged engine
 * rebuilds nothing.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync, rmSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import {
  buildNationalCareer,
  buildNationalWorld,
  PLAYED_FIXTURES,
  QUICK_FIXTURES,
} from './fixtures';
import {
  errorPath,
  fixtureDirectory,
  fixturePath,
  lockPath,
  playingPid,
  pruneStore,
  writeFixture,
} from './store';

let child: ChildProcess | null = null;

export default function setup(project: TestProject): () => void {
  const dir = fixtureDirectory();
  pruneStore(dir);
  project.provide('testWorlds', dir);
  if (!QUICK_FIXTURES.every((name) => existsSync(fixturePath(dir, name)))) {
    const world = buildNationalWorld();
    writeFixture(dir, 'world', JSON.stringify(world));
    writeFixture(dir, 'career', JSON.stringify(buildNationalCareer(world)));
  }
  const missing = PLAYED_FIXTURES.some((name) => !existsSync(fixturePath(dir, name)));
  if (missing && !playingPid(dir)) startPlaying(dir);
  return () => {
    // Leave nothing running after the tests: a later run starts the season again.
    if (child && child.exitCode === null) child.kill();
    child = null;
  };
}

/** Play the season fixtures in a separate process, which holds the lock while it runs. */
function startPlaying(dir: string): void {
  rmSync(errorPath(dir), { force: true });
  rmSync(lockPath(dir), { force: true });
  let lock: number;
  try {
    lock = openSync(lockPath(dir), 'wx');
  } catch {
    return; // Another run took the lock first.
  }
  const script = fileURLToPath(new URL('./play-worlds.ts', import.meta.url));
  child = spawn(process.execPath, ['--import', 'tsx', script, dir], { stdio: 'inherit' });
  writeSync(lock, String(child.pid));
  closeSync(lock);
}
