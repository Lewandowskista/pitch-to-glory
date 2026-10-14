import type { ClubKits, Crest, Kit, KitPattern } from '../../model/domain';
import type { Rng } from '../rng';
import { crestMarkup } from './crest';
import { textPath, textWidth } from './glyphs';
import { colors, item, mix, PALETTES, svg, withContrast } from './shared';
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
/** The four collar styles; a kit's collar value picks the style (0–3) and its treatment. */
export const COLLAR_STYLES = ['crew', 'v-neck', 'polo', 'grandad'] as const;
const COLLARS: Record<(typeof COLLAR_STYLES)[number], { band: string; placket?: string }> = {
  crew: { band: 'M48 23Q80 39 112 23L117 26.5Q80 47 43 26.5Z' },
  'v-neck': { band: 'M48 23L80 49L112 23L118 26.5L80 59L42 26.5Z' },
  polo: {
    band: 'M45 22Q80 40 115 22L120 31L98 45L80 38L62 45L40 31Z',
    placket: 'M76.5 38H83.5V63H76.5Z',
  },
  grandad: {
    band: 'M48 21Q80 37 112 21L112 28Q80 44 48 28Z',
    placket: 'M77 35H83V58H77Z',
  },
};

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

/** A cuff band at the end of the left sleeve, `depth` units up the sleeve. */
function cuff(depth: number, from = 0): string {
  // The sleeve runs from the shoulder (27 31) to the cuff edge (7 68)–(29 81).
  const [ux, uy] = [0.475, -0.88];
  const at = (x: number, y: number, d: number) =>
    `${(x + ux * d).toFixed(1)} ${(y + uy * d).toFixed(1)}`;
  return `M${at(7, 68, from)}L${at(29, 81, from)}L${at(29, 81, depth)}L${at(7, 68, depth)}Z`;
}
const mirror = 'transform="matrix(-1 0 0 1 160 0)"';

export interface KitOptions {
  /** The club crest worn as the chest badge; a plain shield otherwise. */
  crest?: Crest;
  /** The shirt sponsor's name, lettered on the sponsor block. */
  sponsorName?: string;
}
export function renderKit(kit: Kit, options: KitOptions = {}): string {
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
  const style = item(COLLAR_STYLES, item([0, 1, 2, 3, 4, 5, 6, 7], kit.collar) % 4);
  const trim = item([0, 1, 2, 3, 4, 5, 6, 7], kit.trim);
  const sponsor = item([0, 1, 2, 3, 4, 5, 6, 7], kit.sponsor);
  const shadow = mix(base, '#0b1410', 0.6);

  // Collar: the style, solid (0–3) or tipped with a contrasting edge (4–7).
  const collar = COLLARS[style];
  const tipped = kit.collar >= 4;
  const collarInk = tipped ? light : accent;
  const tip = tipped ? accent : light;
  const neck = `<path d="M50 23Q80 13 110 23Q80 37 50 23Z" fill="${shadow}"/>${style === 'v-neck' ? `<path d="M48 23Q80 39 112 23L80 50Z" fill="${shadow}"/>` : ''}`;
  const collarLayer = `<g fill="${collarInk}" stroke="${tip}" stroke-width="${tipped ? 1.6 : 0}" stroke-linejoin="round"><path d="${collar.band}"/>${collar.placket ? `<path d="${collar.placket}"/>` : ''}</g>${collar.placket ? `<g fill="${withContrast(tip, collarInk, 2)}"><circle cx="80" cy="${style === 'polo' ? 47 : 42}" r="1.4"/><circle cx="80" cy="${style === 'polo' ? 55 : 50}" r="1.4"/></g>` : ''}`;

  // Cuffs: colour (bit 0), depth (bit 1) and a tipped line with shoulder piping (bit 2).
  const cuffInk = trim & 1 ? light : accent;
  const cuffOther = trim & 1 ? accent : light;
  const depth = trim & 2 ? 8 : 4.5;
  const cuffs = `<g fill="${cuffInk}"><path d="${cuff(depth)}"/><path d="${cuff(depth)}" ${mirror}/></g>${
    trim & 4
      ? `<g fill="${cuffOther}"><path d="${cuff(depth + 1.6, depth)}"/><path d="${cuff(depth + 1.6, depth)}" ${mirror}/></g><path d="M27 35L14 59M133 35L146 59" stroke="${cuffOther}" stroke-width="2.5"/>`
      : ''
  }`;

  // Chest: maker mark, club badge and sponsor.
  const maker = `<path d="M50 61L56 57L61 60L55 64Z" fill="${withContrast(light, base, 2.2)}"/>`;
  const badge = options.crest
    ? `<g transform="translate(97.5 54) scale(.11)">${crestMarkup(options.crest, 'kit-badge')}</g>`
    : `<path d="M100 58L110 58V68L105 73L100 68Z" fill="${light}"/><path d="M103 61H107V67L105 69L103 67Z" fill="${base}"/>`;
  const name = options.sponsorName?.trim() ?? '';
  const block = sponsor % 2 ? accent : light;
  const outlined = sponsor % 4 === 3;
  const blockFill = outlined ? base : withContrast(block, base, 1.6);
  const ink = outlined ? withContrast(light, base, 4.5) : withContrast(base, blockFill, 4.5);
  let lettering = '';
  let width = 52 + sponsor;
  if (name) {
    let size = 9;
    while (size > 5 && textWidth(name, size) > 62) size -= 0.5;
    width = Math.max(30, textWidth(name, size) + 12);
    lettering = textPath(name, { x: 80, y: 96 + size / 2, size, anchor: 'middle', fill: ink });
  } else {
    lettering = `<path d="M66 93L72 99L80 93L88 99L94 93" stroke="${ink}" stroke-width="2" fill="none"/>`;
  }
  const radius = [1, 3, 8, 2][sponsor % 4]!;
  const sponsorLayer = `<rect x="${(80 - width / 2).toFixed(1)}" y="88" width="${width.toFixed(1)}" height="16" rx="${radius}" fill="${blockFill}"${outlined ? ` stroke="${ink}" stroke-width="1.5"` : ''}/>${lettering}`;

  return svg(
    `<defs><clipPath id="kit-body"><path d="${SHIRT}"/></clipPath></defs><path d="${SHIRT}" fill="${shadow}" transform="translate(0 3)"/><path d="${SHIRT}" fill="${base}"/><g clip-path="url(#kit-body)">${patterns[kit.pattern]}<path d="M40 62V150H51Q46 110 50 62ZM27 31L7 68L13 71.5L31 34Z" fill="#000000" opacity=".12"/><path d="M120 62V150H111Q115 110 112 62Z" fill="#ffffff" opacity=".1"/><path d="M47 141H113" stroke="#ffffff" stroke-opacity=".25" stroke-dasharray="2 3" stroke-width="1"/>${cuffs}</g>${neck}${collarLayer}${maker}${badge}${sponsorLayer}<path d="${SHIRT}" stroke="#182a35" stroke-opacity=".22" stroke-width="2" stroke-linejoin="round"/>`,
    '0 0 160 165',
  );
}
