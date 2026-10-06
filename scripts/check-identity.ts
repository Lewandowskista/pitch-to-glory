// Validates a country identity data file against the national profiles.
// Usage: npx tsx scripts/check-identity.ts england
import { NATIONAL_PROFILES } from '../src/engine/world/profiles';
import type { CountryIdentity } from '../src/engine/world/identities/types';

const file = process.argv[2];
if (!file) throw new Error('Usage: npx tsx scripts/check-identity.ts <country>');
const module = (await import(`../src/engine/world/identities/${file}.ts`)) as Record<
  string,
  CountryIdentity
>;
const identity = Object.values(module).find((value) => value && typeof value === 'object')!;
const profile = NATIONAL_PROFILES.find((p) => p.counterpart === identity.counterpart)!;
const problems: string[] = [];
const fail = (message: string) => problems.push(message);
const frontier = profile.divisions.at(-1)!;
const regions = frontier.groups.map((g) => g.region);
const hex = /^#[0-9a-f]{6}$/;
const patterns = [
  'solid',
  'stripes',
  'hoops',
  'halves',
  'sash',
  'chevron',
  'pinstripe',
  'gradient',
];
const names = new Set<string>();
const cities = new Set<string>();
for (const division of profile.divisions) {
  const display = identity.divisions[division.tier];
  if (!display?.name || !display.reference) fail(`tier ${division.tier}: missing division name`);
  if (division.groups.length > 1 && display?.groups?.length !== division.groups.length)
    fail(`tier ${division.tier}: needs ${division.groups.length} group names`);
  const clubs = identity.clubs[division.tier];
  if (clubs) {
    const size = division.groups.reduce((n, g) => n + g.size, 0);
    if (clubs.length !== size)
      fail(`tier ${division.tier}: ${clubs.length} clubs, expected ${size}`);
    for (const club of clubs) {
      if (names.has(club.name)) fail(`duplicate club name ${club.name}`);
      names.add(club.name);
      cities.add(club.city);
      if (!regions.includes(club.region))
        fail(`${club.name}: region ${club.region} not in ${regions}`);
      if (!club.colours.every((c) => hex.test(c))) fail(`${club.name}: colours must be #rrggbb`);
      if (!patterns.includes(club.pattern)) fail(`${club.name}: unknown pattern ${club.pattern}`);
      if (!(club.stature >= 1 && club.stature <= 10)) fail(`${club.name}: stature 1–10`);
      if (!(club.capacity > 500 && club.capacity < 120000)) fail(`${club.name}: capacity`);
      if (Math.abs(club.lat) > 90 || Math.abs(club.lon) > 180) fail(`${club.name}: coordinates`);
      if (club.name.length > 34) fail(`${club.name}: name too long`);
      if (club.name.toLowerCase() === club.reference.toLowerCase()) fail(`${club.name}: real name`);
      if (club.stadium.length > 40) fail(`${club.name}: stadium name too long`);
    }
  } else {
    const groups = identity.groupRegions[division.tier];
    if (!groups || groups.length !== division.groups.length)
      fail(`tier ${division.tier}: groupRegions needs ${division.groups.length} entries`);
    groups?.forEach((list) =>
      list.forEach(
        (r) => !regions.includes(r) && fail(`tier ${division.tier}: unknown region ${r}`),
      ),
    );
  }
}
for (const tier of Object.keys(identity.clubs))
  for (const club of identity.clubs[Number(tier)]!)
    if (club.reserveOf && !names.has(club.reserveOf))
      fail(`${club.name}: reserveOf ${club.reserveOf} not found`);
const towns = new Set<string>();
for (const region of regions) {
  const list = identity.towns[region];
  if (!list?.length) {
    fail(`region ${region}: no towns`);
    continue;
  }
  for (const town of list) {
    if (towns.has(town.name)) fail(`town ${town.name} listed twice`);
    if (cities.has(town.name)) fail(`town ${town.name} is a referenced club's city`);
    towns.add(town.name);
    if (Math.abs(town.lat) > 90 || Math.abs(town.lon) > 180) fail(`town ${town.name}: coordinates`);
  }
}
// Every generated club needs a town: count required clubs per region (spread evenly).
const need = new Map<string, number>(regions.map((r) => [r, 0]));
for (const division of profile.divisions) {
  if (identity.clubs[division.tier]) continue;
  division.groups.forEach((group, index) => {
    const sources = identity.groupRegions[division.tier]?.[index] ?? [];
    for (const r of sources)
      need.set(r, (need.get(r) ?? 0) + group.size / Math.max(1, sources.length));
  });
}
for (const [region, count] of need) {
  const available = identity.towns[region]?.length ?? 0;
  const wanted = Math.ceil(count * 1.4);
  if (available < wanted) fail(`region ${region}: ${available} towns, want at least ${wanted}`);
}
if (!identity.cup?.name) fail('missing domestic cup name');
if (problems.length) {
  console.log(`${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `${identity.name}: ok — ${names.size} referenced clubs, ${towns.size} towns, regions ${regions.join(', ')}`,
);
