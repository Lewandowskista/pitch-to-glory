import type { Attributes, KeeperAttributes, MatchEvent, Position } from '../../model/domain';

/**
 * Data-driven key-moment catalogue.
 *
 * A situation is a moment the selected footballer faces. `attackWeight` and `defenceWeight` are the
 * relative goal value a moment of this type carries for the selected team's attack and against
 * its goal; the engine converts them into an absolute budget per moment (see `momentBudget`).
 *
 * A choice declares the attributes that govern it, how its goals arise and which trait helps it.
 * At the reference player (attributes equal to the match level, neutral conditions) every choice in
 * a situation has the same expected goals for (`forShare × budget.for`) and against
 * (`againstShare × budget.against`); attributes, traits, role and conditions then move success
 * probability and goal impact. Scalar tunables live in `CONFIG.match`.
 */
export type GoverningAttribute = keyof Attributes | keyof KeeperAttributes;
export type ChoiceEvent = Extract<
  MatchEvent['kind'],
  'shot' | 'pass' | 'dribble' | 'tackle' | 'save'
>;
export type RatingFamily = 'shooting' | 'passing' | 'dribbling' | 'defending' | 'goalkeeping';
export type ConditionsSensitivity = 'technical' | 'direct' | 'neutral';
export type Opponent = 'keeper' | 'defender' | 'attacker';

export interface ChoiceTemplate {
  id: string;
  /** Weights sum to one. Keeper attribute names read `keeperAttributes`, others `attributes`. */
  attributes: Partial<Record<GoverningAttribute, number>>;
  /** Reference success probability, ignored for direct choices whose probability is the budget. */
  base: number;
  /** 'for': success is itself a goal. 'against': failure is itself a goal conceded. */
  direct: 'for' | 'against' | null;
  /** Expected goals for/against at the reference player, relative to the moment budget. */
  forShare: number;
  againstShare: number;
  /** Fraction of expected goals for arising after success (rest: rebounds after failure). */
  forOnSuccess: number;
  /** Fraction of expected goals against arising after failure (rest: second balls after success). */
  againstOnFailure: number;
  /** Who finishes a chance created by a successful choice. */
  scorer: 'self' | 'teammate';
  assist: boolean;
  event: ChoiceEvent;
  family: RatingFamily;
  /** Statistic credited on success. */
  stat: 'shots' | 'passes' | 'tackles' | 'saves' | null;
  opponent: Opponent;
  conditions: ConditionsSensitivity;
  /** Trait improving this choice, matched exactly with `player.traits.includes(traitId)`. */
  traitId: string | null;
  /** Choice is only offered to players with this trait (skill tree unlocks, milestone 4). */
  requiredTraitId: string | null;
  /** Commentary family: `match.commentary.<commentary>.<success|failure>.<variant>`. */
  commentary: string;
  /** Where the end of the highlight lands, in goal-mouth y coordinates for shots. */
  target?: number;
}

export interface Situation {
  id: string;
  attackWeight: number;
  defenceWeight: number;
  /** Relative selection weight per position; absent positions never see this situation. */
  positions: Partial<Record<Position, number>>;
  /** Where the selected player stands, as distance from own goal line (0–100) and width. */
  spot: { depth: number; width: number };
  choices: ChoiceTemplate[];
}

const choice = (
  value: Pick<ChoiceTemplate, 'id' | 'attributes' | 'event' | 'family' | 'commentary'> &
    Partial<ChoiceTemplate>,
): ChoiceTemplate => ({
  base: 0.5,
  direct: null,
  forShare: 1,
  againstShare: 1,
  forOnSuccess: 1,
  againstOnFailure: 1,
  scorer: 'teammate',
  assist: false,
  stat: null,
  opponent: 'defender',
  conditions: 'neutral',
  traitId: null,
  requiredTraitId: null,
  ...value,
});

export const SITUATIONS: readonly Situation[] = [
  {
    id: 'box-chance',
    attackWeight: 1,
    defenceWeight: 0,
    positions: { ST: 3.5, LW: 2.5, RW: 2.5, AM: 2, CM: 1 },
    spot: { depth: 88, width: 44 },
    choices: [
      choice({
        id: 'near-post',
        attributes: { finishing: 0.7, composure: 0.3 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        traitId: 'clinical-finisher',
        commentary: 'shot',
        target: 47,
      }),
      choice({
        id: 'far-post',
        forOnSuccess: 0.9,
        attributes: { finishing: 0.5, composure: 0.3, vision: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        traitId: 'finesse-shot',
        commentary: 'placed',
        target: 53,
      }),
      choice({
        id: 'square-pass',
        attributes: { passing: 0.6, vision: 0.4 },
        base: 0.72,
        assist: true,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'technical',
        traitId: 'playmaker',
        commentary: 'pass',
      }),
      choice({
        id: 'take-on',
        attributes: { dribbling: 0.6, agility: 0.2, acceleration: 0.2 },
        base: 0.45,
        scorer: 'self',
        event: 'dribble',
        family: 'dribbling',
        conditions: 'technical',
        traitId: 'trickster',
        commentary: 'dribble',
      }),
    ],
  },
  {
    id: 'build-up',
    attackWeight: 0.15,
    defenceWeight: 1,
    positions: { ST: 2, LW: 4, RW: 4, AM: 3.5, CM: 3.5, DM: 1, LB: 1.5, RB: 1.5 },
    spot: { depth: 66, width: 18 },
    choices: [
      choice({
        id: 'through-ball',
        attributes: { vision: 0.5, passing: 0.5 },
        base: 0.45,
        assist: true,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'technical',
        traitId: 'playmaker',
        commentary: 'through',
      }),
      choice({
        id: 'cross-switch',
        attributes: { crossing: 0.7, vision: 0.3 },
        base: 0.58,
        assist: true,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'direct',
        commentary: 'cross',
      }),
      choice({
        id: 'carry-forward',
        attributes: { dribbling: 0.4, pace: 0.3, strength: 0.3 },
        base: 0.62,
        scorer: 'self',
        event: 'dribble',
        family: 'dribbling',
        conditions: 'technical',
        traitId: 'engine',
        commentary: 'carry',
      }),
      choice({
        id: 'disguised-pass',
        attributes: { vision: 0.6, passing: 0.2, composure: 0.2 },
        base: 0.5,
        assist: true,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'technical',
        requiredTraitId: 'maestro',
        commentary: 'through',
      }),
    ],
  },
  {
    id: 'edge-of-area',
    attackWeight: 0.4,
    defenceWeight: 0,
    positions: { ST: 2, LW: 2, RW: 2, AM: 3, CM: 2.5, DM: 0.5 },
    spot: { depth: 78, width: 50 },
    choices: [
      choice({
        id: 'long-shot',
        forOnSuccess: 0.8,
        attributes: { longShots: 0.8, composure: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        conditions: 'direct',
        traitId: 'finesse-shot',
        commentary: 'long',
        target: 50,
      }),
      choice({
        id: 'lay-off',
        attributes: { firstTouch: 0.4, passing: 0.6 },
        base: 0.78,
        assist: true,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'technical',
        traitId: 'playmaker',
        commentary: 'pass',
      }),
      choice({
        id: 'drive-inside',
        attributes: { dribbling: 0.5, acceleration: 0.3, agility: 0.2 },
        base: 0.5,
        scorer: 'self',
        event: 'dribble',
        family: 'dribbling',
        conditions: 'technical',
        traitId: 'trickster',
        commentary: 'dribble',
      }),
      choice({
        id: 'curler',
        forOnSuccess: 0.85,
        attributes: { longShots: 0.5, setPieces: 0.3, composure: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        conditions: 'direct',
        requiredTraitId: 'curler',
        commentary: 'placed',
        target: 47,
      }),
    ],
  },
  {
    id: 'aerial-chance',
    attackWeight: 0.6,
    defenceWeight: 0,
    positions: { ST: 2.5, LW: 1, RW: 1, AM: 0.5, CM: 0.5, CB: 0.6 },
    spot: { depth: 90, width: 50 },
    choices: [
      choice({
        id: 'header',
        forOnSuccess: 0.9,
        attributes: { heading: 0.5, jumping: 0.3, strength: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        conditions: 'direct',
        traitId: 'aerial-threat',
        commentary: 'header',
        target: 50,
      }),
      choice({
        id: 'control-shoot',
        attributes: { firstTouch: 0.6, finishing: 0.4 },
        base: 0.5,
        scorer: 'self',
        event: 'dribble',
        family: 'shooting',
        conditions: 'technical',
        traitId: 'clinical-finisher',
        commentary: 'control',
      }),
      choice({
        id: 'cushion',
        attributes: { firstTouch: 0.4, heading: 0.3, vision: 0.3 },
        base: 0.7,
        assist: true,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'technical',
        commentary: 'pass',
      }),
      choice({
        id: 'bicycle-kick',
        forOnSuccess: 0.7,
        attributes: { agility: 0.4, finishing: 0.4, jumping: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        requiredTraitId: 'acrobat',
        commentary: 'shot',
        target: 50,
      }),
    ],
  },
  {
    id: 'defend-attack',
    attackWeight: 0,
    defenceWeight: 1,
    positions: { CB: 5, LB: 4, RB: 4, DM: 4, CM: 1.5 },
    spot: { depth: 22, width: 44 },
    choices: [
      choice({
        id: 'intercept',
        attributes: { positioning: 0.5, decisions: 0.3, acceleration: 0.2 },
        base: 0.5,
        event: 'tackle',
        family: 'defending',
        stat: 'tackles',
        opponent: 'attacker',
        traitId: 'ball-winner',
        commentary: 'intercept',
      }),
      choice({
        id: 'tackle',
        attributes: { tackling: 0.6, strength: 0.2, aggression: 0.2 },
        base: 0.64,
        event: 'tackle',
        family: 'defending',
        stat: 'tackles',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'ball-winner',
        commentary: 'tackle',
      }),
      choice({
        id: 'jockey',
        attributes: { positioning: 0.4, pace: 0.3, decisions: 0.3 },
        base: 0.78,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'engine',
        commentary: 'jockey',
      }),
      choice({
        id: 'slide-block',
        attributes: { tackling: 0.5, acceleration: 0.3, decisions: 0.2 },
        base: 0.56,
        event: 'tackle',
        family: 'defending',
        stat: 'tackles',
        opponent: 'attacker',
        conditions: 'technical',
        requiredTraitId: 'last-ditch',
        commentary: 'tackle',
      }),
    ],
  },
  {
    id: 'build-out',
    attackWeight: 0.15,
    defenceWeight: 0.35,
    positions: { CB: 3, LB: 2.5, RB: 2.5, DM: 3, CM: 1.5 },
    spot: { depth: 14, width: 30 },
    choices: [
      choice({
        id: 'short-pass',
        attributes: { passing: 0.5, composure: 0.3, firstTouch: 0.2 },
        base: 0.86,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'playmaker',
        commentary: 'recycle',
      }),
      choice({
        id: 'clear-long',
        attributes: { passing: 0.5, vision: 0.3, strength: 0.2 },
        base: 0.62,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'direct',
        commentary: 'long-ball',
      }),
      choice({
        id: 'carry-out',
        attributes: { dribbling: 0.4, composure: 0.3, pace: 0.3 },
        base: 0.66,
        event: 'dribble',
        family: 'dribbling',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'engine',
        commentary: 'carry',
      }),
      choice({
        id: 'press-escape',
        attributes: { dribbling: 0.5, agility: 0.3, composure: 0.2 },
        base: 0.6,
        event: 'dribble',
        family: 'dribbling',
        opponent: 'attacker',
        conditions: 'technical',
        requiredTraitId: 'escape-artist',
        commentary: 'carry',
      }),
    ],
  },
  {
    id: 'shot-incoming',
    attackWeight: 0,
    defenceWeight: 1,
    positions: { GK: 4 },
    spot: { depth: 4, width: 50 },
    choices: [
      choice({
        id: 'hold',
        attributes: { handling: 0.6, reflexes: 0.4 },
        direct: 'against',
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'safe-hands',
        commentary: 'catch',
      }),
      choice({
        id: 'parry',
        attributes: { reflexes: 0.6, diving: 0.4 },
        direct: 'against',
        againstOnFailure: 0.7,
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        commentary: 'parry',
      }),
      choice({
        id: 'tip-over',
        attributes: { reflexes: 0.7, aerialReach: 0.3 },
        direct: 'against',
        againstOnFailure: 0.8,
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        requiredTraitId: 'cat-reflexes',
        commentary: 'parry',
      }),
    ],
  },
  {
    id: 'one-on-one',
    attackWeight: 0,
    defenceWeight: 4,
    positions: { GK: 0.7 },
    spot: { depth: 6, width: 50 },
    choices: [
      choice({
        id: 'rush',
        attributes: { oneOnOnes: 0.6, commandOfArea: 0.2, decisions: 0.2 },
        base: 0.6,
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        commentary: 'rush',
      }),
      choice({
        id: 'stay-line',
        attributes: { reflexes: 0.5, diving: 0.3, oneOnOnes: 0.2 },
        direct: 'against',
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        commentary: 'line',
      }),
      choice({
        id: 'smother',
        attributes: { oneOnOnes: 0.5, diving: 0.3, decisions: 0.2 },
        base: 0.55,
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        requiredTraitId: 'one-on-one-specialist',
        commentary: 'rush',
      }),
    ],
  },
  {
    id: 'cross-ball',
    attackWeight: 0,
    defenceWeight: 0.6,
    positions: { GK: 2 },
    spot: { depth: 5, width: 50 },
    choices: [
      choice({
        id: 'claim',
        attributes: { commandOfArea: 0.5, aerialReach: 0.3, handling: 0.2 },
        base: 0.7,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        conditions: 'direct',
        traitId: 'safe-hands',
        commentary: 'claim',
      }),
      choice({
        id: 'punch',
        attributes: { aerialReach: 0.5, commandOfArea: 0.3, strength: 0.2 },
        base: 0.82,
        againstOnFailure: 0.7,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        conditions: 'direct',
        commentary: 'punch',
      }),
      choice({
        id: 'hold-line',
        attributes: { reflexes: 0.5, diving: 0.3, handling: 0.2 },
        direct: 'against',
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        commentary: 'line',
      }),
    ],
  },
  {
    id: 'distribution',
    attackWeight: 1,
    defenceWeight: 0.15,
    positions: { GK: 2.5 },
    spot: { depth: 6, width: 50 },
    choices: [
      choice({
        id: 'short-distribution',
        attributes: { kicking: 0.4, decisions: 0.3, composure: 0.3 },
        base: 0.9,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'technical',
        commentary: 'recycle',
      }),
      choice({
        id: 'long-distribution',
        attributes: { kicking: 0.7, vision: 0.3 },
        base: 0.55,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'direct',
        commentary: 'long-ball',
      }),
      choice({
        id: 'quick-release',
        attributes: { kicking: 0.5, vision: 0.3, decisions: 0.2 },
        base: 0.62,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'direct',
        requiredTraitId: 'distributor',
        commentary: 'long-ball',
      }),
    ],
  },
];

export const SITUATION_BY_ID: Readonly<Record<string, Situation>> = Object.fromEntries(
  SITUATIONS.map((situation) => [situation.id, situation]),
);
export const KEEPER_ATTRIBUTES: readonly GoverningAttribute[] = [
  'handling',
  'reflexes',
  'diving',
  'oneOnOnes',
  'kicking',
  'commandOfArea',
  'aerialReach',
];
export const OUTCOME_COMMENTARY = [
  ...new Set(SITUATIONS.flatMap((s) => s.choices.map((c) => c.commentary))),
];
