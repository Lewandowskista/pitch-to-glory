import type { Hex, Point } from '../../model/domain';
import { contrastRatio } from '../../engine/assets/shared';

/** Shared geometry for the GPU scene and its vector fallback. */
export const pitchArt = {
  radius: 1.95,
  numberSize: 1.85,
  ballRadius: 0.8,
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
/** Dark mowing bands, in drawing units, across the whole 116 × 80 drawing. */
export const pitchBands: readonly number[] = Array.from({ length: 6 }, (_, i) => -2 + i * 20);

export const pitchPoint = (point: Point, overrun = 0): Point => ({
  x: 8 + Math.max(-overrun, Math.min(100 + overrun, point.x)),
  y: 8 + Math.max(0, Math.min(100, point.y)) * 0.64,
});

/** Dark digits on pale kits, white on darker kits, without a fuzzy text outline. */
export function kitNumberColor(hex: Hex): Hex {
  return contrastRatio('#102c26', hex) > contrastRatio('#ffffff', hex) ? '#102c26' : '#ffffff';
}

/** The ball is beside the token's feet, so it never covers the shirt number. */
export function ballAtFeet(point: Point, angle: number, scale = 1): Point {
  return {
    x: point.x + Math.cos(angle) * 2.95 * scale,
    y: point.y + Math.sin(angle) * 2.95 * scale,
  };
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

/** Keep digits at least about 8 CSS pixels on phone-sized full-pitch views. */
export const pitchAssetScale = (sceneScale: number) =>
  Math.max(1, Math.min(1.7, 8 / (pitchArt.numberSize * Math.max(sceneScale, 0.001))));
