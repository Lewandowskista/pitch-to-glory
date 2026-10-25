import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
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
 * The 1.0 budget (docs/RELEASE-1.0-PLAN.md, Phase 3): shell + route at most 280 KB gzip. REPORTED
 * until phase 3 (with step 2.8's headroom) meets it and sets `asserted`; the 300 KB limit above
 * stays asserted.
 */
const BUDGET_1_0 = { kilobytes: 280, asserted: false, phase: 3 };
const overBudget = [];
let routes = 0;
for (const route of [
  'Menu',
  'Gallery',
  'Saves',
  'Settings',
  'World',
  'EditMode',
  'Match',
  'MatchBody',
  'career/CareerNew',
  'career/CareerHub',
  'career/CareerProfile',
  'career/CareerSkills',
  'career/CareerTraining',
  'career/CareerTransfers',
  'career/CareerAgent',
  'career/CareerInbox',
  'career/CareerCalendar',
  'career/CareerClub',
  'career/CareerMedia',
  'career/CareerRival',
  'career/CareerLifestyle',
  'career/CareerWardrobe',
  'career/CareerNational',
  'career/CareerTrophies',
  'career/CareerChronicle',
  'career/CareerMoments',
  'career/CareerLegacy',
  'MomentViewer',
  'WhatsNew',
  'Privacy',
]) {
  routes++;
  const visited = new Set();
  let bytes = 0;
  function visit(chunk) {
    if (!chunk || visited.has(chunk.file)) return;
    visited.add(chunk.file);
    bytes += gzipSync(readFileSync(`dist/${chunk.file}`)).length;
    for (const key of chunk.imports ?? []) visit(manifest[key]);
  }
  visit(entry);
  const routeChunk =
    manifest[`src/screens/${route}.tsx`] ??
    Object.values(manifest).find((chunk) => chunk.isDynamicEntry && chunk.name === route);
  if (!routeChunk) throw new Error(`Missing route chunk in build manifest: ${route}`);
  visit(routeChunk);
  if ([...visited].some((file) => /pitchScene|WebGLRenderer|WebGPURenderer/.test(file)))
    throw new Error(`${route} eagerly loads the match renderer`);
  if (bytes > 300 * 1024)
    throw new Error(`${route} initial JavaScript exceeds 300 KB gzip: ${bytes}`);
  console.log(
    `${route} initial JavaScript (shell + route): ${(bytes / 1024).toFixed(1)} KB gzip (budget: 300 KB).`,
  );
  if (bytes > BUDGET_1_0.kilobytes * 1024) overBudget.push(`${route} ${(bytes / 1024).toFixed(1)}`);
}
const budgetLine = `1.0 budget: shell + route ≤ ${BUDGET_1_0.kilobytes} KB gzip — ${
  overBudget.length
    ? `${overBudget.length} of ${routes} routes over (${overBudget.join(', ')} KB)`
    : 'met'
}`;
if (BUDGET_1_0.asserted && overBudget.length) throw new Error(budgetLine);
console.log(`${budgetLine} (reported, asserted from phase ${BUDGET_1_0.phase}).`);
console.log(`Entry output: ${(statSync(`dist/${entry.file}`).size / 1024).toFixed(1)} KB.`);
