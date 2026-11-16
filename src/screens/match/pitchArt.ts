import type { Hex } from '../../model/domain';
import { contrastRatio } from '../../engine/assets/shared';

/** The pitch's colours, shared by the clips, their stills and the report's maps. */
export const pitchArt = {
  /** The flat redesign pitch: mowing stripes, white lines at 78%, gold for your player. */
  grass: '#2f7a4f',
  stripes: ['#2f7a4f', '#2a7148'],
  line: '#ffffff',
  lineAlpha: 0.78,
  gold: '#efcf63',
  /** The fading dashed line of the last pass. */
  trail: '#fff7e4',
  night: '#14251e',
} as const;

/** Dark digits on pale kits, white on darker kits, without a fuzzy text outline. */
export function kitNumberColor(hex: Hex): Hex {
  return contrastRatio('#102c26', hex) > contrastRatio('#ffffff', hex) ? '#102c26' : '#ffffff';
}

/** Squad numbers by player id, for the tokens of both line-ups. */
export function shirtNumbers(
  players: Readonly<Record<string, { squadNumber?: number }>>,
): Record<string, number> {
  const numbers: Record<string, number> = {};
  for (const [id, player] of Object.entries(players))
    if (typeof player.squadNumber === 'number') numbers[id] = player.squadNumber;
  return numbers;
}
/** A token's shirt number: the player's squad number, else his formation slot (1–11). */
export const shirtNumber = (
  numbers: Readonly<Record<string, number>> | undefined,
  id: string,
  index: number,
): number => numbers?.[id] ?? (index % 11) + 1;
