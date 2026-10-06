import type { ClubKits, Kit, KitPattern } from '../../model/domain';
import type { Rng } from '../rng';
import { colors, item, PALETTES, svg } from './shared';
export const KIT_PATTERNS: readonly KitPattern[] = [
  'solid',
  'stripes',
  'hoops',
  'halves',
  'sash',
  'chevron',
  'pinstripe',
  'gradient',
];
const SHIRT =
  'M48 23L27 31L7 68L29 81L40 62V143Q80 152 120 143V62L131 81L153 68L133 31L112 23Q80 39 48 23Z';
const COLLARS = [
  '<path d="M52 24Q80 53 108 24" fill="none"/>',
  '<path d="M51 25L80 52L109 25L99 24L80 41L61 24Z"/>',
  '<path d="M52 24L63 46L80 35L97 46L108 24L95 21L80 33L65 21Z"/>',
  '<path d="M55 22V34Q80 54 105 34V22L94 25Q80 37 66 25Z"/>',
  '<path d="M50 24Q80 56 110 24M57 23Q80 47 103 23" fill="none"/>',
  '<path d="M58 22Q80 45 102 22L97 37H83V54H77V37H63Z"/>',
  '<path d="M51 24L71 40H89L109 24L97 23L87 33H73L63 23Z"/>',
  '<path d="M51 24Q80 53 109 24M80 37V55" fill="none"/>',
];
export function generateKits(rng: Rng, palette = rng.pick(PALETTES)): ClubKits {
  const make = (p: Kit['colors']): Kit => ({
    pattern: rng.pick(KIT_PATTERNS),
    colors: p,
    collar: rng.int(0, 7),
    trim: rng.int(0, 7),
    sponsor: rng.int(0, 7),
  });
  const [a, b, c] = palette;
  return { home: make([a, b, c]), away: make([c, a, b]), third: make([b, c, a]) };
}
export function renderKit(kit: Kit): string {
  colors(kit.colors);
  const [base, accent, light] = kit.colors;
  const patterns: Record<KitPattern, string> = {
    solid: '',
    stripes: [45, 65, 85, 105]
      .map((x) => `<path d="M${x} 22V150" stroke="${accent}" stroke-width="10"/>`)
      .join(''),
    hoops: [49, 73, 97, 121]
      .map((y) => `<path d="M0 ${y}H160" stroke="${accent}" stroke-width="11"/>`)
      .join(''),
    halves: `<path d="M80 20H160V155H80Z" fill="${accent}"/>`,
    sash: `<path d="M34 7L131 149" stroke="${accent}" stroke-width="23"/>`,
    chevron: `<path d="M14 43L80 85L145 43" stroke="${accent}" stroke-width="17" fill="none"/>`,
    pinstripe: Array.from(
      { length: 11 },
      (_, i) => `<path d="M${25 + i * 11} 20V155" stroke="${accent}" stroke-width="2"/>`,
    ).join(''),
    // Discrete SVG strips form a deterministic flat gradient without a raster asset.
    gradient: Array.from(
      { length: 14 },
      (_, i) =>
        `<path d="M0 ${25 + i * 10}H160" stroke="${accent}" stroke-opacity="${(i / 14).toFixed(3)}" stroke-width="10"/>`,
    ).join(''),
  };
  if (!(kit.pattern in patterns)) throw new Error('Invalid kit pattern');
  item(COLLARS, kit.collar);
  item(
    Array.from({ length: 8 }, (_, i) => i),
    kit.trim,
  );
  item(
    Array.from({ length: 8 }, (_, i) => i),
    kit.sponsor,
  );
  const trim = kit.trim;
  const sponsor = `<g fill="${light}"><rect x="${52 - kit.sponsor}" y="89" width="${56 + kit.sponsor * 2}" height="14" rx="${kit.sponsor % 4}"/><path d="M58 109H102" stroke="${light}" stroke-width="2"/></g><path d="M66 93L72 99L80 93L88 99L94 93" stroke="${base}" stroke-width="2" fill="none"/>`;
  return svg(
    `<defs><clipPath id="shirt"><path d="${SHIRT}"/></clipPath></defs><path d="${SHIRT}" fill="${base}"/><g clip-path="url(#shirt)">${patterns[kit.pattern]}<path d="M8 67L30 79M130 79L152 67" stroke="${accent}" stroke-width="${5 + trim}"/><path d="M42 ${137 - trim}H118" stroke="${accent}" stroke-width="${2 + (trim % 3)}"/>${trim >= 4 ? `<path d="M27 35L14 59M133 35L146 59" stroke="${light}" stroke-width="3"/>` : ''}</g><g fill="${accent}" stroke="${accent}" stroke-width="4" stroke-linejoin="round">${item(COLLARS, kit.collar)}</g><path d="M100 58L110 58V68L105 73L100 68Z" fill="${light}"/><path d="M49 59H59" stroke="${light}" stroke-width="3"/>${sponsor}<path d="${SHIRT}" stroke="#182a35" stroke-opacity=".22" stroke-width="2" stroke-linejoin="round"/>`,
    '0 0 160 165',
  );
}
