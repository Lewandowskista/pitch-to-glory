import type { Hex } from '../../model/domain';
import { colors } from './shared';

/**
 * Outlined lettering for generated art (sponsor names, founding-year ribbons). Art is shown as
 * image data URIs, where page fonts such as Bebas Neue are not available, so letters are drawn
 * as stroked centrelines: a condensed, uppercase, square-ended alphabet in the spirit of Bebas.
 * Each glyph lives on a grid 10 units tall; the number is its centreline width.
 */
const O = 'M1.4 0H2.6Q4 0 4 1.4V8.6Q4 10 2.6 10H1.4Q0 10 0 8.6V1.4Q0 0 1.4 0Z';
export const GLYPHS: Readonly<Record<string, readonly [number, string]>> = {
  A: [4, 'M0 10L1.5 0H2.5L4 10M0.7 6.6H3.3'],
  B: [4, 'M0 10V0H2.6Q3.8 0 3.8 1.2V3.6Q3.8 4.8 2.6 4.8H0M2.6 4.8Q4 4.8 4 6.2V8.6Q4 10 2.6 10H0'],
  C: [4, 'M4 3.2V1.4Q4 0 2.6 0H1.4Q0 0 0 1.4V8.6Q0 10 1.4 10H2.6Q4 10 4 8.6V6.8'],
  D: [4, 'M0 10V0H2.6Q4 0 4 1.4V8.6Q4 10 2.6 10Z'],
  E: [3.6, 'M3.6 0H0V10H3.6M0 4.8H3'],
  F: [3.6, 'M3.6 0H0V10M0 4.8H3'],
  G: [4, 'M4 2.8V1.4Q4 0 2.6 0H1.4Q0 0 0 1.4V8.6Q0 10 1.4 10H2.6Q4 10 4 8.6V5.6H2.2'],
  H: [4, 'M0 0V10M4 0V10M0 4.8H4'],
  I: [0, 'M0 0V10'],
  J: [3.4, 'M3.4 0V8.6Q3.4 10 2 10H1.4Q0 10 0 8.6V7.6'],
  K: [4, 'M0 0V10M4 0L0.4 6.2M1.6 4.4L4 10'],
  L: [3.6, 'M0 0V10H3.6'],
  M: [5, 'M0 10V0L2.5 7.5L5 0V10'],
  N: [4, 'M0 10V0L4 10V0'],
  O: [4, O],
  P: [4, 'M0 10V0H2.6Q4 0 4 1.4V4.2Q4 5.6 2.6 5.6H0'],
  Q: [4, `${O}M2.4 8L3.8 10.4`],
  R: [4, 'M0 10V0H2.6Q4 0 4 1.4V3.8Q4 5.2 2.6 5.2H0M2.4 5.2L4 10'],
  S: [
    4,
    'M3.9 2.8V1.4Q3.9 0 2.5 0H1.5Q0.1 0 0.1 1.4V2.9Q0.1 4 1.1 4.5L2.9 5.5Q3.9 6 3.9 7.1V8.6Q3.9 10 2.5 10H1.5Q0.1 10 0.1 8.6V7.2',
  ],
  T: [4, 'M0 0H4M2 0V10'],
  U: [4, 'M0 0V8.6Q0 10 1.4 10H2.6Q4 10 4 8.6V0'],
  V: [4, 'M0 0L1.5 10H2.5L4 0'],
  W: [5.4, 'M0 0L1.1 10L2.7 2.6L4.3 10L5.4 0'],
  X: [4, 'M0.1 0L3.9 10M3.9 0L0.1 10'],
  Y: [4, 'M0 0L2 5.4L4 0M2 5.4V10'],
  Z: [4, 'M0.2 0H4L0 10H3.8'],
  '0': [3.8, 'M1.4 0H2.4Q3.8 0 3.8 1.4V8.6Q3.8 10 2.4 10H1.4Q0 10 0 8.6V1.4Q0 0 1.4 0Z'],
  '1': [2.4, 'M0 1.6L2.4 0V10'],
  '2': [4, 'M0.1 2.8V1.4Q0.1 0 1.5 0H2.5Q3.9 0 3.9 1.4V3.4Q3.9 4.3 3.3 5.1L0 10H4'],
  '3': [
    4,
    'M0.1 2.6V1.4Q0.1 0 1.5 0H2.5Q3.9 0 3.9 1.4V3.4Q3.9 4.8 2.5 4.8H1.4M2.5 4.8Q4 4.8 4 6.2V8.6Q4 10 2.6 10H1.4Q0 10 0 8.6V7.4',
  ],
  '4': [4, 'M3 10V0L0 7.2H4'],
  '5': [4, 'M3.8 0H0.4L0.2 4.8Q0.8 4.2 1.8 4.2H2.6Q4 4.2 4 5.6V8.6Q4 10 2.6 10H1.4Q0 10 0 8.6V7.6'],
  '6': [4, 'M3.8 2V1.4Q3.8 0 2.4 0H1.4Q0 0 0 1.4V8.6Q0 10 1.4 10H2.6Q4 10 4 8.6V6Q4 4.6 2.6 4.6H0'],
  '7': [4, 'M0 0H4L1.4 10'],
  '8': [
    4,
    'M1.6 4.8H2.4Q3.8 4.8 3.8 3.4V1.4Q3.8 0 2.4 0H1.6Q0.2 0 0.2 1.4V3.4Q0.2 4.8 1.6 4.8ZM1.6 4.8H1.4Q0 4.8 0 6.2V8.6Q0 10 1.4 10H2.6Q4 10 4 8.6V6.2Q4 4.8 2.6 4.8H2.4',
  ],
  '9': [4, 'M0.2 8V8.6Q0.2 10 1.6 10H2.6Q4 10 4 8.6V1.4Q4 0 2.6 0H1.4Q0 0 0 1.4V4Q0 5.4 1.4 5.4H4'],
  '.': [0, 'M0 9.4V10'],
  '&': [
    4.6,
    'M4.6 10L1 4.6Q0.3 3.5 0.6 1.6Q0.9 0 2.2 0Q3.6 0 3.6 1.6Q3.6 3 1.8 4.4L0.9 5.2Q0 6 0 7.6Q0 10 2 10Q3.4 10 4.4 7.2',
  ],
  ' ': [1.4, ''],
};
/** Stroke weight and letter gap, in glyph grid units. */
const WEIGHT = 1.8;
const GAP = 1.1;
/** A glyph's full height including the square stroke ends. */
const HEIGHT = 10 + WEIGHT;

/** The characters lettering can show: accents are dropped and unknown characters skipped. */
function letters(text: string): string[] {
  return [...text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()].filter(
    (char) => char in GLYPHS,
  );
}
function advance(char: string): number {
  return GLYPHS[char]![0] + WEIGHT + GAP;
}
/** Width of `text` set at cap height `size`. */
export function textWidth(text: string, size: number): number {
  const chars = letters(text);
  if (!chars.length) return 0;
  return ((chars.reduce((sum, char) => sum + advance(char), 0) - GAP) * size) / HEIGHT;
}

const round = (value: number) => String(Math.round(value * 100) / 100);
/** Moves and scales a glyph path made of absolute M, L, H, V, Q and Z commands. */
function place(path: string, x: number, y: number, scale: number): string {
  return path.replace(/([MLHVQZ])([^MLHVQZ]*)/g, (_, command: string, args: string) => {
    const numbers = args.trim()
      ? args
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
    const mapped = numbers.map((value, index) => {
      const isY = command === 'V' || (command !== 'H' && index % 2 === 1);
      return round(isY ? y + value * scale : x + value * scale);
    });
    return `${command}${mapped.join(' ')}`;
  });
}

export interface TextOptions {
  /** Anchor point: the baseline at `x`. */
  x: number;
  y: number;
  /** Cap height in user units. */
  size: number;
  anchor?: 'start' | 'middle' | 'end';
  fill: Hex;
}
/** `text` as one stroked SVG path in the condensed art lettering; empty when nothing to draw. */
export function textPath(
  text: string,
  { x, y, size, anchor = 'start', fill }: TextOptions,
): string {
  colors([fill, fill, fill]);
  if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(y))
    throw new RangeError('Invalid text placement');
  const chars = letters(text);
  const scale = size / HEIGHT;
  const width = textWidth(text, size);
  let pen = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const top = y - size + (WEIGHT / 2) * scale;
  let d = '';
  for (const char of chars) {
    const [, glyph] = GLYPHS[char]!;
    if (glyph) d += place(glyph, pen + (WEIGHT / 2) * scale, top, scale);
    pen += advance(char) * scale;
  }
  if (!d) return '';
  return `<path d="${d}" stroke="${fill}" stroke-width="${round(WEIGHT * scale)}" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="2.5" fill="none"/>`;
}
