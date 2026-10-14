import type { Counterpart, Hex } from '../../model/domain';
import { colors as checkColors, svg } from './shared';
import { TONE } from './illustration';

/**
 * National flags (redesign A8) on a 30 × 20 grid with a faint edge, for the six simulated
 * countries keyed by their real counterpart. Flag colours are the countries' own, not brand
 * tokens. Worlds created before real identities (fictional countries) and guest nations get a
 * simple two-colour flag in their national colours.
 */
export const FLAG_COUNTERPARTS: readonly Counterpart[] = [
  'England',
  'France',
  'Spain',
  'Germany',
  'Italy',
  'Portugal',
];

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

const FLAGS: Record<Counterpart, string> = {
  England:
    rect(0, 0, 30, 20, '#ffffff') +
    rect(12.5, 0, 5, 20, '#ce1124') +
    rect(0, 7.5, 30, 5, '#ce1124'),
  France:
    rect(0, 0, 10, 20, '#0055a4') + rect(10, 0, 10, 20, '#ffffff') + rect(20, 0, 10, 20, '#ef4135'),
  Spain:
    rect(0, 0, 30, 5, '#aa151b') + rect(0, 5, 30, 10, '#f1bf00') + rect(0, 15, 30, 5, '#aa151b'),
  Germany:
    rect(0, 0, 30, 6.7, '#000000') +
    rect(0, 6.7, 30, 6.6, '#dd0000') +
    rect(0, 13.3, 30, 6.7, '#ffce00'),
  Italy:
    rect(0, 0, 10, 20, '#009246') + rect(10, 0, 10, 20, '#ffffff') + rect(20, 0, 10, 20, '#ce2b37'),
  // The armillary sphere, simplified: a yellow ring around the red and white shield.
  Portugal:
    rect(0, 0, 12, 20, '#006600') +
    rect(12, 0, 18, 20, '#ff0000') +
    '<circle cx="12" cy="10" r="4.4" fill="#ffcc00"/><circle cx="12" cy="10" r="3" fill="#ff0000" stroke="#ffcc00" stroke-width=".6"/><path d="M10.6 8.4H13.4V10.8Q13.4 12.4 12 12.9Q10.6 12.4 10.6 10.8Z" fill="#ffffff"/>',
};

/** Two-colour fallbacks: horizontal and vertical halves, a Nordic cross, a diagonal, a band. */
const FALLBACKS: readonly ((a: Hex, b: Hex) => string)[] = [
  (a, b) => rect(0, 0, 30, 10, a) + rect(0, 10, 30, 10, b),
  (a, b) => rect(0, 0, 15, 20, a) + rect(15, 0, 15, 20, b),
  (a, b) => rect(0, 0, 30, 20, a) + rect(8, 0, 5, 20, b) + rect(0, 7.5, 30, 5, b),
  (a, b) => rect(0, 0, 30, 20, a) + `<path d="M0 20L30 0V20Z" fill="${b}"/>`,
  (a, b) => rect(0, 0, 30, 20, a) + rect(0, 6.5, 30, 7, b),
];

export interface FlagFallback {
  colors: readonly [Hex, Hex];
  /** Which two-colour pattern; by default derived from the colours. */
  pattern?: number;
}

/**
 * A flag as SVG: the real flag for a counterpart, otherwise a two-colour flag from
 * `fallback` (or a neutral field-green one when there is nothing to go on).
 */
export function renderFlag(
  counterpart: Counterpart | null | undefined,
  fallback?: FlagFallback,
): string {
  let body = counterpart ? FLAGS[counterpart] : undefined;
  if (!body) {
    const [a, b] = fallback?.colors ?? [TONE.field, TONE.heroInk];
    checkColors([a, b, b]);
    const pattern =
      fallback?.pattern ?? [...`${a}${b}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    body = FALLBACKS[Math.abs(Math.trunc(pattern)) % FALLBACKS.length]!(a, b);
  }
  return svg(
    `${body}<rect x=".5" y=".5" width="29" height="19" rx="2" fill="none" stroke="${TONE.ink}" stroke-opacity=".18"/>`,
    '0 0 30 20',
  );
}

/** The counterpart a country name stands for, when it is one of the six real countries. */
export function counterpartOf(name: string): Counterpart | null {
  return FLAG_COUNTERPARTS.find((counterpart) => counterpart === name) ?? null;
}
