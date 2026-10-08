/**
 * Deterministic saves for the performance checks (Phase 4.2): real play states reached by the
 * endurance policy, never hand-edited, so audits measure what a player's save contains.
 *
 *   npm run perf:fixtures            both fixtures into artifacts/performance/
 *
 * - populated: a national career in its first season, at week 20, between matches.
 * - late: the same career in its fifteenth season (age 31), with a long inbox, history,
 *   Chronicle and Moments, between matches.
 * Both stop where Continue leads to the next matchday, so a journey can advance, then play.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { decide, freshPolicy, startCareer } from './soak-career';

const SEED = 'performance';

function week(world: World, policy: ReturnType<typeof freshPolicy>): World {
  const next = decide(world, policy, () => {});
  return advanceCareerWeek(next, { inPlace: true, autoPlay: true }).world;
}
/** Advance to `target` in the current season, then on to a week with no match waiting. */
function settle(world: World, target: number, policy: ReturnType<typeof freshPolicy>): World {
  let current = world;
  while (current.phase === 'active' && current.date.week < target) current = week(current, policy);
  while (current.phase === 'active' && pendingCareerFixture(current))
    current = week(current, policy);
  // Leave nothing for the hub to ask first, so Continue is the next action.
  return decide(current, policy, () => {});
}
async function write(name: string, world: World) {
  const json = JSON.stringify(
    createSave(1, `Performance ${name}`, {
      kind: 'world',
      world,
      gallery: { seed: SEED, generation: 0 },
      settings: DEFAULT_SETTINGS,
    }),
  );
  await writeFile(`artifacts/performance/${name}.json`, json);
  const career = world.career!;
  console.log(
    `${name}: season ${world.date.season} week ${world.date.week}, ${(Buffer.byteLength(json) / 2 ** 20).toFixed(1)} MiB, ` +
      `${world.inbox.length} messages, ${career.matches.length} matches, ${world.chronicle.length} chronicle entries, ${world.moments.length} moments`,
  );
}

await mkdir('artifacts/performance', { recursive: true });
const policy = freshPolicy();
let world = startCareer(generateWorld(SEED), 0);
world = settle(world, 20, policy);
await write('populated', world);
const late = process.argv.includes('--populated-only') ? null : 31;
if (late) {
  for (;;) {
    while (world.phase === 'active') world = week(world, policy);
    world = startNextSeason(world, { inPlace: true });
    const player = world.players[world.career!.playerId]!;
    console.log(`  season ${world.date.season} · age ${world.date.season - player.birthSeason}`);
    if (world.date.season - player.birthSeason >= late) break;
  }
  world = settle(world, 12, policy);
  await write('late', world);
}
