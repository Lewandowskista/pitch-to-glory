/**
 * Goalkeeping attributes an outfield player never trains (retention, release plan step 3.6).
 * They are a fixed function of the player's id (`untrainedValue`), so they are not stored: a
 * player without `keeperAttributes` has exactly the derived values. Pure and deterministic.
 */
import type { KeeperAttributes, Player } from '../model/domain';
import { isUntrained, KEEPER_KEYS, untrainedValue } from './ageing';

/** The untrained goalkeeping a player's id implies. */
export function untrainedKeeping(player: Pick<Player, 'id'>): KeeperAttributes {
  const values = {} as Record<(typeof KEEPER_KEYS)[number], number>;
  for (const key of KEEPER_KEYS) values[key] = untrainedValue(player, key);
  return values;
}

/** A player's goalkeeping: stored, or derived when it is untrained and so not stored. */
export function keeperAttributesOf(
  player: Pick<Player, 'id' | 'keeperAttributes'>,
): KeeperAttributes {
  return player.keeperAttributes ?? untrainedKeeping(player);
}

/** A player's goalkeeping to change: stored from now on. */
export function ownKeeperAttributes(
  player: Pick<Player, 'id' | 'keeperAttributes'>,
): KeeperAttributes {
  return (player.keeperAttributes ??= untrainedKeeping(player));
}

/**
 * Whether stored goalkeeping can go: an outfield player whose every value is the untrained one.
 * Dropping it then loses nothing, as `keeperAttributesOf` gives the same values back.
 */
export function isDerivableKeeping(
  player: Pick<Player, 'id' | 'primaryPosition' | 'keeperAttributes'>,
): boolean {
  const stored = player.keeperAttributes;
  if (!stored || player.primaryPosition === 'GK') return false;
  const keys = Object.keys(stored);
  return (
    keys.length === KEEPER_KEYS.length &&
    KEEPER_KEYS.every(
      (key) =>
        isUntrained(player.primaryPosition, key) && stored[key] === untrainedValue(player, key),
    )
  );
}

/** Drop derivable goalkeeping (see `isDerivableKeeping`); returns whether it was dropped. */
export function compactKeeping(
  player: Pick<Player, 'id' | 'primaryPosition' | 'keeperAttributes'>,
): boolean {
  if (!isDerivableKeeping(player)) return false;
  delete player.keeperAttributes;
  return true;
}
