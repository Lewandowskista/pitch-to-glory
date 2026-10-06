import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
for (const route of [
  'Menu',
  'Gallery',
  'Saves',
  'Settings',
  'World',
  'Match',
  'career/CareerNew',
  'career/CareerHub',
  'career/CareerProfile',
  'career/CareerSkills',
  'career/CareerTraining',
  'career/CareerTransfers',
  'career/CareerAgent',
  'career/CareerInbox',
  'career/CareerClub',
  'career/CareerMedia',
  'career/CareerRival',
]) {
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
}
console.log(`Entry output: ${(statSync(`dist/${entry.file}`).size / 1024).toFixed(1)} KB.`);
