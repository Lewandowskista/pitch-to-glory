/**
 * World drift gate (docs/RELEASE-1.0-PLAN.md step 2.3). Simulates a national world for many
 * seasons, with a headless career and its children (the soak policy) or without one, and
 * measures at every season end whether the world holds: the top of the talent distribution,
 * the age profile and national sides against season 1; how dominant champions are and how
 * hard survival is; club money; who the AI market buys; duplicate names in a squad; which line
 * wins the Golden Ball; and how fast the save grows against the validator's caps.
 *
 *   npm run drift -- --seed drift-a --seasons 25           with a career (about 20 minutes)
 *   npm run drift -- --seed drift-b --seasons 25 --no-career
 *   npm run drift -- --check                               report the targets over artifacts/drift
 *   npm run drift -- --check --assert-targets              fail on any target not met
 *
 * Every target is REPORTED (`asserted: false`) until the phase that meets it flips its flag:
 * the world targets in phase 8, the Golden Ball line share in phase 7. Save size and the validator
 * caps are asserted since phase 3 (retention, step 3.6).
 * Writes artifacts/drift/<seed>.json and a readable artifacts/drift/<seed>.txt.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Id, Position, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { rankStandings } from '../src/engine/world/ranking';
import { playerAbility } from '../src/engine/strength';
import { advanceCareerWeek } from '../src/engine/career/season';
import { applyHonoursAction } from '../src/engine/career/honours/actions';
import { liveHallOfFame, retirementState } from '../src/engine/career/honours/retirement';
import { selectSquad } from '../src/engine/career/honours/international';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { DETAILED_HISTORY_LIMIT, HISTORY_LIMIT } from '../src/persistence/worldValidation';
import { decide, freshPolicy, startCareer } from './soak-career';
import {
  assertAllTargets,
  evaluateTargets,
  median,
  printTargets,
  round,
  within,
  type Target,
  type TargetResult,
} from './targets';

const OUT_DIR = 'artifacts/drift';
/** The soak policy retires its careers from this age. */
const RETIRE_AGE = 33;
const AGE_BUCKETS = ['<18', '18-20', '21-23', '24-26', '27-29', '30-32', '33+'] as const;
type AgeBucket = (typeof AGE_BUCKETS)[number];
const LINE: Record<Position, 'GK' | 'DEF' | 'MID' | 'ATT'> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};
const XI_SLOTS = { GK: 1, DEF: 4, MID: 3, ATT: 3 } as const;

/**
 * The validator caps a long world grows towards (src/persistence/*Validation.ts and the
 * schemas). A save past any of them no longer loads.
 */
const H = CONFIG.career.honours;
const CAPS: { name: string; cap: number; count: (world: World) => number }[] = [
  { name: 'history', cap: HISTORY_LIMIT, count: (w) => w.history.length },
  {
    name: 'full seasons',
    cap: DETAILED_HISTORY_LIMIT,
    count: (w) => w.history.filter((summary) => !summary.compact).length,
  },
  {
    name: 'archived players',
    cap: 1_000_000,
    count: (w) => Object.keys(w.archive?.players ?? {}).length,
  },
  { name: 'awards', cap: H.awards.maxRecords, count: (w) => w.awards.length },
  { name: 'trophies', cap: 10000, count: (w) => w.trophies.length },
  { name: 'events', cap: 100000, count: (w) => w.events.length },
  { name: 'legacies', cap: H.legacyLimit, count: (w) => w.legacies.length },
  {
    name: 'chronicle',
    cap: H.chronicleLimit * (H.legacyLimit + 1),
    count: (w) => w.chronicle.length,
  },
  {
    name: 'moments',
    cap: H.moments.limit * (H.legacyLimit + 1),
    count: (w) => w.moments.length,
  },
  { name: 'relationships', cap: 500, count: (w) => w.relationships.length },
  { name: 'career moves', cap: 500, count: (w) => w.career?.market.moves.length ?? 0 },
  {
    name: 'rival seasons',
    cap: 100,
    count: (w) => Math.max(0, ...w.rivalries.map((rivalry) => rivalry.seasons.length)),
  },
  {
    name: "a player's trophies",
    cap: 1000,
    count: (w) => Math.max(0, ...Object.values(w.players).map((p) => p.stats.trophies.length)),
  },
  {
    name: "a legacy's awards",
    cap: 400,
    count: (w) => Math.max(0, ...w.legacies.map((legacy) => legacy.awardIds.length)),
  },
];

export interface DriftSeason {
  season: number;
  /** Seconds to simulate the season (Node, headless; the browser adds transport and saves). */
  seconds: number;
  career: { generation: number; age: number; club: string } | null;
  players: number;
  players85: number;
  players90: number;
  ages: Record<AgeBucket, number>;
  /** Senior XI mean ability by country name. */
  nations: Record<string, number>;
  /** Tier-1 leagues: champion and 17th place points a game, champion club, by country name. */
  tier1: Record<string, { champion: Id; championPpg: number; seventeenthPpg: number | null }>;
  clubs: number;
  medianBalance: number;
  debtClubs: number;
  /** Paid transfers this season (the career player's excluded), by line. */
  purchases: Record<'GK' | 'DEF' | 'MID' | 'ATT', number>;
  /** Players beyond the first of each name within a squad, over all squads. */
  duplicateNames: number;
  /** The Golden Ball winner's line, if one was awarded. */
  goldenBall: { line: string; position: Position; name: string } | null;
  saveBytes: number;
  caps: Record<string, number>;
  /**
   * The career's Hall of Fame standing at the season's end. Retention (step 3.6) must leave it
   * exactly as a run without retention has it: compare two runs of the same seed.
   */
  hallOfFame?: { score: number; rank: number; of: number } | null;
}
export interface DriftRun {
  seed: string;
  career: boolean;
  seasons: number;
  date: string;
  node: string;
  /** Before the first season. */
  start: { medianBalance: number; players: number };
  measures: DriftSeason[];
  caps: Record<string, number>;
  targets?: TargetResult[];
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const bucketOf = (age: number): AgeBucket =>
  age < 18
    ? '<18'
    : age < 21
      ? '18-20'
      : age < 24
        ? '21-23'
        : age < 27
          ? '24-26'
          : age < 30
            ? '27-29'
            : age < 33
              ? '30-32'
              : '33+';
const leagueClubs = (world: World) =>
  Object.values(world.clubs).filter((club) => world.leagues[club.leagueId]);

/** A country's senior XI mean ability: the selected squad's best by line, 1-4-3-3. */
function nationalRating(world: World, countryId: string): number {
  const squad = selectSquad(world, countryId, 'senior');
  const xi: number[] = [];
  for (const line of ['GK', 'DEF', 'MID', 'ATT'] as const)
    xi.push(
      ...squad
        .filter((player) => LINE[player.primaryPosition] === line)
        .slice(0, XI_SLOTS[line])
        .map(playerAbility),
    );
  return round(xi.reduce((sum, value) => sum + value, 0) / Math.max(1, xi.length), 1);
}

function saveBytes(world: World, seed: string): number {
  const json = JSON.stringify(
    createSave(1, 'Drift', {
      kind: 'world',
      world,
      gallery: { seed, generation: 0 },
      settings: DEFAULT_SETTINGS,
    }),
  );
  return Buffer.byteLength(json, 'utf8');
}

/** Measures at a season end, before the next season starts. */
function measure(
  world: World,
  seed: string,
  seconds: number,
  career: DriftSeason['career'],
): DriftSeason {
  const season = world.date.season;
  const active = Object.values(world.players).filter((player) => !player.retired);
  const abilities = active.map(playerAbility);
  const ages = Object.fromEntries(AGE_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    AgeBucket,
    number
  >;
  for (const player of active) ages[bucketOf(season - player.birthSeason)]++;
  const summary = world.history.at(-1);
  const tier1: DriftSeason['tier1'] = {};
  const nations: Record<string, number> = {};
  for (const country of Object.values(world.countries)) {
    nations[country.name] = nationalRating(world, country.id);
    const league = country.leagueIds
      .map((id) => world.leagues[id])
      .find((entry) => entry?.tier === 1);
    const rows = league && summary?.tables[league.id];
    if (!league || !rows?.length) continue;
    const table = rankStandings(world, rows);
    const ppg = (index: number) =>
      table[index] ? round(table[index]!.points / Math.max(1, table[index]!.played), 3) : null;
    tier1[country.name] = {
      champion: summary!.champions[league.id] ?? table[0]!.clubId,
      championPpg: ppg(0)!,
      seventeenthPpg: ppg(16),
    };
  }
  const clubs = leagueClubs(world);
  const purchases = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const event of world.events) {
    if (event.date.season !== season || event.kind !== 'transfer') continue;
    if (!(Number(event.params?.fee ?? 0) > 0)) continue;
    const id = event.entityIds[0]!;
    if (id === world.career?.playerId) continue;
    const position =
      world.players[id]?.primaryPosition ?? world.archive?.players[id]?.primaryPosition;
    if (position) purchases[LINE[position]]++;
  }
  let duplicateNames = 0;
  for (const club of clubs) {
    const names = new Set<string>();
    for (const id of club.playerIds) {
      const name = world.players[id]!.name;
      if (names.has(name)) duplicateNames++;
      names.add(name);
    }
  }
  const ball = world.awards.find(
    (award) => award.kind === 'golden-ball' && award.season === season,
  );
  const winner = ball?.winnerIds[0];
  const record = winner ? (world.players[winner] ?? world.archive?.players[winner]) : undefined;
  return {
    season,
    seconds,
    career,
    players: active.length,
    players85: abilities.filter((value) => value >= 85).length,
    players90: abilities.filter((value) => value >= 90).length,
    ages,
    nations,
    tier1,
    clubs: clubs.length,
    medianBalance: Math.round(median(clubs.map((club) => club.finances.balance))),
    debtClubs: clubs.filter((club) => club.finances.balance < 0).length,
    purchases,
    duplicateNames,
    goldenBall: record
      ? {
          line: LINE[record.primaryPosition],
          position: record.primaryPosition,
          name: record.name,
        }
      : null,
    saveBytes: saveBytes(world, seed),
    caps: Object.fromEntries(CAPS.map((entry) => [entry.name, entry.count(world)])),
    hallOfFame: world.career
      ? (({ score, rank, of }) => ({ score, rank, of }))(liveHallOfFame(world))
      : null,
  };
}

export function runDrift(
  seed: string,
  seasons: number,
  withCareer: boolean,
  log: (line: string) => void = () => {},
): DriftRun {
  let world = generateWorld(seed);
  const clubs = leagueClubs(world);
  const run: DriftRun = {
    seed,
    career: withCareer,
    seasons,
    date: new Date().toISOString(),
    node: process.version,
    start: {
      medianBalance: Math.round(median(clubs.map((club) => club.finances.balance))),
      players: Object.values(world.players).filter((p) => !p.retired).length,
    },
    measures: [],
    caps: Object.fromEntries(CAPS.map((entry) => [entry.name, entry.cap])),
  };
  let generation = 0;
  if (withCareer) world = startCareer(world, generation);
  let state = freshPolicy();
  for (let index = 0; index < seasons; index++) {
    const started = performance.now();
    while (world.phase === 'active') {
      if (world.career) {
        world = decide(world, state, () => {});
        world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
      } else world = simulateWeek(world, { inPlace: true, allowCareerFixture: true });
    }
    const seconds = Math.round((performance.now() - started) / 100) / 10;
    const player = world.career ? world.players[world.career.playerId] : undefined;
    const age = player ? world.date.season - player.birthSeason : null;
    const career =
      player && age !== null
        ? {
            generation,
            age,
            club: player.clubId ? (world.clubs[player.clubId]?.name ?? '') : '',
          }
        : null;
    const measures = measure(world, seed, seconds, career);
    run.measures.push(measures);
    log(
      `${measures.season} · ${seconds}s · 85+ ${measures.players85} 90+ ${measures.players90} · champions ${Object.values(
        measures.tier1,
      )
        .map((t) => t.championPpg.toFixed(2))
        .join(
          '/',
        )} ppg · balance ${(measures.medianBalance / 1e6).toFixed(1)}M (${measures.debtClubs} in debt) · keepers bought ${measures.purchases.GK} of ${Object.values(measures.purchases).reduce((a, b) => a + b, 0)} · duplicates ${measures.duplicateNames} · Golden Ball ${measures.goldenBall?.position ?? '-'} · save ${(measures.saveBytes / 2 ** 20).toFixed(1)} MiB${career ? ` · career ${career.generation + 1} age ${career.age}` : ''}${measures.hallOfFame ? ` · Hall of Fame ${measures.hallOfFame.score}, #${measures.hallOfFame.rank} of ${measures.hallOfFame.of}` : ''}`,
    );
    if (index === seasons - 1) break;
    if (world.career && age !== null) {
      const rule = retirementState(world);
      if (rule === 'forced' || (rule === 'available' && age >= RETIRE_AGE)) {
        world = applyHonoursAction(world, { type: 'retire' });
        const { score, rank, of } = world.legacies.at(-1)!.hallOfFame;
        log(`retired at ${age}: Hall of Fame ${score} points, #${rank} of ${of}`);
      }
    }
    world = startNextSeason(world, { inPlace: true });
    if (withCareer && !world.career) {
      generation++;
      world = startCareer(world, generation, world.legacies.at(-1)?.id);
      state = freshPolicy();
    }
  }
  return run;
}

/** The 1.0 bands, in one place (docs/RELEASE-1.0-PLAN.md step 2.3). */
export const TARGET_BANDS = {
  /** Talent, ages and national sides against season 1, either way. */
  drift: 0.25,
  championPpg: [2.1, 2.5],
  seventeenthPpg: [0.85, 1.1],
  /** Distinct tier-1 champions per country over 20 seasons. */
  distinctChampions: [3, 7],
  championWindow: 20,
  /** Median club balance at most this multiple of the start. */
  balanceMultiple: 2,
  keeperShare: 0.05,
  goldenBallLineShare: 0.5,
  /** Save growth a season after season 10, and the horizon no validator cap may be reached in. */
  growthBytes: 0.5 * 2 ** 20,
  growthFrom: 10,
  capHorizon: 200,
  /** Phase 3 budget: the save after 34 seasons (a career, a retirement and a child). */
  save34Bytes: 90 * 2 ** 20,
} as const;

const first = (run: DriftRun) => run.measures[0]!;
const last = (run: DriftRun) => run.measures.at(-1)!;
const drifted = (from: number, to: number) =>
  from === 0 ? (to === 0 ? 0 : Number.POSITIVE_INFINITY) : (to - from) / from;
const signed = (value: number) =>
  Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%` : '∞';
/** Per-season growth of a measure, from season `from` on (or the last five seasons). */
function growth(run: DriftRun, pick: (season: DriftSeason) => number): number {
  const measures = run.measures;
  if (measures.length < 2) return Number.NaN;
  const start = Math.min(
    Math.max(0, TARGET_BANDS.growthFrom - 1),
    Math.max(0, measures.length - 6),
  );
  const span = measures.length - 1 - start;
  return span > 0 ? (pick(measures.at(-1)!) - pick(measures[start]!)) / span : Number.NaN;
}
/** The season a capped array is projected to reach its cap, from the run's growth. */
function capReached(run: DriftRun, name: string): number | null {
  const rate = growth(run, (season) => season.caps[name] ?? 0);
  const now = last(run).caps[name] ?? 0;
  const cap = run.caps[name]!;
  if (now > cap) return run.measures.length;
  if (!(rate > 0)) return null;
  return Math.ceil(run.measures.length + (cap - now) / rate);
}
const perRun = (
  runs: DriftRun[],
  judge: (run: DriftRun) => { met: boolean | null; value: string },
): { met: boolean | null; value: string } => {
  if (!runs.length) return { met: null, value: 'no runs' };
  const results = runs.map((run) => ({ run, ...judge(run) }));
  const met = results.some((r) => r.met === false)
    ? false
    : results.every((r) => r.met === true)
      ? true
      : null;
  return { met, value: results.map((r) => `${r.run.seed}: ${r.value}`).join(' | ') };
};
const partial = (run: DriftRun) => run.measures.length < 25;

export const TARGETS: Target<DriftRun[]>[] = [
  {
    id: 'talent',
    name: '85+ and 90+ counts within ±25% of season 1',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const a = drifted(first(run).players85, last(run).players85);
        const b = drifted(first(run).players90, last(run).players90);
        return {
          met: Math.abs(a) <= TARGET_BANDS.drift && Math.abs(b) <= TARGET_BANDS.drift,
          value: `85+ ${first(run).players85} → ${last(run).players85} (${signed(a)}), 90+ ${first(run).players90} → ${last(run).players90} (${signed(b)}) by ${last(run).season}`,
        };
      }),
  },
  {
    id: 'ages',
    name: 'age buckets within ±25% of season 1',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const changes = AGE_BUCKETS.map(
          (bucket) => [bucket, drifted(first(run).ages[bucket], last(run).ages[bucket])] as const,
        );
        return {
          met: changes.every(([, change]) => Math.abs(change) <= TARGET_BANDS.drift),
          value: changes.map(([bucket, change]) => `${bucket} ${signed(change)}`).join(', '),
        };
      }),
  },
  {
    id: 'nations',
    name: 'national ratings within ±25% of season 1',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const changes = Object.keys(first(run).nations).map(
          (name) =>
            [
              name,
              first(run).nations[name]!,
              last(run).nations[name] ?? 0,
              drifted(first(run).nations[name]!, last(run).nations[name] ?? 0),
            ] as const,
        );
        return {
          met: changes.every(([, , , change]) => Math.abs(change) <= TARGET_BANDS.drift),
          value: changes.map(([name, a, b]) => `${name} ${a}→${b}`).join(', '),
        };
      }),
  },
  {
    id: 'champions',
    name: 'tier-1 champions take a median 2.1–2.5 points a game',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const value = median(
          run.measures.flatMap((m) => Object.values(m.tier1).map((t) => t.championPpg)),
        );
        return {
          met: within(value, TARGET_BANDS.championPpg[0], TARGET_BANDS.championPpg[1]),
          value: `median ${value.toFixed(2)}`,
        };
      }),
  },
  {
    id: 'seventeenth',
    name: 'tier-1 17th place takes a median 0.85–1.1 points a game',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const value = median(
          run.measures.flatMap((m) =>
            Object.values(m.tier1).flatMap((t) =>
              t.seventeenthPpg === null ? [] : [t.seventeenthPpg],
            ),
          ),
        );
        return {
          met: within(value, TARGET_BANDS.seventeenthPpg[0], TARGET_BANDS.seventeenthPpg[1]),
          value: `median ${value.toFixed(2)}`,
        };
      }),
  },
  {
    id: 'distinct-champions',
    name: '3–7 different tier-1 champions per 20 seasons in every country',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const window = run.measures.slice(-TARGET_BANDS.championWindow);
        const countries = Object.keys(first(run).tier1);
        const counts = countries.map(
          (name) =>
            [
              name,
              new Set(window.flatMap((m) => (m.tier1[name] ? [m.tier1[name]!.champion] : []))).size,
            ] as const,
        );
        const off = counts.some(
          ([, n]) =>
            n > TARGET_BANDS.distinctChampions[1] ||
            (!(window.length < TARGET_BANDS.championWindow) &&
              n < TARGET_BANDS.distinctChampions[0]),
        );
        return {
          // Too many champions already fails a short run; too few needs the full window.
          met: off ? false : window.length < TARGET_BANDS.championWindow ? null : true,
          value: `${counts.map(([name, n]) => `${name} ${n}`).join(', ')} over ${window.length} seasons`,
        };
      }),
  },
  {
    id: 'club-money',
    name: 'median club balance ≤ 2× the start, and some clubs in debt',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const multiple = last(run).medianBalance / Math.max(1, run.start.medianBalance);
        const debt = Math.max(...run.measures.map((m) => m.debtClubs));
        return {
          met: multiple <= TARGET_BANDS.balanceMultiple && debt > 0,
          value: `median ${(run.start.medianBalance / 1e6).toFixed(1)}M → ${(last(run).medianBalance / 1e6).toFixed(1)}M (×${multiple.toFixed(2)}), clubs in debt at a season end: at most ${debt}`,
        };
      }),
  },
  {
    id: 'keeper-purchases',
    name: 'keepers ≥ 5% of AI purchases',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const total = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
        for (const m of run.measures)
          for (const line of Object.keys(total) as (keyof typeof total)[])
            total[line] += m.purchases[line];
        const all = Object.values(total).reduce((a, b) => a + b, 0);
        const share = all ? total.GK / all : Number.NaN;
        return {
          met: all ? share >= TARGET_BANDS.keeperShare : null,
          value: `${total.GK} of ${all} (${(share * 100).toFixed(1)}%; DEF ${total.DEF}, MID ${total.MID}, ATT ${total.ATT})`,
        };
      }),
  },
  {
    id: 'duplicate-names',
    name: 'no same-squad duplicate names',
    phase: 8,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const most = Math.max(...run.measures.map((m) => m.duplicateNames));
        return {
          met: most === 0,
          value: `${first(run).duplicateNames} in season 1, ${last(run).duplicateNames} in the last, ${most} at most`,
        };
      }),
  },
  {
    id: 'golden-ball-lines',
    name: 'no line wins more than 50% of Golden Balls over the run',
    phase: 7,
    asserted: false,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const lines: Record<string, number> = {};
        for (const m of run.measures)
          if (m.goldenBall) lines[m.goldenBall.line] = (lines[m.goldenBall.line] ?? 0) + 1;
        const total = Object.values(lines).reduce((a, b) => a + b, 0);
        const top = Math.max(0, ...Object.values(lines));
        return {
          met: total ? top / total <= TARGET_BANDS.goldenBallLineShare : null,
          value: `${Object.entries(lines)
            .map(([line, n]) => `${line} ${n}`)
            .join(', ')} of ${total}`,
        };
      }),
  },
  {
    id: 'save-growth',
    name: 'save grows ≤ 0.5 MiB a season after season 10',
    phase: 3,
    asserted: true,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const rate = growth(run, (season) => season.saveBytes);
        const note = run.measures.length <= TARGET_BANDS.growthFrom ? ' (last five seasons)' : '';
        return {
          met: Number.isFinite(rate) ? rate <= TARGET_BANDS.growthBytes : null,
          value: `${(first(run).saveBytes / 2 ** 20).toFixed(1)} → ${(last(run).saveBytes / 2 ** 20).toFixed(1)} MiB, ${(rate / 2 ** 20).toFixed(2)} MiB a season${note}`,
        };
      }),
  },
  {
    id: 'save-34-seasons',
    name: 'save after 34 seasons ≤ 90 MiB (phase 3 budget; projected from the run when shorter)',
    phase: 3,
    asserted: true,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const seasons = run.measures.length;
        const bytes =
          seasons >= 34
            ? run.measures[33]!.saveBytes
            : last(run).saveBytes + (34 - seasons) * growth(run, (season) => season.saveBytes);
        return {
          met: Number.isFinite(bytes) ? bytes <= TARGET_BANDS.save34Bytes : null,
          value: `${(bytes / 2 ** 20).toFixed(1)} MiB${seasons >= 34 ? '' : ` (projected from ${seasons} seasons)`}`,
        };
      }),
  },
  {
    id: 'validator-caps',
    name: 'no validator cap reachable within 200 seasons (full seasons ≤ 100, awards ≤ 5,000, …)',
    phase: 3,
    asserted: true,
    evaluate: (runs) =>
      perRun(runs, (run) => {
        const reached = Object.keys(run.caps)
          .map((name) => [name, capReached(run, name)] as const)
          .filter(([, season]) => season !== null)
          .sort((a, b) => a[1]! - b[1]!);
        const within200 = reached.filter(([, season]) => season! <= TARGET_BANDS.capHorizon);
        const show = (entries: readonly (readonly [string, number | null])[]) =>
          entries
            .map(
              ([name, season]) =>
                `${name} ${last(run).caps[name]}/${run.caps[name]} at season ${season}`,
            )
            .join(', ');
        return {
          met: within200.length === 0,
          value: within200.length
            ? `reached: ${show(within200)}`
            : `none within ${TARGET_BANDS.capHorizon}${reached.length ? `; later: ${show(reached.slice(0, 3))}` : ''}`,
        };
      }),
  },
];

/** A readable summary of a run: the trajectory every few seasons, then the targets. */
export function summarise(run: DriftRun, results: TargetResult[]): string {
  const lines: string[] = [
    `World drift · seed ${run.seed} · ${run.measures.length} seasons · ${run.career ? 'with a career' : 'no career'} · ${run.date}`,
  ];
  const picks = run.measures.filter(
    (_, index) => index === 0 || (index + 1) % 5 === 0 || index === run.measures.length - 1,
  );
  lines.push(
    'season  sec  players  85+  90+  champ-ppg  17th-ppg  balance-M  debt  GK-bought  dupes  save-MiB',
  );
  for (const m of [...new Set(picks)]) {
    const tier = Object.values(m.tier1);
    lines.push(
      [
        String(m.season).padEnd(6),
        String(m.seconds).padStart(5),
        String(m.players).padStart(8),
        String(m.players85).padStart(4),
        String(m.players90).padStart(4),
        median(tier.map((t) => t.championPpg))
          .toFixed(2)
          .padStart(10),
        median(tier.flatMap((t) => (t.seventeenthPpg === null ? [] : [t.seventeenthPpg])))
          .toFixed(2)
          .padStart(9),
        (m.medianBalance / 1e6).toFixed(1).padStart(10),
        String(m.debtClubs).padStart(5),
        `${m.purchases.GK}/${Object.values(m.purchases).reduce((a, b) => a + b, 0)}`.padStart(10),
        String(m.duplicateNames).padStart(6),
        (m.saveBytes / 2 ** 20).toFixed(1).padStart(9),
      ].join(' '),
    );
  }
  const seconds = run.measures.map((m) => m.seconds);
  lines.push(
    `Season simulation (Node, headless): median ${median(seconds)} s, slowest ${Math.max(...seconds)} s (phase 3 budget for the browser: ≤ 75 s on a desktop).`,
  );
  printTargets(results, (line) => lines.push(line));
  return lines.join('\n');
}

function check(): void {
  const files = readdirSync(OUT_DIR).filter((name) => name.endsWith('.json'));
  const runs = files.map(
    (name) => JSON.parse(readFileSync(`${OUT_DIR}/${name}`, 'utf8')) as DriftRun,
  );
  if (!runs.length) throw new Error(`No drift runs in ${OUT_DIR}`);
  console.log(`${runs.length} runs: ${files.join(', ')}`);
  for (const run of runs)
    if (partial(run))
      console.log(`${run.seed}: ${run.measures.length} seasons — a partial run (the gate is 25)`);
  const failed = printTargets(evaluateTargets(TARGETS, runs, assertAllTargets()));
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/world-drift.ts')) {
  if (process.argv.includes('--check')) check();
  else {
    const seed = argument('seed') ?? 'drift-a';
    const seasons = Number(argument('seasons') ?? 25);
    const withCareer = !process.argv.includes('--no-career');
    console.log(
      `World drift · seed ${seed} · ${seasons} seasons · ${withCareer ? 'with a career' : 'no career'}`,
    );
    const run = runDrift(seed, seasons, withCareer, (line) => console.log(line));
    run.targets = evaluateTargets(TARGETS, [run]);
    const summary = summarise(run, run.targets);
    console.log(summary);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}/${seed}.json`, JSON.stringify(run, null, 2));
    writeFileSync(`${OUT_DIR}/${seed}.txt`, `${summary}\n`);
    console.log(`Report: ${OUT_DIR}/${seed}.json`);
  }
}
