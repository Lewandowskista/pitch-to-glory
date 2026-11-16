import { describe, expect, it } from 'vitest';
import type { Position, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type ChainSummary,
  type MatchSession,
} from '../src/engine/match';
import { bestChain } from '../src/engine/career/honours/moments';
import { addMatchLabels } from '../src/i18n/match';
import { momentCopy } from '../src/i18n/momentsCopy';
import { reelPolicy } from '../src/screens/match/reel/policy';
import { chainSummaries, currentChain, stepCast } from '../src/screens/match/reel/chain';
import {
  HEADER_WORDS,
  OPTION_WORDS,
  VERB_WORDS,
  cardWords,
  decisionCard,
  wordCount,
} from '../src/screens/match/reel/card';
import { staleReport } from '../src/screens/match/restoreReport';

/**
 * The highlights reel (release 1.0, X1b; docs/EXPERIENCE-REDESIGN-1.0.md 1.2–1.5) reading the
 * engine's decision chains (X1a, 1.7): the card's word budgets, the chains and casts it shows,
 * the headless policy for Watch highlights and Simulate, and the best chain kept as a Moment.
 */
addMatchLabels(momentCopy);
const world = generateWorld('match-reel', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;

/** Every step a session offered, with the card the reel drew for it, and the finished session. */
function playThrough(position: Position, index: number) {
  const club = clubs[index % 2]!;
  const ids = club.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
  let session: MatchSession = createMatchSession(
    createMatchSetup(
      world,
      clubs[0]!.id,
      clubs[1]!.id,
      ids[Math.floor(index / 2) % ids.length]!,
      `reel:${position}:${index}`,
    ),
    tactics,
  );
  const cards: ReturnType<typeof decisionCard>[] = [];
  const casts: ReturnType<typeof stepCast>[] = [];
  const steps: { step: number; steps: number }[] = [];
  let agreed = true;
  while (session.state.match.status !== 'finished') {
    const moment = session.state.currentMoment;
    if (moment && moment.follows !== 'shootout') {
      const chain = currentChain(session)!;
      cards.push(decisionCard(chain, moment, session.state.match.score));
      casts.push(stepCast(session.setup, moment));
      steps.push({ step: chain.step, steps: chain.steps });
    }
    const command = autoPlayCommand(session);
    if (JSON.stringify(reelPolicy(session)) !== JSON.stringify(command)) agreed = false;
    session = applyMatchCommand(session, command);
  }
  return { session, cards, casts, steps, agreed };
}
const played = (['ST', 'CM', 'CB', 'GK'] as Position[]).flatMap((position) =>
  Array.from({ length: 4 }, (_, index) => playThrough(position, index)),
);

describe('the highlights reel on decision chains (X1b)', () => {
  it('draws every step as a card within its word budgets, with the chain’s pips', () => {
    let cards = 0;
    for (const run of played)
      run.cards.forEach((card, index) => {
        cards++;
        expect(wordCount(card.header)).toBeLessThanOrEqual(HEADER_WORDS);
        expect(cardWords(card)).toBeLessThanOrEqual(OPTION_WORDS);
        expect(card.options.length).toBeGreaterThanOrEqual(2);
        expect(card.options.length).toBeLessThanOrEqual(3);
        for (const option of card.options) {
          expect(wordCount(option.verb)).toBeLessThanOrEqual(VERB_WORDS);
          // The engine names each chance's outcome ("Goal 34%"), with no raw keys left.
          expect(option.percent).toMatch(/^\D+ \d+%$/);
          expect(option.choice.band).toBe(option.band);
          if (option.risk) expect(option.risk.text).not.toContain('match.');
        }
        const { step, steps } = run.steps[index]!;
        expect(card.pips).toEqual({ step: step + 1, steps });
      });
    expect(cards).toBeGreaterThan(100);
  });

  it('reads the engine’s chains, each with the key moments it was played from', () => {
    for (const { session } of played) {
      const summaries = chainSummaries(session);
      expect(summaries.map((summary) => summary.id)).toEqual(
        session.state.chains!.map((chain) => chain.id),
      );
      for (const summary of summaries) {
        expect(summary.momentIds.length).toBeGreaterThanOrEqual(summary.results.length);
        expect(summary.momentIds.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('casts each step from the engine: seven players at most and four ghosts', () => {
    for (const run of played)
      for (const cast of run.casts) {
        expect(cast.you).toBe(run.session.setup.selectedPlayerId);
        const named = [cast.opponent, ...cast.teammates, ...cast.defenders, cast.keeper];
        expect(named.filter(Boolean).length + 1).toBeLessThanOrEqual(7);
        expect(cast.ghosts.length).toBeLessThanOrEqual(4);
      }
  });

  it('plays Watch highlights and Simulate with the season simulation’s own policy', () => {
    for (const run of played) expect(run.agreed).toBe(true);
  });
});

describe('the best chain of a match (Moments)', () => {
  const chain = (outcome: ChainSummary['outcome'], odds: number[], positive = true) =>
    ({
      id: `${outcome}-${odds.join()}`,
      kind: 'attack',
      minute: 10,
      outcome,
      positive,
      steps: 2,
      results: odds.map((probability, step) => ({
        step,
        choiceId: 'x',
        probability,
        success: true,
        cause: { key: 'k', params: {} },
      })),
    }) satisfies ChainSummary;

  it('prefers a goal, then the longest odds overcome, and never a negative chain', () => {
    expect(bestChain([chain('lost', [0.2], false)])).toBeNull();
    expect(
      bestChain([chain('stop', [0.1]), chain('goal', [0.8, 0.6]), chain('goal', [0.5, 0.3])])?.id,
    ).toBe('goal-0.5,0.3');
    expect(bestChain([chain('won', [0.2]), chain('chance', [0.9])])?.id).toBe('chance-0.9');
  });
});

describe('a report kept on the device (X1b)', () => {
  const at = (week: number) =>
    JSON.stringify({ outcome: { record: { season: world.date.season, week } } });
  const careerWorld = (pending: boolean) =>
    ({
      ...world,
      career: { matches: [] },
      fixtures: pending ? world.fixtures : {},
    }) as unknown as World;

  it('is stale once the week moves on, or when the record is damaged', () => {
    const quiet = careerWorld(false);
    expect(staleReport(at(world.date.week), quiet)).toBe(false);
    expect(staleReport(at(world.date.week - 1), quiet)).toBe(true);
    expect(staleReport('not json', quiet)).toBe(true);
    expect(staleReport(null, quiet)).toBe(false);
  });
});
