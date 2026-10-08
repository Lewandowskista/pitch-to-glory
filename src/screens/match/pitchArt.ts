import type { Hex, Point } from '../../model/domain';
import { contrastRatio } from '../../engine/assets/shared';

/** Shared geometry for the GPU scene and its vector fallback. */
export const pitchArt = {
  radius: 1.95,
  numberSize: 1.85,
  ballRadius: 0.8,
  grass: '#153f30',
  stripes: ['#327653', '#2c6b4b'],
  line: '#e0eed7',
  gold: '#ffda70',
} as const;

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

/** Keep digits at least about 8 CSS pixels on phone-sized full-pitch views. */
export const pitchAssetScale = (sceneScale: number) =>
  Math.max(1, Math.min(1.7, 8 / (pitchArt.numberSize * Math.max(sceneScale, 0.001))));
