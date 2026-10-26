import type { Position } from '../../model/domain';
import { SITUATION_BY_ID, SITUATIONS, choice, type Situation } from './situations';

/**
 * The 1.0 key-moment catalogue (engine match-22, release 1.0 step 5.2), beside the match-21
 * catalogue in situations.ts, which stays as it was so saved sessions replay.
 *
 * - New situations per position (review M9), offered only by match-22.
 * - Skill mechanics (review C13): choices a skill unlocks, and counters a success starts.
 * - Each position's situation weights, so no position spends most of a match in one situation.
 *
 * What the pitch shows at each moment (the reads) is in readTable.ts. Kept out of situations.ts
 * so the career screens that need the catalogue's families stay small.
 */

// ── New situations (review M9) ───────────────────────────────────────────────
export const SITUATIONS_22: readonly Situation[] = [
  {
    id: 'last-man',
    phase: 'defence',
    attackWeight: 0,
    defenceWeight: 2.2,
    positions: { CB: 0.45, LB: 0.35, RB: 0.35, DM: 0.35 },
    spot: { depth: 34, width: 50 },
    choices: [
      choice({
        id: 'professional-foul',
        attributes: { aggression: 0.4, tackling: 0.4, decisions: 0.2 },
        base: 0.86,
        againstOnFailure: 0.7,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        foulOnSuccess: true,
        commentary: 'tackle',
      }),
      choice({
        id: 'chase-back',
        attributes: { pace: 0.5, acceleration: 0.3, positioning: 0.2 },
        base: 0.55,
        event: 'tackle',
        family: 'defending',
        stat: 'tackles',
        opponent: 'attacker',
        traitId: 'sprinter',
        commentary: 'track',
      }),
      choice({
        id: 'show-wide',
        attributes: { positioning: 0.5, decisions: 0.3, pace: 0.2 },
        base: 0.7,
        againstOnFailure: 0.85,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'man-marker',
        commentary: 'jockey',
      }),
    ],
  },
  {
    id: 'cross-defence',
    phase: 'defence',
    attackWeight: 0,
    defenceWeight: 0.9,
    positions: { CB: 1.6, LB: 1.5, RB: 1.5, DM: 0.7 },
    spot: { depth: 8, width: 50 },
    choices: [
      choice({
        id: 'attack-cross',
        attributes: { heading: 0.5, jumping: 0.3, positioning: 0.2 },
        base: 0.6,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        conditions: 'direct',
        traitId: 'aerial-dominance',
        commentary: 'block',
      }),
      choice({
        id: 'mark-runner',
        attributes: { positioning: 0.5, strength: 0.3, decisions: 0.2 },
        base: 0.7,
        againstOnFailure: 0.85,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'man-marker',
        commentary: 'track',
      }),
      choice({
        id: 'block-cross',
        attributes: { pace: 0.4, tackling: 0.3, workRate: 0.3 },
        base: 0.5,
        event: 'tackle',
        family: 'defending',
        stat: 'tackles',
        opponent: 'attacker',
        traitId: 'last-ditch',
        commentary: 'block',
      }),
    ],
  },
  {
    id: 'two-on-one',
    phase: 'defence',
    attackWeight: 0,
    defenceWeight: 1.4,
    positions: { CB: 1.1, LB: 1, RB: 1, DM: 0.9, CM: 0.4 },
    spot: { depth: 26, width: 50 },
    choices: [
      choice({
        id: 'engage-carrier',
        attributes: { tackling: 0.5, acceleration: 0.3, aggression: 0.2 },
        base: 0.5,
        event: 'tackle',
        family: 'defending',
        stat: 'tackles',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'ball-winner',
        commentary: 'tackle',
      }),
      choice({
        id: 'cut-lane',
        attributes: { positioning: 0.5, decisions: 0.3, vision: 0.2 },
        base: 0.55,
        event: 'tackle',
        family: 'defending',
        stat: 'tackles',
        opponent: 'attacker',
        traitId: 'interceptor',
        commentary: 'intercept',
      }),
      choice({
        id: 'delay',
        attributes: { positioning: 0.4, decisions: 0.4, pace: 0.2 },
        base: 0.75,
        againstOnFailure: 0.8,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'man-marker',
        commentary: 'jockey',
      }),
    ],
  },
  {
    id: 'set-piece-marking',
    drama: true,
    phase: 'defence',
    attackWeight: 0,
    defenceWeight: 0.8,
    positions: { CB: 0.8, DM: 0.4, LB: 0.3, RB: 0.3 },
    spot: { depth: 6, width: 50 },
    choices: [
      choice({
        id: 'zonal-hold',
        attributes: { heading: 0.4, positioning: 0.4, jumping: 0.2 },
        base: 0.6,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        conditions: 'direct',
        traitId: 'aerial-dominance',
        commentary: 'block',
      }),
      choice({
        id: 'man-mark',
        attributes: { strength: 0.4, positioning: 0.3, jumping: 0.3 },
        base: 0.6,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'man-marker',
        commentary: 'track',
      }),
      choice({
        id: 'front-post',
        attributes: { heading: 0.4, acceleration: 0.3, decisions: 0.3 },
        base: 0.55,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        conditions: 'direct',
        traitId: 'aerial-threat',
        commentary: 'block',
      }),
    ],
  },
  {
    id: 'sweeping',
    phase: 'defence',
    attackWeight: 0.2,
    defenceWeight: 1.6,
    positions: { GK: 1 },
    spot: { depth: 14, width: 50 },
    choices: [
      choice({
        id: 'sweep-clear',
        attributes: { oneOnOnes: 0.4, decisions: 0.4, kicking: 0.2 },
        base: 0.62,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'sweeper',
        commentary: 'rush',
      }),
      choice({
        id: 'sweep-control',
        attributes: { kicking: 0.4, decisions: 0.3, composure: 0.3 },
        base: 0.48,
        event: 'pass',
        family: 'goalkeeping',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'distributor',
        commentary: 'recycle',
      }),
      choice({
        id: 'stay-home',
        attributes: { reflexes: 0.5, oneOnOnes: 0.3, diving: 0.2 },
        direct: 'against',
        event: 'save',
        family: 'goalkeeping',
        stat: 'saves',
        opponent: 'attacker',
        traitId: 'cat-reflexes',
        commentary: 'line',
      }),
    ],
  },
  {
    id: 'back-pass',
    attackWeight: 0.35,
    defenceWeight: 0.7,
    positions: { GK: 1.1 },
    spot: { depth: 7, width: 44 },
    choices: [
      choice({
        id: 'first-time-clear',
        attributes: { kicking: 0.6, decisions: 0.4 },
        base: 0.8,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'direct',
        commentary: 'long-ball',
      }),
      choice({
        id: 'take-touch',
        attributes: { composure: 0.4, kicking: 0.3, decisions: 0.3 },
        base: 0.72,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'distributor',
        commentary: 'recycle',
      }),
      choice({
        id: 'round-striker',
        attributes: { agility: 0.4, composure: 0.4, decisions: 0.2 },
        base: 0.5,
        event: 'dribble',
        family: 'dribbling',
        opponent: 'attacker',
        conditions: 'technical',
        commentary: 'carry',
      }),
    ],
  },
  {
    id: 'rebound',
    phase: 'attack',
    attackWeight: 1,
    defenceWeight: 0,
    positions: { ST: 1.5, LW: 0.8, RW: 0.8, AM: 0.9, CM: 0.5 },
    spot: { depth: 92, width: 46 },
    choices: [
      choice({
        id: 'rebound-first-time',
        attributes: { finishing: 0.6, composure: 0.2, acceleration: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        traitId: 'poacher',
        commentary: 'shot',
        target: 48,
      }),
      choice({
        id: 'rebound-control',
        forOnSuccess: 0.9,
        attributes: { firstTouch: 0.5, finishing: 0.3, composure: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        traitId: 'composed',
        commentary: 'placed',
        target: 53,
      }),
      choice({
        id: 'rebound-cutback',
        attributes: { passing: 0.5, vision: 0.3, composure: 0.2 },
        base: 0.7,
        assist: true,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'technical',
        traitId: 'playmaker',
        commentary: 'pass',
      }),
    ],
  },
  {
    id: 'weak-foot',
    phase: 'attack',
    attackWeight: 0.8,
    defenceWeight: 0,
    positions: { ST: 1, LW: 1.2, RW: 1.2, AM: 1, CM: 0.5 },
    spot: { depth: 86, width: 36 },
    choices: [
      choice({
        id: 'weak-foot-shot',
        attributes: { finishing: 0.6, composure: 0.4 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        commentary: 'shot',
        target: 47,
      }),
      choice({
        id: 'shift-strong',
        forOnSuccess: 0.9,
        attributes: { dribbling: 0.4, finishing: 0.4, agility: 0.2 },
        direct: 'for',
        scorer: 'self',
        event: 'shot',
        family: 'shooting',
        stat: 'shots',
        opponent: 'keeper',
        traitId: 'close-control',
        commentary: 'placed',
        target: 53,
      }),
      choice({
        id: 'weak-foot-pass',
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
    ],
  },
];

/**
 * Skill-unlocked choices of match-22 (review C13: capstones as mechanics). Each joins its
 * situation's choices for a player with the skill, replacing the weakest base choice when four
 * are already offered (C14).
 */
export const UNLOCKS_22: Readonly<Record<string, readonly Situation['choices'][number][]>> = {
  // Ball Winner: win it and go, starting a counter.
  'defend-attack': [
    choice({
      id: 'press-carry',
      attributes: { tackling: 0.4, aggression: 0.2, acceleration: 0.2, dribbling: 0.2 },
      base: 0.5,
      event: 'tackle',
      family: 'defending',
      stat: 'tackles',
      opponent: 'attacker',
      conditions: 'technical',
      requiredTraitId: 'ball-winner',
      counter: 0.05,
      commentary: 'tackle',
    }),
  ],
  // Maestro: a first-time ball over the press into the space behind, starting a counter.
  'build-out': [
    choice({
      id: 'first-time-ball',
      attributes: { vision: 0.5, passing: 0.4, composure: 0.1 },
      base: 0.48,
      assist: true,
      event: 'pass',
      family: 'passing',
      stat: 'passes',
      opponent: 'attacker',
      conditions: 'technical',
      requiredTraitId: 'maestro',
      counter: 0.06,
      commentary: 'through',
    }),
  ],
};
/** The keeper's quick release (Distributor) starts a counter on match-22. */
export const COUNTER_22: Readonly<Record<string, number>> = { 'quick-release': 0.05 };

/** Every situation of the current engine, and a lookup by id over both catalogues. */
export const ALL_SITUATIONS: readonly Situation[] = [...SITUATIONS, ...SITUATIONS_22];
export const SITUATION_22_BY_ID: Readonly<Record<string, Situation>> = {
  ...SITUATION_BY_ID,
  ...Object.fromEntries(SITUATIONS_22.map((situation) => [situation.id, situation])),
};
/** A situation of either catalogue (match-21 sessions only ever name the first). */
export const situationOf = (id: string): Situation | undefined => SITUATION_22_BY_ID[id];
/** A choice's template in a situation, skill mechanics (UNLOCKS_22) included. */
export const templateOf = (situationId: string, choiceId: string) =>
  [...(situationOf(situationId)?.choices ?? []), ...(UNLOCKS_22[situationId] ?? [])].find(
    (template) => template.id === choiceId,
  );

/**
 * Selection weights per position of the match-21 situations on match-22 (review M9), so no
 * position spends much more than a third of its moments in one. The new situations carry their
 * own; situations absent here keep their match-21 weights.
 */
export const POSITIONS_22: Readonly<Record<string, Partial<Record<Position, number>>>> = {
  'box-chance': { ST: 2.6, LW: 1.9, RW: 1.9, AM: 1.7, CM: 0.9 },
  'build-up': { ST: 1.6, LW: 3, RW: 3, AM: 2.8, CM: 3, DM: 1, LB: 1.4, RB: 1.4 },
  'edge-of-area': { ST: 1.6, LW: 1.7, RW: 1.7, AM: 2.4, CM: 2.2, DM: 0.5 },
  'aerial-chance': { ST: 1.9, LW: 0.8, RW: 0.8, AM: 0.5, CM: 0.5, CB: 0.6 },
  'defend-attack': { CB: 3, LB: 2.6, RB: 2.6, DM: 3, CM: 1.5 },
  'build-out': { CB: 2, LB: 1.8, RB: 1.8, DM: 2.4, CM: 1.5 },
  'shot-incoming': { GK: 3 },
  'one-on-one': { GK: 1 },
  'cross-ball': { GK: 1.7 },
  distribution: { GK: 1.7 },
  'offside-line': { CB: 1.2, LB: 0.6, RB: 0.6, DM: 0.4 },
};
