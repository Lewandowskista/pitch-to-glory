import type { AwardKind, Tournament } from '../../model/domain';
import { svg } from './shared';
import { shapes, TONE, type Shape } from './illustration';

/**
 * Flat trophy art (redesign A8) on a 64 × 64 grid: gold body, one shadow tone, a light
 * highlight and a dark plinth. Shown alone or on the gold-rimmed disc of the trophy cabinet.
 */
export const TROPHY_KINDS = [
  'league',
  'cup',
  'continental',
  'shield',
  'international',
  'golden-ball',
  'golden-boot',
  'medal-gold',
  'medal-silver',
  'medal-bronze',
] as const;
export type TrophyKind = (typeof TROPHY_KINDS)[number];

const G = TONE.gold;
const S = TONE.goldPressed;
const D = TONE.goldDeep;
const H = TONE.heroInk;
const P = TONE.plate;
const M = TONE.mint;

const MEDAL_RIBBON: Shape[] = [
  ['M21 6H29L35 26H27Z', H],
  ['M43 6H35L29 26H37Z', M],
];
/** A medal in one metal: body, rim (its shadow tone) and star. */
const medal = (body: string, rim: string, star: string): Shape[] => [
  ...MEDAL_RIBBON,
  ['M26 22H38V27H26Z', rim],
  ['M18 40a14 14 0 1 0 28 0a14 14 0 1 0-28 0Z', body],
  [
    'M18 40a14 14 0 1 0 28 0a14 14 0 1 0-28 0ZM21.5 40a10.5 10.5 0 1 0 21 0a10.5 10.5 0 1 0-21 0Z',
    rim,
  ],
  ['M32 32L34.4 37.2L40 37.8L35.8 41.6L37 47.2L32 44.4L27 47.2L28.2 41.6L24 37.8L29.6 37.2Z', star],
];

const ART: Record<TrophyKind, Shape[]> = {
  league: [
    ['M21 16H14Q12 30 23 32V29Q16 27 17 19H21ZM43 16H50Q52 30 41 32V29Q48 27 47 19H43Z', S],
    ['M20 12H44V24Q44 38 32 40Q20 38 20 24Z', G],
    ['M32 12H44V24Q44 38 32 40Z', S],
    ['M23 15H26V25Q26 32 30 36Q23 33 23 25Z', H],
    ['M29 40H35L34 46H30Z', D],
    ['M25 46H39V49H25Z', G],
    ['M20 49H44L46 57H18Z', P],
    ['M27 51H37V54H27Z', G],
  ],
  cup: [
    ['M30 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0ZM24 14Q32 6 40 14Z', G],
    ['M23 14H41V17H23Z', D],
    [
      'M24 19Q17 20 19 27Q21 31 26 30L26 28Q21 28 21 25Q21 21 24 21ZM40 19Q47 20 45 27Q43 31 38 30L38 28Q43 28 43 25Q43 21 40 21Z',
      S,
    ],
    ['M24 17H40Q40 33 32 36Q24 33 24 17Z', G],
    ['M32 17H40Q40 33 32 36Z', S],
    ['M26.5 19H28.5V27Q28.5 31 30.5 33Q26.5 31 26.5 26Z', H],
    ['M30.5 36H33.5V45H30.5Z', D],
    ['M25 45H39L41 50H23Z', G],
    ['M21 50H43V57H21Z', P],
  ],
  continental: [
    [
      'M22 14Q8 12 9 26Q10 38 24 38L25 34Q14 34 13.5 26Q13 17 22 18ZM42 14Q56 12 55 26Q54 38 40 38L39 34Q50 34 50.5 26Q51 17 42 18Z',
      S,
    ],
    ['M21 10H43Q44 30 32 36Q20 30 21 10Z', G],
    ['M32 10H43Q44 30 32 36Z', S],
    ['M20 9H44V12H20Z', D],
    ['M24 13H27Q27 25 30 31Q24 27 24 13Z', H],
    ['M30 36H34V44H30Z', D],
    ['M24 44H40L42 50H22Z', G],
    ['M19 50H45V57H19Z', P],
    ['M27 52H37V55H27Z', G],
  ],
  shield: [
    ['M15 26a17 17 0 1 0 34 0a17 17 0 1 0-34 0Z', G],
    ['M32 9a17 17 0 0 1 0 34Z', S],
    [
      'M19 26a13 13 0 1 0 26 0a13 13 0 1 0-26 0ZM21.5 26a10.5 10.5 0 1 0 21 0a10.5 10.5 0 1 0-21 0Z',
      D,
    ],
    ['M32 18L34.4 23.2L40 23.8L35.8 27.6L37 33.2L32 30.4L27 33.2L28.2 27.6L24 23.8L29.6 23.2Z', D],
    ['M18.5 21Q21 13 28 10.5Q23 15 21.5 22Z', H],
    ['M29 43H35L34 46H30Z', D],
    ['M25 46H39V49H25Z', G],
    ['M20 49H44L46 57H18Z', P],
    ['M27 51H37V54H27Z', G],
  ],
  international: [
    ['M22 18a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z', G],
    ['M31 8.5H33V27.5H31ZM22.5 17H41.5V19H22.5Z', D],
    ['M24 24Q21 35 28 42L30.5 42Q26 34 28 27ZM40 24Q43 35 36 42L33.5 42Q38 34 36 27Z', S],
    ['M27 28Q32 31 37 28L35.5 43H28.5Z', G],
    ['M24.5 12Q27 9 30 8.8Q27 11 26 14Z', H],
    ['M25 43H39L40 49H24Z', D],
    ['M20 49H44V57H20Z', P],
  ],
  'golden-ball': [
    ['M16 26a16 16 0 1 0 32 0a16 16 0 1 0-32 0Z', G],
    ['M32 10a16 16 0 0 1 0 32a10 16 0 0 0 0-32Z', S],
    [
      'M32 20L37.7 24.1L35.5 30.8H28.5L26.3 24.1ZM32 10.5L35.5 12.6L32 15.2L28.5 12.6ZM47 22L47.6 28.6L43.8 27.4L43.6 22.4ZM17 22L20.4 22.4L20.2 27.4L16.4 28.6ZM23.6 38.6L27.4 36.2L29.6 40.8L25.6 41.2ZM40.4 38.6L36.6 36.2L34.4 40.8L38.4 41.2Z',
      D,
    ],
    ['M21.5 18Q24.5 12.5 30 11.5Q25.5 15.5 24 21Z', H],
    ['M28 42H36L37 47H27Z', D],
    ['M20 47H44L46 57H18Z', P],
    ['M27 50H37V53H27Z', G],
  ],
  'golden-boot': [
    ['M16 12H31V30L44 33Q53 35 53 42V45H14Q13 28 16 12Z', G],
    ['M14 40H53V45H14Z', S],
    ['M20 17H28V19H20ZM20 22H28V24H20ZM20 27H28V29H20Z', D],
    ['M17.5 15H20V36H17Z', H],
    ['M18 45H22V48H18ZM31 45H35V48H31ZM45 45H49V48H45Z', D],
    ['M13 49H54V57H13Z', P],
  ],
  'medal-gold': medal(G, S, D),
  // Silver and bronze are metals, not brand colours: a pale and a warm tone, each with its shadow.
  'medal-silver': medal(TONE.line, '#a9b5ab', TONE.muted),
  'medal-bronze': medal('#d08a4e', '#a8652f', '#7a4520'),
};

/**
 * A trophy as SVG. With `disc`, it sits on the cabinet's gold-rimmed disc: field green, or the
 * dark plate (`'plate'`) used on the Chronicle poster.
 */
export function renderTrophy(kind: TrophyKind, disc: boolean | 'plate' = true): string {
  const art = ART[kind];
  if (!art) throw new RangeError('Invalid trophy kind');
  const body = shapes(art, ' fill-rule="evenodd"');
  if (!disc) return svg(body, '0 0 64 64');
  return svg(
    `<circle cx="32" cy="32" r="31" fill="${TONE.gold}"/><circle cx="32" cy="32" r="27.5" fill="${disc === 'plate' ? TONE.plate : TONE.field}"/><g transform="translate(4.5 4.5) scale(.86)">${body}</g>`,
    '0 0 64 64',
  );
}

/** Only the shapes, for composing several trophies into one larger SVG (the poster). */
export function trophyShapes(kind: TrophyKind): string {
  return shapes(ART[kind], ' fill-rule="evenodd"');
}

const AWARD_TROPHY: Record<AwardKind, TrophyKind> = {
  month: 'medal-gold',
  'team-season': 'medal-gold',
  'golden-boot': 'golden-boot',
  'young-player': 'medal-gold',
  mvp: 'medal-gold',
  'golden-ball': 'golden-ball',
};

/**
 * The trophy for a competition id, an award kind or an international tournament kind. Club
 * competitions: the Continental Champions Cup is the big-eared cup and the Continental Shield
 * its plate; domestic cups (`cup:…`) are lidded cups; everything else (leagues, their
 * promotion phases and championship finals) is a league trophy. Tournaments are the
 * international trophy.
 */
export function trophyKindFor(source: string | AwardKind | Tournament['kind']): TrophyKind {
  if (Object.hasOwn(AWARD_TROPHY, source)) return AWARD_TROPHY[source as AwardKind];
  if (source === 'world' || source === 'continental') return 'international';
  if (source === 'continental:champions') return 'continental';
  if (source === 'continental:shield') return 'shield';
  if (source.startsWith('cup:')) return 'cup';
  return 'league';
}

/** A finishing place as a medal: winners gold, finalists silver, semi-finalists bronze. */
export function medalFor(place: number): TrophyKind {
  return place <= 1 ? 'medal-gold' : place === 2 ? 'medal-silver' : 'medal-bronze';
}
