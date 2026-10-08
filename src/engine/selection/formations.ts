/**
 * The four managers' formations (Phase 5.1): for each, eleven ordered slots with the position
 * a player fills, the line it belongs to, its role on the pitch and where it stands in the
 * team's attack frame. Selection fills the slots; match motion draws the shape from them.
 *
 * Coordinates are `[depth, width]` with the ball on the centre spot: depth from the team's own
 * goal line (0) to the opponent's (100), width from its left touchline. 4-3-3 keeps the shape
 * and slot order the match engine used before formations, so earlier matches replay unchanged.
 */
import type { Position } from '../../model/domain';

export const FORMATIONS = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'] as const;
export type Formation = (typeof FORMATIONS)[number];
export type Line = 'keeper' | 'defence' | 'midfield' | 'attack';
/**
 * What a slot does in set pieces and choreography. Several slots may share a role (two
 * strikers, two holding midfielders); lookups take the first, in slot order.
 */
export type SlotRole =
  | 'keeper'
  | 'left-back'
  | 'centre-back-left'
  | 'centre-back'
  | 'centre-back-right'
  | 'right-back'
  | 'left-mid'
  | 'pivot'
  | 'right-mid'
  | 'attacking-mid'
  | 'wide-left'
  | 'wide-right'
  | 'striker'
  | 'second-striker';
export interface FormationSlot {
  position: Position;
  line: Line;
  role: SlotRole;
  /** Where the slot stands with the ball on the centre spot, in and out of possession. */
  in: readonly [number, number];
  out: readonly [number, number];
}

const slot = (
  position: Position,
  line: Line,
  role: SlotRole,
  inPossession: readonly [number, number],
  outOfPossession: readonly [number, number],
): FormationSlot => ({ position, line, role, in: inPossession, out: outOfPossession });

const KEEPER = slot('GK', 'keeper', 'keeper', [6, 50], [5, 50]);
const BACK_FOUR = [
  slot('LB', 'defence', 'left-back', [38, 13], [26, 22]),
  slot('CB', 'defence', 'centre-back-left', [28, 37], [23, 41]),
  slot('CB', 'defence', 'centre-back-right', [28, 63], [23, 59]),
  slot('RB', 'defence', 'right-back', [38, 87], [26, 78]),
];

export const FORMATION_SLOTS: Record<Formation, readonly FormationSlot[]> = {
  '4-3-3': [
    KEEPER,
    ...BACK_FOUR,
    slot('CM', 'midfield', 'left-mid', [50, 33], [38, 36]),
    slot('DM', 'midfield', 'pivot', [40, 50], [32, 50]),
    slot('CM', 'midfield', 'right-mid', [50, 67], [38, 64]),
    slot('LW', 'attack', 'wide-left', [66, 12], [50, 25]),
    slot('ST', 'attack', 'striker', [70, 50], [56, 50]),
    slot('RW', 'attack', 'wide-right', [66, 88], [50, 75]),
  ],
  '4-4-2': [
    KEEPER,
    ...BACK_FOUR,
    slot('LW', 'midfield', 'wide-left', [56, 12], [40, 20]),
    slot('CM', 'midfield', 'left-mid', [48, 38], [36, 40]),
    slot('CM', 'midfield', 'right-mid', [48, 62], [36, 60]),
    slot('RW', 'midfield', 'wide-right', [56, 88], [40, 80]),
    slot('ST', 'attack', 'striker', [70, 42], [54, 44]),
    slot('ST', 'attack', 'second-striker', [68, 58], [52, 56]),
  ],
  '4-2-3-1': [
    KEEPER,
    ...BACK_FOUR,
    slot('DM', 'midfield', 'pivot', [42, 40], [32, 42]),
    slot('DM', 'midfield', 'pivot', [42, 60], [32, 58]),
    slot('LW', 'attack', 'wide-left', [64, 14], [46, 24]),
    slot('AM', 'midfield', 'attacking-mid', [60, 50], [44, 50]),
    slot('RW', 'attack', 'wide-right', [64, 86], [46, 76]),
    slot('ST', 'attack', 'striker', [72, 50], [56, 50]),
  ],
  '3-5-2': [
    KEEPER,
    slot('CB', 'defence', 'centre-back-left', [27, 30], [22, 34]),
    slot('CB', 'defence', 'centre-back', [25, 50], [20, 50]),
    slot('CB', 'defence', 'centre-back-right', [27, 70], [22, 66]),
    slot('LB', 'midfield', 'wide-left', [50, 10], [30, 16]),
    slot('CM', 'midfield', 'left-mid', [50, 35], [38, 38]),
    slot('DM', 'midfield', 'pivot', [40, 50], [32, 50]),
    slot('CM', 'midfield', 'right-mid', [50, 65], [38, 62]),
    slot('RB', 'midfield', 'wide-right', [50, 90], [30, 84]),
    slot('ST', 'attack', 'striker', [70, 42], [54, 44]),
    slot('ST', 'attack', 'second-striker', [68, 58], [52, 56]),
  ],
};

export const isFormation = (value: unknown): value is Formation =>
  typeof value === 'string' && (FORMATIONS as readonly string[]).includes(value);
/** A manager's formation, or 4-3-3 for anything unrecognised. */
export const formationOf = (value: unknown): Formation => (isFormation(value) ? value : '4-3-3');
