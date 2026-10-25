import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
/**
 * Bundle budgets (AGENTS.md §3; docs/ARCHITECTURE.md, "Bundle budget"). For every route:
 *
 * - static: the shell (entry) and the route chunk with their static imports, the code the
 *   browser must have before the route can render at all. Hard budget 300 KB gzip, warning
 *   from 285 KB.
 * - usable: static plus the dynamic imports the shell and the route request during their first
 *   render and initial effects, for a returning player opening the address with a save
 *   (`FIRST_RENDER` below), each with its own static imports. This is what a cold load really
 *   fetches on the main thread before the route is usable. Same budget and warning. The match
 *   renderer (Pixi) is not part of it: the pitch requests it once the match screen is up (and
 *   draws its SVG pitch where WebGL is missing).
 * - workers: the worker bundles a usable route starts (the persistence worker, once a save is
 *   read), reported beside the main-thread figure and not budgeted.
 *
 * The declared first-render imports are checked against the build: each must be a dynamic
 * import of code already in the route's set, so a refactor that stops requesting one (or
 * renames it) fails here until the list is updated. Cold loads measured in Chromium confirm
 * the method: the hub's 66 files match its usable set exactly (docs/ARCHITECTURE.md).
 * `--list <route>` prints a route's usable files.
 */
const BUDGET = 300 * 1024;
const WARNING = 285 * 1024;
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
const gzip = new Map();
const gzipped = (file) => {
  if (!gzip.has(file)) gzip.set(file, gzipSync(readFileSync(`dist/${file}`)).length);
  return gzip.get(file);
};
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// The patch notes load only with the What's new screen; the shell knows just the version.
const notesMarker = /summary:\s*'([^']{20,})'/.exec(
  readFileSync('src/i18n/patchNotes.ts', 'utf8').replace(/\s*\r?\n\s*/g, ' '),
)?.[1];
if (!notesMarker) throw new Error('Could not read a summary from src/i18n/patchNotes.ts');
/** The files a chunk loads up front: itself and its static imports. */
function staticFiles(chunk, seen = new Set()) {
  if (!chunk || seen.has(chunk.file)) return seen;
  seen.add(chunk.file);
  for (const key of chunk.imports ?? []) staticFiles(manifest[key], seen);
  return seen;
}
const withNotes = (files) =>
  [...files].filter((file) => readFileSync(`dist/${file}`, 'utf8').includes(notesMarker));
const shellNotes = withNotes(staticFiles(entry));
if (shellNotes.length) throw new Error(`The app shell bundles the patch notes (${shellNotes})`);
if (!withNotes(staticFiles(manifest['src/screens/WhatsNew.tsx'])).length)
  throw new Error('The What’s new screen does not carry the patch notes');

/**
 * Dynamic imports requested during the first render and initial effects, as manifest keys (or
 * the end of one, for packages). The shell's apply to every route: Framer Motion's features
 * (LazyMotion) and the service worker registration (workbox-window).
 */
const SHELL = ['src/ui/motionFeatures.ts', '/workbox-window.prod.es5.mjs'];
/** The save system's main-thread half: any route that reads a save on arrival requests it. */
const SAVES = 'src/persistence/api.ts';
/** The career shell's portrait (ShellPortrait), drawn once a career is loaded. */
const PORTRAIT = 'src/engine/assets/avatar.ts';
const CAREER = [SAVES, PORTRAIT];
const FIRST_RENDER = {
  Menu: [SAVES], // a returning player's career card
  Gallery: [],
  Saves: ['src/screens/SavesContent.tsx', SAVES],
  Settings: [],
  World: [SAVES],
  EditMode: [SAVES],
  Match: [], // no world and no save: the page only points to the World screen
  MatchBody: [SAVES, PORTRAIT, 'src/screens/match/Pitch.tsx'],
  'career/CareerNew': [SAVES],
  'career/CareerHub': [
    ...CAREER,
    'src/screens/career/HubBody.tsx',
    'src/screens/career/ambitionsUi.tsx',
  ],
  'career/CareerProfile': CAREER,
  'career/CareerSkills': CAREER,
  'career/CareerTraining': CAREER,
  'career/CareerTransfers': CAREER,
  'career/CareerAgent': CAREER,
  'career/CareerInbox': CAREER,
  'career/CareerCalendar': CAREER,
  'career/CareerClub': CAREER,
  'career/CareerMedia': CAREER,
  'career/CareerRival': CAREER,
  'career/CareerLifestyle': CAREER,
  'career/CareerWardrobe': CAREER,
  'career/CareerNational': CAREER,
  'career/CareerPreseason': CAREER,
  'career/CareerTrophies': CAREER,
  'career/CareerChronicle': CAREER,
  'career/CareerMoments': CAREER,
  'career/CareerLegacy': CAREER,
  MomentViewer: [],
  WhatsNew: [],
  Privacy: [],
};
/** Workers a usable route starts: the persistence worker reads the save. */
const STARTED_WORKERS = /persistence\.worker-[\w-]+\.js/g;
/** The match renderer, which must stay out of every route's static and usable sets. */
const RENDERER = /pitchScene|WebGLRenderer|WebGPURenderer|CanvasRenderer/;

/**
 * Whether a manifest key is the declared module: its own chunk, or the shared chunk Rollup
 * named after it when the module sits in one (`_avatar-<hash>.js` for avatar.ts).
 */
const isModule = (key, name) =>
  name.startsWith('/')
    ? key.endsWith(name)
    : key === name ||
      (!manifest[key]?.src &&
        manifest[key]?.name === name.replace(/^.*\//, '').replace(/\..*$/, ''));
function measure(route) {
  const files = new Set();
  const keys = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || keys.has(key)) return;
    keys.add(key);
    files.add(chunk.file);
    for (const next of chunk.imports ?? []) visit(next);
  };
  visit(Object.keys(manifest).find((key) => manifest[key] === entry));
  const routeKey =
    Object.keys(manifest).find((key) => key === `src/screens/${route}.tsx`) ??
    Object.keys(manifest).find(
      (key) => manifest[key].isDynamicEntry && manifest[key].name === route,
    );
  if (!routeKey) throw new Error(`Missing route chunk in build manifest: ${route}`);
  visit(routeKey);
  const staticFiles = new Set(files);
  for (const name of [...SHELL, ...FIRST_RENDER[route]]) {
    const key = [...keys]
      .flatMap((owner) => manifest[owner].dynamicImports ?? [])
      .find((candidate) => isModule(candidate, name));
    if (!key)
      throw new Error(
        `${route}: ${name} is listed as a first-render import, but nothing the route loads requests it. Update FIRST_RENDER in scripts/check-bundle.mjs.`,
      );
    visit(key);
  }
  const sum = (set) => [...set].reduce((total, file) => total + gzipped(file), 0);
  const workers = new Set();
  for (const file of files)
    for (const match of readFileSync(`dist/${file}`, 'utf8').matchAll(STARTED_WORKERS))
      workers.add(`assets/${match[0]}`);
  for (const file of files)
    if (RENDERER.test(file))
      throw new Error(`${route} loads the match renderer before it is usable`);
  return {
    static: sum(staticFiles),
    usable: sum(files),
    files: files.size,
    workers: sum(workers),
    list: [...files].map((file) => [file, gzipped(file), staticFiles.has(file)]),
  };
}
/** `node scripts/check-bundle.mjs --list <route>`: the route's usable files, largest first. */
const listed = process.argv.indexOf('--list');
if (listed !== -1) {
  const route = process.argv[listed + 1];
  if (!(route in FIRST_RENDER)) throw new Error(`Unknown route: ${route}`);
  for (const [file, bytes, isStatic] of measure(route).list.sort((a, b) => b[1] - a[1]))
    console.log(kb(bytes).padStart(9), isStatic ? 'static ' : 'dynamic', file);
  process.exit(0);
}

// Every route the app loads (src/App.tsx) is budgeted.
for (const [, route] of readFileSync('src/App.tsx', 'utf8').matchAll(
  /import\('\.\/screens\/([\w/]+)'\)/g,
))
  if (!(route in FIRST_RENDER))
    throw new Error(`Route ${route} has no bundle budget: add it to FIRST_RENDER`);
const warnings = [];
for (const route of Object.keys(FIRST_RENDER)) {
  const result = measure(route);
  for (const [kind, bytes] of [
    ['static', result.static],
    ['usable', result.usable],
  ]) {
    if (bytes > BUDGET)
      throw new Error(`${route} ${kind} JavaScript exceeds 300 KB gzip: ${kb(bytes)}`);
    if (bytes > WARNING) warnings.push(`${route} ${kind} JavaScript is ${kb(bytes)} gzip`);
  }
  console.log(
    `${route}: static ${kb(result.static)}, usable ${kb(result.usable)} in ${result.files} files` +
      (result.workers ? ` (+ workers ${kb(result.workers)})` : '') +
      ' gzip (budget 300 KB, warning 285 KB).',
  );
}

// Dexie and the save validators belong to the persistence worker (docs/ARCHITECTURE.md).
const workerBundles = (file) => /\.worker-[\w-]+\.js$/.test(file);
const mainThread = readdirSync('dist/assets').filter(
  (file) => file.endsWith('.js') && !workerBundles(file),
);
const dexie = mainThread.filter((file) =>
  readFileSync(`dist/assets/${file}`, 'utf8').includes('MissingAPI'),
);
if (dexie.length) throw new Error(`Dexie is bundled on the main thread: ${dexie.join(', ')}`);
// The pitch uses Pixi's WebGL renderer alone; nothing else may be built or precached.
const renderers = mainThread.filter((file) => /WebGPURenderer|CanvasRenderer/.test(file));
if (renderers.length) throw new Error(`Unused Pixi renderers are built: ${renderers.join(', ')}`);
const precached = readFileSync('dist/sw.js', 'utf8');
for (const unused of ['browserAll', 'webworkerAll'])
  if (precached.includes(`assets/${unused}-`))
    throw new Error(`The service worker precaches Pixi's unused ${unused} bundle`);

for (const warning of warnings)
  console.warn(
    `${process.env.GITHUB_ACTIONS ? '::warning::' : 'Warning: '}${warning}, over the 285 KB warning threshold.`,
  );
console.log(
  `Entry output: ${kb(statSync(`dist/${entry.file}`).size)} (${kb(gzipped(entry.file))} gzip).`,
);
