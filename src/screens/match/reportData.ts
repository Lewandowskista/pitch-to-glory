/**
 * What the match report shows, derived from a finished session alone (release 1.0, step 5.1):
 * the player's key moments against the best-value alternative, the match story (goals, cards,
 * team statistics) and the touchline reaction for the match. Presentation only: nothing here
 * changes a rule, an outcome or a reward, and every value is the same on every render.
 */
import type {
  CardKind,
  DecisionChoice,
  KeyMoment,
  MatchEvent,
  ProbabilityFactor,
} from '../../model/domain';
import type { MatchSession } from '../../engine/match/types';
import { expectedImpact } from '../../engine/match/decisions';
import { CONFIG } from '../../engine/config';
import { createRng } from '../../engine/rng';
import { chanceMeaning, type ChanceMeaning } from './choices';

/**
 * Two choices whose expected values differ by no more than a hundredth of a goal are worth
 * the same: a choice this close to the best counts as the best-value option.
 */
export const VALUE_TOLERANCE = 0.01;

export interface RecapChoice {
  id: string;
  labelKey: string;
  probability: number;
  meaning: ChanceMeaning;
  /** Expected goal difference for the player's side (goals for minus goals against). */
  value: number;
}
export interface RecapEntry {
  momentId: string;
  minute: number;
  moment: KeyMoment;
  chosen: RecapChoice;
  success: boolean;
  /** The factors behind the chance, as the decision showed them. */
  factors: ProbabilityFactor[];
  /** The choice with the highest expected value when it was worth more than the one made. */
  better: RecapChoice | null;
  /** How much more the better choice was worth, in expected goals (0 when the best was taken). */
  gap: number;
}
export interface MomentRecap {
  entries: RecapEntry[];
  /** Moments where the choice made was the best-value one (within the tolerance). */
  bestValue: number;
}

function recapChoice(moment: KeyMoment, choice: DecisionChoice, probability: number): RecapChoice {
  return {
    id: choice.id,
    labelKey: choice.labelKey,
    probability,
    meaning: chanceMeaning(moment.situationId, choice.id),
    value: expectedImpact({ ...choice, probability }).net,
  };
}

/**
 * Every key moment the player answered, in the order they were played: the choice and its
 * stated chance, what came of it, and the best-value alternative when it was worth more.
 */
export function momentRecap(session: MatchSession): MomentRecap {
  const match = session.state.match;
  const entries: RecapEntry[] = [];
  const seen = new Set<string>();
  for (const event of match.events) {
    const outcome = event.outcome;
    if (!outcome || seen.has(outcome.input.momentId)) continue;
    seen.add(outcome.input.momentId);
    const moment = match.keyMoments.find((entry) => entry.id === outcome.input.momentId);
    const choice = moment?.choices.find((entry) => entry.id === outcome.input.choiceId);
    if (!moment || !choice) continue;
    const chosen = recapChoice(moment, choice, outcome.probability);
    // The most valuable alternative at the odds it was offered (the first of equals).
    let best: RecapChoice | null = null;
    for (const other of moment.choices) {
      if (other.id === choice.id) continue;
      const option = recapChoice(moment, other, other.probability);
      if (!best || option.value > best.value) best = option;
    }
    const better = best && best.value - chosen.value > VALUE_TOLERANCE ? best : null;
    entries.push({
      momentId: moment.id,
      minute: moment.minute,
      moment,
      chosen,
      success: outcome.success,
      factors: outcome.factors,
      better,
      gap: better ? better.value - chosen.value : 0,
    });
  }
  return { entries, bestValue: entries.filter((entry) => !entry.better).length };
}

export interface StoryGoal {
  id: string;
  minute: number;
  playerId: string | null;
  /** The player whose key-moment choice made the goal, when the engine names one. */
  assistId: string | null;
}
export interface StoryCard {
  id: string;
  minute: number;
  playerId: string;
  card: CardKind;
}
export interface TeamStat {
  key: 'shots' | 'onTarget' | 'possession' | 'xg';
  home: number;
  away: number;
}
export interface MatchStory {
  goals: [StoryGoal[], StoryGoal[]];
  cards: [StoryCard[], StoryCard[]];
  stats: TeamStat[];
}

/** Goals and cards for each side (home first) in the order they came, and the team statistics. */
export function matchStory(session: MatchSession): MatchStory {
  const { setup, state } = session;
  const sideOf = (event: MatchEvent) => (event.teamId === setup.home.id ? 0 : 1);
  const goals: [StoryGoal[], StoryGoal[]] = [[], []];
  const cards: [StoryCard[], StoryCard[]] = [[], []];
  for (const event of state.match.events) {
    if (event.kind === 'goal')
      goals[sideOf(event)].push({
        id: event.id,
        minute: event.minute,
        playerId: event.playerId,
        assistId: event.assistId ?? null,
      });
    else if (event.kind === 'card' && event.card && event.playerId)
      cards[sideOf(event)].push({
        id: event.id,
        minute: event.minute,
        playerId: event.playerId,
        card: event.card,
      });
  }
  const s = state.stats;
  const stats: TeamStat[] = [
    { key: 'shots', home: s.homeShots, away: s.awayShots },
    { key: 'onTarget', home: s.shotsOnTarget[0], away: s.shotsOnTarget[1] },
    { key: 'possession', home: s.homePossession, away: 100 - s.homePossession },
    {
      key: 'xg',
      home: Math.round(s.xg[0] * 100) / 100,
      away: Math.round(s.xg[1] * 100) / 100,
    },
  ];
  return { goals, cards, stats };
}

export interface XpBreakdown {
  /** Performance XP: minutes, rating, goals, assists and objectives. */
  performance: number;
  /** XP from the key decisions that came off (more for the unlikely ones). */
  decisions: number;
  /** The opposition multiplier, as the recorded total implies it. */
  opposition: number;
  /** The occasion multiplier (1 for a league game). */
  importance: number;
  total: number;
}
/**
 * How a recorded match's XP was made up: performance and decision XP, weighted by the
 * opposition and the occasion. Decision XP follows the commit's rule (each decision that came
 * off, more for one under even odds, plus `analyst`, the lifestyle bonus per decision) on the
 * recap's decisions; the opposition multiplier is the one the recorded total implies, so the
 * rows always multiply out to the XP granted.
 */
export function xpBreakdown(
  session: MatchSession,
  recap: MomentRecap,
  performance: number,
  total: number,
  analyst: number,
): XpBreakdown {
  const K = CONFIG.career.decisionXp;
  const decisions = recap.entries.reduce(
    (sum, entry) =>
      sum +
      (entry.success
        ? // The career records each chance to three decimals before it is compared.
          (Math.round(entry.chosen.probability * 1000) / 1000 < 0.5 ? K.underdog : K.success) +
          analyst
        : 0),
    0,
  );
  const importance = session.setup.fixture?.importance ?? 1;
  const base = (performance + decisions) * importance;
  return {
    performance,
    decisions,
    opposition: base > 0 ? total / base : 1,
    importance,
    total,
  };
}

/**
 * One of a reaction's variants, chosen from the match seed: the same match always shows the
 * same line (a refresh never changes it), while different matches vary.
 */
export function pickVariant<T>(seed: string, key: string, variants: readonly T[]): T {
  if (variants.length === 0) throw new Error(`No variants for ${key}`);
  return createRng(`${seed}:report:${key}`).pick(variants);
}
