import type { Position, Tactics } from '../../model/domain';

/** Position families share one personal-role list. This is the single source used by the
 * preview screen, tactic validation and the half-time role request. */
export type PositionFamily = 'keeper' | 'defence' | 'wide' | 'central';
export const ROLES_BY_FAMILY = {
  keeper: ['balanced', 'sweeper-keeper', 'shot-stopper', 'safe-distribution'],
  defence: ['balanced', 'hold-position', 'ball-winner', 'push-forward'],
  wide: ['balanced', 'hug-touchline', 'cut-inside', 'track-back'],
  central: ['balanced', 'playmaker', 'run-behind', 'target-player'],
} as const satisfies Record<PositionFamily, readonly string[]>;
export type RoleId = (typeof ROLES_BY_FAMILY)[PositionFamily][number];

/** Requested at half-time ("more attacking freedom"); the first role different from the current. */
const HALFTIME_ROLES: Record<PositionFamily, readonly RoleId[]> = {
  keeper: ['sweeper-keeper', 'safe-distribution'],
  defence: ['push-forward', 'ball-winner'],
  wide: ['cut-inside', 'hug-touchline'],
  central: ['run-behind', 'playmaker'],
};

export interface RoleEffect {
  /** Multiplies situation selection weights. */
  situations?: Partial<Record<string, number>>;
  /** Choices receiving the role multiplier on success odds. */
  choices?: readonly string[];
  /** Scales [own, opposition] expected goals: an attacking role opens the game both ways. */
  totals?: readonly [number, number];
  /** Covering runs reduce the danger of failed choices. */
  counterRelief?: boolean;
}
export const ROLE_EFFECTS: Record<RoleId, RoleEffect> = {
  balanced: {},
  'sweeper-keeper': {
    situations: { 'one-on-one': 2, distribution: 1.2 },
    choices: ['rush', 'claim', 'short-distribution'],
  },
  'shot-stopper': {
    situations: { 'shot-incoming': 1.5, 'one-on-one': 0.8 },
    choices: ['hold', 'parry', 'stay-line', 'hold-line'],
  },
  'safe-distribution': {
    situations: { distribution: 1.6 },
    choices: ['short-distribution', 'long-distribution'],
  },
  'hold-position': {
    situations: { 'defend-attack': 1.3, 'build-out': 0.8 },
    choices: ['jockey', 'intercept'],
    counterRelief: true,
  },
  'ball-winner': { situations: { 'defend-attack': 1.4 }, choices: ['tackle'] },
  'push-forward': {
    situations: { 'build-out': 1.3, 'build-up': 1.6 },
    choices: ['carry-out', 'carry-forward', 'cross-switch'],
    totals: [1.05, 1.04],
  },
  'hug-touchline': {
    situations: { 'build-up': 1.6, 'box-chance': 0.8 },
    choices: ['cross-switch'],
  },
  'cut-inside': {
    situations: { 'box-chance': 1.3, 'edge-of-area': 1.4, 'build-up': 0.8 },
    choices: ['far-post', 'drive-inside', 'long-shot'],
    totals: [1.05, 1.04],
  },
  'track-back': {
    situations: { 'build-up': 1.2, 'box-chance': 0.8 },
    choices: ['lay-off', 'cross-switch'],
    counterRelief: true,
  },
  playmaker: {
    situations: { 'build-up': 1.5, 'edge-of-area': 1.1, 'box-chance': 0.8 },
    choices: ['through-ball', 'square-pass', 'lay-off'],
  },
  'run-behind': {
    situations: { 'box-chance': 1.4, 'build-up': 0.9 },
    choices: ['take-on', 'carry-forward', 'near-post'],
  },
  'target-player': {
    situations: { 'aerial-chance': 2, 'box-chance': 1.1 },
    choices: ['header', 'cushion', 'near-post'],
  },
};

export function positionFamily(position: Position): PositionFamily {
  return position === 'GK'
    ? 'keeper'
    : ['CB', 'LB', 'RB', 'DM'].includes(position)
      ? 'defence'
      : ['LW', 'RW'].includes(position)
        ? 'wide'
        : 'central';
}
export function rolesForPosition(position: Position): readonly RoleId[] {
  return ROLES_BY_FAMILY[positionFamily(position)];
}
export function isRoleFor(position: Position, role: string): role is RoleId {
  return (rolesForPosition(position) as readonly string[]).includes(role);
}
export function halftimeRole(position: Position, current: string): RoleId {
  const options = HALFTIME_ROLES[positionFamily(position)];
  return options.find((role) => role !== current) ?? options[0]!;
}
export function roleEffect(role: string): RoleEffect {
  return ROLE_EFFECTS[role as RoleId] ?? {};
}
const MENTALITIES: readonly Tactics['mentality'][] = ['defensive', 'balanced', 'attacking'];
/** One step along defensive → balanced → attacking, bounded at both ends. */
export function shiftMentality(
  mentality: Tactics['mentality'],
  step: 1 | -1,
): Tactics['mentality'] {
  const index = Math.max(0, Math.min(2, MENTALITIES.indexOf(mentality) + step));
  return MENTALITIES[index]!;
}
