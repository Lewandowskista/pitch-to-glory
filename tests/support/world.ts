/**
 * The shared national test worlds (release 1.0 plan, step 2.1). Production creates only national
 * worlds, so career, market, honours, social, lifestyle, story and coaching tests start from one:
 *
 * - `nationalWorld()`: a fresh national world (six countries, every regional group and feeder
 *   level, continental cups, the AI market, AI injuries), generated on a fixed seed.
 * - `nationalCareer()`: that world with an English 17-year-old striker (`TEST_DRAFT`) just signed
 *   at a semi-professional trial club in the bottom simulated tier, in week 1.
 * - `nationalCareerWeeks()`: the career after `SNAPSHOT_WEEKS` auto-played weeks.
 * - `nationalCareerSeason()`: the career after its first season was auto-played to the end,
 *   before the rollover (`startNextSeason`).
 *
 * Every call returns a fresh copy, so tests may change it freely. The legacy compact world is
 * still loadable and keeps a small explicit suite (tests/legacy-compat.test.ts); other tests
 * that still build one use it only as a cheap source of clubs for match-engine checks, where the
 * world's rules do not matter.
 */
import { existsSync, readFileSync } from 'node:fs';
import { inject } from 'vitest';
import type { World } from '../../src/model/domain';
import {
  buildNationalCareer,
  buildNationalWorld,
  playNationalCareer,
  type FixtureName,
} from './fixtures';
import { errorPath, fixturePath, playingPid } from './store';

export { NATIONAL_SEED, SNAPSHOT_WEEKS, TEST_DRAFT } from './fixtures';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The folder of the shared test worlds (tests/support/setup-worlds.ts). */
    testWorlds: string;
  }
}

/** Each fixture's JSON, read once per test file. */
const texts = new Map<FixtureName, string>();
const parse = (name: FixtureName) => JSON.parse(texts.get(name)!) as World;
const directory = (): string | undefined => {
  try {
    return inject('testWorlds');
  } catch {
    return undefined;
  }
};

/** Build a fixture in this process, for runs without the global setup or a lost player. */
function buildHere(name: FixtureName): void {
  if (name === 'world') texts.set(name, JSON.stringify(buildNationalWorld()));
  else if (name === 'career') {
    if (!texts.has('world')) buildHere('world');
    texts.set(name, JSON.stringify(buildNationalCareer(parse('world'))));
  } else {
    if (!texts.has('career')) load('career');
    playNationalCareer(parse('career'), (played, world) =>
      texts.set(played, JSON.stringify(world)),
    );
  }
}
function load(name: FixtureName): void {
  if (texts.has(name)) return;
  const dir = directory();
  if (dir && existsSync(fixturePath(dir, name)))
    texts.set(name, readFileSync(fixturePath(dir, name), 'utf8'));
  else buildHere(name);
}
/** Wait for the background process to write a played fixture (or build it here if it stopped). */
async function loadPlayed(name: FixtureName): Promise<void> {
  if (texts.has(name)) return;
  const dir = directory();
  while (dir && !existsSync(fixturePath(dir, name))) {
    if (existsSync(errorPath(dir)))
      throw new Error(`The test world player failed:\n${readFileSync(errorPath(dir), 'utf8')}`);
    if (!playingPid(dir)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  load(name);
}

export function nationalWorld(): World {
  load('world');
  return parse('world');
}
export function nationalCareer(): World {
  load('career');
  return parse('career');
}
export async function nationalCareerWeeks(): Promise<World> {
  await loadPlayed('career-weeks');
  return parse('career-weeks');
}
export async function nationalCareerSeason(): Promise<World> {
  await loadPlayed('career-season');
  return parse('career-season');
}
