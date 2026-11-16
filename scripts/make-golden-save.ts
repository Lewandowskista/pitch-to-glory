/**
 * Golden save fixtures (docs/RELEASE-1.0-PLAN.md step 2.2, tests/fixtures/saves/README.md).
 * Plays a seeded career with a release's own code and writes the file that release exports
 * (Settings → Export), brotli-compressed, then records it in the fixtures' manifest.
 *
 * The release's modules are imported from `--root`, so this script can live in a newer
 * checkout: export the release's tree (`git archive <commit> | tar -x -C <dir>`), give it a
 * `node_modules` (a symlink to this checkout's is enough; only the engine and the save schema
 * are loaded), and point `--root` at it. Run from a checkout of the release itself, `--root`
 * defaults to the working directory.
 *
 *   node --import tsx scripts/make-golden-save.ts --root <release tree> --commit <sha> \
 *     --out tests/fixtures/saves/v0.9.1-match.json.br --match 30
 *
 * Options: `--week <n>` stops at the career's first fixture on or after that week (default 21);
 * `--seasons <n>` plays that many whole seasons first (default 0); `--match <minute>` starts that
 * fixture and plays it with the headless policy to the minute, stopping at the next key moment
 * (omit it for a save between matches); `--format national|legacy`, `--seed`, `--position`
 * and `--archetype` shape the world and the career.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants } from 'node:zlib';

/** The fixtures' manifest: one entry per file, read by tests/golden-saves.test.ts. */
export interface GoldenSaveEntry {
  file: string;
  /** package.json version of the release that wrote the file. */
  release: string;
  commit: string;
  seed: string;
  format: 'national' | 'legacy';
  position: string;
  archetype: string;
  /** The day the file was made (the save's own createdAt is the exact time). */
  made: string;
  schemaVersion: number;
  world: { season: number; week: number; phase: string };
  /** The match in progress, or null for a save between matches. */
  match: { engine: string; minute: number; commands: number; momentPending: boolean } | null;
  /** SHA-256 of the uncompressed JSON. */
  sha256: string;
  bytes: number;
  command: string;
}
export interface GoldenSaveManifest {
  fixtures: GoldenSaveEntry[];
}

// The release's own modules, loosely typed: their shapes differ between releases.
interface Loose {
  [key: string]: unknown;
}
type Fn = (...args: unknown[]) => unknown;
interface WorldLike extends Loose {
  date: { season: number; week: number };
  phase: string;
  countries: Record<string, unknown>;
  fixtures: Record<string, unknown>;
}
interface SessionLike {
  engine: string;
  commands: unknown[];
  state: { match: { status: string; minute: number }; currentMoment?: unknown };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      out: { type: 'string' },
      commit: { type: 'string' },
      seed: { type: 'string' },
      format: { type: 'string', default: 'national' },
      week: { type: 'string', default: '21' },
      seasons: { type: 'string', default: '0' },
      match: { type: 'string' },
      position: { type: 'string', default: 'ST' },
      archetype: { type: 'string', default: 'finisher' },
    },
  });
  if (!values.out) throw new Error('--out <file.json.br> is required');
  const format = values.format === 'legacy' ? 'legacy' : 'national';
  const root = resolve(values.root ?? process.cwd());
  const out = resolve(values.out);
  const load = async (path: string): Promise<Record<string, Fn & Loose>> =>
    (await import(pathToFileURL(join(root, 'src', path)).href)) as Record<string, Fn & Loose>;
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version: string;
  };
  const seed = values.seed ?? `golden-${version}`;
  const { generateWorld } = await load('engine/world/generate.ts');
  const { createCareer, trialOffers } = await load('engine/career/create.ts');
  const { advanceCareerWeek } = await load('engine/career/season.ts');
  const { startNextSeason } = await load('engine/world/simulate.ts');
  const { careerMatchSetup, defaultTactics, autoPlayCommand } = await load(
    'engine/career/matches.ts',
  );
  const { createMatchSession, applyMatchCommand } = await load('engine/match/index.ts');
  const { createSave } = await load('persistence/schema.ts');
  const { DEFAULT_SETTINGS } = await load('persistence/settings.ts');
  const { CONFIG } = await load('engine/config.ts');

  const started = Date.now();
  const log = (message: string) =>
    console.log(`${version} ${message} (${Math.round((Date.now() - started) / 1000)} s)`);
  let world = generateWorld!(seed, format === 'legacy' ? { format: 'legacy' } : {}) as WorldLike;
  const nationalityId = Object.keys(world.countries).sort()[0]!;
  const club = (trialOffers!(world, nationalityId, seed) as { id: string }[])[0]!;
  world = createCareer!(
    world,
    {
      name: 'Jamie Golden',
      avatar: {
        face: 1,
        skin: 2,
        hair: 3,
        hairColor: 4,
        facialHair: 0,
        eyebrows: 1,
        eyes: 2,
        accessory: 3,
      },
      nationalityId,
      position: values.position,
      foot: 'right',
      age: 17,
      archetype: values.archetype,
    },
    club.id,
    seed,
  ) as WorldLike;
  log(`career at ${club.id}`);

  // Play whole weeks (and seasons) headless to the target week, then stop at the career's next
  // club fixture. An international window match on the way is played headless too.
  const season = world.date.season + Number(values.seasons);
  const week = Number(values.week);
  let fixture: unknown = null;
  for (let guard = 0; guard < 400 && !fixture; guard++) {
    if (world.phase === 'complete') {
      world = startNextSeason!(world, { inPlace: true }) as WorldLike;
      log(`season ${world.date.season}`);
      continue;
    }
    const ready = world.date.season === season && world.date.week >= week;
    const step = advanceCareerWeek!(world, { inPlace: true, autoPlay: !ready }) as {
      world: WorldLike;
      pendingFixtureId: string | null;
    };
    if (step.pendingFixtureId && world.fixtures[step.pendingFixtureId])
      fixture = world.fixtures[step.pendingFixtureId];
    else if (step.pendingFixtureId)
      world = (advanceCareerWeek!(world, { inPlace: true, autoPlay: true }) as typeof step).world;
    else world = step.world;
  }
  if (!fixture) throw new Error('No career fixture reached');
  log(`stopped at ${world.date.season} week ${world.date.week}`);

  let session: SessionLike | null = null;
  if (values.match !== undefined) {
    const minute = Number(values.match);
    const setup = careerMatchSetup!(world, fixture);
    session = createMatchSession!(setup, defaultTactics!(world, setup)) as SessionLike;
    while (
      session.state.match.status !== 'finished' &&
      !(
        session.state.match.minute >= minute &&
        (session.state.currentMoment || session.state.match.minute >= minute + 15)
      )
    )
      session = applyMatchCommand!(session, autoPlayCommand!(session)) as SessionLike;
    if (session.state.match.status === 'finished') throw new Error('The match ended first');
    log(`match at minute ${session.state.match.minute}, ${session.commands.length} commands`);
  }

  const save = createSave!(1, `Golden ${version}`, {
    kind: 'world',
    world,
    ...(session ? { matchSession: session } : {}),
    gallery: { seed, generation: 0 },
    settings: DEFAULT_SETTINGS,
  }) as Loose & { recovery?: string; schemaVersion: number };
  if (save.recovery) throw new Error(`The release discarded its own save: ${save.recovery}`);
  // Exactly what the release's export writes: the save without its load-time recovery flag.
  const { recovery: _recovery, ...file } = save;
  void _recovery;
  const json = JSON.stringify(file);
  const raw = Buffer.from(json, 'utf8');
  const compressed = brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_LGWIN]: constants.BROTLI_MAX_WINDOW_BITS,
      [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  writeFileSync(out, compressed);
  log(`wrote ${basename(out)}: ${raw.length} bytes, ${compressed.length} compressed`);

  const configured = (CONFIG as unknown as { saves: { schemaVersion: number } }).saves
    .schemaVersion;
  const entry: GoldenSaveEntry = {
    file: basename(out),
    release: version,
    commit: values.commit ?? 'unknown',
    seed,
    format,
    position: values.position!,
    archetype: values.archetype!,
    made: new Date().toISOString().slice(0, 10),
    schemaVersion: configured,
    world: { season: world.date.season, week: world.date.week, phase: world.phase },
    match: session
      ? {
          engine: session.engine,
          minute: session.state.match.minute,
          commands: session.commands.length,
          momentPending: Boolean(session.state.currentMoment),
        }
      : null,
    sha256: createHash('sha256').update(raw).digest('hex'),
    bytes: compressed.length,
    command: [
      'node --import tsx scripts/make-golden-save.ts',
      `--root <v${version} tree> --commit ${values.commit ?? 'unknown'}`,
      `--out ${relative(process.cwd(), out)}`,
      ...(format === 'legacy' ? ['--format legacy'] : []),
      ...(values.seed ? [`--seed ${seed}`] : []),
      `--week ${week}`,
      ...(values.seasons !== '0' ? [`--seasons ${values.seasons}`] : []),
      ...(values.match !== undefined ? [`--match ${values.match}`] : []),
      `--position ${values.position} --archetype ${values.archetype}`,
    ].join(' '),
  };
  const manifestPath = join(dirname(out), 'manifest.json');
  const manifest: GoldenSaveManifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as GoldenSaveManifest)
    : { fixtures: [] };
  manifest.fixtures = [...manifest.fixtures.filter((item) => item.file !== entry.file), entry];
  manifest.fixtures.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`recorded in ${relative(process.cwd(), manifestPath)}`);
}

await main();
