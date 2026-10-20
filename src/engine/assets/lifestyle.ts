import { svg } from './shared';
import { shapes, TONE, type Shape } from './illustration';

/**
 * Lifestyle shop illustrations (redesign A8): one flat drawing per catalogue item on a
 * 120 × 72 grid, with a transparent background so the screen can tint it per kind.
 */
const G = TONE.field;
const M = TONE.mint;
const Au = TONE.gold;
const K = TONE.ink;
const B = TONE.info;
const BT = TONE.artBlue;
const C = TONE.heroInk;
const S = TONE.surfaceSoft;
const D = TONE.danger;
const W = TONE.surface;

const ground: Shape = ['M0 60H120V72H0Z', S];
const ring = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
const wheels = (a: number, b: number): Shape[] => [
  [ring(a, 52, 8), K],
  [ring(b, 52, 8), K],
  [`${ring(a, 52, 3)}${ring(b, 52, 3)}`, W],
];

const ART: Record<string, Shape[]> = {
  'car:hatch': [
    ground,
    ['M18 52Q18 40 30 38L42 26Q46 22 54 22H74Q82 22 86 30L92 38Q104 40 104 52Z', B],
    ['M46 28H60V38H38ZM64 28H76Q80 28 82 32L86 38H64Z', BT],
    ['M98 44H104V48H98Z', Au],
    ...wheels(38, 84),
  ],
  'car:coupe': [
    ground,
    ['M10 52Q10 44 22 42L44 32Q50 29 60 29H74Q84 29 92 37L106 41Q112 43 112 52Z', G],
    ['M48 34Q52 32 60 32H70L66 40H40ZM73 32Q82 33 86 39H70Z', M],
    ['M14 47H110', 'none', Au, 2],
    ...wheels(32, 92),
  ],
  'car:grand-tourer': [
    ground,
    ['M6 52Q6 44 16 42L36 34Q42 31 52 31H78Q90 31 98 38L110 41Q116 43 116 52Z', Au],
    ['M44 35Q48 33 54 33H66V40H38ZM70 33H78Q86 33 92 40H70Z', K],
    ['M10 47H112', 'none', W, 2],
    ...wheels(28, 94),
  ],
  'car:hypercar': [
    ground,
    ['M6 52L12 44L48 36Q56 33 66 33L86 36L114 46L114 52Z', K],
    ['M54 36Q60 35 66 35L82 37L74 42H44Z', Au],
    ['M100 36H116V40H100ZM106 40V44', K, K, 2],
    ['M18 48H100', 'none', D, 2],
    ...wheels(28, 94),
  ],
  'house:flat': [
    ground,
    ['M36 12H84V60H36Z', B],
    [
      'M42 18h10v8h-10ZM56 18h10v8h-10ZM70 18h8v8h-8ZM42 30h10v8h-10ZM56 30h10v8h-10ZM70 30h8v8h-8ZM42 42h10v8h-10ZM70 42h8v8h-8Z',
      BT,
    ],
    ['M56 46h10v14h-10Z', Au],
    ['M30 60H90', 'none', K, 2],
  ],
  'house:townhouse': [
    ground,
    ['M26 30H94V60H26Z', D],
    ['M22 32L42 14L60 28L78 14L98 32Z', K],
    ['M32 38h12v10h-12ZM76 38h12v10h-12Z', C],
    ['M52 42h16v18h-16Z', Au],
    ['M60 42V60', 'none', K, 1.5],
  ],
  'house:family': [
    ground,
    ['M20 32H84V60H20Z', C],
    ['M14 34L52 12L90 34Z', G],
    ['M84 40H108V60H84Z', TONE.line],
    ['M88 46H104M88 51H104M88 56H104', 'none', K, 1.5],
    ['M28 40h14v10h-14ZM62 40h14v10h-14Z', B],
    ['M46 44h12v16h-12Z', Au],
    ['M108 40L96 32L84 40Z', K],
  ],
  'house:villa': [
    ['M0 56H120V72H0Z', S],
    ['M12 34H108V56H12Z', W, K, 1.5],
    ['M8 30H112V35H8Z', K],
    ['M20 40H50V52H20ZM70 40H100V52H70Z', M],
    ['M56 42H64V56H56Z', Au],
    ['M28 60H92V68H28Z', B],
    ['M6 56V22M6 22Q0 18 -2 24M6 22Q14 16 18 22M6 22Q6 12 12 10', 'none', G, 2.5],
  ],
  'staff:physio': [
    [ring(60, 36, 26), G],
    ['M54 22h12v12h12v12h-12v12h-12v-12h-12v-12h12Z', W],
  ],
  'staff:nutritionist': [
    ['M60 26Q46 18 38 30Q30 46 44 58Q52 64 60 58Q68 64 76 58Q90 46 82 30Q74 18 60 26Z', G],
    ['M60 26Q62 14 72 12Q70 22 60 26Z', M],
    ['M46 34Q44 40 46 46', 'none', M, 3],
  ],
  'staff:coach': [
    ['M40 14H80V64H40Z', W, K, 1.5],
    ['M52 10H68V18H52Z', Au],
    ['M48 28H72M48 36H72M48 44H64', 'none', G, 3],
    [`${ring(53, 54, 3)}${ring(67, 54, 3)}`, B],
  ],
  'staff:analyst': [
    ['M24 60H96', 'none', K, 2],
    ['M30 46h12v14h-12ZM50 36h12v24h-12ZM70 26h12v34h-12Z', B],
    ['M30 38L54 26L74 18L92 10', 'none', Au, 3],
    ['M86 8L93 9L91 16', 'none', Au, 3],
  ],
  'experience:holiday': [
    [ring(84, 22, 10), Au],
    ['M0 52Q15 47 30 52T60 52T90 52T120 52V72H0Z', B],
    ['M30 54Q34 36 30 22', 'none', K, 3],
    ['M30 22Q18 18 12 26M30 22Q42 16 48 24M30 22Q28 12 36 8', 'none', G, 3.5],
  ],
  'experience:family': [
    ['M24 32L42 18L60 32V58H24Z', C, K, 1.5],
    ['M36 42h12v16h-12Z', Au],
    [`${ring(76, 33, 7)}${ring(94, 36, 6)}`, K],
    ['M66 58Q66 40 76 40Q86 40 86 58Z', G],
    ['M86 58Q86 44 94 44Q102 44 102 58Z', B],
    ['M60 16L56 12Q54 8 58 8Q60 8 60 10Q60 8 62 8Q66 8 64 12Z', D],
  ],
  'charity:foundation': [
    ['M60 46L44 30Q38 22 46 16Q54 12 60 20Q66 12 74 16Q82 22 76 30Z', D],
    ['M22 52Q36 46 50 54L70 54Q76 56 70 62H40Q30 62 22 58Z', Au],
    ['M98 52Q84 46 70 54', 'none', Au, 3],
  ],
  'charity:camp': [
    ground,
    [ring(60, 38, 14), W, K, 1.5],
    ['M60 32L66 36L64 42H56L54 36Z', K],
    ['M18 60L25 42L32 60ZM88 60L95 42L102 60Z', Au],
    ['M21 52H29M91 52H99', 'none', W, 2],
  ],
  // A share in the club: its stand under a roof, with a pennant on the gable.
  'legacy:stake': [
    ground,
    ['M22 30H98V60H22Z', G],
    ['M16 30L60 16L104 30Z', K],
    ['M28 38H92M28 45H92M28 52H92', 'none', M, 2.5],
    ['M60 16V4', 'none', K, 1.5],
    ['M60 4L72 7.5L60 11Z', Au],
    ['M52 52h16v8h-16Z', Au],
  ],
  // The youth academy: a schoolhouse with a ball on the gable and two youngsters outside.
  'legacy:academy': [
    ground,
    ['M18 32H74V60H18Z', C, K, 1.5],
    ['M12 34L46 14L80 34Z', B],
    [ring(46, 27, 5), W, K, 1.2],
    ['M28 40h10v8h-10ZM54 40h10v8h-10Z', BT],
    ['M40 46h12v14h-12Z', Au],
    [`${ring(90, 40, 4.5)}${ring(104, 43, 4)}`, K],
    ['M83 60Q83 47 90 47Q97 47 97 60Z', G],
    ['M98 60Q98 50 104 50Q110 50 110 60Z', D],
  ],
  'invest:bond': [
    ['M28 12H92V60H28Z', W, Au, 2],
    ['M38 22H82M38 30H76M38 38H70', 'none', K, 2],
    [ring(78, 56, 8), Au],
    ['M74 54L72 66L78 62L84 66L82 54', Au],
  ],
  'invest:fund': [
    ground,
    ['M24 30H48V60H24ZM54 20H78V60H54Z', B],
    [
      'M30 36h4v4h-4ZM38 36h4v4h-4ZM30 46h4v4h-4ZM38 46h4v4h-4ZM60 26h4v4h-4ZM68 26h4v4h-4ZM60 36h4v4h-4ZM68 36h4v4h-4ZM60 46h4v4h-4ZM68 46h4v4h-4Z',
      BT,
    ],
    ['M84 50L94 36L102 42L112 24', 'none', G, 3.5],
    ['M104 22L112 24L110 32', 'none', G, 3.5],
  ],
  'invest:startup': [
    ['M60 8Q74 20 74 40V50H46V40Q46 20 60 8Z', W, K, 1.5],
    [ring(60, 32, 6), B],
    ['M46 40L36 54L46 50ZM74 40L84 54L74 50Z', D],
    ['M50 52Q60 72 70 52Z', Au],
  ],
};

/** The first drawing of each kind, for an item added to the catalogue after these drawings. */
const KIND_DEFAULT: Record<string, string> = {
  car: 'car:hatch',
  house: 'house:flat',
  staff: 'staff:physio',
  experience: 'experience:holiday',
  charity: 'charity:foundation',
  investment: 'invest:bond',
  invest: 'invest:bond',
  legacy: 'legacy:stake',
};

/** Item ids with their own drawing. */
export const LIFESTYLE_ART_IDS: readonly string[] = Object.keys(ART);

/** A lifestyle item as SVG, by catalogue id; unknown items of a known kind use that kind's art. */
export function renderLifestyle(itemId: string, kind?: string): string {
  const art = ART[itemId] ?? ART[KIND_DEFAULT[kind ?? itemId.split(':')[0] ?? ''] ?? ''];
  if (!art) throw new RangeError('Invalid lifestyle item');
  return svg(shapes(art), '0 0 120 72');
}
