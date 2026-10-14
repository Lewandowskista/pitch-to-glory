import type { Club, ClubIdentity, Crest, Hex } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { textPath } from './glyphs';
import { colors, contrastRatio, item, mix, PALETTES, svg, withContrast } from './shared';

/**
 * Badge silhouettes in a 160×180 box. Saved worlds and edit packs store the index, so entries
 * may be redrawn in place or appended, never reordered or removed.
 */
export const CREST_SHAPES = [
  'M22 14H138V86Q138 135 80 169Q22 135 22 86Z',
  'M80 10A72 72 0 1 1 79.9 154A72 72 0 1 1 80 10Z',
  'M80 9L140 42V117L80 169L20 117V42Z',
  'M20 16H140V128L112 144L80 168L48 144L20 128Z',
  'M80 8L147 82L80 169L13 82Z',
  'M32 12H128L141 40V113L80 167L19 113V40Z',
  'M80 9L139 34L132 111Q124 150 80 169Q36 150 28 111L21 34Z',
  'M28 13H132V106L80 165L28 106Z',
  'M80 10C127 10 143 38 143 83C143 126 116 159 80 167C44 159 17 126 17 83C17 38 33 10 80 10Z',
  'M80 8L110 26L140 24L136 87L145 116L80 167L15 116L24 87L20 24L50 26Z',
  'M19 18Q80 0 141 18L132 110Q119 148 80 168Q41 148 28 110Z',
  'M80 9L132 29L147 78L130 130L80 158L30 130L13 78L28 29Z',
  'M22 15H138V112Q138 163 80 163Q22 163 22 112Z',
  'M80 8L135 25V139L110 128L80 163L50 128L25 139V25Z',
  'M80 9L98 24L121 18L129 41L147 53L140 80L148 106L126 123L116 147L91 150L80 170L69 150L44 147L34 123L12 106L20 80L13 53L31 41L39 18L62 24Z',
] as const;
/** Per shape: the visual centre the rim and field scale around, and the emblem scale. */
const SHAPE_LAYOUT: readonly (readonly [cy: number, scale: number])[] = [
  [86, 0.72],
  [82, 0.7],
  [89, 0.72],
  [88, 0.74],
  [86, 0.54],
  [88, 0.72],
  [88, 0.7],
  [80, 0.64],
  [87, 0.74],
  [90, 0.66],
  [86, 0.72],
  [84, 0.72],
  [88, 0.74],
  [78, 0.68],
  [89, 0.6],
];

const f = (value: number) => value.toFixed(1);
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
const polar = (cx: number, cy: number, r: number, angle: number) =>
  `${f(cx + Math.cos(angle) * r)} ${f(cy + Math.sin(angle) * r)}`;
/** A star-like ring of points alternating between two radii. */
function burst(cx: number, cy: number, outer: number, inner: number, points: number): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${polar(cx, cy, i % 2 ? inner : outer, angle)}`;
  }
  return `${d}Z`;
}
const wave = (y: number) =>
  `M8 ${y}Q20 ${y - 10} 32 ${y}T56 ${y}T80 ${y}T92 ${y}V${y + 10}Q80 ${y} 68 ${y + 10}T44 ${y + 10}T20 ${y + 10}T8 ${y + 10}Z`;
function sun(): string {
  let d = circle(50, 50, 20);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    d += `M${polar(50, 50, 26, angle - 0.12)}L${polar(50, 50, 44, angle)}L${polar(50, 50, 26, angle + 0.12)}Z`;
  }
  return d;
}
/** One branch of a laurel: a curved stem with leaves pointing up and out. */
function laurel(): string {
  const [cx, cy] = [50, 52];
  const rad = Math.PI / 180;
  let d = `M${polar(cx, cy, 36, 100 * rad)}A36 36 0 0 1 ${polar(cx, cy, 36, 252 * rad)}L${polar(cx, cy, 32, 252 * rad)}A32 32 0 0 0 ${polar(cx, cy, 32, 100 * rad)}Z`;
  for (let i = 0; i < 6; i++) {
    const a = (108 + i * 27) * rad;
    for (const [tilt, length, width] of [
      [0.75, 16, 6],
      [-0.6, 11, 4.5],
    ] as const) {
      const [bx, by] = [cx + Math.cos(a) * 34, cy + Math.sin(a) * 34];
      // Up the stem (increasing angle), turned outwards or inwards.
      const [tx, ty] = [-Math.sin(a), Math.cos(a)];
      const [nx, ny] = [Math.cos(a), Math.sin(a)];
      const [dx, dy] = [tx + nx * tilt, ty + ny * tilt];
      const norm = Math.hypot(dx, dy);
      const [ux, uy] = [dx / norm, dy / norm];
      const [ex, ey] = [bx + ux * length, by + uy * length];
      const [mx, my] = [(bx + ex) / 2, (by + ey) / 2];
      d += `M${f(bx)} ${f(by)}Q${f(mx - uy * width)} ${f(my + ux * width)} ${f(ex)} ${f(ey)}Q${f(mx + uy * width)} ${f(my - ux * width)} ${f(bx)} ${f(by)}Z`;
    }
  }
  return d;
}
function wheel(): { ring: string; spokes: string } {
  const ring = `${circle(50, 50, 36)}${circle(50, 50, 28)}`;
  let spokes = circle(50, 50, 10);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const [ux, uy, vx, vy] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    const at = (r: number, w: number) => `${f(50 + ux * r + vx * w)} ${f(50 + uy * r + vy * w)}`;
    spokes += `M${at(8, -2.6)}L${at(44, -2.6)}L${at(44, 2.6)}L${at(8, 2.6)}Z`;
    spokes += circle(Number(f(50 + ux * 45)), Number(f(50 + uy * 45)), 4.5);
  }
  return { ring, spokes };
}
const symbol = (main: string, cut = '', over = '') =>
  `<path d="${main}"/>${cut ? `<path d="${cut}" fill="currentColor"/>` : ''}${over ? `<path d="${over}"/>` : ''}`;
const spokes = wheel();

/**
 * Emblems in a 100×100 box, filled in the emblem colour; `currentColor` cut-outs show the
 * badge's base colour. Stored by index like the shapes: redraw in place or append only.
 */
export const CREST_SYMBOLS = [
  // 0 Lion
  symbol(
    burst(50, 52, 44, 34, 14),
    'M50 24Q69 24 70 45Q71 63 60 74L50 81L40 74Q29 63 30 45Q31 24 50 24Z',
    'M37 45H46V50H37ZM54 45H63V50H54ZM44 60H56L50 68Z',
  ),
  // 1 Eagle
  symbol(
    'M43 24a7 7 0 1 1 14 0a7 7 0 1 1 -14 0ZM56 21L64 25L56 29ZM45 30Q50 26 55 30L57 70L50 90L43 70ZM46 40L6 24L13 35L4 40L15 46L8 53L21 55L17 62L45 58ZM54 40L94 24L87 35L96 40L85 46L92 53L79 55L83 62L55 58Z',
    circle(51.5, 22, 1.8),
  ),
  // 2 Fox
  symbol(
    'M22 6L40 30H60L78 6L82 40Q88 52 76 60L56 88Q50 94 44 88L24 60Q12 52 18 40Z',
    'M28 16L36 29H31ZM72 16L64 29H69ZM35 46L46 50L42 55ZM65 46L54 50L58 55ZM45 78H55L50 84Z',
  ),
  // 3 Bear
  symbol(
    `${circle(30, 24, 12)}${circle(70, 24, 12)}M50 22Q81 22 82 52Q84 86 50 90Q16 86 18 52Q19 22 50 22Z`,
    `${circle(28, 21, 5)}${circle(72, 21, 5)}${circle(39, 50, 3.5)}${circle(61, 50, 3.5)}M43 64H57L50 72Z`,
  ),
  // 4 Bull
  symbol(
    'M8 20Q20 34 34 30L40 26H60L66 30Q80 34 92 20Q88 42 68 44L64 70Q60 88 50 90Q40 88 36 70L32 44Q12 42 8 20Z',
    `${circle(44.2, 74, 3.2)}${circle(55.8, 74, 3.2)}${circle(43, 50, 3)}${circle(57, 50, 3)}`,
  ),
  // 5 Stag
  symbol(
    'M38 44H62L60 70L50 90L40 70ZM40 46L26 38L36 54ZM60 46L74 38L64 54ZM44 44L36 30L24 26L28 21L37 25L33 9L38 8L43 23L47 16L50 19L47 30L49 44ZM56 44L64 30L76 26L72 21L63 25L67 9L62 8L57 23L53 16L50 19L53 30L51 44Z',
    `${circle(45.4, 56, 2.4)}${circle(54.6, 56, 2.4)}M46 80H54L50 86Z`,
  ),
  // 6 Owl
  symbol(
    'M22 16L36 28Q50 22 64 28L78 16L80 48Q82 82 50 92Q18 82 20 48Z',
    `${circle(39, 45, 10)}${circle(61, 45, 10)}M46 58H54L50 66Z`,
    `${circle(40, 46, 4)}${circle(60, 46, 4)}`,
  ),
  // 7 Horse
  symbol(
    'M58 8L66 22Q86 34 88 62L74 68L66 56Q58 62 56 74L54 94H26Q24 66 34 48Q38 28 50 20Z',
    `${circle(65, 34, 3)}M40 30L46 24L44 40Z`,
  ),
  // 8 Fish
  symbol(
    'M8 50Q30 22 62 34L84 18L80 50L84 82L62 66Q30 78 8 50Z',
    `${circle(25.5, 46, 3.5)}M44 38Q50 50 44 62Q48 50 44 38Z`,
  ),
  // 9 Star
  symbol('M50 8L61 37L92 38L68 57L76 88L50 70L24 88L32 57L8 38L39 37Z'),
  // 10 Tower
  symbol(
    'M22 90V40H30V26H40V36H46V26H54V36H60V26H70V40H78V90Z',
    'M42 90V72Q50 62 58 72V90ZM36 48H42V58H36ZM58 48H64V58H58Z',
  ),
  // 11 Waves
  symbol(`${wave(28)}${wave(48)}${wave(68)}`),
  // 12 Crossed swords
  symbol(
    'M16 12L27 10L76 70L84 68L89 77L81 82L83 91L74 89L70 81L72 76L22 21ZM84 12L73 10L24 70L16 68L11 77L19 82L17 91L26 89L30 81L28 76L78 21Z',
  ),
  // 13 Anchor
  symbol(
    'M43 14a7 7 0 1 1 14 0a7 7 0 1 1 -14 0ZM46 20H54V28H66V36H54V80Q70 78 76 64L68 62L84 48L88 70L82 67Q72 90 50 92Q28 90 18 67L12 70L16 48L32 62L24 64Q30 78 46 80V36H34V28H46Z',
    circle(50, 14, 2.5),
  ),
  // 14 Sun
  symbol(sun(), `${circle(42.5, 46, 2.5)}${circle(57.5, 46, 2.5)}M42 56Q50 63 58 56Q50 60 42 56Z`),
  // 15 Mountains
  symbol(
    'M2 86L34 28L48 50L64 16L98 86Z',
    'M57 30L64 16L71 30L67 28L64 32L61 28ZM28 40L34 28L40 38L36 37L33 40Z',
  ),
  // 16 Pine tree
  symbol('M50 4L76 40H63L84 68H58V94H42V68H16L37 40H24Z'),
  // 17 Laurel wreath
  `<path d="${laurel()}"/><path d="${laurel()}" transform="matrix(-1 0 0 1 100 0)"/>`,
  // 18 Lightning bolt
  symbol('M58 4L20 56H46L36 96L80 38H55L68 4Z'),
  // 19 Crown
  symbol(
    'M14 72L8 28L31 48L50 16L69 48L92 28L86 72ZM14 78H86V90H14Z',
    `${circle(50, 60, 4)}${circle(29, 62, 3)}${circle(71, 62, 3)}`,
  ),
  // 20 Bridge
  symbol(
    'M4 42H96V52H88V90H74Q74 64 50 64Q26 64 26 90H12V52H4ZM16 20H26V42H16ZM74 20H84V42H74Z',
    'M30 46H36V52H30ZM47 46H53V52H47ZM64 46H70V52H64Z',
  ),
  // 21 Rose
  symbol(
    'M50 16Q72 16 74 38Q76 60 50 64Q24 60 26 38Q28 16 50 16ZM48 62H52V94H48ZM52 76Q66 64 76 72Q66 84 52 80ZM48 82Q34 70 24 78Q34 90 48 86Z',
    'M40 36Q50 24 62 36Q50 32 40 36ZM42 46Q52 56 62 44Q55 51 42 46Z',
  ),
  // 22 Ship's wheel
  `<path d="${spokes.ring}" fill-rule="evenodd"/><path d="${spokes.spokes}"/><path d="${circle(50, 50, 3.5)}" fill="currentColor"/>`,
  // 23 Football
  symbol(
    circle(50, 50, 40),
    'M50 36L63 45L58 60H42L37 45ZM50 12L58 18L50 24L42 18ZM80 40L86 48L80 56L74 48ZM20 40L26 48L20 56L14 48ZM32 78L40 74L44 82L36 86ZM68 78L60 74L56 82L64 86Z',
  ),
  // 24 Key
  symbol(
    `${circle(50, 26, 19)}M45 40H55V92H45ZM55 66H69V73H55ZM55 80H65V87H55Z`,
    circle(50, 26, 8),
  ),
  // 25 Flame
  symbol(
    'M50 6Q74 32 72 58Q71 90 50 94Q29 90 28 62Q28 46 41 33Q41 50 50 54Q45 30 50 6Z',
    'M50 60Q61 70 59 80Q57 90 50 90Q42 88 43 78Q44 69 50 60Z',
  ),
  // 26 Ship
  symbol(
    'M8 64H92L80 86H20ZM47 8H53V64H47ZM56 12Q84 34 56 60ZM44 18Q20 38 44 60Z',
    `${circle(26.5, 72, 2.5)}${circle(42.5, 72, 2.5)}${circle(58.5, 72, 2.5)}${circle(74.5, 72, 2.5)}`,
  ),
  // 27 Open book
  symbol(
    'M8 24Q30 14 48 24V86Q30 76 8 86ZM52 24Q70 14 92 24V86Q70 76 52 86Z',
    'M16 36Q28 30 40 36V41Q28 35 16 41ZM16 50Q28 44 40 50V55Q28 49 16 55ZM16 64Q28 58 40 64V69Q28 63 16 69ZM60 36Q72 30 84 36V41Q72 35 60 41ZM60 50Q72 44 84 50V55Q72 49 60 55ZM60 64Q72 58 84 64V69Q72 63 60 69Z',
  ),
  // 28 Gem
  symbol(
    'M28 16H72L92 40L50 92L8 40Z',
    'M14 37H86L83 42H17ZM39 42H45L50 80ZM55 42H61L50 80ZM38 19H44L36 37H30ZM56 19H62L70 37H64Z',
  ),
  // 29 Wing
  symbol(
    'M88 12Q50 16 24 40Q8 56 12 84Q22 72 34 72Q30 80 32 90Q44 78 58 76Q56 84 60 90Q70 72 76 58Q88 36 88 12Z',
    'M30 60Q48 46 72 38Q52 52 33 65ZM42 74Q60 60 72 50Q62 64 46 77Z',
  ),
  // 30 Bee
  symbol(
    `${circle(50, 28, 8.5)}M36 56a14 22 0 1 0 28 0a14 22 0 1 0 -28 0ZM36 46Q8 26 14 50Q20 62 38 56ZM64 46Q92 26 86 50Q80 62 62 56ZM46 22L40 10L43 8.5L49 21ZM54 22L60 10L57 8.5L51 21ZM46 76L50 88L54 76Z`,
    'M37 50H63V56H37ZM40 64H60V69H40Z',
  ),
  // 31 Trident
  symbol(
    'M24 22L30 10L36 22H33V36Q33 44 47 44V22H44L50 6L56 22H53V44Q67 44 67 36V22H64L70 10L76 22H73V38Q73 52 53 52V92H47V52Q27 52 27 38V22Z',
  ),
  // 32 Compass star
  symbol(
    'M50 4L58 42L96 50L58 58L50 96L42 58L4 50L42 42ZM24 24L50 42L76 24L58 50L76 76L50 58L24 76L42 50Z',
    circle(50, 50, 7),
  ),
] as const;

/**
 * Field divisions in the second club colour, clipped inside the badge. Each is drawn relative
 * to the shape's visual centre `cy`: none, per pale, fess, bend, chevron, quartered, chief and
 * pallets.
 */
export const CREST_DIVISIONS: readonly ((cy: number) => string)[] = [
  () => '',
  () => 'M80 0H160V180H80Z',
  (cy) => `M0 ${cy + 18}H160V${cy + 38}H0Z`,
  () => 'M-10 30L30 -10L170 130L130 170Z',
  (cy) => `M0 ${cy + 36}L80 ${cy - 12}L160 ${cy + 36}V${cy + 64}L80 ${cy + 16}L0 ${cy + 64}Z`,
  (cy) => `M80 0H160V${cy}H80ZM0 ${cy}H80V180H0Z`,
  (cy) => `M0 0H160V${cy - 42}H0Z`,
  () => 'M30 0H50V180H30ZM70 0H90V180H70ZM110 0H130V180H110Z',
];

export function generateCrest(rng: Rng): Crest {
  // Exactly three draws: any change here reshuffles every club's kits, manager and squad.
  return {
    shape: rng.int(0, CREST_SHAPES.length - 1),
    symbol: rng.int(0, CREST_SYMBOLS.length - 1),
    colors: [...rng.pick(PALETTES)],
  };
}

/**
 * The field division a crest shows: derived from the crest itself on a side stream (never the
 * world RNG), so it needs no stored field and changes along with "Draw a new crest". Plain
 * fields are the most common, as on real badges.
 */
export function crestDivision(crest: Crest): number {
  const draw = createRng(
    `crest-division:${crest.shape}:${crest.symbol}:${crest.colors.join('')}`.toLowerCase(),
  ).int(0, 9);
  return draw < 3 ? 0 : draw - 2;
}

/**
 * The year a club was founded: a pure function of its id and generated identity, so it is the
 * same everywhere and never drawn from the world RNG. Professional clubs date from the early
 * football era, smaller clubs later, and reserve sides later still.
 */
export function foundedYear(
  club: Pick<Club, 'id'> & { identity?: Pick<ClubIdentity, 'status' | 'reserveParentId'> },
): number {
  const [from, to] = club.identity?.reserveParentId
    ? [1946, 2004]
    : club.identity?.status === 'professional'
      ? [1863, 1925]
      : club.identity?.status === 'semi-professional'
        ? [1874, 1962]
        : club.identity?.status === 'amateur'
          ? [1885, 1995]
          : [1867, 1950];
  return createRng(`club-founded:${club.id}`).int(from, to);
}

/** The emblem colour, and a halo in the base colour when no colour reads on both fields. */
function emblemInk(crest: Crest, division: number): { ink: Hex; halo: Hex | null } {
  const [base, accent, light] = crest.colors;
  const own = withContrast(light, base, 4.5);
  if (!division) return { ink: own, halo: null };
  const candidates: Hex[] = [light, own, withContrast(light, accent, 4.5), '#ffffff', '#000000'];
  const both = candidates.find(
    (ink) => contrastRatio(ink, base) >= 3 && contrastRatio(ink, accent) >= 3,
  );
  return both ? { ink: both, halo: null } : { ink: own, halo: base };
}

export interface CrestOptions {
  /** Show a founding-year ribbon ("EST 1887") across the bottom. */
  founded?: number;
  /** Override the derived division (review screens and tests). */
  division?: number;
}
/** Crest layers in a 160×180 box, with resource ids namespaced by `id` for composed art. */
export function crestMarkup(crest: Crest, id: string, options: CrestOptions = {}): string {
  colors(crest.colors);
  const [base, accent] = crest.colors;
  const path = item(CREST_SHAPES, crest.shape);
  const emblem = item(CREST_SYMBOLS, crest.symbol);
  const [cy, scale] = item(SHAPE_LAYOUT, crest.shape);
  const division = options.division ?? crestDivision(crest);
  const field = item(CREST_DIVISIONS, division)(cy);
  const { ink, halo } = emblemInk(crest, division);
  const founded = options.founded;
  if (founded !== undefined && (!Number.isInteger(founded) || founded < 1000 || founded > 9999))
    throw new RangeError('Invalid founding year');
  const inner = (factor: number) => `translate(80 ${cy}) scale(${factor}) translate(-80 -${cy})`;
  const lift = founded === undefined ? 2 : 9;
  const size = founded === undefined ? scale : scale * 0.9;
  const place = `translate(${f(80 - 50 * size)} ${f(cy - 50 * size - lift)}) scale(${size})`;
  const haloLayer = halo
    ? `<g data-halo="" transform="${place}" fill="${halo}" stroke="${halo}" color="${halo}" stroke-width="${f(6 / size)}" stroke-linejoin="round">${emblem}</g>`
    : '';
  const ribbon =
    founded === undefined
      ? ''
      : `<path d="M22 141H138L130 151.5L138 162H22L30 151.5Z" fill="${mix(ink, '#0b1410', 0.25)}" transform="translate(0 2)"/><path d="M22 141H138L130 151.5L138 162H22L30 151.5Z" fill="${ink}"/>${textPath(`EST ${founded}`, { x: 80, y: 157, size: 10.5, anchor: 'middle', fill: withContrast(base, ink, 4.5) })}`;
  return `<defs><clipPath id="${id}-field"><path d="${path}" transform="${inner(0.9)}"/></clipPath></defs><path d="${path}" fill="${mix(base, '#0b1410', 0.55)}" transform="translate(0 4)"/><path d="${path}" fill="${base}"/><g clip-path="url(#${id}-field)">${field ? `<path d="${field}" fill="${accent}"/>` : ''}<path d="M0 0H80V180H0Z" fill="#ffffff" opacity=".08"/></g><path d="${path}" transform="${inner(0.86)}" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/>${haloLayer}<g transform="${place}" fill="${ink}" color="${base}" data-emblem="">${emblem}</g>${ribbon}`;
}
export function renderCrest(crest: Crest, options: CrestOptions = {}): string {
  return svg(crestMarkup(crest, 'crest', options), '0 0 160 180');
}
