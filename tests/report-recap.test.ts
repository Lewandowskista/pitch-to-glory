import { beforeAll, describe, expect, it } from 'vitest';
import type { DecisionChoice, KeyMoment, MatchEvent, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { CONFIG } from '../src/engine/config';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchSession,
} from '../src/engine/match';
import { expectedImpact } from '../src/engine/match/decisions';
import {
  autoPlayCommand,
  careerMatchSetup,
  commitCareerMatch,
  defaultTactics,
} from '../src/engine/career/matches';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { reactionVariants } from '../src/i18n/matchReport';
import {
  VALUE_TOLERANCE,
  matchStory,
  momentRecap,
  pickVariant,
  xpBreakdown,
} from '../src/screens/match/reportData';
import { nationalCareer } from './support/world';

/** The match report's derivations (release 1.0, step 5.1): presentation only. */
const world = generateWorld('report-recap', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
function played(seed: string, position = 'ST'): MatchSession {
  const club = clubs[0]!;
  const id = club.playerIds.find((entry) => world.players[entry]!.primaryPosition === position)!;
  let session = createMatchSession(createMatchSetup(world, club.id, clubs[1]!.id, id, seed), {
    role: 'balanced',
    risk: 'balanced',
    mentality: 'balanced',
  });
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, autoPlayCommand(session));
  return session;
}

const choice = (id: string, probability: number, successGoal: number): DecisionChoice =>
  ({
    id,
    labelKey: `match.choice.${id}`,
    probability,
    factors: [],
    requiredTraitId: null,
    traitId: null,
    attributes: [],
    stakes: { successGoal, successConcede: 0, failureGoal: 0, failureConcede: 0.1 },
  }) as DecisionChoice;
/** A finished session holding one answered moment with the given choices. */
function oneMoment(choices: DecisionChoice[], chosen: string, success: boolean): MatchSession {
  const moment = {
    id: 'moment-1',
    minute: 23,
    situationId: 'box-chance',
    situationKey: 'match.situation.box-chance',
    choices,
  } as unknown as KeyMoment;
  const picked = choices.find((entry) => entry.id === chosen)!;
  const event = {
    id: 'event-1',
    minute: 23,
    kind: 'shot',
    outcome: {
      input: { momentId: moment.id, choiceId: chosen },
      success,
      roll: 0.5,
      probability: picked.probability,
      factors: [{ labelKey: 'match.factor.base', source: 'attribute', contribution: 0.3 }],
    },
  } as unknown as MatchEvent;
  return {
    setup: { seed: 'one', season: 1 },
    state: { match: { events: [event, { ...event, id: 'event-2' }], keyMoments: [moment] } },
  } as unknown as MatchSession;
}

describe('the "Your moments" recap', () => {
  it('lists every answered key moment once, in the order they were played', () => {
    for (const seed of ['recap-a', 'recap-b', 'recap-c']) {
      const session = played(seed);
      const recap = momentRecap(session);
      // Key moments only: routine outcomes the engine resolves on its own are not choices.
      const moments = new Set(session.state.match.keyMoments.map((moment) => moment.id));
      const answered = new Set(
        session.state.match.events.flatMap((event) =>
          event.outcome && moments.has(event.outcome.input.momentId)
            ? [event.outcome.input.momentId]
            : [],
        ),
      );
      expect(recap.entries.map((entry) => entry.momentId)).toEqual([...answered]);
      expect(recap.entries.length).toBeGreaterThan(0);
      for (let index = 1; index < recap.entries.length; index++)
        expect(recap.entries[index]!.minute).toBeGreaterThanOrEqual(
          recap.entries[index - 1]!.minute,
        );
      for (const entry of recap.entries) {
        const offered = entry.moment.choices.find((option) => option.id === entry.chosen.id)!;
        // The stated chance is the one the decision had.
        expect(entry.chosen.probability).toBeCloseTo(offered.probability, 9);
        const best = Math.max(...entry.moment.choices.map((option) => expectedImpact(option).net));
        const worth = expectedImpact(offered).net;
        if (best - worth > VALUE_TOLERANCE) {
          expect(entry.better!.value).toBeCloseTo(best, 9);
          expect(entry.gap).toBeCloseTo(best - worth, 9);
        } else {
          expect(entry.better).toBeNull();
          expect(entry.gap).toBe(0);
        }
      }
      expect(recap.bestValue).toBe(recap.entries.filter((entry) => !entry.better).length);
    }
  });

  it('names the better choice and how much more it was worth', () => {
    const choices = [choice('near-post', 0.2, 1), choice('square-pass', 0.74, 0.5)];
    const recap = momentRecap(oneMoment(choices, 'near-post', false));
    expect(recap.entries).toHaveLength(1);
    const [entry] = recap.entries;
    expect(entry!.minute).toBe(23);
    expect(entry!.success).toBe(false);
    expect(entry!.chosen).toMatchObject({ id: 'near-post', probability: 0.2, meaning: 'score' });
    expect(entry!.better).toMatchObject({
      id: 'square-pass',
      probability: 0.74,
      meaning: 'complete',
    });
    // 0.74 × 0.5 − 0.26 × 0.1 against 0.2 × 1 − 0.8 × 0.1.
    expect(entry!.gap).toBeCloseTo(0.344 - 0.12, 9);
    expect(recap.bestValue).toBe(0);
  });

  it('counts the best-value choice, and one within a hundredth of a goal of it', () => {
    const choices = [choice('near-post', 0.5, 0.8), choice('square-pass', 0.505, 0.8)];
    for (const chosen of ['near-post', 'square-pass']) {
      const recap = momentRecap(oneMoment(choices, chosen, true));
      expect(recap.entries[0]!.better).toBeNull();
      expect(recap.bestValue).toBe(1);
    }
  });
});

describe('the match story', () => {
  it('lists each side’s goals to the score, and the team statistics', () => {
    for (const seed of ['story-a', 'story-b', 'story-c', 'story-d']) {
      const session = played(seed);
      const story = matchStory(session);
      expect(story.goals[0].length).toBe(session.state.match.score[0]);
      expect(story.goals[1].length).toBe(session.state.match.score[1]);
      // The woodwork (match-22) shows when a shot hit it.
      const woodwork = session.state.stats.woodwork ?? [0, 0];
      expect(story.stats.map((stat) => stat.key)).toEqual([
        'shots',
        'onTarget',
        ...(woodwork[0] + woodwork[1] > 0 ? ['woodwork'] : []),
        'possession',
        'xg',
      ]);
      const possession = story.stats.find((stat) => stat.key === 'possession')!;
      expect(possession.home + possession.away).toBe(100);
    }
  });
});

describe('touchline reactions', () => {
  const keys = [
    ...['manager', 'fans'].flatMap((who) =>
      ['win', 'draw', 'loss'].flatMap((result) =>
        ['star', 'solid', 'poor'].map(
          (performance) => `match.reaction.${who}.${result}.${performance}`,
        ),
      ),
    ),
    'match.reaction.manager.sent-off.second-yellow',
    'match.reaction.manager.sent-off.straight-red',
    ...['win', 'draw', 'loss'].map((result) => `match.reaction.fans.sent-off.${result}`),
  ];

  it('has at least four distinct lines for every outcome', () => {
    for (const key of keys) {
      const lines = reactionVariants(key);
      expect(lines.length, key).toBeGreaterThanOrEqual(4);
      expect(new Set(lines).size, key).toBe(lines.length);
    }
  });

  it('chooses the same line for the same match, and varies across matches', () => {
    for (const key of keys) {
      const lines = reactionVariants(key);
      expect(pickVariant('seed-1', key, lines)).toBe(pickVariant('seed-1', key, lines));
      const seen = new Set(
        Array.from({ length: 64 }, (_, index) => pickVariant(`seed-${index}`, key, lines)),
      );
      expect(seen.size, key).toBe(lines.length);
    }
    // The manager and the fans draw apart.
    const manager = reactionVariants(keys[0]!);
    expect(
      Array.from({ length: 16 }, (_, index) => pickVariant(`m-${index}`, keys[0]!, manager)),
    ).not.toEqual(
      Array.from({ length: 16 }, (_, index) => pickVariant(`m-${index}`, keys[9]!, manager)),
    );
  });
});

describe('the XP breakdown', () => {
  let career: World;
  beforeAll(() => {
    career = nationalCareer();
  });

  it('multiplies out to the XP the career recorded, with the commit’s decision XP', () => {
    const current = structuredClone(career);
    while (!advanceCareerWeek(current, { inPlace: true }).pendingFixtureId);
    const fixture = pendingCareerFixture(current)!;
    const setup = careerMatchSetup(current, fixture);
    let session = createMatchSession(setup, defaultTactics(current, setup));
    while (session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    const opponentId =
      setup.home.id === current.players[current.career!.playerId]!.clubId
        ? fixture.awayId
        : fixture.homeId;
    const C = CONFIG.career;
    const opposition = Math.min(
      C.oppositionRange[1],
      Math.max(
        C.oppositionRange[0],
        C.oppositionBase + current.clubs[opponentId]!.reputation * C.oppositionSlope,
      ),
    );
    const outcome = commitCareerMatch(current, session);
    const breakdown = xpBreakdown(
      session,
      momentRecap(session),
      outcome.final.xp,
      outcome.record.xp,
      0,
    );
    expect(breakdown.total).toBe(outcome.record.xp);
    expect(
      Math.round(
        (breakdown.performance + breakdown.decisions) * breakdown.opposition * breakdown.importance,
      ),
    ).toBe(outcome.record.xp);
    // Decision XP as the commit counts it (4 or 8 a decision): the implied opposition is the
    // real multiplier, to the rounding of the total.
    expect(breakdown.decisions).toBeGreaterThan(0);
    expect(Math.abs(breakdown.opposition - opposition)).toBeLessThan(0.02);
  });
});
