/**
 * Where the shared test worlds live on disk: one folder per revision of the engine and model
 * sources, under the system temporary folder, so an unchanged engine reuses the worlds of the
 * previous run and a changed one can never read stale worlds. Node built-ins only.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Everything a fixture's content depends on. */
const SOURCES = ['src/engine', 'src/model', 'tests/support/fixtures.ts'];
const STORE = join(tmpdir(), 'ptg-test-worlds');

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((entry) => files(join(path, entry)));
}
/** The folder of the current sources' fixtures (created if missing). */
export function fixtureDirectory(): string {
  const hash = createHash('sha256');
  for (const file of SOURCES.flatMap((source) => files(join(ROOT, source)))) {
    hash.update(relative(ROOT, file));
    hash.update(readFileSync(file));
  }
  const dir = join(STORE, hash.digest('hex').slice(0, 16));
  mkdirSync(dir, { recursive: true });
  return dir;
}
export const fixturePath = (dir: string, name: string) => join(dir, `${name}.json`);
/** Write through a temporary file and rename, so readers never see half a world. */
export function writeFixture(dir: string, name: string, text: string): void {
  const temporary = join(dir, `${name}.${process.pid}.tmp`);
  writeFileSync(temporary, text);
  renameSync(temporary, fixturePath(dir, name));
}
/** Remove folders of older sources not used for a day (other checkouts may still use theirs). */
export function pruneStore(keep: string): void {
  const day = Date.now() - 24 * 3600 * 1000;
  for (const entry of existsSync(STORE) ? readdirSync(STORE) : []) {
    const dir = join(STORE, entry);
    if (dir !== keep && statSync(dir).mtimeMs < day) rmSync(dir, { recursive: true, force: true });
  }
}
export const lockPath = (dir: string) => join(dir, 'playing.lock');
export const errorPath = (dir: string) => join(dir, 'playing.error');
/** Whether a process is still running (signal 0 only checks). */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
/** The process playing the season fixtures, when one is running. */
export function playingPid(dir: string): number | null {
  try {
    const pid = Number(readFileSync(lockPath(dir), 'utf8'));
    return Number.isInteger(pid) && pid > 0 && alive(pid) ? pid : null;
  } catch {
    return null;
  }
}
