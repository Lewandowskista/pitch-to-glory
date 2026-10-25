/**
 * Retention over 200 seasons (docs/RELEASE-1.0-PLAN.md step 3.6). Simulating 200 national
 * seasons takes hours, so the growth of everything a long world accumulates is synthesised at a
 * late save's rates on the shared national world, and the engine's own functions keep it: season
 * summaries (`compactHistory`), about 2,100 retirees a season (`pruneArchive`), a season's awards
 * (`trimAwards`), and a career every 16 seasons whose Chronicle and Moments the engine trims
 * (`chronicle`, `trimMoments`), retiring into a legacy. Every season, every count stays below
 * its validator cap with room for 200 seasons, the retained bytes stop growing beyond a few
 * kilobytes a season, and at the end every Hall of Fame rank equals the rank in the same world
 * with every pruned record restored.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ArchivedPlayer, Award, AwardKind, Legacy, Moment, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { startNextSeason } from '../src/engine/world/simulate';
import { applyRetention } from '../src/engine/world/retention';
import { trimAwards } from '../src/engine/career/honours/awards';
import { chronicle } from '../src/engine/career/honours/chronicle';
import { trimMoments } from '../src/engine/career/honours/moments';
import { hallOfFameStanding, retireCareer } from '../src/engine/career/honours/retirement';
import { DETAILED_HISTORY_LIMIT, HISTORY_LIMIT } from '../src/persistence/worldValidation';
import { nationalCareerSeason } from './support/world';

const SEASONS = 200;
const RETIREES = 2100;
const R = CONFIG.world.retention;
const H = CONFIG.career.honours;
const clone = <T>(value: T): T => structuredClone(value);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? '');

/** Every validator cap the growth reaches towards (src/persistence/*), with its count. */
const CAPS: { name: string; cap: number; count: (world: World) => number }[] = [
  { name: 'history', cap: HISTORY_LIMIT, count: (w) => w.history.length },
  {
    name: 'full seasons',
    cap: Math.min(DETAILED_HISTORY_LIMIT, R.historySeasons + 1),
    count: (w) => w.history.filter((summary) => !summary.compact).length,
  },
  { name: 'archive', cap: 1_000_000, count: (w) => Object.keys(w.archive!.players).length },
  { name: 'pruned scores', cap: 1_000_000, count: (w) => w.archive!.pruned?.length ?? 0 },
  { name: 'awards', cap: H.awards.maxRecords, count: (w) => w.awards.length },
  { name: 'legacies', cap: H.legacyLimit, count: (w) => w.legacies.length },
  {
    name: 'chronicle',
    cap: H.chronicleLimit * (H.legacyLimit + 1),
    count: (w) => w.chronicle.length,
  },
  { name: 'moments', cap: H.moments.limit * (H.legacyLimit + 1), count: (w) => w.moments.length },
  {
    name: "a legacy's awards",
    cap: 400,
    count: (w) => Math.max(0, ...w.legacies.map((legacy) => legacy.awardIds.length)),
  },
];
/** What retention keeps that grows with seasons. */
const retained = (world: World) =>
  bytes({
    history: world.history,
    archive: world.archive,
    awards: world.awards,
    legacies: world.legacies,
    chronicle: world.chronicle,
    moments: world.moments,
  });

let start: World;
beforeAll(async () => {
  start = startNextSeason(await nationalCareerSeason(), { inPlace: true });
}, 300000);

describe('retention over 200 seasons', () => {
  it('keeps every validator cap out of reach and the save from growing', () => {
    const world = clone(start);
    const rng = createRng('retention-200');
    const summary = world.history.at(-1)!;
    const template: ArchivedPlayer = Object.values(world.archive!.players)[0]!;
    const legacyTemplate: Legacy = retireCareer(clone(world));
    const momentTemplate: Moment | undefined = world.moments[0];
    const careerTemplate = clone(world.players[world.career!.playerId]!);
    const leagues = Object.values(world.leagues)
      .filter((league) => league.tier <= 2)
      .map((league) => league.id);
    /** Every archived record ever made, for the exactness check at the end. */
    const everyone = new Map<string, ArchivedPlayer>(Object.entries(world.archive!.players));
    let career = world.career!.playerId;
    let careerAwards: string[] = [];
    let generation = 0;
    let awardCount = 0;
    const sizes: number[] = [];
    const peaks = new Map<string, number>();

    for (let season = 1; season <= SEASONS; season++) {
      const year = summary.season + season;
      // The season's summary, as `archiveSeason` writes it.
      const next = clone(summary);
      next.season = year;
      for (const entry of Object.values(next.divisionChampions ?? {}))
        entry.competitionId = entry.competitionId.replace(`:${summary.season}:`, `:${year}:`);
      world.history.push(next);
      world.date.season = year;

      // The season's retirees join the archive, with a late save's Hall of Fame spread.
      const retirees: string[] = [];
      for (let index = 0; index < RETIREES; index++) {
        const id = `retiree:${year}:${index}`;
        const tail = rng.next() ** 6;
        const record: ArchivedPlayer = {
          ...clone(template),
          id,
          retiredSeason: year,
          stats: { ...template.stats, goals: rng.int(0, 120) },
          hallOfFame: Math.round(tail * 18000) / 10,
        };
        world.archive!.players[id] = record;
        everyone.set(id, record);
        retirees.push(id);
      }

      // The season's awards: winners who have since retired, and the career's own.
      const pick = () => retirees[rng.int(0, retirees.length - 1)]!;
      const award = (kind: AwardKind, winnerIds: string[], month: number | null = null): Award => {
        const entry: Award = {
          id: `award:${year}:${awardCount++}`,
          kind,
          season: year,
          month,
          competitionId: kind === 'golden-ball' || kind === 'young-player' ? null : leagues[0]!,
          winnerIds,
          shortlist:
            kind === 'golden-ball'
              ? winnerIds.concat(Array.from({ length: 9 }, pick)).map((playerId, rank) => ({
                  playerId,
                  clubId: Object.keys(world.clubs)[0]!,
                  score: 100 - rank,
                }))
              : [],
          value: 10,
        };
        world.awards.push(entry);
        trimAwards(world);
        return entry;
      };
      for (let month = 1; month <= 12; month++)
        if (rng.next() < 0.3) careerAwards.push(award('month', [career], month).id);
        else award('month', [pick()], month);
      for (let index = 0; index < leagues.length; index++) {
        award('golden-boot', [pick()]);
        award('mvp', [pick()]);
        award('team-season', Array.from({ length: 11 }, pick));
      }
      for (let country = 0; country < 6; country++) award('young-player', [pick()]);
      award('golden-ball', [pick()]);

      // The career's Chronicle and Moments, trimmed by the engine as it writes them.
      for (let entry = 0; entry < 45; entry++) chronicle(world, 'cap', { season: year });
      if (momentTemplate)
        for (let moment = 0; moment < 4; moment++) {
          world.moments.push({
            ...clone(momentTemplate),
            id: `moment:${year}:${moment}`,
            playerId: career,
          });
          trimMoments(world, career);
        }

      // A career retires every 16 seasons into a legacy that names its teammates and mentees;
      // the next one starts as a new player.
      if (season % 16 === 0) {
        world.players[career]!.retired = true;
        world.legacies.push({
          ...clone(legacyTemplate),
          id: `legacy:${career}`,
          playerId: career,
          awardIds: careerAwards,
          teammateIds: retirees.slice(0, 12),
          menteeIds: retirees.slice(12, 14),
          childPlayerId: null,
        });
        generation++;
        career = `career:retention:${generation}`;
        world.players[career] = { ...clone(careerTemplate), id: career, contractId: null };
        world.career!.playerId = career;
        careerAwards = [];
      }

      applyRetention(world);
      for (const { name, cap, count } of CAPS) {
        const value = count(world);
        peaks.set(name, Math.max(peaks.get(name) ?? 0, value));
        expect(value, `${name} in season ${season}`).toBeLessThanOrEqual(cap);
      }
      sizes.push(retained(world));
    }

    // Everyone an award or a legacy names is still remembered by name.
    const named = (id: string) => Boolean(world.players[id] || world.archive!.players[id]);
    for (const entry of world.awards) {
      for (const id of entry.winnerIds) expect(named(id), id).toBe(true);
      for (const { playerId } of entry.shortlist) expect(named(playerId), playerId).toBe(true);
    }
    for (const legacy of world.legacies)
      for (const id of [...legacy.teammateIds, ...(legacy.menteeIds ?? [])])
        expect(named(id), id).toBe(true);
    // The archive holds the best records and everyone named; the rest are scores.
    expect(Object.keys(world.archive!.players).length).toBeLessThan(R.archiveTop + 3000);
    // Growth: the retained records add at most a few kilobytes a season once the windows fill.
    const perSeason = (sizes.at(-1)! - sizes[99]!) / (SEASONS - 100);
    console.log(
      `Retention over ${SEASONS} seasons: ${(sizes.at(-1)! / 1e6).toFixed(2)} MB retained, ` +
        `${(perSeason / 1e3).toFixed(1)} KB a season after season 100; peaks ${JSON.stringify(Object.fromEntries(peaks))}`,
    );
    expect(perSeason).toBeLessThan(40_000);
    expect(sizes.at(-1)!).toBeLessThan(20e6);

    // Ranks are exact: the same as with every pruned record restored.
    const restored = clone(world);
    for (const [id, record] of everyone)
      if (!restored.archive!.players[id] && !restored.players[id])
        restored.archive!.players[id] = record;
    delete restored.archive!.pruned;
    expect(Object.keys(restored.archive!.players).length).toBe(everyone.size);
    for (const score of [0, 5, 50, 200, 600, 1200, 1800, 5000])
      for (const exclude of [career, world.legacies[0]!.playerId, 'nobody']) {
        const { rank, of } = hallOfFameStanding(restored, score, exclude);
        expect(hallOfFameStanding(world, score, exclude), `${score} ${exclude}`).toMatchObject({
          rank,
          of,
        });
      }
  }, 900000);
});
