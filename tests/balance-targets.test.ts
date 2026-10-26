import { describe, expect, it } from 'vitest';
import {
  evaluateTargets,
  median,
  percentile,
  printTargets,
  standardDeviation,
  type Target,
} from '../scripts/targets';
import { TARGETS as DRIFT, type DriftRun, type DriftSeason } from '../scripts/world-drift';
import { TARGETS as MATCH, type PositionProfile } from '../scripts/match-profile';
import { TARGETS as CAREER, type CareerProfile } from '../scripts/career-profile';
import { threadTime } from '../e2e/threads';

/**
 * The 1.0 targets (docs/RELEASE-1.0-PLAN.md step 2.3): reported until their phase asserts
 * them, and each judges what it names. The harnesses themselves run in performance.yml and
 * drift.yml.
 */
describe('1.0 targets', () => {
  const target = (met: boolean | null, asserted: boolean): Target<null> => ({
    id: `t-${met}-${asserted}`,
    name: 'a target',
    phase: 5,
    asserted,
    evaluate: () => ({ met, value: String(met) }),
  });

  it('fails a check only on asserted targets, or on all with --assert-targets', () => {
    const targets = [target(false, false), target(null, false), target(true, true)];
    const quiet = () => {};
    expect(printTargets(evaluateTargets(targets, null), quiet)).toBe(0);
    expect(printTargets(evaluateTargets(targets, null, true), quiet)).toBe(2);
    expect(printTargets(evaluateTargets([target(false, true)], null), quiet)).toBe(1);
  });

  it('reports a target that cannot be measured instead of throwing', () => {
    const broken: Target<null> = {
      id: 'broken',
      name: 'broken',
      phase: 3,
      asserted: false,
      evaluate: () => {
        throw new Error('no data');
      },
    };
    expect(evaluateTargets([broken], null)[0]).toMatchObject({ met: null, asserted: false });
  });

  it('keeps every harness target reported until its phase', () => {
    // Met by phase 3 (retention, step 3.6) and asserted since; ratings and match statistics by
    // step 5.3 (engine match-22), added-time goals by step 5.4.
    const met = new Set([
      'save-growth',
      'save-34-seasons',
      'validator-caps',
      'ratings',
      'match-statistics',
      'added-time-goals',
    ]);
    for (const entry of [...DRIFT, ...MATCH, ...CAREER])
      expect(entry.asserted, entry.id).toBe(met.has(entry.id));
  });

  it('computes the shared statistics', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1)).toBe(2);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
});

describe('world drift targets', () => {
  const season = (index: number, overrides: Partial<DriftSeason> = {}): DriftSeason => ({
    season: 2026 + index,
    seconds: 40,
    career: null,
    players: 25000,
    players85: 80,
    players90: 2,
    ages: { '<18': 10, '18-20': 10, '21-23': 10, '24-26': 10, '27-29': 10, '30-32': 10, '33+': 10 },
    nations: { England: 86 },
    tier1: { England: { champion: `club:${index % 5}`, championPpg: 2.3, seventeenthPpg: 0.95 } },
    clubs: 500,
    medianBalance: 1e6,
    debtClubs: 3,
    purchases: { GK: 6, DEF: 30, MID: 30, ATT: 34 },
    duplicateNames: 0,
    goldenBall: { line: ['GK', 'DEF', 'MID'][index % 3]!, position: 'CM', name: 'A' },
    saveBytes: 60e6 + index * 0.2 * 2 ** 20,
    caps: { history: index + 1, awards: 400 },
    ...overrides,
  });
  const run = (seasons: DriftSeason[]): DriftRun => ({
    seed: 'test',
    career: true,
    seasons: seasons.length,
    date: '',
    node: '',
    start: { medianBalance: 1e6, players: 25000 },
    measures: seasons,
    caps: { history: 100, awards: 2000 },
  });
  const judge = (id: string, value: DriftRun) =>
    evaluateTargets(DRIFT, [value]).find((result) => result.id === id)!;

  it('passes a world that holds, except the history cap reached at season 100', () => {
    const steady = run(Array.from({ length: 25 }, (_, index) => season(index)));
    for (const result of evaluateTargets(DRIFT, [steady]))
      expect(result.met, `${result.id}: ${result.value}`).toBe(result.id !== 'validator-caps');
    expect(judge('validator-caps', steady).value).toContain('history 25/100 at season 100');
  });

  it('flags talent inflation, flat tables and a striker monopoly', () => {
    const drifting = run(
      Array.from({ length: 25 }, (_, index) =>
        season(index, {
          players85: 80 + index * 5,
          tier1: {
            England: { champion: `club:${index}`, championPpg: 1.8, seventeenthPpg: 1.2 },
          },
          goldenBall: { line: 'ATT', position: 'ST', name: 'S' },
          duplicateNames: 60,
          purchases: { GK: 0, DEF: 30, MID: 30, ATT: 40 },
        }),
      ),
    );
    for (const id of [
      'talent',
      'champions',
      'seventeenth',
      'distinct-champions',
      'golden-ball-lines',
      'duplicate-names',
      'keeper-purchases',
    ])
      expect(judge(id, drifting).met, id).toBe(false);
  });
});

describe('match targets', () => {
  const profile = (overrides: Partial<PositionProfile>): PositionProfile =>
    ({
      position: 'GK',
      matches: 100,
      goals: 0,
      assists: 0,
      rating: { mean: 6.7, p10: 5.6, p90: 7.8, nineOrMore: 0.01, sd: 0.85, fiveOrLess: 0.02 },
      seed: 'a',
      ...overrides,
    }) as PositionProfile;

  it('finds a choice that is best almost every time', () => {
    const dominated = profile({
      dominance: { 'one-on-one': { n: 100, best: { 'stay-line': 96, rush: 4 } } },
    });
    const result = evaluateTargets(MATCH, [dominated]).find((r) => r.id === 'no-dominant-choice')!;
    expect(result.met).toBe(false);
    expect(result.value).toContain('one-on-one/stay-line 96%');
  });

  it('needs two seeds before choices can be said to matter', () => {
    const swing = { mean: 0.4, se: 0.05, n: 100 };
    const one = evaluateTargets(MATCH, [profile({ swing })]).find((r) => r.id === 'choices-matter');
    const two = evaluateTargets(MATCH, [profile({ swing }), profile({ swing, seed: 'b' })]).find(
      (r) => r.id === 'choices-matter',
    );
    expect(one!.met).toBeNull();
    expect(two!.met).toBe(true);
  });

  it('judges ratings by mean, spread and both tails', () => {
    const wide = profile({
      rating: { mean: 6.7, p10: 4.8, p90: 9.1, nineOrMore: 0.1, sd: 1.4, fiveOrLess: 0.12 },
    });
    expect(evaluateTargets(MATCH, [wide]).find((r) => r.id === 'ratings')!.met).toBe(false);
    expect(evaluateTargets(MATCH, [profile({})]).find((r) => r.id === 'ratings')!.met).toBe(true);
  });

  it('judges the match statistics apart from goals in added time (step 5.4)', () => {
    const statistics = (addedTimeGoals: number) =>
      profile({
        statistics: {
          matches: 100,
          shots: 2500,
          onTarget: 875,
          woodwork: 80,
          goals: 270,
          addedTimeGoals,
          possession: Array.from({ length: 100 }, (_, index) => 30 + (index * 40) / 99),
        },
      });
    const judge = (id: string, added: number) =>
      evaluateTargets(MATCH, [statistics(added)]).find((r) => r.id === id)!;
    expect(judge('match-statistics', 0).met).toBe(true);
    expect(judge('match-statistics', 0).value).toContain('0.80 off the woodwork a match');
    expect(judge('added-time-goals', 0).met).toBe(false);
    // A share of all goals (step 5.4): 3 of 270 is too few, 20 (7.4%) is in the band.
    expect(judge('added-time-goals', 3).met).toBe(false);
    expect(judge('added-time-goals', 20).met).toBe(true);
    const flat = profile({
      statistics: { ...statistics(3).statistics!, possession: new Array<number>(100).fill(50) },
    });
    expect(evaluateTargets(MATCH, [flat]).find((r) => r.id === 'match-statistics')!.met).toBe(
      false,
    );
  });
});

describe('thread time from a trace', () => {
  it('splits top-level tasks between the main thread and workers', () => {
    const meta = (tid: number, name: string) => ({
      ph: 'M',
      name: 'thread_name',
      pid: 1,
      tid,
      args: { name },
    });
    const task = (tid: number, ms: number) => ({
      ph: 'X',
      name: 'ThreadControllerImpl::RunTask',
      pid: 1,
      tid,
      dur: ms * 1000,
    });
    const time = threadTime({
      traceEvents: [
        meta(1, 'CrRendererMain'),
        meta(2, 'DedicatedWorker thread'),
        meta(3, 'DedicatedWorker thread'),
        meta(4, 'Compositor'),
        task(1, 40),
        task(2, 300),
        task(3, 120),
        task(3, 80),
        task(4, 999),
      ],
    });
    expect(time).toEqual({ mainMs: 40, workersMs: 500, longestWorkerTaskMs: 300, workers: 2 });
  });
});

describe('career targets', () => {
  const seasons = (sponsors: number) =>
    Array.from({ length: 14 }, (_, index) => ({
      age: 18 + index,
      fameLevel: Math.min(10, 2 + index),
      fans: index >= 7 ? 98 : 70,
      footballIncome: 100,
      sponsorIncome: sponsors,
      cash: 1000 * index,
      awards: [],
      awardPoints:
        index === 1 ? [{ kind: 'golden-boot', tier: 4, points: 6, tierOnePoints: 6 }] : [],
    })) as unknown as CareerProfile['seasons'];
  const career = (policy: string, sponsors = 0, position = 'ST'): CareerProfile =>
    ({
      seed: 'test',
      position,
      archetype: 'finisher',
      specialise: false,
      policy,
      seasons: seasons(sponsors),
      legacy: { hallOfFame: { rank: 10, of: 1000, score: 500 } },
      calibration: {},
    }) as CareerProfile;
  const judge = (id: string, profiles: CareerProfile[]) =>
    evaluateTargets(CAREER, profiles).find((result) => result.id === id)!;

  it('flags fame level 10 before 27, pinned fans and a full-weight lower-tier award', () => {
    const profiles = [career('default'), career('default', 0, 'GK')];
    expect(judge('prime-fame', profiles).met).toBe(false);
    expect(judge('prime-fans', profiles).met).toBe(false);
    expect(judge('award-tier-weight', profiles).met).toBe(false);
    expect(judge('honours-fairness', profiles).value).toContain('keeper #10');
  });

  it('judges sponsor wealth against football income by age', () => {
    expect(judge('economy', [career('default')]).met).toBeNull();
    expect(judge('economy', [career('sponsor', 20)]).met).toBe(true);
    expect(judge('economy', [career('sponsor', 300)]).met).toBe(false);
  });
});
