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
import { expectedImpact } from '../../engine/match/value';
import { rolePosition } from '../../engine/match/shared';
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
  /** In added time (match-22): the added minute. */
  addedTime?: number;
  playerId: string | null;
  /** The player whose key-moment choice made the goal, when the engine names one. */
  assistId: string | null;
}
export interface StoryCard {
  id: string;
  minute: number;
  /** In added time (match-22): the added minute. */
  addedTime?: number;
  playerId: string;
  card: CardKind;
}
export interface TeamStat {
  key: 'shots' | 'onTarget' | 'woodwork' | 'possession' | 'xg';
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
        ...(event.addedTime ? { addedTime: event.addedTime } : {}),
        playerId: event.playerId,
        assistId: event.assistId ?? null,
      });
    else if (event.kind === 'card' && event.card && event.playerId)
      cards[sideOf(event)].push({
        id: event.id,
        minute: event.minute,
        ...(event.addedTime ? { addedTime: event.addedTime } : {}),
        playerId: event.playerId,
        card: event.card,
      });
  }
  const s = state.stats;
  const stats: TeamStat[] = [
    { key: 'shots', home: s.homeShots, away: s.awayShots },
    { key: 'onTarget', home: s.shotsOnTarget[0], away: s.shotsOnTarget[1] },
    // Engine match-22 counts the woodwork; shown when a shot hit it.
    ...(s.woodwork && s.woodwork[0] + s.woodwork[1] > 0
      ? [{ key: 'woodwork' as const, home: s.woodwork[0], away: s.woodwork[1] }]
      : []),
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

/**
 * What the touchline reacts to beyond the result (release 1.0, step 5.5), read from the goals
 * from the player's side: a late winner, equaliser or defeat (the last goal, from the 85th
 * minute, changed the result), a comeback win, a beating by three or more either way, or a
 * clean sheet kept by a keeper or a defender. Undefined when the match told none of these.
 */
export type ReactionStory =
  | 'late-winner'
  | 'comeback'
  | 'late-equaliser'
  | 'late-defeat'
  | 'heavy-defeat'
  | 'thrashing'
  | 'clean-sheet';
const LATE_GOAL_MINUTE = 85;
export function reactionStory(session: MatchSession): ReactionStory | undefined {
  const { setup, state } = session;
  const player = setup.players[setup.selectedPlayerId]!;
  const own = player.clubId === setup.home.id ? 0 : 1;
  const other = own === 0 ? 1 : 0;
  const score: [number, number] = [0, 0];
  let trailed = false;
  let last: { side: number; minute: number; before: number } | undefined;
  for (const event of state.match.events) {
    if (event.kind !== 'goal') continue;
    const side = event.teamId === setup.home.id ? 0 : 1;
    const before = score[own] - score[other];
    score[side]++;
    last = { side: side === own ? 0 : 1, minute: event.minute, before };
    if (score[own] < score[other]) trailed = true;
  }
  const margin = score[own] - score[other];
  const late = last !== undefined && last.minute >= LATE_GOAL_MINUTE;
  if (late && margin > 0 && last!.side === 0 && last!.before === 0) return 'late-winner';
  if (margin > 0 && trailed) return 'comeback';
  if (late && margin === 0 && last!.side === 0) return 'late-equaliser';
  if (late && margin < 0 && last!.side === 1 && last!.before === 0) return 'late-defeat';
  if (margin <= -3) return 'heavy-defeat';
  if (margin >= 3) return 'thrashing';
  const defends = ['GK', 'CB', 'LB', 'RB'].includes(rolePosition(setup));
  if (margin >= 0 && score[other] === 0 && defends && !state.substituted) return 'clean-sheet';
  return undefined;
}
/**
 * The reaction key the report quotes: the engine's (by result and rating band, or a sending
 * off), or the match story's when it told one. The manager's story lines keep the rating's
 * tone: praise for a solid or star match, a word of warning for a poor one.
 */
export function reactionKey(session: MatchSession, who: 'manager' | 'fans'): string {
  const state = session.state;
  const engine = who === 'manager' ? state.managerReactionKey : state.fanReactionKey;
  // A dismissal, or a match spent unused on the bench (match-22), is what they react to.
  const unused = state.bench !== undefined && state.bench.on === undefined;
  const story = state.sentOff || unused ? undefined : reactionStory(session);
  if (!story) return engine;
  return who === 'fans'
    ? `match.reaction.fans.story.${story}`
    : `match.reaction.manager.story.${story}.${engine.endsWith('.poor') ? 'poor' : 'good'}`;
}
