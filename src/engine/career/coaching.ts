/**
 * Coaching (Phase 5.2): recent key-moment decisions turned into training advice, and one
 * season development goal. Advice is derived each time from saved records and never stored;
 * an accepted goal is stored with its season and version and never changes afterwards.
 */
import type {
  Career,
  CareerCoaching,
  DecisionFamily,
  DecisionSample,
  Position,
  SeasonGoal,
  SeasonGoalKind,
  TrainingFocus,
  TrainingPlan,
  World,
} from '../../model/domain';
import { CONFIG } from '../config';
import type { AnyAttribute } from '../ageing';
import { SITUATION_BY_ID } from '../match/situations';
import { expectedImpact } from '../match/decisions';
import type { MatchSession } from '../match/types';
import { currentRole } from './market/rules';
import { attributeCost, attributeValue, trainableAttributes } from './progression';
import { defaultTrainingPlan } from './training';

const K = CONFIG.career.coaching;

export const emptyCoaching = (): CareerCoaching => ({
  version: 1,
  recent: [],
  goal: null,
  declinedSeason: null,
  history: [],
});
/** The career's coaching record, created for a career saved before coaching. */
export function coachingOf(career: Career): CareerCoaching {
  career.coaching ??= emptyCoaching();
  return career.coaching;
}

/** The decisions a finished match's selected player made: kind, outcome, odds, attributes. */
export function matchDecisions(
  session: MatchSession,
  date: { season: number; week: number },
): DecisionSample[] {
  const match = session.state.match;
  const samples: DecisionSample[] = [];
  const seen = new Set<string>();
  for (const event of match.events) {
    const outcome = event.outcome;
    if (!outcome || seen.has(outcome.input.momentId)) continue;
    seen.add(outcome.input.momentId);
    const moment = match.keyMoments.find((entry) => entry.id === outcome.input.momentId);
    const choice = moment?.choices.find((entry) => entry.id === outcome.input.choiceId);
    const template = moment
      ? SITUATION_BY_ID[moment.situationId]?.choices.find(
          (entry) => entry.id === outcome.input.choiceId,
        )
      : undefined;
    if (!moment || !choice || !template) continue;
    // What the attributes did to the chosen odds, and what a better choice would have been worth.
    const attributeEffect =
      choice.factors.find((factor) => factor.labelKey === 'match.factor.attribute')?.contribution ??
      0;
    const best = Math.max(...moment.choices.map((entry) => expectedImpact(entry).net));
    samples.push({
      season: date.season,
      week: date.week,
      family: template.family as DecisionFamily,
      success: outcome.success,
      probability: Math.round(outcome.probability * 1000) / 1000,
      attributes: choice.attributes.slice(0, 3),
      // `+ 0` turns a rounded −0 into 0, which a save writes and reads back unchanged.
      attributeEffect: Math.round(attributeEffect * 1000) / 1000 + 0,
      regret: Math.round(Math.max(0, best - expectedImpact(choice).net) * 1e4) / 1e4,
    });
  }
  return samples;
}
/** Keep a recorded match's decisions, newest last, within the limit. */
export function recordDecisions(career: Career, samples: readonly DecisionSample[]): void {
  const coaching = coachingOf(career);
  coaching.recent.push(...samples);
  if (coaching.recent.length > K.recentLimit)
    coaching.recent.splice(0, coaching.recent.length - K.recentLimit);
}

export type AdviceReason = 'injury' | 'fatigue' | 'decisions' | 'position';
export interface Recommendation {
  focus: TrainingFocus;
  reason: AdviceReason;
  /**
   * For advice from decisions: the kind, how many were judged, and the success chance the
   * player's attributes cost each one on average (percentage points against the match level).
   */
  family?: DecisionFamily;
  attempts?: number;
  cost?: number;
}
/**
 * What recent decisions say that training cannot fix: misses beyond what the chances
 * predicted (bad luck: the odds already counted the attributes), or choices that gave up
 * expected value against the best option offered.
 */
export interface CoachNote {
  kind: 'variance' | 'choices';
  family: DecisionFamily;
  attempts: number;
  successes?: number;
  expected?: number;
  /** Expected goal difference given up per decision. */
  regret?: number;
}
export interface CoachAdvice {
  /** What the advice rests on: recovery, recent decisions, or the position alone. */
  basis: 'recovery' | 'decisions' | 'steady' | 'position';
  /** Decisions considered. */
  sample: number;
  recommendations: Recommendation[];
  notes: CoachNote[];
}

/** An attribute the player can usefully train now: right for their position, below their cap. */
function useful(world: World, key: string): boolean {
  const player = world.players[world.career!.playerId]!;
  return (
    trainableAttributes(player).includes(key as AnyAttribute) &&
    attributeCost(world, key as AnyAttribute) === CONFIG.career.costs.belowCap
  );
}
const mean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * Up to two training recommendations, and notes on what training cannot change (review phase
 * 2, step 2.3). Every outcome is drawn at the odds shown, so fewer successes than predicted is
 * luck, never a reason to train. Recovery comes first while injured or heavily fatigued.
 * Otherwise:
 * - execution: kinds of decision where the player's attributes cost the chosen odds a clear
 *   amount against the match level point to the attribute that cost the most;
 * - choices: kinds where the chosen option gave up expected value against the best offered
 *   are noted, as a matter of choosing, not training;
 * - variance: kinds that worked clearly less often than their chances predicted are noted as
 *   bad luck.
 * Decisions recorded before schema 22 carry neither cost nor choice value, so they count only
 * for the variance note. With nothing to train, the advice is the position's balanced plan.
 */
export function coachAdvice(world: World): CoachAdvice {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const recent = career.coaching?.recent ?? [];
  const recommendations: Recommendation[] = [];
  const notes: CoachNote[] = [];
  if (career.injury)
    return {
      basis: 'recovery',
      sample: recent.length,
      recommendations: [{ focus: 'recovery', reason: 'injury' }],
      notes,
    };
  if (player.fatigue >= K.fatigue) recommendations.push({ focus: 'recovery', reason: 'fatigue' });
  if (recent.length >= K.minimumDecisions) {
    const families = new Map<DecisionFamily, DecisionSample[]>();
    for (const sample of recent)
      families.set(sample.family, [...(families.get(sample.family) ?? []), sample]);
    const execution: { family: DecisionFamily; samples: DecisionSample[]; cost: number }[] = [];
    for (const [family, samples] of [...families.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      if (samples.length < K.minimumAttempts) continue;
      const successes = samples.filter((sample) => sample.success).length;
      const expected = samples.reduce((sum, sample) => sum + sample.probability, 0);
      if (expected - successes >= K.shortfall)
        notes.push({
          kind: 'variance',
          family,
          attempts: samples.length,
          successes,
          expected: Math.round(expected * 10) / 10,
        });
      const judged = samples.filter((sample) => sample.attributeEffect !== undefined);
      if (judged.length < K.minimumAttempts) continue;
      const regret = mean(judged.map((sample) => sample.regret ?? 0));
      if (regret >= K.regret)
        notes.push({
          kind: 'choices',
          family,
          attempts: judged.length,
          regret: Math.round(regret * 1000) / 1000,
        });
      const cost = -mean(judged.map((sample) => sample.attributeEffect!));
      if (cost >= K.execution) execution.push({ family, samples: judged, cost });
    }
    const chosen = new Set<string>();
    for (const entry of execution.sort((a, b) => b.cost - a.cost)) {
      if (recommendations.length >= 2) break;
      // The attribute behind the cost: governing attributes of the decisions it held back,
      // weighted by how much (the strongest attribute counts double).
      const weight = new Map<string, number>();
      for (const sample of entry.samples) {
        const held = -(sample.attributeEffect ?? 0);
        if (held <= 0) continue;
        sample.attributes.forEach((key, index) =>
          weight.set(key, (weight.get(key) ?? 0) + held * (index === 0 ? 2 : 1)),
        );
      }
      const key = [...weight.entries()]
        .filter(([attribute]) => !chosen.has(attribute) && useful(world, attribute))
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
      if (!key) continue;
      chosen.add(key);
      recommendations.push({
        focus: key as TrainingFocus,
        reason: 'decisions',
        family: entry.family,
        attempts: entry.samples.length,
        cost: Math.round(entry.cost * 1000) / 10,
      });
    }
    if (recommendations.some((entry) => entry.reason === 'decisions'))
      return { basis: 'decisions', sample: recent.length, recommendations, notes };
  }
  // Nothing to train: the position's balanced plan, said plainly.
  for (const session of defaultTrainingPlan(player.primaryPosition).sessions) {
    if (recommendations.length >= 2) break;
    if (!recommendations.some((entry) => entry.focus === session.focus))
      recommendations.push({ focus: session.focus, reason: 'position' });
  }
  return {
    basis:
      recommendations[0]?.reason === 'fatigue'
        ? 'recovery'
        : recent.length >= K.minimumDecisions
          ? 'steady'
          : 'position',
    sample: recent.length,
    recommendations,
    notes,
  };
}

/**
 * A training plan carrying the advice, for the player to review and save. The current plan
 * is the starting point and stays in force until saved: recovery replaces the first session
 * (all of them while injured); each other recommendation takes the next session.
 */
export function adviceDraft(plan: TrainingPlan, advice: CoachAdvice): TrainingPlan {
  const sessions = plan.sessions.map((session) => ({ ...session }));
  if (advice.recommendations[0]?.reason === 'injury')
    return {
      sessions: sessions.map(() => ({
        focus: 'recovery' as TrainingFocus,
        intensity: 'low' as const,
      })),
      extra: null,
    };
  advice.recommendations.slice(0, sessions.length).forEach((recommendation, index) => {
    sessions[index] = {
      focus: recommendation.focus,
      intensity: recommendation.reason === 'fatigue' ? 'low' : 'normal',
    };
  });
  return { sessions, extra: plan.extra ? { ...plan.extra } : null };
}

// ── Season goal ─────────────────────────────────────────────────────────────

const ATTACKING: readonly Position[] = ['LW', 'RW', 'ST'];
const DEFENSIVE: readonly Position[] = ['CB', 'LB', 'RB', 'DM'];
/** The attribute an attacker or keeper develops, if it is below their cap. */
const DEVELOP: Partial<Record<Position, string[]>> = {
  GK: ['reflexes', 'handling', 'oneOnOnes'],
  ST: ['finishing', 'composure', 'firstTouch'],
  LW: ['dribbling', 'crossing', 'acceleration'],
  RW: ['dribbling', 'crossing', 'acceleration'],
};

/** A key attribute for the player's position they can still develop, if any. */
export function developmentAttribute(world: World): string | null {
  const player = world.players[world.career!.playerId]!;
  const preferred = DEVELOP[player.primaryPosition] ?? [];
  const found = preferred.find((key) => useful(world, key));
  if (found) return found;
  return trainableAttributes(player).find((key) => useful(world, key)) ?? null;
}

/** The goal a player would be offered this season, from their squad role and position. */
export function goalOffer(world: World): Omit<SeasonGoal, 'accepted'> | null {
  const career = world.career!;
  const coaching = career.coaching;
  const season = world.date.season;
  if (world.phase === 'complete') return null;
  if (coaching?.goal?.season === season || coaching?.declinedSeason === season) return null;
  const player = world.players[career.playerId]!;
  const role = currentRole(world);
  const base = { version: 1 as const, season, attribute: null, baseline: 0 };
  if (role === 'backup' || role === 'youth')
    return { ...base, kind: 'appearances', target: K.goals.appearances[role] };
  const position = player.primaryPosition;
  if (DEFENSIVE.includes(position)) return { ...base, kind: 'defending', target: K.goals.tackles };
  if (position === 'GK' || ATTACKING.includes(position)) {
    const attribute = DEVELOP[position]!.find((key) => useful(world, key));
    if (attribute)
      return {
        ...base,
        kind: 'attribute',
        attribute,
        baseline: attributeValue(player, attribute as AnyAttribute),
        target: K.goals.attributeGain,
      };
    return { ...base, kind: 'appearances', target: K.goals.appearances[role] };
  }
  return { ...base, kind: 'passing', target: K.goals.passes };
}
/** Progress towards a goal, from the season's finalized records. */
export function goalProgress(world: World, goal: SeasonGoal): number {
  const career = world.career!;
  const season = career.matches.filter((match) => match.season === goal.season);
  switch (goal.kind) {
    case 'appearances':
      return season.filter((match) => match.minutes > 0).length;
    case 'passing':
      return season.reduce((sum, match) => sum + (match.passes?.[0] ?? 0), 0);
    case 'defending':
      return season.reduce((sum, match) => sum + (match.tackles ?? 0), 0);
    case 'attribute':
      return Math.max(
        0,
        attributeValue(world.players[career.playerId]!, goal.attribute as AnyAttribute) -
          goal.baseline,
      );
  }
}
export const GOAL_KINDS: readonly SeasonGoalKind[] = [
  'appearances',
  'passing',
  'defending',
  'attribute',
];

/** Accept this season's offered goal. Returns a new world; the career is copied. */
export function acceptGoal(world: World): World {
  const offer = goalOffer(world);
  if (!offer) throw new Error('No goal to accept');
  const career = structuredClone(world.career!);
  coachingOf(career).goal = { ...offer, accepted: { ...world.date } };
  return { ...world, career };
}
/** Turn down this season's goal; it is offered again next season. */
export function declineGoal(world: World): World {
  if (!goalOffer(world)) throw new Error('No goal to decline');
  const career = structuredClone(world.career!);
  coachingOf(career).declinedSeason = world.date.season;
  return { ...world, career };
}
/** At the new season: judge last season's goal, keep the result and clear the offer. */
export function coachingRollover(world: World): void {
  const career = world.career;
  if (!career?.coaching) return;
  const coaching = career.coaching;
  const goal = coaching.goal;
  if (goal && goal.season < world.date.season) {
    const achieved = goalProgress(world, goal);
    coaching.history.push({
      season: goal.season,
      kind: goal.kind,
      target: goal.target,
      attribute: goal.attribute,
      achieved,
      completed: achieved >= goal.target,
    });
    if (coaching.history.length > K.historyLimit)
      coaching.history.splice(0, coaching.history.length - K.historyLimit);
    coaching.goal = null;
  }
  coaching.declinedSeason = null;
}
