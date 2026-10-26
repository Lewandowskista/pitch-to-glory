import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { CONFIG } from '../src/engine/config';
import {
  createMatchSession,
  createMatchSetup,
  MATCH_ENGINE_VERSION,
  PREVIOUS_MATCH_ENGINE,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import {
  addRating,
  assistCredit,
  creditDecision,
  errorCredit,
  goalCredit,
  stopCredit,
  RATING_PARTS,
  type MomentPar,
} from '../src/engine/match/report';
import { performanceFame, performanceXp, rewardScale } from '../src/engine/match/rewards';
import type { RatingFamily } from '../src/engine/match/situations';
import type { Position } from '../src/model/domain';
import { goldenSession, onEngine, playOnEngines, type Engine } from './support/engines';

/**
 * Believable ratings and statistics (release 1.0 step 5.3, engine match-22): ratings measured
 * against each moment's par with a soft limit, XP and fame on the compressed scale, possession
 * from style and home advantage, and every missed shot settled (the woodwork among them).
 * Match-21 keeps its rules: `tests/match-outcome-snapshot.test.ts` pins it byte for byte.
 */
const R = CONFIG.match.rating22;
const world = generateWorld('match-ratings', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2) as [
  (typeof world.clubs)[string],
  (typeof world.clubs)[string],
];
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
function setupFor(position: Position, seed: string): MatchSetup {
  const [home, away] = clubs;
  const id = home.playerIds.find((pid) => world.players[pid]!.primaryPosition === position)!;
  return createMatchSetup(world, home.id, away.id, id, seed);
}
const sessionFor = (position: Position, engine: Engine = MATCH_ENGINE_VERSION) =>
  createMatchSession(onEngine(setupFor(position, `ratings:${position}`), engine), tactics);
const partsSum = (session: MatchSession) =>
  RATING_PARTS.reduce((sum, part) => sum + (session.state.ratingParts[part] ?? 0), 0);
const par = (overrides: Partial<MomentPar>): MomentPar => ({
  scored: 0,
  assisted: 0,
  goals: 0,
  assists: 0,
  danger: 0,
  conceded: 0,
  ...overrides,
});
/** One key moment's credits, in the order resolveChoice gives them. */
function moment(
  session: MatchSession,
  family: RatingFamily,
  reference: number,
  outcome: {
    success: boolean;
    goal?: boolean;
    assist?: boolean;
    conceded?: boolean;
    danger?: number;
  },
  expected: Partial<MomentPar>,
): void {
  const s = session.state;
  const { goals: scored, assists: assisted } = s.stats;
  if (outcome.goal) {
    s.stats.goals++;
    addRating(session, 'goals', goalCredit(session));
  }
  if (outcome.success && outcome.danger)
    addRating(session, 'saves', stopCredit(session, outcome.danger, reference));
  if (outcome.assist) {
    s.stats.assists++;
    addRating(session, 'assists', assistCredit(session));
  }
  if (outcome.conceded) addRating(session, 'errors', errorCredit(session));
  creditDecision(
    session,
    family,
    outcome.success,
    reference,
    par({ scored, assisted, danger: outcome.danger ?? 0, ...expected }),
  );
}
const finalRating = (session: MatchSession) => Math.round(session.state.stats.rating * 10) / 10;

describe('match-22 ratings', () => {
  it('starts every position at the base and keeps match-21 on its own scale', () => {
    expect(sessionFor('ST').state.stats.rating).toBe(R.base);
    const old = sessionFor('ST', PREVIOUS_MATCH_ENGINE);
    expect(old.state.stats.rating).toBe(CONFIG.match.rating.base);
    expect(old.state.ratingParts.par).toBeUndefined();
    // Match-21's credits are the flat ones it always had.
    expect(goalCredit(old)).toBe(CONFIG.match.rating.goal);
    creditDecision(old, 'shooting', true, 0.25, par({ goals: 0.25 }));
    expect(old.state.ratingParts.shooting).toBeCloseTo(CONFIG.match.rating.decisionWeight * 0.75);
    expect(old.state.ratingParts.par).toBeUndefined();
  });

  it('gives every moment an expected credit of zero for the reference player', () => {
    // Each case: the reference odds, the outcomes with their probabilities, and the par.
    const cases: {
      position: Position;
      family: RatingFamily;
      b: number;
      outcomes: [number, Parameters<typeof moment>[3]][];
      expected: Partial<MomentPar>;
      /** Goals the player has already scored. */
      scored?: number;
    }[] = [
      {
        position: 'ST',
        family: 'shooting',
        b: 0.22,
        outcomes: [
          [0.22, { success: true, goal: true }],
          [0.78, { success: false }],
        ],
        expected: { goals: 0.22 },
      },
      {
        // On one goal already: the second goal and its par are both worth `repeat` as much.
        position: 'ST',
        family: 'shooting',
        b: 0.3,
        scored: 1,
        outcomes: [
          [0.3, { success: true, goal: true }],
          [0.7, { success: false }],
        ],
        expected: { goals: 0.3 },
      },
      {
        position: 'CM',
        family: 'passing',
        b: 0.6,
        // A completed pass makes a chance a teammate scores 25% of the time; a lost one gives
        // the opposition a 10% chance.
        outcomes: [
          [0.6 * 0.25, { success: true, assist: true }],
          [0.6 * 0.75, { success: true }],
          [0.4 * 0.1, { success: false, conceded: true }],
          [0.4 * 0.9, { success: false }],
        ],
        expected: { assists: 0.6 * 0.25, conceded: 0.4 * 0.1 },
      },
      {
        position: 'GK',
        family: 'goalkeeping',
        b: 0.55,
        outcomes: [
          [0.55, { success: true, danger: 0.3 }],
          [0.45, { success: false, conceded: true, danger: 0.3 }],
        ],
        expected: { conceded: 0.45 },
      },
      {
        position: 'CB',
        family: 'defending',
        b: 0.2,
        // A hard stop: its credit reaches the floor and the cap, and its par follows them.
        outcomes: [
          [0.2, { success: true, danger: 0.6 }],
          [0.8, { success: false, conceded: true, danger: 0.6 }],
        ],
        expected: { conceded: 0.8 },
      },
    ];
    for (const { position, family, b, outcomes, expected, scored = 0 } of cases) {
      let mean = 0;
      for (const [probability, outcome] of outcomes) {
        const session = sessionFor(position);
        session.state.stats.goals = scored;
        moment(session, family, b, outcome, expected);
        mean += probability * partsSum(session);
      }
      expect(Math.abs(mean), `${position} ${family}`).toBeLessThan(1e-5);
    }
  });

  it('lets a hat-trick reach 9 and more', () => {
    const session = sessionFor('ST');
    for (const scored of [true, false, true, false, true])
      moment(session, 'shooting', 0.25, { success: scored, goal: scored }, { goals: 0.25 });
    for (let pass = 0; pass < 4; pass++)
      moment(session, 'passing', 0.75, { success: true }, { assists: 0.75 * 0.1 });
    addRating(session, 'team', R.result);
    expect(finalRating(session)).toBeGreaterThanOrEqual(9);
    // Each further goal is worth `repeat` of the one before, and the third adds the hat-trick.
    const first = sessionFor('ST');
    first.state.stats.goals = 1;
    expect(goalCredit(session)).toBeCloseTo(
      goalCredit(first) * R.repeat * R.repeat + (goalCredit(first) / R.goal) * R.hatTrick,
      5,
    );
    // A brace in the same match falls short of 9.
    const brace = sessionFor('ST');
    for (const scored of [true, false, true, false, false])
      moment(brace, 'shooting', 0.25, { success: scored, goal: scored }, { goals: 0.25 });
    addRating(brace, 'team', R.result);
    expect(finalRating(brace)).toBeLessThan(9);
  });

  it('lets a heroic keeper display reach 9', () => {
    const session = sessionFor('GK');
    for (let save = 0; save < 5; save++)
      moment(session, 'goalkeeping', 0.45, { success: true, danger: 0.3 }, { conceded: 0.55 });
    addRating(session, 'team', R.result + R.cleanSheet);
    expect(finalRating(session)).toBeGreaterThanOrEqual(9);
  });

  it('can still go below 5 after a disaster, but the soft limit slows the fall', () => {
    const session = sessionFor('CB');
    for (let error = 0; error < 4; error++)
      moment(
        session,
        'defending',
        0.65,
        { success: false, conceded: true, danger: 0.2 },
        { conceded: 0.35 },
      );
    addRating(session, 'team', -R.result);
    const sum = R.base + partsSum(session);
    expect(finalRating(session)).toBeLessThan(5);
    // Below the base the distance counts × lean[0], and past the lower knee less again.
    expect(session.state.stats.rating).toBeGreaterThan(sum);
  });

  it('bounds the rating to 3–10', () => {
    const session = sessionFor('ST');
    addRating(session, 'goals', 20);
    expect(session.state.stats.rating).toBe(R.maximum);
    addRating(session, 'goals', -60);
    expect(session.state.stats.rating).toBe(R.minimum);
  });

  it('lists every part and the limit in the report, summing to the rating', () => {
    for (const session of playOnEngines(setupFor('CM', 'ratings:report'), tactics)) {
      const report = session.state.report!;
      const sum = report.ratingFactors.reduce((total, factor) => total + factor.contribution, 0);
      expect(sum).toBeCloseTo(report.rating, 6);
      expect(report.ratingFactors[0]!.contribution).toBe(
        session.engine === MATCH_ENGINE_VERSION ? R.base : CONFIG.match.rating.base,
      );
    }
  });
});

describe('match-22 rewards', () => {
  const performance = { minutes: 90, rating: 7.2, goals: 1, assists: 0, objectives: 1 };
  it('keeps match-21 XP and fame exactly', () => {
    const X = CONFIG.match.xp,
      F = CONFIG.match.fame;
    expect(performanceXp(performance)).toBe(
      Math.round(90 * X.perMinute + (7.2 - X.ratingThreshold) * X.perRating + X.perGoal + 15),
    );
    expect(performanceFame(7.2, 1, 0, false)).toBe(
      Math.round((7.2 - F.ratingThreshold) * F.perRating + F.perGoal),
    );
    expect(rewardScale(sessionFor('ST', PREVIOUS_MATCH_ENGINE))).toBeNull();
  });

  it('pays the compressed scale by the position played', () => {
    const W = CONFIG.match.rewards22;
    expect(rewardScale(sessionFor('GK'))).toEqual({ position: 'GK' });
    const keeper = performanceXp(performance, { position: 'GK' });
    const striker = performanceXp(performance, { position: 'ST' });
    expect(keeper).toBe(
      Math.round(
        90 * CONFIG.match.xp.perMinute +
          (7.2 - W.xp.ratingThreshold) * W.xp.perRating * W.position.GK! +
          CONFIG.match.xp.perGoal +
          CONFIG.match.xp.perObjective,
      ),
    );
    expect(keeper).toBeGreaterThan(striker);
    // A rating point is worth more on the compressed scale than on match-21's.
    const step = (scale: { position: Position } | null) =>
      performanceXp({ ...performance, rating: 7.7 }, scale) - performanceXp(performance, scale);
    expect(step({ position: 'CM' })).toBeGreaterThanOrEqual(step(null) * 0.7);
    expect(performanceFame(6.1, 0, 0, false, { position: 'ST' })).toBe(0);
    expect(performanceFame(8, 0, 0, false, { position: 'GK' })).toBe(
      Math.round((8 - W.fame.ratingThreshold) * W.fame.perRating * W.position.GK!),
    );
  });
});

describe('match-22 statistics', () => {
  it('gives every missed background shot a result, the woodwork among them, and counts it', () => {
    let woodwork = 0;
    for (let index = 0; index < 8; index++) {
      const setup = setupFor((['ST', 'CM', 'CB', 'GK'] as const)[index % 4]!, `shots:${index}`);
      const [current, previous] = playOnEngines(setup, tactics);
      const events = current!.state.match.events;
      for (const [position, shot] of events.entries()) {
        if (shot.kind !== 'shot') continue;
        const family = shot.commentaryKey.split('.')[2]!;
        if (shot.shotResult === 'woodwork') {
          woodwork++;
          expect(family).toBe('attempt-woodwork');
        }
        // A background shot (`attempt`) either went in or was missed in a named way.
        if (family === 'attempt' && !shot.outcome)
          expect(
            events[position + 1]?.kind === 'goal' || events[position + 1]?.kind === 'save',
          ).toBe(true);
        if (family.startsWith('attempt-')) expect(shot.shotResult, family).toBeDefined();
      }
      const counted = current!.state.stats.woodwork!;
      const homeId = current!.setup.home.id;
      expect(counted).toEqual([
        events.filter((e) => e.shotResult === 'woodwork' && e.teamId === homeId).length,
        events.filter((e) => e.shotResult === 'woodwork' && e.teamId !== homeId).length,
      ]);
      // Match-21 has neither.
      expect(previous!.state.stats.woodwork).toBeUndefined();
      expect(previous!.state.match.events.some((e) => e.shotResult)).toBe(false);
    }
    expect(woodwork).toBeGreaterThan(0);
  });

  it('gives possession to the side whose style keeps the ball, and to the home side', () => {
    const possession = (style: string, neutral = false, engine: Engine = MATCH_ENGINE_VERSION) => {
      const setup = onEngine(setupFor('CM', 'possession'), engine);
      setup.home.playingStyle = style;
      setup.away.playingStyle = 'balanced';
      setup.neutral = neutral;
      return createMatchSession(setup, tactics).state.stats.homePossession;
    };
    const P = CONFIG.match.possession22;
    expect(possession('possession') - possession('counter')).toBe(
      P.styles.possession! - P.styles.counter!,
    );
    expect(possession('balanced') - possession('balanced', true)).toBeGreaterThanOrEqual(
      Math.floor(P.home),
    );
    // Match-21 ignores both.
    expect(possession('possession', false, PREVIOUS_MATCH_ENGINE)).toBe(
      possession('counter', false, PREVIOUS_MATCH_ENGINE),
    );
  });

  it('still replays the 0.9.1 golden session on match-21', () => {
    const session = goldenSession('v0.9.1-match.json.br');
    expect(session.engine).toBe(PREVIOUS_MATCH_ENGINE);
    expect(session.state.ratingParts.par).toBeUndefined();
  });
});
