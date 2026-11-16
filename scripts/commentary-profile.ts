/**
 * Commentary repetition (release 1.0, step 5.5; review finding M8). Plays seasons of matches
 * headlessly and builds each match's live feed as the match screen does (summary rows for
 * routine passes, goal lines, narration), then counts its sentences by template: the same line
 * with other names is the same sentence.
 *
 *   npm run profile:commentary                    46 matches for each of five positions
 *   npm run profile:commentary -- --engine match-21   the previous engine's keys
 *   npm run profile:commentary -- --check         fail above the targets below
 *
 * Targets: no sentence more than about three times in a match, and the most common feed sentence
 * under about 40 times in a 46-match season.
 */
import type { Position } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  MATCH_ENGINE_VERSION,
  PREVIOUS_MATCH_ENGINE,
} from '../src/engine/match';
import { autoPlayCommand } from '../src/engine/career/matches';
import { buildFeed } from '../src/screens/match/feed';
import { feedLines } from '../src/screens/match/lines';

const POSITIONS: Position[] = ['ST', 'RW', 'CM', 'CB', 'GK'];
const SEASON = 46;
/** The targets (`--check`): repetitions of one sentence in a match and in a season. */
const TARGETS = { match: 3, season: 40 };

const args = process.argv.slice(2);
const engine = args.includes('--engine')
  ? args[args.indexOf('--engine') + 1]
  : MATCH_ENGINE_VERSION;
if (engine !== MATCH_ENGINE_VERSION && engine !== PREVIOUS_MATCH_ENGINE)
  throw new Error(`Unknown engine ${engine}`);

const world = generateWorld('commentary-profile', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const matches: { rows: number; distinct: number; max: number; top: string }[] = [];
const seasons: { position: Position; template: string; count: number }[] = [];
const totals = new Map<string, number>();
const add = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

for (const position of POSITIONS) {
  const season = new Map<string, number>();
  for (let index = 0; index < SEASON; index++) {
    const [home, away] = index % 2 ? [clubs[1]!, clubs[0]!] : [clubs[0]!, clubs[1]!];
    const club = index % 2 ? clubs[1]! : clubs[0]!;
    const ids = club.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
    const setup = createMatchSetup(
      world,
      home.id,
      away.id,
      ids[index % ids.length]!,
      `cp:${position}:${index}`,
    );
    if (engine === PREVIOUS_MATCH_ENGINE) delete setup.rules22;
    let session = createMatchSession(setup, tactics);
    while (session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    const lines = feedLines(session);
    const rows = buildFeed(
      session.state.match.events,
      lines.text,
      () => undefined,
      session.state.narration.map((line, order) => ({
        id: String(order),
        minute: line.minute,
        text: line.key,
        template: line.key,
        ...(line.eventId ? { eventId: line.eventId } : {}),
      })),
      { spell: lines.spell },
    );
    const counts = new Map<string, number>();
    for (const row of rows) {
      const template = row.template ?? row.text;
      add(counts, template);
      add(season, template);
      add(totals, template);
    }
    const [top, max] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    matches.push({ rows: rows.length, distinct: counts.size, max, top });
  }
  const [template, count] = [...season].sort((a, b) => b[1] - a[1])[0]!;
  seasons.push({ position, template, count });
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const worstMatch = Math.max(...matches.map((m) => m.max));
const worstSeason = Math.max(...seasons.map((s) => s.count));
console.log(`Commentary on ${engine}: ${matches.length} matches, ${POSITIONS.join(', ')}`);
console.log(`  feed rows a match            ${mean(matches.map((m) => m.rows)).toFixed(1)}`);
console.log(`  distinct sentences a match   ${mean(matches.map((m) => m.distinct)).toFixed(1)}`);
console.log(
  `  most repeated sentence       ${mean(matches.map((m) => m.max)).toFixed(2)} a match on average, ${worstMatch} at most`,
);
const over = matches.filter((m) => m.max > TARGETS.match).map((m) => `${m.top} (${m.max})`);
if (over.length)
  console.log(
    `  above ${TARGETS.match} in a match: ${over.length}, e.g. ${over.slice(0, 5).join(', ')}`,
  );
console.log('  most common sentence of a season (46 matches):');
for (const s of seasons)
  console.log(`    ${s.position.padEnd(3)} ${String(s.count).padStart(4)}  ${s.template}`);
console.log('  most common sentences overall, a match:');
for (const [template, count] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log(`    ${(count / matches.length).toFixed(2)}  ${template}`);

const families = new Map<string, number>();
for (const [template, count] of totals)
  families.set(
    template.replace(/\.\d+$/, ''),
    (families.get(template.replace(/\.\d+$/, '')) ?? 0) + count,
  );
console.log('  most common families, a match:');
for (const [family, count] of [...families].sort((a, b) => b[1] - a[1]).slice(0, 15))
  console.log(`    ${(count / matches.length).toFixed(2)}  ${family}`);

if (args.includes('--check')) {
  const failures = [
    ...(worstMatch > TARGETS.match ? [`a sentence ${worstMatch} times in a match`] : []),
    ...(worstSeason >= TARGETS.season ? [`a sentence ${worstSeason} times in a season`] : []),
  ];
  if (failures.length) {
    console.error(`Commentary targets missed: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('Commentary targets met.');
}
