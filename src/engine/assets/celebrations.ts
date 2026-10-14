import type { Hex } from '../../model/domain';
import { colors as checkColors, svg, withContrast } from './shared';
import { shapes, TONE, type Shape } from './illustration';

/**
 * Celebration key frames (redesign A8): the match token caught at the height of each
 * celebration on a 60 × 40 strip of striped pitch, with flat motion marks. The wardrobe shows
 * them while a tile is still; the animated token (src/styles/celebrations.css) takes over when
 * it plays.
 */
const C = TONE.heroInk;
const Au = TONE.gold;
const Mi = TONE.mint;

interface Pose {
  /** Where the token stands in the key frame. */
  x: number;
  y: number;
  marks: Shape[];
}

const POSES: Record<string, Pose> = {
  'celebration:fist-pump': {
    x: 28,
    y: 24,
    marks: [
      ['M32 20L37 12', 'none', C, 1.6],
      ['M35 9a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0Z', C],
      ['M42 6L45 4M43 10L47 10M41 2L42 0', 'none', Au, 1],
    ],
  },
  'celebration:arms-wide': {
    x: 30,
    y: 22,
    marks: [
      ['M14 18H23M37 18H46', 'none', C, 1.6],
      ['M11 22Q8 16 11 10M49 22Q52 16 49 10', 'none', Au, 1],
    ],
  },
  'celebration:knee-slide': {
    x: 42,
    y: 24,
    marks: [
      ['M6 22H28M10 26H32M8 18H24', 'none', C, 1.2],
      ['M34 30a1 1 0 1 0 2 0a1 1 0 1 0-2 0ZM30 32a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z', Mi],
    ],
  },
  'celebration:badge-kiss': {
    x: 30,
    y: 24,
    marks: [['M30 14L27.5 11.5Q26 9.5 28 8.5Q29.5 8 30 9.5Q30.5 8 32 8.5Q34 9.5 32.5 11.5Z', Au]],
  },
  'celebration:corner-flag': {
    x: 44,
    y: 26,
    marks: [
      ['M54 4V20', 'none', C, 1],
      ['M54 4L59 6.5L54 9Z', Au],
      ['M34 22L36 19L38 22M50 32L52 29L54 32', 'none', Mi, 1],
    ],
  },
  'celebration:airplane': {
    x: 32,
    y: 21,
    marks: [
      ['M16 25L48 17', 'none', C, 1.8],
      ['M6 14H16M4 20H14M8 26H16', 'none', Mi, 1],
    ],
  },
  'celebration:shush': {
    x: 24,
    y: 22,
    marks: [
      ['M28 14V19', 'none', C, 1.6],
      ['M38 16Q41 21 38 26M42 13Q47 21 42 29', 'none', Au, 1],
      ['M36 12L46 30', 'none', TONE.danger, 1.2],
    ],
  },
  'celebration:robot': {
    x: 30,
    y: 22,
    marks: [
      ['M18 22H23M18 22V15M37 22H42M42 22V29', 'none', C, 1.6],
      ['M12 10H16M44 34H48', 'none', Mi, 1],
    ],
  },
  'celebration:spin': {
    x: 30,
    y: 20,
    marks: [
      ['M30 9A11 11 0 1 1 19 20', 'none', C, 1.2],
      ['M17 17L19 21L22 18', 'none', C, 1.2],
    ],
  },
  'celebration:cartwheel': {
    x: 30,
    y: 12,
    marks: [
      ['M8 34Q30 -4 52 34', 'none', C, 1],
      [
        'M8 34a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0ZM16 22a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0ZM44 22a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Z',
        Mi,
      ],
    ],
  },
  'celebration:backflip': {
    x: 30,
    y: 26,
    marks: [
      ['M22 22Q22 6 30 6Q38 6 38 18', 'none', C, 1.2],
      ['M35 16L38 19L40 15', 'none', C, 1.2],
    ],
  },
  'celebration:ice-cold': {
    x: 26,
    y: 22,
    marks: [
      ['M44 12V24M38 18H50M39.8 13.8L48.2 22.2M48.2 13.8L39.8 22.2', 'none', TONE.artBlue, 1.1],
    ],
  },
};

/** The token's shirt and trim (outline and number) for a kit: trim readable on the shirt. */
export function celebrationToken(kit: readonly [Hex, Hex] = [TONE.heroInk, TONE.ink]): {
  shirt: Hex;
  trim: Hex;
} {
  checkColors([kit[0], kit[1], kit[1]]);
  return { shirt: kit[0], trim: withContrast(kit[1], kit[0], 3) };
}

/** Celebration ids with a key frame (the catalogue's celebrations). */
export const CELEBRATION_POSE_IDS: readonly string[] = Object.keys(POSES);

/**
 * A celebration's key frame as SVG, the token in the kit colours (shirt, then trim) with the
 * squad number. Without a kit, the token is cream with ink trim.
 */
export function renderCelebration(
  id: string,
  kit: readonly [Hex, Hex] = [TONE.heroInk, TONE.ink],
  number = 9,
): string {
  const pose = POSES[id];
  if (!pose) throw new RangeError('Invalid celebration');
  const { shirt, trim } = celebrationToken(kit);
  const label = String(Math.max(1, Math.min(99, Math.trunc(number))));
  const { x, y } = pose;
  return svg(
    `<rect width="60" height="40" rx="6" fill="${TONE.field}"/><path d="M6 0H12V40H6Q0 40 0 34V6Q0 0 6 0ZM24 0H36V40H24ZM48 0H54Q60 0 60 6V34Q60 40 54 40H48Z" fill="${TONE.fieldStripe}"/><path d="M30 0V40M0 20H60" stroke="${Mi}" stroke-opacity=".35" stroke-width=".6"/>${shapes(pose.marks)}<circle cx="${x}" cy="${y}" r="6.5" fill="none" stroke="${Au}" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="5" fill="${shirt}" stroke="${trim}" stroke-width="1"/><text x="${x}" y="${y + 1.8}" text-anchor="middle" font-family="Inter, sans-serif" font-size="5" font-weight="800" fill="${trim}">${label}</text>`,
    '0 0 60 40',
  );
}
