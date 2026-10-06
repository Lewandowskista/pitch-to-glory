import type {
  DecisionChoice,
  Match,
  Player,
  Position,
  ProbabilityFactor,
  Tactics,
} from '../../model/domain';
import { CONFIG } from '../config';
import { roleEffect } from './roles';
import {
  KEEPER_ATTRIBUTES,
  SITUATIONS,
  type ChoiceTemplate,
  type GoverningAttribute,
  type Opponent,
  type Situation,
} from './situations';

const C = CONFIG.match;
const D = C.decision;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** Six-decimal rounding keeps stored floats identical across JavaScript engines. */
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** Multiplies success odds, which stays inside (0, 1) and needs no transcendental functions. */
export const scaleOdds = (p: number, multiplier: number) =>
  (p * multiplier) / (1 - p + p * multiplier);

export interface DecisionContext {
  player: Pick<Player, 'attributes' | 'keeperAttributes' | 'traits' | 'morale'>;
  situation: Situation;
  /** Expected goals this moment replaces for and against the selected team. */
  budget: { for: number; against: number };
  /** Mean starting-XI ability of both teams; attributes are judged relative to it. */
  matchLevel: number;
  /** Fixture importance: 1 for league games and friendlies. */
  importance: number;
  fatigue: number;
  tactics: Tactics;
  weather: Match['weather'];
  pitchCondition: number;
  /** Selected team strength minus opposition strength. */
  strengthGap: number;
  /** Ability of the direct opponent each choice is measured against. */
  opponents: Record<Opponent, number>;
}

export function governingValue(
  player: DecisionContext['player'],
  attributes: ChoiceTemplate['attributes'],
): number {
  let value = 0;
  for (const [name, weight] of Object.entries(attributes) as [GoverningAttribute, number][])
    value +=
      weight *
      (KEEPER_ATTRIBUTES.includes(name)
        ? player.keeperAttributes[name as keyof Player['keeperAttributes']]
        : player.attributes[name as keyof Player['attributes']]);
  return value;
}

export function conditionsEffect(
  sensitivity: ChoiceTemplate['conditions'],
  weather: Match['weather'],
  pitchCondition: number,
): number {
  if (sensitivity === 'technical')
    return (
      C.conditions.technical[weather] -
      Math.max(0, C.conditions.pitchGood - pitchCondition) * C.conditions.pitchSlope
    );
  return sensitivity === 'direct' ? C.conditions.direct[weather] : 0;
}

/**
 * Skills that improve choices beyond each choice's own `traitId`, by exact skill id. The
 * skill tree (milestone 4) is the only source of traits.
 */
export const TRAIT_BOOSTS: Readonly<Record<string, readonly string[]>> = {
  'clinical-finisher': ['near-post', 'control-shoot'],
  'finesse-shot': ['far-post', 'long-shot', 'curler'],
  'long-ranger': ['long-shot', 'curler'],
  'chip-specialist': ['far-post', 'control-shoot'],
  poacher: ['near-post', 'header', 'control-shoot'],
  acrobat: ['bicycle-kick', 'control-shoot'],
  playmaker: ['square-pass', 'through-ball', 'lay-off', 'short-pass'],
  'through-ball-artist': ['through-ball', 'disguised-pass'],
  crosser: ['cross-switch'],
  maestro: ['disguised-pass', 'lay-off', 'short-pass'],
  'tempo-setter': ['short-pass', 'clear-long', 'lay-off'],
  trickster: ['take-on', 'drive-inside'],
  'close-control': ['carry-forward', 'carry-out', 'press-escape'],
  'speed-dribbler': ['carry-forward', 'take-on'],
  'escape-artist': ['press-escape', 'carry-out'],
  'ball-winner': ['intercept', 'tackle'],
  interceptor: ['intercept'],
  'last-ditch': ['slide-block', 'tackle'],
  'man-marker': ['jockey', 'intercept'],
  'aerial-dominance': ['header', 'claim'],
  engine: ['carry-forward', 'carry-out', 'jockey'],
  sprinter: ['carry-forward', 'take-on', 'jockey'],
  'aerial-threat': ['header'],
  composed: ['near-post', 'far-post', 'short-pass'],
  'set-piece-specialist': ['cross-switch', 'curler'],
  curler: ['curler', 'far-post'],
  'safe-hands': ['hold', 'claim'],
  'cat-reflexes': ['parry', 'tip-over', 'stay-line'],
  'one-on-one-specialist': ['rush', 'smother'],
  commanding: ['claim', 'punch'],
  distributor: ['short-distribution', 'long-distribution', 'quick-release'],
  sweeper: ['rush'],
  visionary: ['through-ball', 'disguised-pass', 'cross-switch'],
  flair: ['take-on', 'drive-inside'],
  magician: ['take-on', 'drive-inside', 'carry-forward', 'press-escape'],
  'defensive-wall': ['intercept', 'tackle', 'jockey', 'slide-block'],
  powerhouse: ['tackle', 'header', 'carry-out'],
  clutch: ['near-post', 'far-post', 'header', 'long-shot'],
  'delivery-specialist': ['cross-switch', 'clear-long'],
  'free-kick-master': ['curler', 'long-shot'],
  'reaction-saves': ['hold', 'parry', 'tip-over', 'stay-line'],
  'aerial-command': ['claim', 'punch', 'hold-line'],
  wall: ['hold', 'parry', 'tip-over', 'stay-line', 'rush', 'smother', 'claim', 'punch'],
};
/** Odds multiplier from the player's skills for one choice. */
export function traitMultiplier(
  traits: readonly string[],
  template: Pick<ChoiceTemplate, 'id' | 'traitId'>,
  importance: number,
): number {
  const boosted =
    (template.traitId !== null && traits.includes(template.traitId)) ||
    traits.some((trait) => TRAIT_BOOSTS[trait]?.includes(template.id));
  const bigGame = importance > 1 && traits.includes('big-game-player');
  return (boosted ? D.traitMultiplier : 1) * (bigGame ? D.bigGameMultiplier : 1);
}

/** Confidence: morale above the generated average helps, low morale hurts (milestone 6). */
export function moraleMultiplier(morale: number): number {
  const MM = CONFIG.career.social.matchMorale;
  return clamp(1 + (morale - MM.neutral) * MM.slope, MM.minimum, MM.maximum);
}
/** Builds the displayed choices for a situation. Factors sum exactly to the probability. */
export function buildChoices(context: DecisionContext): DecisionChoice[] {
  const { player, situation, budget, tactics } = context;
  const role = roleEffect(tactics.role);
  const risk = D.risk[tactics.risk];
  return situation.choices
    .filter((t) => !t.requiredTraitId || player.traits.includes(t.requiredTraitId))
    .map((t) => {
      const value = governingValue(player, t.attributes);
      const relative = value - context.matchLevel;
      const attribute = clamp(
        1 + relative * D.attributeSlope,
        D.attributeMinimum,
        D.attributeMaximum,
      );
      const impact = clamp(1 + relative * D.impactSlope, D.impactMinimum, D.impactMaximum);
      const defensive = t.opponent === 'attacker';
      const goalsFor = t.forShare * budget.for;
      const goalsAgainst = t.againstShare * budget.against * (defensive ? D.defensiveEdge : 1);
      const team = clamp(1 + context.strengthGap * D.teamSlope, D.teamMinimum, D.teamMaximum);
      // The reference probability anchors expected goals: a reference player in neutral
      // conditions realises exactly the moment budget whichever choice they make.
      const base =
        t.direct === 'for'
          ? goalsFor * t.forOnSuccess
          : t.direct === 'against'
            ? 1 - goalsAgainst * t.againstOnFailure
            : t.base;
      const reference = clamp(
        t.direct ? base : scaleOdds(base, team),
        D.minimumProbability,
        D.maximumProbability,
      );
      const relief = role.counterRelief ? D.roleCounterRelief : 1;
      const riskImpact = t.direct ? 1 : risk.impact;
      const conversion = (n: number) => round6(clamp(n, 0, D.maximumConversion));
      const stakes = {
        successGoal:
          t.direct === 'for'
            ? 1
            : conversion(((goalsFor * t.forOnSuccess) / reference) * impact * riskImpact),
        failureGoal: conversion(((goalsFor * (1 - t.forOnSuccess)) / (1 - reference)) * impact),
        successConcede: conversion(
          ((goalsAgainst * (1 - t.againstOnFailure)) / reference / impact) * relief,
        ),
        failureConcede:
          t.direct === 'against'
            ? 1
            : conversion(
                ((goalsAgainst * t.againstOnFailure) / (1 - reference) / impact) *
                  relief *
                  riskImpact,
              ),
      };
      const matchup = clamp(
        1 - (context.opponents[t.opponent] - context.matchLevel) * D.matchupSlope,
        D.matchupMinimum,
        D.matchupMaximum,
      );
      const fatigue = clamp(
        1 - Math.max(0, context.fatigue - D.fatigueThreshold) * D.fatigueSlope,
        D.fatigueMinimum,
        1,
      );
      const steps: [string, ProbabilityFactor['source'], number][] = [
        ['match.factor.defender', 'defender', (t.direct ? 1 : team) * matchup],
        ['match.factor.attribute', 'attribute', attribute],
        ['match.factor.trait', 'trait', traitMultiplier(player.traits, t, context.importance)],
        ['match.factor.fatigue', 'fatigue', fatigue],
        ['match.factor.morale', 'attribute', moraleMultiplier(player.morale)],
        ['match.factor.role', 'attribute', role.choices?.includes(t.id) ? D.roleMultiplier : 1],
        ['match.factor.risk', 'attribute', t.direct ? 1 : risk.odds],
        [
          'match.factor.conditions',
          'attribute',
          1 + conditionsEffect(t.conditions, context.weather, context.pitchCondition),
        ],
      ];
      let current = round6(clamp(base, D.minimumProbability, D.maximumProbability));
      const factors: ProbabilityFactor[] = [
        { labelKey: 'match.factor.base', source: 'attribute', contribution: current },
      ];
      for (const [labelKey, source, multiplier] of steps) {
        const next = round6(scaleOdds(current, multiplier));
        factors.push({ labelKey, source, contribution: round6(next - current) });
        current = next;
      }
      const probability = round6(
        clamp(
          current,
          D.minimumProbability,
          t.direct === 'for' ? D.maximumShotProbability : D.maximumProbability,
        ),
      );
      if (probability !== current)
        factors.push({
          labelKey: 'match.factor.limit',
          source: 'attribute',
          contribution: round6(probability - current),
        });
      return {
        id: t.id,
        labelKey: `match.choice.${t.id}`,
        probability,
        factors,
        requiredTraitId: t.requiredTraitId,
        traitId: t.traitId,
        attributes: (Object.entries(t.attributes) as [string, number][])
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
          .map(([name]) => name),
        stakes,
      };
    });
}

/** Expected goals for and against the selected team if this choice is made. */
export function expectedImpact(choice: DecisionChoice): {
  for: number;
  against: number;
  net: number;
} {
  const p = choice.probability,
    s = choice.stakes;
  const goalsFor = p * s.successGoal + (1 - p) * s.failureGoal;
  const goalsAgainst = p * s.successConcede + (1 - p) * s.failureConcede;
  return { for: goalsFor, against: goalsAgainst, net: goalsFor - goalsAgainst };
}

/** Situation selection weights for a position and personal role (unnormalised). */
export function situationWeights(
  position: Position,
  role: string,
): { situation: Situation; weight: number }[] {
  const effect = roleEffect(role);
  return SITUATIONS.flatMap((situation) => {
    const weight = (situation.positions[position] ?? 0) * (effect.situations?.[situation.id] ?? 1);
    return weight > 0 ? [{ situation, weight }] : [];
  });
}

/**
 * Converts a situation's relative weights into absolute expected goals. Over a full match the
 * expected budget of all moments equals `expectedGoals × share` for each side.
 */
export function momentBudget(
  situation: Situation,
  weights: readonly { situation: Situation; weight: number }[],
  shares: { attack: number; defence: number },
  expected: { own: number; opposition: number },
  momentCount: number,
): { for: number; against: number } {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  const meanAttack =
    weights.reduce((sum, w) => sum + w.weight * w.situation.attackWeight, 0) / total;
  const meanDefence =
    weights.reduce((sum, w) => sum + w.weight * w.situation.defenceWeight, 0) / total;
  return {
    for: meanAttack
      ? round6((expected.own * shares.attack * situation.attackWeight) / (momentCount * meanAttack))
      : 0,
    against: meanDefence
      ? round6(
          (expected.opposition * shares.defence * situation.defenceWeight) /
            (momentCount * meanDefence),
        )
      : 0,
  };
}
