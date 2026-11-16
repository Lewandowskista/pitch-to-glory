import type { ChainFailure, ChoiceOutcome } from '../../model/domain';
import { choice, type ChoiceTemplate, type Situation } from './situations';

/**
 * The decision-chain catalogue (engine match-22, release 1.0 X1a; docs/MATCH-BALANCING.md
 * "Decision chains"). A chain's last step is a situation of the match-22 catalogue (the finish:
 * a shot, a final ball, a block, a save); the steps before it are lead-ins from this file: a
 * read (receive the ball, get goal-side, set your feet) and, in a three-step chain, an action
 * (beat your man, step in, narrow the angle).
 *
 * Each lead-in option, when it comes off, stages a state of the next step's read (a 5.2 read
 * of the play, `match.read.<read>.<state>`): turning your man leaves you one against one in the
 * box, pressing the carrier forces a heavy touch. The next step's odds show it as a named
 * factor. A failed lead-in ends the chain with the option's declared consequence, except a
 * set piece's read, which only stages the worse state (`misread`).
 */

/** A lead-in option: its template, what its chance is of, and what failing it leads to. */
export interface LeadInOption {
  template: ChoiceTemplate;
  outcome: ChoiceOutcome;
  ifFailed: ChainFailure;
}
/** The family of a chain's finish: which lead-ins come before it. */
export type ChainFamily = 'attack' | 'build' | 'defence' | 'keeper' | 'set-piece';

const lead = (
  value: Parameters<typeof choice>[0],
  outcome: ChoiceOutcome,
  ifFailed: ChainFailure,
): LeadInOption => ({ template: choice({ scorer: 'self', ...value }), outcome, ifFailed });

/** Lead-in options by id. */
export const LEAD_IN_OPTIONS: Readonly<Record<string, LeadInOption>> = Object.fromEntries(
  [
    // ── Attack: receive (read) ──────────────────────────────────────────────────
    lead(
      {
        id: 'receive-set',
        attributes: { firstTouch: 0.5, composure: 0.3, strength: 0.2 },
        base: 0.72,
        event: 'dribble',
        family: 'dribbling',
        conditions: 'technical',
        boostedBy: ['close-control', 'composed'],
        commentary: 'chain-touch',
      },
      'control',
      'foul-won',
    ),
    lead(
      {
        id: 'receive-turn',
        attributes: { firstTouch: 0.4, agility: 0.3, dribbling: 0.3 },
        base: 0.56,
        event: 'dribble',
        family: 'dribbling',
        conditions: 'technical',
        traitId: 'trickster',
        boostedBy: ['magician', 'flair'],
        commentary: 'chain-turn',
      },
      'turn',
      'counter',
    ),
    lead(
      {
        id: 'receive-run',
        attributes: { pace: 0.4, acceleration: 0.3, positioning: 0.3 },
        base: 0.5,
        event: 'dribble',
        family: 'dribbling',
        traitId: 'sprinter',
        boostedBy: ['speed-dribbler'],
        commentary: 'chain-run',
      },
      'run',
      'offside',
    ),
    // ── Attack: beat your man (action) ──────────────────────────────────────────
    lead(
      {
        id: 'beat-dribble',
        attributes: { dribbling: 0.5, agility: 0.3, acceleration: 0.2 },
        base: 0.55,
        event: 'dribble',
        family: 'dribbling',
        conditions: 'technical',
        traitId: 'trickster',
        boostedBy: ['magician', 'flair', 'speed-dribbler'],
        commentary: 'chain-turn',
      },
      'beat',
      'counter',
    ),
    lead(
      {
        id: 'beat-combine',
        attributes: { passing: 0.5, vision: 0.3, firstTouch: 0.2 },
        base: 0.66,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        conditions: 'technical',
        traitId: 'playmaker',
        boostedBy: ['maestro', 'tempo-setter'],
        commentary: 'chain-combine',
      },
      'combine',
      'lost',
    ),
    lead(
      {
        id: 'beat-shield',
        attributes: { strength: 0.5, composure: 0.3, firstTouch: 0.2 },
        base: 0.76,
        event: 'dribble',
        family: 'dribbling',
        traitId: 'powerhouse',
        commentary: 'chain-shield',
      },
      'shield',
      'foul-won',
    ),
    // ── Attack: the run into the box (read, for crosses and loose balls) ────────
    lead(
      {
        id: 'run-near',
        attributes: { acceleration: 0.4, heading: 0.3, positioning: 0.3 },
        base: 0.55,
        event: 'dribble',
        family: 'dribbling',
        traitId: 'poacher',
        commentary: 'chain-run',
      },
      'run',
      'lost',
    ),
    lead(
      {
        id: 'run-far',
        attributes: { positioning: 0.4, jumping: 0.3, composure: 0.3 },
        base: 0.66,
        event: 'dribble',
        family: 'dribbling',
        traitId: 'aerial-threat',
        commentary: 'chain-run',
      },
      'run',
      'lost',
    ),
    lead(
      {
        id: 'run-hold',
        attributes: { composure: 0.4, strength: 0.3, firstTouch: 0.3 },
        base: 0.76,
        event: 'dribble',
        family: 'dribbling',
        commentary: 'chain-touch',
      },
      'control',
      'lost',
    ),
    // ── Build: collect the ball deep (read) ─────────────────────────────────────
    lead(
      {
        id: 'collect-touch',
        attributes: { composure: 0.5, decisions: 0.3, strength: 0.2 },
        base: 0.76,
        event: 'dribble',
        family: 'passing',
        opponent: 'attacker',
        commentary: 'chain-collect',
      },
      'control',
      'counter',
    ),
    lead(
      {
        id: 'collect-scan',
        attributes: { vision: 0.5, decisions: 0.3, composure: 0.2 },
        base: 0.66,
        event: 'dribble',
        family: 'passing',
        opponent: 'attacker',
        traitId: 'tempo-setter',
        commentary: 'chain-collect',
      },
      'set',
      'counter',
    ),
    lead(
      {
        id: 'collect-first',
        attributes: { decisions: 0.4, vision: 0.3, composure: 0.3 },
        base: 0.58,
        event: 'pass',
        family: 'passing',
        stat: 'passes',
        opponent: 'attacker',
        traitId: 'maestro',
        boostedBy: ['distributor', 'escape-artist'],
        commentary: 'chain-collect',
      },
      'pass',
      'counter',
    ),
    // ── Defence: positioning (read) ─────────────────────────────────────────────
    lead(
      {
        id: 'position-goal-side',
        attributes: { positioning: 0.5, pace: 0.3, decisions: 0.2 },
        base: 0.78,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'man-marker',
        boostedBy: ['defensive-wall'],
        commentary: 'chain-hold',
      },
      'goal-side',
      'beaten',
    ),
    lead(
      {
        id: 'position-press',
        attributes: { acceleration: 0.4, aggression: 0.3, tackling: 0.3 },
        base: 0.6,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'ball-winner',
        boostedBy: ['engine'],
        commentary: 'chain-press',
      },
      'press',
      'foul',
    ),
    lead(
      {
        id: 'position-cover',
        attributes: { positioning: 0.4, decisions: 0.4, vision: 0.2 },
        base: 0.68,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'interceptor',
        commentary: 'chain-hold',
      },
      'cover',
      'beaten',
    ),
    // ── Defence: engage (action) ────────────────────────────────────────────────
    lead(
      {
        id: 'engage-step',
        attributes: { tackling: 0.5, acceleration: 0.3, aggression: 0.2 },
        base: 0.6,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        conditions: 'technical',
        traitId: 'ball-winner',
        boostedBy: ['last-ditch', 'powerhouse'],
        commentary: 'chain-press',
      },
      'press',
      'beaten',
    ),
    lead(
      {
        id: 'engage-delay',
        attributes: { positioning: 0.5, decisions: 0.3, pace: 0.2 },
        base: 0.78,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'man-marker',
        commentary: 'chain-hold',
      },
      'goal-side',
      'beaten',
    ),
    lead(
      {
        id: 'engage-show',
        attributes: { pace: 0.4, positioning: 0.4, decisions: 0.2 },
        base: 0.68,
        event: 'tackle',
        family: 'defending',
        opponent: 'attacker',
        traitId: 'sprinter',
        commentary: 'chain-hold',
      },
      'cover',
      'beaten',
    ),
    // ── Keeper: set your position (read) ────────────────────────────────────────
    lead(
      {
        id: 'set-line',
        attributes: { reflexes: 0.5, diving: 0.3, handling: 0.2 },
        base: 0.8,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'cat-reflexes',
        commentary: 'chain-keeper',
      },
      'set',
      'beaten',
    ),
    lead(
      {
        id: 'set-off',
        attributes: { oneOnOnes: 0.5, commandOfArea: 0.5 },
        base: 0.62,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'sweeper',
        boostedBy: ['one-on-one-specialist'],
        commentary: 'chain-keeper',
      },
      'set',
      'beaten',
    ),
    lead(
      {
        id: 'set-near',
        attributes: { reflexes: 0.4, diving: 0.4, aerialReach: 0.2 },
        base: 0.7,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'reaction-saves',
        commentary: 'chain-keeper',
      },
      'set',
      'beaten',
    ),
    // ── Keeper: the angle (action) ──────────────────────────────────────────────
    lead(
      {
        id: 'angle-narrow',
        attributes: { oneOnOnes: 0.6, commandOfArea: 0.4 },
        base: 0.64,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'one-on-one-specialist',
        commentary: 'chain-keeper',
      },
      'set',
      'beaten',
    ),
    lead(
      {
        id: 'angle-big',
        attributes: { reflexes: 0.5, diving: 0.3, handling: 0.2 },
        base: 0.8,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'wall',
        commentary: 'chain-keeper',
      },
      'set',
      'beaten',
    ),
    lead(
      {
        id: 'angle-feint',
        attributes: { oneOnOnes: 0.5, reflexes: 0.3, diving: 0.2 },
        base: 0.6,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        commentary: 'chain-keeper',
      },
      'set',
      'beaten',
    ),
    // ── Set pieces: the read before the kick (never ends the chain) ─────────────
    lead(
      {
        id: 'spot-keeper',
        attributes: { composure: 0.6, decisions: 0.4 },
        base: 0.58,
        event: 'dribble',
        family: 'shooting',
        opponent: 'keeper',
        traitId: 'composed',
        commentary: 'chain-read',
      },
      'read',
      'misread',
    ),
    lead(
      {
        id: 'spot-pick',
        attributes: { composure: 0.5, finishing: 0.3, setPieces: 0.2 },
        base: 0.76,
        event: 'dribble',
        family: 'shooting',
        opponent: 'keeper',
        traitId: 'set-piece-specialist',
        commentary: 'chain-read',
      },
      'read',
      'misread',
    ),
    lead(
      {
        id: 'scan-near',
        attributes: { vision: 0.6, decisions: 0.4 },
        base: 0.6,
        event: 'dribble',
        family: 'passing',
        traitId: 'delivery-specialist',
        commentary: 'chain-read',
      },
      'read',
      'misread',
    ),
    lead(
      {
        id: 'scan-far',
        attributes: { setPieces: 0.5, composure: 0.3, vision: 0.2 },
        base: 0.74,
        event: 'dribble',
        family: 'passing',
        traitId: 'set-piece-specialist',
        commentary: 'chain-read',
      },
      'read',
      'misread',
    ),
    lead(
      {
        id: 'taker-hips',
        attributes: { oneOnOnes: 0.5, diving: 0.3, reflexes: 0.2 },
        base: 0.55,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'one-on-one-specialist',
        commentary: 'chain-read',
      },
      'read',
      'misread',
    ),
    lead(
      {
        id: 'taker-big',
        attributes: { reflexes: 0.5, diving: 0.3, handling: 0.2 },
        base: 0.74,
        event: 'save',
        family: 'goalkeeping',
        opponent: 'attacker',
        traitId: 'cat-reflexes',
        commentary: 'chain-read',
      },
      'read',
      'misread',
    ),
  ].map((option) => [option.template.id, option]),
);

const leadIn = (id: string, phase: Situation['phase'], options: readonly string[]): Situation => ({
  id,
  attackWeight: 0,
  defenceWeight: 0,
  positions: {},
  ...(phase ? { phase } : {}),
  spot: { depth: 50, width: 50 },
  choices: options.map((option) => LEAD_IN_OPTIONS[option]!.template),
});
/** The lead-in steps, as situations of the catalogue (never drawn on their own). */
export const LEAD_INS: readonly Situation[] = [
  leadIn('chain-receive', 'attack', ['receive-set', 'receive-turn', 'receive-run']),
  leadIn('chain-beat', 'attack', ['beat-dribble', 'beat-combine', 'beat-shield']),
  leadIn('chain-run', 'attack', ['run-near', 'run-far', 'run-hold']),
  leadIn('chain-collect', undefined, ['collect-touch', 'collect-scan', 'collect-first']),
  leadIn('chain-position', 'defence', ['position-goal-side', 'position-press', 'position-cover']),
  leadIn('chain-engage', 'defence', ['engage-step', 'engage-delay', 'engage-show']),
  leadIn('chain-set', 'defence', ['set-line', 'set-off', 'set-near']),
  leadIn('chain-angle', 'defence', ['angle-narrow', 'angle-big', 'angle-feint']),
  leadIn('chain-spot', 'attack', ['spot-keeper', 'spot-pick']),
  leadIn('chain-scan', 'attack', ['scan-near', 'scan-far']),
  leadIn('chain-taker', 'defence', ['taker-hips', 'taker-big']),
];
export const LEAD_IN_IDS: ReadonlySet<string> = new Set(LEAD_INS.map((s) => s.id));
/** A set piece's read: it never ends its chain; failing it stages the worse state. */
export const SET_PIECE_READS: ReadonlySet<string> = new Set([
  'chain-spot',
  'chain-scan',
  'chain-taker',
]);

/** Each finish's family. A situation not listed is not a chain's finish. */
export const FINISH_FAMILY: Readonly<Record<string, ChainFamily>> = {
  'box-chance': 'attack',
  'edge-of-area': 'attack',
  'aerial-chance': 'attack',
  rebound: 'attack',
  'weak-foot': 'attack',
  'build-up': 'attack',
  'build-out': 'build',
  distribution: 'build',
  'back-pass': 'build',
  'defend-attack': 'defence',
  'last-man': 'defence',
  'two-on-one': 'defence',
  'cross-defence': 'defence',
  'offside-line': 'defence',
  'goal-line': 'defence',
  'set-piece-marking': 'defence',
  'shot-incoming': 'keeper',
  'one-on-one': 'keeper',
  'cross-ball': 'keeper',
  sweeping: 'keeper',
  penalty: 'set-piece',
  'free-kick': 'set-piece',
  'corner-kick': 'set-piece',
  'penalty-save': 'set-piece',
};
/** The chain kind a finish gives (`ChainState.kind`). */
export const finishKind = (situationId: string, keeper: boolean) => {
  const family = FINISH_FAMILY[situationId];
  if (family === 'set-piece' || situationId === 'set-piece-marking') return 'set-piece' as const;
  if (family === 'keeper' || (family === 'build' && keeper)) return 'keeper' as const;
  if (family === 'defence') return 'defence' as const;
  return 'attack' as const;
};

/**
 * The lead-ins before a finish, for a two- or three-step chain. Set pieces and a keeper's build
 * have two steps.
 */
export function chainPath(finish: string, steps: 2 | 3, keeper: boolean): string[] {
  const family = FINISH_FAMILY[finish] ?? 'attack';
  const two = steps === 2;
  switch (family) {
    case 'attack': {
      const read =
        finish === 'aerial-chance' || finish === 'rebound' ? 'chain-run' : 'chain-receive';
      if (two) return [read, finish];
      return read === 'chain-run'
        ? ['chain-receive', 'chain-run', finish]
        : ['chain-receive', 'chain-beat', finish];
    }
    case 'build':
      return two || keeper ? ['chain-collect', finish] : ['chain-collect', 'chain-beat', finish];
    case 'defence':
      return two ? ['chain-position', finish] : ['chain-position', 'chain-engage', finish];
    case 'keeper':
      return two ? ['chain-set', finish] : ['chain-set', 'chain-angle', finish];
    case 'set-piece':
      return [
        finish === 'corner-kick'
          ? 'chain-scan'
          : finish === 'penalty-save'
            ? 'chain-taker'
            : 'chain-spot',
        finish,
      ];
  }
}
/** Whether a finish can close a three-step chain. */
export const allowsThree = (finish: string, keeper: boolean) =>
  FINISH_FAMILY[finish] !== 'set-piece' && !(FINISH_FAMILY[finish] === 'build' && keeper);

/**
 * What a choice does, for the edge a lead-in stages: a shot, a pass, a dribble or carry, a
 * defending or keeping challenge (`stop`), or a save on the line (`save`).
 */
export type ChoiceClass = 'shot' | 'pass' | 'dribble' | 'stop' | 'save';
export function choiceClass(template: ChoiceTemplate): ChoiceClass {
  if (template.direct === 'for') return 'shot';
  if (template.direct === 'against') return 'save';
  if (template.event === 'pass') return 'pass';
  if (template.event === 'dribble') return 'dribble';
  return 'stop';
}
/**
 * The edge a lead-in step leaves for the rest of its chain (`match.read.edge.<state>`): how
 * big the chance it leads to is (`value`: the finish's expected goals in attack, its danger in
 * defence, × this), and a named odds factor on the next step's options by what they do
 * (`odds`). Turning your man makes a bigger chance and a likelier shot; setting the ball makes
 * a smaller one and a likelier pass. A bolder option is less likely to come off and leaves a
 * bigger edge.
 */
export interface Edge {
  value: number;
  odds: Readonly<Partial<Record<ChoiceClass, number>>>;
}
const edge = (value: number, odds: Edge['odds'] = {}): Edge => ({ value, odds });
export const EDGES: Readonly<Record<string, Edge>> = {
  // Attack: receive.
  settled: edge(0.8, { pass: 1.05 }),
  turned: edge(1.45, { shot: 1.12, dribble: 1.12 }),
  'in-behind': edge(1.22, { shot: 1.2, pass: 0.9 }),
  // Attack: beat your man.
  'man-beaten': edge(1.6, { shot: 1.15, dribble: 1.15 }),
  combined: edge(1.0, { pass: 1.15 }),
  shielded: edge(0.83, { pass: 1.04 }),
  // Attack: the run into the box.
  'near-run': edge(1.2, { shot: 1.15 }),
  'far-run': edge(1.0, { dribble: 1.12, shot: 1.05 }),
  'held-run': edge(0.87, { pass: 1.05 }),
  // Building from the back.
  'first-touch': edge(0.9),
  scanned: edge(1.12),
  'first-time': edge(1.36),
  // Defence: positioning and engaging (the danger they leave).
  'goal-side': edge(0.9, { stop: 1.2, save: 1.15 }),
  pressed: edge(0.75, { stop: 1.4, save: 1.2 }),
  covered: edge(0.825, { stop: 1.3, save: 1.15 }),
  'stepped-in': edge(0.75, { stop: 1.4, save: 1.2 }),
  delayed: edge(0.9, { stop: 1.2, save: 1.15 }),
  'shown-wide': edge(0.825, { stop: 1.3, save: 1.15 }),
  // Keeping.
  'on-line': edge(0.9, { save: 1.25, stop: 1.05 }),
  'off-line': edge(0.75, { stop: 1.25, save: 1.1 }),
  'near-covered': edge(0.825, { save: 1.3, stop: 1.15 }),
  narrowed: edge(0.77, { stop: 1.3, save: 1.15 }),
  'stood-big': edge(0.9, { save: 1.2, stop: 1.1 }),
  feinted: edge(0.72, { save: 1.2, stop: 1.1 }),
  // Set pieces: a read that comes off, or not.
  'keeper-read': edge(1.1, { shot: 1.3 }),
  'keeper-misread': edge(0.9, { shot: 0.82, pass: 0.82 }),
  'spot-picked': edge(1.05, { shot: 1.1 }),
  'spot-doubted': edge(0.95, { shot: 0.88, pass: 0.88 }),
  'marking-read': edge(1.05, { pass: 1.2 }),
  'marking-misread': edge(0.85, { pass: 0.8 }),
  'routine-set': edge(1.05, { pass: 1.15 }),
  'routine-read': edge(0.9, { pass: 0.85 }),
  'taker-read': edge(1, { save: 1.35, stop: 1.2 }),
  'taker-misread': edge(1, { save: 0.8, stop: 0.8 }),
  'stayed-big': edge(1, { save: 1.12, stop: 1.05 }),
  'big-read': edge(1, { save: 0.85, stop: 0.85 }),
};
/** The edge each lead-in option leaves when it comes off and, for a set piece's read, when not. */
export const OPTION_EDGES: Readonly<Record<string, { success: string; failure?: string }>> = {
  'receive-set': { success: 'settled' },
  'receive-turn': { success: 'turned' },
  'receive-run': { success: 'in-behind' },
  'beat-dribble': { success: 'man-beaten' },
  'beat-combine': { success: 'combined' },
  'beat-shield': { success: 'shielded' },
  'run-near': { success: 'near-run' },
  'run-far': { success: 'far-run' },
  'run-hold': { success: 'held-run' },
  'collect-touch': { success: 'first-touch' },
  'collect-scan': { success: 'scanned' },
  'collect-first': { success: 'first-time' },
  'position-goal-side': { success: 'goal-side' },
  'position-press': { success: 'pressed' },
  'position-cover': { success: 'covered' },
  'engage-step': { success: 'stepped-in' },
  'engage-delay': { success: 'delayed' },
  'engage-show': { success: 'shown-wide' },
  'set-line': { success: 'on-line' },
  'set-off': { success: 'off-line' },
  'set-near': { success: 'near-covered' },
  'angle-narrow': { success: 'narrowed' },
  'angle-big': { success: 'stood-big' },
  'angle-feint': { success: 'feinted' },
  'spot-keeper': { success: 'keeper-read', failure: 'keeper-misread' },
  'spot-pick': { success: 'spot-picked', failure: 'spot-doubted' },
  'scan-near': { success: 'marking-read', failure: 'marking-misread' },
  'scan-far': { success: 'routine-set', failure: 'routine-read' },
  'taker-hips': { success: 'taker-read', failure: 'taker-misread' },
  'taker-big': { success: 'stayed-big', failure: 'big-read' },
};

/**
 * Budget weights in a chain where a key moment's would mislead (`chainBudget`): a match has
 * about half as many chains as it had moments, so a situation whose value is fixed (the penalty,
 * the penalty save) or whose danger would pass a real one (the goal line, the one-on-one) takes
 * a share of the mix that keeps its budget near what it is worth.
 */
export const CHAIN_WEIGHTS: Readonly<Record<string, { attack?: number; defence?: number }>> = {
  penalty: { attack: 4.2 },
  'penalty-save': { defence: 7 },
  'goal-line': { defence: 5 },
  'one-on-one': { defence: 2.2 },
};

/** How far a lead-in step happens before its finish's spot (depth units). */
export const LEAD_IN_DEPTH: Readonly<Record<string, number>> = {
  'chain-receive': -14,
  'chain-beat': -7,
  'chain-run': -6,
  'chain-collect': -2,
  'chain-position': 10,
  'chain-engage': 5,
  'chain-set': 0,
  'chain-angle': 0,
  'chain-spot': 0,
  'chain-scan': 0,
  'chain-taker': 0,
};
