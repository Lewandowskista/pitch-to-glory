/**
 * Background process of the Vitest global setup (setup-worlds.ts): auto-plays the shared career
 * and writes each played fixture as soon as it exists. Usage: `node --import tsx
 * tests/support/play-worlds.ts <fixture folder>`.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { World } from '../../src/model/domain';
import { playNationalCareer } from './fixtures';
import { errorPath, fixturePath, lockPath, writeFixture } from './store';

const dir = process.argv[2]!;
try {
  const career = JSON.parse(readFileSync(fixturePath(dir, 'career'), 'utf8')) as World;
  playNationalCareer(career, (name, world) => writeFixture(dir, name, JSON.stringify(world)));
} catch (error) {
  writeFileSync(errorPath(dir), String((error as Error)?.stack ?? error));
  process.exitCode = 1;
} finally {
  rmSync(lockPath(dir), { force: true });
}
