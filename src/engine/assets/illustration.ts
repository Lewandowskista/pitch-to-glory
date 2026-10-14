import type { Hex } from '../../model/domain';
import { ART } from './shared';

/**
 * Shared pieces for the flat illustrations (trophies, flags, lifestyle, conditions,
 * celebrations, stadium). Every colour is a design token: the brand colours in `ART`, plus the
 * theme tokens these drawings also use (src/styles/tokens.css, light values unless noted).
 */
export const TONE = {
  ...ART,
  /** Shadow tone under gold: --meter-gold. */
  goldDeep: '#9a7612',
  /** The dark plate under trophies on the poster: dark --on-accent. */
  plate: '#14251e',
  /** Dark --accent: the mint highlight on field green. */
  mint: '#9ed9b7',
  heroMuted: '#e4edd7',
  accentSoft: '#e0ebe2',
  surfaceSoft: '#edf1e9',
  line: '#d5dfd5',
  muted: '#56675d',
  info: '#2d6f8f',
  /** Dark --info: a pale sky blue. */
  infoPale: '#9cc9de',
  dangerSoft: '#fff0ef',
  artGreen: '#e4eddd',
  artGold: '#f4ead4',
} as const satisfies Record<string, Hex>;

/** One flat shape: a path and its fill (`none` for strokes) with an optional stroke. */
export type Shape = readonly [d: string, fill: string, stroke?: string, width?: number];

export function shapes(list: readonly Shape[], rule = ''): string {
  return list
    .map(([d, fill, stroke, width]) => {
      const line = stroke
        ? ` stroke="${stroke}" stroke-width="${width ?? 1}" stroke-linecap="round" stroke-linejoin="round"`
        : '';
      return `<path d="${d}" fill="${fill}"${rule}${line}/>`;
    })
    .join('');
}

let renders = 0;
/** A resource id that is unique for every render, so composed SVGs never share one. */
export function uid(prefix: string): string {
  renders = (renders + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${renders.toString(36)}`;
}

/** The colour mixed towards black (amount > 0) or white (amount < 0): its shadow or light tone. */
export function shade(color: Hex, amount: number): Hex {
  const target = amount > 0 ? 0 : 255;
  const share = Math.min(1, Math.abs(amount));
  return `#${[1, 3, 5]
    .map((index) => {
      const channel = parseInt(color.slice(index, index + 2), 16);
      return Math.round(channel + (target - channel) * share)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}` as Hex;
}

export function isHex(color: string): color is Hex {
  return /^#[0-9a-f]{6}$/i.test(color);
}
