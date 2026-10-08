/**
 * One team selection for every match (Phase 5.1): background results, the career player's
 * selection and interactive matches pick the same eleven for a club and formation.
 *
 * A player's value in a slot is their ability scaled by positional fit: full value in their
 * primary position, their familiarity (0–100) for a secondary one, and the configured floor
 * for an unfamiliar one. Slots are filled best value first across the whole team, so a slightly
 * weaker specialist can beat a stronger player out of position. Keepers only keep goal.
 */
import type { Id, Player, Position } from '../../model/domain';
import { CONFIG } from '../config';
import { playerAbility } from '../strength';
import { FORMATION_SLOTS, type Formation } from './formations';

const S = CONFIG.selection;

export interface LineupChoice {
  formation: Formation;
  /** In slot order: index i plays `slots[i]`. */
  starterIds: Id[];
  slots: Position[];
  benchIds: Id[];
}

/** How well a player knows a position: 100 primary, familiarity if secondary, otherwise 0. */
export function slotFit(
  player: Pick<Player, 'primaryPosition' | 'secondaryPositions'>,
  position: Position,
): number {
  if (player.primaryPosition === position) return 100;
  return player.secondaryPositions.find((entry) => entry.position === position)?.familiarity ?? 0;
}
/** A player's ability in a slot, scaled by positional fit. */
export function effectiveAbility(player: Player, position: Position): number {
  const fit = slotFit(player, position);
  return playerAbility(player) * (S.unfamiliarFactor + ((1 - S.unfamiliarFactor) * fit) / 100);
}
export const available = (player: Player | undefined): player is Player =>
  Boolean(player && !player.retired && !player.injuryId && player.fitness > 0);

/**
 * The eleven a club fields in a formation. `selected` is placed in their best slot first (the
 * interactive career player); `exclude` leaves players out (a benched career player).
 * Deterministic: ties go to better fit, then the earlier slot, then the lower id.
 */
export function selectLineup(
  playerIds: readonly Id[],
  players: Readonly<Record<Id, Player>>,
  formation: Formation,
  options: { selected?: Id; exclude?: readonly Id[] } = {},
): LineupChoice {
  const slots = FORMATION_SLOTS[formation];
  const excluded = new Set(options.exclude ?? []);
  const pool = playerIds
    .map((id) => players[id])
    .filter(available)
    .filter((player) => !excluded.has(player.id));
  const byAbility = (a: Player, b: Player) =>
    playerAbility(b) - playerAbility(a) || (a.id < b.id ? -1 : 1);
  const filled: (Id | null)[] = slots.map(() => null);
  const taken = new Set<Id>();
  const place = (index: number, id: Id) => {
    filled[index] = id;
    taken.add(id);
  };
  const selected = options.selected ? pool.find((player) => player.id === options.selected) : null;
  if (selected) {
    if (selected.primaryPosition === 'GK') place(0, selected.id);
    else {
      let best = 1;
      for (let index = 2; index < slots.length; index++)
        if (
          effectiveAbility(selected, slots[index]!.position) >
          effectiveAbility(selected, slots[best]!.position)
        )
          best = index;
      place(best, selected.id);
    }
  }
  if (!filled[0]) {
    const keeper = pool.filter((player) => player.primaryPosition === 'GK').sort(byAbility)[0];
    if (keeper) place(0, keeper.id);
  }
  // Every outfield slot and outfielder, best value first.
  const pairs: { index: number; player: Player; value: number; fit: number }[] = [];
  for (let index = 1; index < slots.length; index++) {
    if (filled[index]) continue;
    const position = slots[index]!.position;
    for (const player of pool)
      if (player.primaryPosition !== 'GK' && !taken.has(player.id))
        pairs.push({
          index,
          player,
          value: effectiveAbility(player, position),
          fit: slotFit(player, position),
        });
  }
  pairs.sort(
    (a, b) =>
      b.value - a.value ||
      b.fit - a.fit ||
      a.index - b.index ||
      (a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0),
  );
  for (const pair of pairs)
    if (!filled[pair.index] && !taken.has(pair.player.id)) place(pair.index, pair.player.id);
  // A squad short of outfielders or keepers fills what it can, keepers last.
  for (let index = 0; index < slots.length; index++) {
    if (filled[index]) continue;
    const spare = pool.filter((player) => !taken.has(player.id)).sort(byAbility)[0];
    if (spare) place(index, spare.id);
  }
  const starterIds: Id[] = [];
  const positions: Position[] = [];
  filled.forEach((id, index) => {
    if (!id) return;
    starterIds.push(id);
    positions.push(slots[index]!.position);
  });
  return {
    formation,
    starterIds,
    slots: positions,
    benchIds: pool.filter((player) => !taken.has(player.id)).map((player) => player.id),
  };
}

/** Team strength input: the mean of each starter's ability in their slot. */
export function lineupAbility(choice: LineupChoice, players: Readonly<Record<Id, Player>>): number {
  if (!choice.starterIds.length) return 0;
  return (
    choice.starterIds.reduce(
      (sum, id, index) => sum + effectiveAbility(players[id]!, choice.slots[index]!),
      0,
    ) / choice.starterIds.length
  );
}
