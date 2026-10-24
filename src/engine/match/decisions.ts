import type {
  DecisionChoice,
  Foot,
  Match,
  Player,
  Position,
  ProbabilityFactor,
  Tactics,
} from '../../model/domain';
import { CONFIG } from '../config';
import { roleEffect } from './roles';
import {
  pitchEffect,
  pitchStateFor,
  weatherEffect,
  type Intensity,
  type PitchState,
} from './conditions';
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
  player: Pick<Player, 'attributes' | 'keeperAttributes' | 'traits' | 'morale' | 'hidden'>;
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
  /** How hard it rains, blows or snows (match-15; steady when absent). */
  weatherIntensity?: Intensity;
  /** The state of the pitch (match-15; derived from the weather when absent). */
  pitchState?: PitchState;
  /** Selected team strength minus opposition strength. */
  strengthGap: number;
  /** Ability of the direct opponent each choice is measured against. */
  opponents: Record<Opponent, number>;
  /** Momentum from the selected team's side (50 even, 100 all theirs). */
  momentum: number;
  /** Second-half multiplier from the half-time talk (1 before it). */
  talkOdds: number;
  /** Finishing of the teammates a created chance falls to. */
  teammateFinishing: number;
  /** This match's shift of the player's governing attributes (consistency). */
  consistencyShift: number;
  /** Chemistry with teammates (0–100): what a chance made for them is worth. */
  chemistry: number;
  /** Attribute points lost to playing an unfamiliar slot (0 in the player's own position). */
  positionPenalty?: number;
  /** The current engine (`match-15`): its appended choices are offered. */
  latest?: boolean;
  /**
   * Skills stack on the impact path as they do on the odds path (`match-17`): before, any one
   * covering skill gave the same flat impact however many more covered the choice.
   */
  stackImpact?: boolean;
  /** The opposition's playing style (`match-19`): it bears on the odds of some choices. */
  opponentStyle?: string;
  /** The player studied this opponent (`match-19`): the style's penalties are softened. */
  prepared?: boolean;
  /** Decisive defending (`match-20`): attributes move defending odds further. */
  defending?: boolean;
  /** The defending choices' attribute slope multiplier when not match-20's (`match-21`). */
  defendingSlope?: number;
  /**
   * The player's stronger foot and the flank of their post (`match-19`): a shot, cross or carry
   * on the weaker foot costs odds unless they are two-footed.
   */
  foot?: { strong: Foot; flank: 'left' | 'right' | 'centre'; twoFooted: boolean };
}

/** Choices made with a particular foot: the outside foot on the flank, or the inside one. */
const FOOT_CHOICES: Record<string, 'outside' | 'inside'> = {
  'near-post': 'outside',
  'cross-switch': 'outside',
  'far-post': 'inside',
  'drive-inside': 'inside',
  curler: 'inside',
};
/**
 * The foot a choice is made with, from the flank of the player's post, and what it does to the
 * odds: the weaker foot costs `foot.weak`; cutting inside onto the stronger foot gains
 * `foot.inside`. Null for a choice with no foot to it, or in the middle of the pitch.
 */
export function footFor(
  choiceId: string,
  foot: NonNullable<DecisionContext['foot']>,
): { side: 'left' | 'right'; weak: boolean; multiplier: number } | null {
  const use = FOOT_CHOICES[choiceId];
  if (!use || foot.flank === 'centre') return null;
  const outside = foot.flank;
  const side = use === 'outside' ? outside : outside === 'left' ? 'right' : 'left';
  const able = foot.strong === 'both' || foot.twoFooted;
  const weak = !able && side !== foot.strong;
  return {
    side,
    weak,
    multiplier: weak ? C.foot.weak : use === 'inside' ? C.foot.inside : 1,
  };
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
/** How many of the player's skills improve one choice. */
export function traitCount(
  traits: readonly string[],
  template: Pick<ChoiceTemplate, 'id' | 'traitId' | 'boostedBy'>,
): number {
  return traits.filter(
    (trait) =>
      (template.traitId !== null && trait === template.traitId) ||
      TRAIT_BOOSTS[trait]?.includes(template.id) ||
      template.boostedBy?.includes(trait),
  ).length;
}
/** Odds multiplier from the player's skills: each further skill stacks, to a limit. */
export function traitOdds(count: number): number {
  return count ? Math.min(D.traitStackMaximum, D.traitMultiplier * D.traitStack ** (count - 1)) : 1;
}
/**
 * Impact multiplier from skills on an already likely choice: each further skill stacks, to a
 * limit (match-17), or one flat bonus on earlier engines.
 */
export function traitImpactOf(count: number, stack = true): number {
  if (!count) return 1;
  return stack
    ? Math.min(D.traitImpactMaximum, D.traitImpact * D.traitStack ** (count - 1))
    : D.traitImpact;
}
/**
 * Whether skills on a choice sharpen its impact rather than its odds: a choice that is likely
 * by its nature (its base odds, not this match's team-scaled odds), so a choice always takes
 * the same path whoever plays it.
 */
export const onImpactPath = (template: Pick<ChoiceTemplate, 'direct' | 'base'>): boolean =>
  !template.direct && template.base >= D.traitImpactThreshold;
/**
 * Odds multiplier for the occasion: in a fixture that matters, big-match temperament (hidden)
 * decides whether the player rises or shrinks, and the Big Game Player skill adds to it.
 */
export function occasionMultiplier(
  traits: readonly string[],
  temperament: number,
  importance: number,
): number {
  if (importance <= 1) return 1;
  return (
    D.bigGame.base +
    temperament * D.bigGame.slope +
    (traits.includes('big-game-player') ? D.bigGame.skill : 0)
  );
}
/** What one skill adds to a choice for a build: its path, and the multiplier without and with it. */
export interface SkillEffect {
  choiceId: string;
  path: 'odds' | 'impact';
  before: number;
  after: number;
}
/**
 * What a skill does for the player's current skills, choice by choice (the current engine):
 * a choice it boosts takes the stacked multiplier with the other skills covering it, on its
 * odds or, for a choice already likely, on what it leads to. `traits` are the skills held;
 * an owned skill is measured against the build without it.
 */
export function skillEffects(traits: readonly string[], skillId: string): SkillEffect[] {
  const without = traits.filter((trait) => trait !== skillId);
  const effects = new Map<string, SkillEffect>();
  for (const situation of SITUATIONS)
    for (const template of situation.choices) {
      if (effects.has(template.id)) continue;
      const covers =
        template.traitId === skillId ||
        TRAIT_BOOSTS[skillId]?.includes(template.id) ||
        template.boostedBy?.includes(skillId);
      if (!covers) continue;
      const impact = onImpactPath(template);
      const measure = (count: number) => (impact ? traitImpactOf(count) : traitOdds(count));
      const count = traitCount(without, template);
      effects.set(template.id, {
        choiceId: template.id,
        path: impact ? 'impact' : 'odds',
        before: round6(measure(count)),
        after: round6(measure(count + 1)),
      });
    }
  return [...effects.values()];
}
/** Odds multiplier from the player's skills for one choice, with the occasion. */
export function traitMultiplier(
  traits: readonly string[],
  template: Pick<ChoiceTemplate, 'id' | 'traitId'>,
  importance: number,
  temperament = 50,
): number {
  return (
    traitOdds(traitCount(traits, template)) * occasionMultiplier(traits, temperament, importance)
  );
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
  const intensity = context.weatherIntensity ?? 'steady';
  const pitch =
    context.pitchState ?? pitchStateFor(context.weather, context.pitchCondition, intensity);
  // Choices appended by the current engine come last, and only while a moment has fewer than
  // four (the number keys 1–4 cover every option): a skill-unlocked choice keeps its place.
  const unlocked = situation.choices.filter(
    (t) => !t.requiredTraitId || player.traits.includes(t.requiredTraitId),
  );
  const room = Math.max(0, 4 - unlocked.filter((t) => !t.latest).length);
  const appended = context.latest ? unlocked.filter((t) => t.latest).slice(0, room) : [];
  return unlocked
    .filter((t) => !t.latest || appended.includes(t))
    .map((t) => {
      const value = governingValue(player, t.attributes);
      const relative = value + context.consistencyShift - context.matchLevel;
      // Defending choices lean harder on the attributes behind them (match-20).
      const slope =
        context.defending && (t.opponent === 'attacker' || t.direct === 'against')
          ? D.attributeSlope *
            // A penalty keeps its fixed odds' slope (match-21 steepens open-play saves only).
            (t.fixed === undefined
              ? (context.defendingSlope ?? C.defending.attributeSlope)
              : C.defending.attributeSlope)
          : D.attributeSlope;
      const attribute = clamp(1 + relative * slope, D.attributeMinimum, D.attributeMaximum);
      const impact = clamp(1 + relative * D.impactSlope, D.impactMinimum, D.impactMaximum);
      const defensive = t.opponent === 'attacker';
      const fixed = t.fixed !== undefined;
      const goalsFor = fixed && t.direct === 'for' ? t.fixed! : t.forShare * budget.for;
      const goalsAgainst =
        fixed && t.direct === 'against'
          ? t.fixed!
          : t.againstShare * budget.against * (defensive ? D.defensiveEdge : 1);
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
      // Skills on an already likely choice sharpen what it leads to instead of its odds.
      const skills = traitCount(player.traits, t);
      const traitOnImpact = onImpactPath(t);
      const traitImpact = traitOnImpact ? traitImpactOf(skills, Boolean(context.stackImpact)) : 1;
      // A chance made for a teammate is worth more when they finish better than the player
      // would, and less when they do not.
      const CH = CONFIG.career.social.chemistry;
      const receiver =
        t.scorer === 'teammate' && !t.direct
          ? clamp(
              1 + (context.teammateFinishing - player.attributes.finishing) * D.receiver.slope,
              D.receiver.minimum,
              D.receiver.maximum,
            ) * clamp(1 + (context.chemistry - 60) * CH.slope, CH.minimum, CH.maximum)
          : 1;
      const stakes = {
        successGoal:
          t.direct === 'for'
            ? 1
            : conversion(
                ((goalsFor * t.forOnSuccess) / reference) *
                  impact *
                  riskImpact *
                  traitImpact *
                  receiver,
              ),
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
      const momentum = clamp(1 + (context.momentum - 50) * D.momentumSlope, 0.9, 1.1);
      const foot = context.foot ? footFor(t.id, context.foot) : null;
      const styled = context.opponentStyle
        ? (C.styles[context.opponentStyle]?.choices[t.id] ?? 1)
        : 1;
      // Studying the opponent in training softens what their style takes away.
      const style = context.prepared && styled < 1 ? 1 - (1 - styled) * C.prepared : styled;
      const steps: [string, ProbabilityFactor['source'], number][] = [
        ['match.factor.defender', 'defender', (t.direct ? 1 : team) * matchup],
        // The opposition's way of playing (match-19), named for its style.
        ...(style !== 1
          ? ([[`match.factor.style.${context.opponentStyle}`, 'defender', style]] as [
              string,
              ProbabilityFactor['source'],
              number,
            ][])
          : []),
        ['match.factor.attribute', 'attribute', attribute],
        // The foot it is made with (match-19).
        ...(foot && foot.multiplier !== 1
          ? ([
              [
                foot.weak ? 'match.factor.foot.weak' : 'match.factor.foot.inside',
                'attribute',
                foot.multiplier,
              ],
            ] as [string, ProbabilityFactor['source'], number][])
          : []),
        ...(context.positionPenalty
          ? ([
              [
                'match.factor.position',
                'attribute',
                clamp(1 - context.positionPenalty * D.attributeSlope, D.attributeMinimum, 1),
              ],
            ] as [string, ProbabilityFactor['source'], number][])
          : []),
        [
          'match.factor.trait',
          'trait',
          (traitOnImpact ? 1 : traitOdds(skills)) *
            occasionMultiplier(
              player.traits,
              player.hidden.bigMatchTemperament,
              context.importance,
            ),
        ],
        ['match.factor.fatigue', 'fatigue', fatigue],
        ['match.factor.morale', 'attribute', moraleMultiplier(player.morale)],
        ['match.factor.momentum', 'attribute', momentum],
        ['match.factor.talk', 'attribute', context.talkOdds],
        ['match.factor.role', 'attribute', role.choices?.includes(t.id) ? D.roleMultiplier : 1],
        [
          'match.factor.risk',
          'attribute',
          t.direct === 'for' ? D.riskShot[tactics.risk] : t.direct ? 1 : risk.odds,
        ],
        // The current engine (match-15) shows the weather and the pitch as separate factors,
        // each named ("Heavy rain", "Heavy pitch"); earlier engines one combined factor.
        ...(context.latest
          ? ([
              [
                `match.factor.weather.${intensity}.${context.weather}`,
                'attribute',
                1 + weatherEffect(t.conditions, context.weather, intensity),
              ],
              [
                `match.factor.pitch.${pitch}`,
                'attribute',
                1 + pitchEffect(t.conditions, context.weather, pitch, context.pitchCondition),
              ],
            ] as [string, ProbabilityFactor['source'], number][])
          : ([
              [
                'match.factor.conditions',
                'attribute',
                1 + conditionsEffect(t.conditions, context.weather, context.pitchCondition),
              ],
            ] as [string, ProbabilityFactor['source'], number][])),
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
          t.direct === 'for' ? (t.maximum ?? D.maximumShotProbability) : D.maximumProbability,
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
        ...(foot ? { foot: { side: foot.side, weak: foot.weak } } : {}),
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

/** How the game stands for the selected side when a moment opens (engine match-12). */
export interface GameState {
  minute: number;
  /** Selected side's goals minus the opposition's. */
  margin: number;
}
/**
 * Situation selection weights for a position and personal role (unnormalised). With `drama`
 * (engine match-12) set pieces and last-ditch situations join the pool, and from the hour a side
 * chasing the game sees more attacking moments while one protecting a lead sees more defending.
 * Moment budgets are normalised by the same weights, so the tilt moves where goals come from
 * without changing how many a match expects.
 */
export function situationWeights(
  position: Position,
  role: string,
  options: { drama?: boolean; state?: GameState; opponentStyle?: string } = {},
): { situation: Situation; weight: number }[] {
  // The opposition's style (match-19) brings some situations about more often.
  const styled = options.opponentStyle ? C.styles[options.opponentStyle]?.situations : undefined;
  const effect = roleEffect(role);
  const G = C.drama;
  const state = options.drama ? options.state : undefined;
  const pressing = state && state.minute >= G.tiltFromMinute;
  const tilt = (situation: Situation) =>
    !pressing || !situation.phase || state.margin === 0
      ? 1
      : state.margin < 0 === (situation.phase === 'attack')
        ? G.tilt
        : 1;
  return SITUATIONS.flatMap((situation) => {
    if (situation.drama && !options.drama) return [];
    const weight =
      (situation.positions[position] ?? 0) *
      (effect.situations?.[situation.id] ?? 1) *
      tilt(situation) *
      (styled?.[situation.id] ?? 1);
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
