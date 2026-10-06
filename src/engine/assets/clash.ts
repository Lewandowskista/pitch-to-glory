import type { Club, Hex, Kit } from '../../model/domain';
import { CONFIG } from '../config';

/**
 * Colour-blind-safe kit clash detection (AGENTS.md §9.9). Two shirt colours are compared as
 * they appear with typical vision and with protanopia, deuteranopia and tritanopia
 * (Machado, Oliveira and Fernandes 2009, full severity), in CIELAB. The smallest of the four
 * differences decides: two kits are only distinct if they are distinct for everyone.
 */
export type Vision = 'typical' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export const VISIONS: readonly Vision[] = ['typical', 'protanopia', 'deuteranopia', 'tritanopia'];

type Matrix = readonly [number, number, number, number, number, number, number, number, number];
const SIMULATION: Record<Exclude<Vision, 'typical'>, Matrix> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
};

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
function linearRgb(color: Hex): [number, number, number] {
  return [1, 3, 5].map((index) => toLinear(parseInt(color.slice(index, index + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
}
const clamp = (value: number) => Math.min(1, Math.max(0, value));
function simulate(rgb: [number, number, number], vision: Vision): [number, number, number] {
  if (vision === 'typical') return rgb;
  const m = SIMULATION[vision];
  const [r, g, b] = rgb;
  return [
    clamp(m[0] * r + m[1] * g + m[2] * b),
    clamp(m[3] * r + m[4] * g + m[5] * b),
    clamp(m[6] * r + m[7] * g + m[8] * b),
  ];
}
function lab([r, g, b]: [number, number, number]): [number, number, number] {
  // Linear sRGB to XYZ (D65), then to CIELAB.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two colours as seen with one kind of vision. */
export function colourDifference(a: Hex, b: Hex, vision: Vision = 'typical'): number {
  const [l1, a1, b1] = lab(simulate(linearRgb(a), vision));
  const [l2, a2, b2] = lab(simulate(linearRgb(b), vision));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** The smallest difference across typical vision and the three colour-vision deficiencies. */
export function safeDifference(a: Hex, b: Hex): { difference: number; vision: Vision } {
  let worst = { difference: Infinity, vision: 'typical' as Vision };
  for (const vision of VISIONS) {
    const difference = colourDifference(a, b, vision);
    if (difference < worst.difference) worst = { difference, vision };
  }
  return worst;
}

/** Whether two shirts are too alike for some viewers. The shirt's main colour is compared. */
export const kitsClash = (a: Kit, b: Kit) =>
  safeDifference(a.colors[0], b.colors[0]).difference < CONFIG.accessibility.kitClash;

export type KitChoice = 'home' | 'away' | 'third';
export interface MatchKits {
  home: Kit;
  away: Kit;
  awayChoice: KitChoice;
  /** No away kit is safe for every viewer, so the pitch adds a marker to away players. */
  clash: boolean;
}

/**
 * Kits for a match: the home side wears its home kit; the away side wears the first of its
 * away, third and home kits that is distinct from it for every viewer, or else the most
 * distinct one, with `clash` set.
 */
export function chooseMatchKits(home: Pick<Club, 'kits'>, away: Pick<Club, 'kits'>): MatchKits {
  const order: KitChoice[] = ['away', 'third', 'home'];
  const base = home.kits.home;
  const safe = order.find((choice) => !kitsClash(base, away.kits[choice]));
  if (safe) return { home: base, away: away.kits[safe], awayChoice: safe, clash: false };
  const best = [...order].sort(
    (a, b) =>
      safeDifference(base.colors[0], away.kits[b].colors[0]).difference -
      safeDifference(base.colors[0], away.kits[a].colors[0]).difference,
  )[0]!;
  return { home: base, away: away.kits[best], awayChoice: best, clash: true };
}
