/**
 * Career endurance harness (Phase 4.1, docs/VERIFICATION.md). Plays careers headlessly in a
 * seeded national world, with the decisions a player makes (recovery plans, press answers,
 * points, offers, a loan, a transfer request, retirement and a child career), and checks the
 * world at every season end: invariants, save export, import and the import size limit.
 *
 *   npm run soak -- --seasons 1                 one season (the pull-request smoke check)
 *   npm run soak -- --seasons 5 --repeat        five seasons, run twice to prove reproducibility
 *   npm run soak -- --generations 2             two natural retirements, each followed by a child
 *
 * Writes artifacts/soak/<mode>-<seed>.json and exits non-zero on any violation, recording the
 * seed, season, week and last completed action.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Id, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { chooseRecovery } from '../src/engine/career/training';
import { applySocialAction } from '../src/engine/career/social/actions';
import {
  applyMarketAction,
  canRequestLoan,
  compareDates,
  openOffers,
  windowState,
} from '../src/engine/career/market';
import {
  attributeCost,
  raiseAttribute,
  skillState,
  trainableAttributes,
  unlockSkill,
} from '../src/engine/career/progression';
import { SKILLS } from '../src/engine/career/catalogue';
import { applyHonoursAction } from '../src/engine/career/honours/actions';
import { retirementState } from '../src/engine/career/honours/retirement';
import { careerInvariants } from '../src/engine/career/invariants';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';

/** The policy retires at the first season end from this age, within the game's own rules. */
const RETIRE_AGE = 33;
const FIRST_NAMES = ['Robin', 'Sam', 'Alex', 'Jamie'];

export interface SoakOptions {
  seed: string;
  /** Stop after this many completed seasons... */
  seasons?: number;
  /** ...or after this many careers have retired. */
  generations?: number;
}
export interface SeasonReport {
  generation: number;
  season: number;
  age: number | null;
  clubId: Id | null;
  weeks: number;
  simulateMs: number;
  exportMs: number;
  importMs: number;
  exportBytes: number;
  heapMB: number;
  rssMB: number;
  /** SHA-256 of the exported world, for reproducibility. */
  hash: string;
  actions: Record<string, number>;
  events: string[];
}
export interface SoakResult {
  seed: string;
  seasons: SeasonReport[];
  retirements: number;
  failure: {
    message: string;
    season: number;
    week: number;
    lastAction: string;
  } | null;
}

class SoakFailure extends Error {}

function draftFor(generation: number, parentLegacyId?: string): CareerDraft {
  return {
    name: `${FIRST_NAMES[generation % FIRST_NAMES.length]} Vale`,
    avatar: {
      face: 1,
      skin: 2,
      hair: (3 + generation) % 8,
      hairColor: 4,
      facialHair: 0,
      eyebrows: 1,
      eyes: 2,
      accessory: 3,
    },
    nationalityId: 'country:0',
    position: 'ST',
    foot: 'left',
    age: 17,
    archetype: 'finisher',
    ...(parentLegacyId ? { parentLegacyId } : {}),
  };
}
export function startCareer(world: World, generation: number, parentLegacyId?: string): World {
  const seed = `${world.seed}:career`;
  const draft = draftFor(generation, parentLegacyId);
  const club = trialOffers(world, draft.nationalityId, `${seed}:${generation}`)[0]!;
  return createCareer(world, draft, club.id, seed);
}

/**
 * One week of a player's decisions before the world moves on. Every action goes through the
 * same engine entry points as the UI; each is counted, and the last one is remembered for a
 * failure report.
 */
export interface PolicyState {
  requestedLoan: boolean;
  requestedTransfer: boolean;
  moved: boolean;
}
export const freshPolicy = (): PolicyState => ({
  requestedLoan: false,
  requestedTransfer: false,
  moved: false,
});
export function decide(input: World, state: PolicyState, note: (action: string) => void): World {
  let world = input;
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const age = world.date.season - player.birthSeason;
  if (career.injury && career.injury.recovery === null) {
    // Alternate the two recovery plans across injuries, so both paths run.
    const plan = career.injury.id.charCodeAt(career.injury.id.length - 1) % 2 ? 'rush' : 'rehab';
    world = chooseRecovery(world, plan);
    note(`recovery-${plan}`);
  }
  for (const item of world.media.filter((entry) => entry.choices.length && entry.answer === null)) {
    world = applySocialAction(world, {
      type: 'answer',
      mediaId: item.id,
      choiceId: item.choices[0]!.id,
    });
    note('press');
  }
  const window = windowState(world).open && world.phase === 'active';
  const club = world.clubs[world.players[career.playerId]!.clubId!]!;
  for (const { id } of openOffers(world)) {
    // Accepting one offer closes the others: act only on offers still open now.
    const offer = world.offers.find((entry) => entry.id === id)!;
    if (offer.status !== 'terms' || compareDates(offer.expires, world.date) < 0) continue;
    const suitor = world.clubs[offer.clubId];
    const better = Boolean(suitor && suitor.reputation > club.reputation);
    const needsWindow = offer.kind === 'transfer' || offer.kind === 'loan';
    if (needsWindow && !window) continue;
    const accept =
      offer.kind === 'renewal' ||
      (offer.kind === 'loan' && state.requestedLoan) ||
      ((offer.kind === 'transfer' || offer.kind === 'pre-contract') && better);
    world = applyMarketAction(world, {
      type: accept ? 'accept' : 'decline',
      offerId: offer.id,
    }).world;
    note(`${accept ? 'accept' : 'decline'}-${offer.kind}`);
    if (accept && offer.kind !== 'renewal') state.moved = true;
  }
  if (window && !state.requestedLoan && !activeLoanOf(world) && canRequestLoan(world)) {
    world = applyMarketAction(world, { type: 'loan-request' }).world;
    state.requestedLoan = true;
    note('loan-request');
  }
  if (window && !state.requestedTransfer && !state.moved && age >= 21) {
    const result = applyMarketAction(world, { type: 'transfer-request' });
    world = result.world;
    state.requestedTransfer = true;
    note(`transfer-request-${result.result}`);
  }
  // Spend points the way a player might: the cheapest useful attribute, then any skill.
  for (let guard = 0; guard < 50 && world.career!.attributePoints > 0; guard++) {
    const target = world.players[world.career!.playerId]!;
    const options = trainableAttributes(target)
      .map((key) => ({ key, cost: attributeCost(world, key) }))
      .filter(
        (entry): entry is { key: (typeof entry)['key']; cost: number } =>
          entry.cost !== null && entry.cost <= world.career!.attributePoints,
      )
      .sort((a, b) => a.cost - b.cost || (a.key < b.key ? -1 : 1));
    if (!options.length) break;
    world = raiseAttribute(world, options[0]!.key);
    note('attribute');
  }
  const skill = SKILLS.find((entry) => skillState(world, entry.id) === 'available');
  if (skill) {
    world = unlockSkill(world, skill.id);
    note('skill');
  }
  return world;
}
const activeLoanOf = (world: World) =>
  world.loans.find((loan) => loan.playerId === world.career?.playerId);

const megabytes = (bytes: number) => Math.round(bytes / 1e6);

export function runSoak(options: SoakOptions, log: (line: string) => void = () => {}): SoakResult {
  const result: SoakResult = { seed: options.seed, seasons: [], retirements: 0, failure: null };
  let world = generateWorld(options.seed);
  let generation = 0;
  let lastAction = 'generate';
  world = startCareer(world, generation);
  lastAction = 'create-career';
  let state = freshPolicy();
  try {
    for (;;) {
      const historyBefore = world.history.length;
      const actions: Record<string, number> = {};
      const events: string[] = [];
      const note = (action: string) => {
        actions[action] = (actions[action] ?? 0) + 1;
        lastAction = `${action} (season ${world.date.season}, week ${world.date.week})`;
      };
      const started = performance.now();
      let weeks = 0;
      let heap = 0;
      let rss = 0;
      while (world.phase === 'active') {
        if (world.career) world = decide(world, state, note);
        world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
        lastAction = `week ${world.date.week - 1} of ${world.date.season}`;
        weeks++;
        const memory = process.memoryUsage();
        heap = Math.max(heap, memory.heapUsed);
        rss = Math.max(rss, memory.rss);
        if (world.career?.injury && world.career.injury.started.week === world.date.week - 1)
          events.push(`injured week ${world.date.week - 1}: ${world.career.injury.kind}`);
      }
      const simulateMs = performance.now() - started;

      const problems = careerInvariants(world, { historyBefore });
      if (problems.length) throw new SoakFailure(`invariants: ${problems.join('; ')}`);

      // Export and import the season, as a player's backup would, and continue from the
      // imported world so every later season starts from a round trip.
      const exportStarted = performance.now();
      const json = JSON.stringify(
        createSave(1, 'Soak', {
          kind: 'world',
          world,
          gallery: { seed: options.seed, generation: 0 },
          settings: DEFAULT_SETTINGS,
        }),
      );
      const exportMs = performance.now() - exportStarted;
      const exportBytes = Buffer.byteLength(json, 'utf8');
      if (exportBytes > CONFIG.saves.maxFileBytes)
        throw new SoakFailure(
          `export of ${exportBytes} bytes exceeds the ${CONFIG.saves.maxFileBytes}-byte import limit`,
        );
      const importStarted = performance.now();
      const parsed = parseSave(json);
      const importMs = performance.now() - importStarted;
      if (parsed.payload.kind !== 'world') throw new SoakFailure('import lost the world');
      const imported = parsed.payload.world;
      const hash = createHash('sha256').update(JSON.stringify(imported)).digest('hex');
      if (JSON.stringify(imported) !== JSON.stringify(world))
        throw new SoakFailure('the imported world differs from the exported one');
      world = imported;

      const player = world.career ? world.players[world.career.playerId] : undefined;
      const age = player ? world.date.season - player.birthSeason : null;
      const report: SeasonReport = {
        generation,
        season: world.date.season,
        age,
        clubId: player?.clubId ?? null,
        weeks,
        simulateMs: Math.round(simulateMs),
        exportMs: Math.round(exportMs),
        importMs: Math.round(importMs),
        exportBytes,
        heapMB: megabytes(heap),
        rssMB: megabytes(rss),
        hash,
        actions,
        events,
      };
      result.seasons.push(report);
      log(
        `season ${report.season} · generation ${generation + 1} · age ${age ?? '-'} · ${weeks} weeks in ${(simulateMs / 1000).toFixed(1)} s · export ${(exportBytes / 2 ** 20).toFixed(1)} MiB (${report.exportMs} ms) · import ${report.importMs} ms · heap ${report.heapMB} MB`,
      );

      if (options.seasons && result.seasons.length >= options.seasons) break;
      // Retire naturally: at the first season end the rules allow from the policy's age, or
      // when forced. The next generation starts as the retired player's child.
      let retired: string | null = null;
      if (world.career && age !== null) {
        const rule = retirementState(world);
        if (rule === 'forced' || (rule === 'available' && age >= RETIRE_AGE)) {
          world = applyHonoursAction(world, { type: 'retire' });
          lastAction = `retire at ${age}`;
          result.retirements++;
          retired = world.legacies.at(-1)!.id;
          log(`retired at ${age}: ${retired}`);
        }
      }
      if (options.generations && result.retirements >= options.generations) break;
      world = startNextSeason(world, { inPlace: true });
      lastAction = `start season ${world.date.season}`;
      if (!world.career) {
        // A forced retirement at rollover leaves no career either.
        const parent = retired ?? world.legacies.at(-1)?.id;
        if (!retired && parent) result.retirements++;
        if (options.generations && result.retirements >= options.generations) break;
        generation++;
        world = startCareer(world, generation, parent);
        state = freshPolicy();
        lastAction = `child career for ${parent}`;
        const problems = careerInvariants(world);
        if (problems.length) throw new SoakFailure(`invariants after a new career: ${problems}`);
      }
    }
  } catch (error) {
    result.failure = {
      message: error instanceof Error ? error.message : String(error),
      season: world.date.season,
      week: world.date.week,
      lastAction,
    };
  }
  return result;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const seed = argument('seed') ?? 'endurance';
  const seasons = argument('seasons') ? Number(argument('seasons')) : undefined;
  const generations = argument('generations') ? Number(argument('generations')) : undefined;
  if (!seasons && !generations) throw new Error('Pass --seasons N or --generations N');
  const repeat = process.argv.includes('--repeat');
  const mode = generations ? `generations-${generations}` : `seasons-${seasons}`;
  const log = (line: string) => console.log(line);
  console.log(`Soak ${mode} · seed ${seed}${repeat ? ' · repeated' : ''}`);
  const first = runSoak({ seed, seasons, generations }, log);
  let reproducible: boolean | null = null;
  if (repeat && !first.failure) {
    console.log('Repeating the same seed…');
    const second = runSoak({ seed, seasons, generations });
    reproducible =
      !second.failure &&
      second.seasons.length === first.seasons.length &&
      second.seasons.every((season, index) => season.hash === first.seasons[index]!.hash);
  }
  const peak = (key: 'exportBytes' | 'heapMB' | 'rssMB') =>
    Math.max(0, ...first.seasons.map((season) => season[key]));
  const report = {
    ...first,
    mode,
    reproducible,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    limitBytes: CONFIG.saves.maxFileBytes,
    peakExportBytes: peak('exportBytes'),
    peakHeapMB: peak('heapMB'),
    peakRssMB: peak('rssMB'),
  };
  await mkdir('artifacts/soak', { recursive: true });
  const path = `artifacts/soak/${mode}-${seed}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(`Report: ${path}`);
  if (first.failure) {
    console.error(
      `FAILED at season ${first.failure.season}, week ${first.failure.week} after ${first.failure.lastAction}: ${first.failure.message}`,
    );
    process.exitCode = 1;
  } else if (reproducible === false) {
    console.error('FAILED: the repeated run produced a different world');
    process.exitCode = 1;
  } else if (generations && first.retirements < generations) {
    console.error(`FAILED: ${first.retirements} of ${generations} careers retired`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/soak-career.ts')) await main();
