import type { Match } from '../../model/domain';
import { CONFIG } from '../config';
import { svg } from './shared';
import { shapes, TONE, type Shape } from './illustration';

/**
 * Match-condition icons (redesign A8) on a 36 × 36 grid: the weather, with light, steady and
 * heavy variants for when the engine reports intensity, and the state of the pitch.
 */
export type Weather = Match['weather'];
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'wind'];
export type Intensity = 'light' | 'steady' | 'heavy';
export const INTENSITIES: readonly Intensity[] = ['light', 'steady', 'heavy'];
export type PitchState = 'firm' | 'good' | 'heavy' | 'frozen';
export const PITCH_STATES: readonly PitchState[] = ['firm', 'good', 'heavy', 'frozen'];

const COUNT: Record<Intensity, number> = { light: 1, steady: 2, heavy: 3 };
const CLOUD = 'M9 20a6 6 0 0 1 1-11.9a8 8 0 0 1 15.4 1.9a5 5 0 0 1 .6 10Z';
const SMALL_CLOUD = 'M20 27a4 4 0 0 1 .7-7.9a5.4 5.4 0 0 1 10.3 1.3a3.4 3.4 0 0 1 .4 6.6Z';

function sun(intensity: Intensity): Shape[] {
  const long = intensity === 'heavy' ? 2 : 0;
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((angle) => {
      const r = (angle * Math.PI) / 180;
      const [a, b] = [10, 13 + long].map((d) => [18 + Math.cos(r) * d, 18 + Math.sin(r) * d]);
      return `M${a![0]!.toFixed(1)} ${a![1]!.toFixed(1)}L${b![0]!.toFixed(1)} ${b![1]!.toFixed(1)}`;
    })
    .join('');
  const art: Shape[] = [
    ['M11 18a7 7 0 1 0 14 0a7 7 0 1 0-14 0Z', TONE.gold],
    [rays, 'none', TONE.goldDeep, 2.4],
  ];
  // Light: the sun comes and goes behind a small cloud.
  if (intensity === 'light') art.push([SMALL_CLOUD, TONE.infoPale]);
  return art;
}

function rain(intensity: Intensity): Shape[] {
  const drops = [
    'M12 24L10 30',
    'M18 24L16 30',
    'M24 24L22 30',
    'M15 30L13.6 34',
    'M21 30L19.6 34',
  ].slice(0, [2, 3, 5][COUNT[intensity] - 1]);
  return [
    [CLOUD, TONE.info],
    [drops.join(''), 'none', TONE.info, 2.4],
  ];
}

function snow(intensity: Intensity): Shape[] {
  const flake = (x: number, y: number) =>
    `M${x} ${y - 2.6}V${y + 2.6}M${x - 2.3} ${y - 1.3}L${x + 2.3} ${y + 1.3}M${x - 2.3} ${y + 1.3}L${x + 2.3} ${y - 1.3}`;
  const flakes = [flake(12, 27), flake(24, 27), flake(18, 31), flake(9, 32), flake(27, 32)].slice(
    0,
    [2, 3, 5][COUNT[intensity] - 1],
  );
  return [
    [CLOUD, TONE.infoPale],
    [flakes.join(''), 'none', TONE.info, 1.6],
  ];
}

function wind(intensity: Intensity): Shape[] {
  const gusts = ['M5 15H22a4 4 0 1 0-4-4', 'M5 21H27a4 4 0 1 1-4 4', 'M8 27H16'].slice(
    0,
    COUNT[intensity],
  );
  return [
    [gusts.join(''), 'none', TONE.info, 2.6],
    ['M27 9Q31 8 32 12Q28 13 27 9Z', TONE.field],
  ];
}

const WEATHER_ART: Record<Weather, (intensity: Intensity) => Shape[]> = {
  clear: sun,
  rain,
  snow,
  wind,
};

/** A weather icon as SVG; `steady` is the match's weather as the engine reports it today. */
export function renderWeather(weather: Weather, intensity: Intensity = 'steady'): string {
  const art = WEATHER_ART[weather];
  if (!art || !COUNT[intensity]) throw new RangeError('Invalid weather');
  return svg(shapes(art(intensity)), '0 0 36 36');
}

const LINES = 'M18 8V28M3 13H8V23H3M33 13H28V23H33';
const PITCH_ART: Record<PitchState, Shape[]> = {
  // Firm: freshly mown, dry and fast, with a gold sun spot.
  firm: [
    ['M6 8H33V28H6Q3 28 3 25V11Q3 8 6 8Z', TONE.field],
    ['M8 8H13V28H8ZM18 8H23V28H18ZM28 8H33V28H28Z', TONE.fieldStripe],
    [LINES, 'none', TONE.accentSoft, 1.6],
    ['M14.5 18a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0Z', 'none', TONE.accentSoft, 1.6],
    ['M28 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z', TONE.gold],
  ],
  good: [
    ['M6 8H30Q33 8 33 11V25Q33 28 30 28H6Q3 28 3 25V11Q3 8 6 8Z', TONE.field],
    [LINES, 'none', TONE.accentSoft, 1.6],
    ['M14.5 18a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0Z', 'none', TONE.accentSoft, 1.6],
  ],
  // Heavy: muddy goalmouths and standing water.
  heavy: [
    ['M6 8H30Q33 8 33 11V25Q33 28 30 28H6Q3 28 3 25V11Q3 8 6 8Z', TONE.field],
    [
      'M3 14Q8 12 11 16Q12 22 7 23Q4 22 3 22ZM33 14Q28 13 26 17Q26 22 30 23Q32 23 33 22Z',
      TONE.goldDeep,
    ],
    [LINES, 'none', TONE.accentSoft, 1.6],
    ['M14.5 18a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0Z', 'none', TONE.accentSoft, 1.6],
    ['M12 25Q15 23 19 25Q15 27 12 25ZM21 11Q24 9.5 27 11Q24 12.5 21 11Z', TONE.infoPale],
  ],
  // Frozen: frosted white turf, blue lines and an ice crystal.
  frozen: [
    ['M6 8H30Q33 8 33 11V25Q33 28 30 28H6Q3 28 3 25V11Q3 8 6 8Z', TONE.artBlue],
    ['M6 8H30Q33 8 33 11V25Q33 28 30 28H6Q3 28 3 25V11Q3 8 6 8Z', 'none', TONE.infoPale, 1.2],
    [LINES, 'none', TONE.infoPale, 1.6],
    [
      'M18 12.5V23.5M13.2 15.2L22.8 20.8M13.2 20.8L22.8 15.2M16.4 12.5L18 14L19.6 12.5M16.4 23.5L18 22L19.6 23.5',
      'none',
      TONE.info,
      1.6,
    ],
  ],
};

/** A pitch-state icon as SVG. */
export function renderPitch(state: PitchState): string {
  const art = PITCH_ART[state];
  if (!art) throw new RangeError('Invalid pitch state');
  return svg(shapes(art), '0 0 36 36');
}

/**
 * The pitch's state from the weather and its quality (0–100): snow freezes it, rain or a
 * pitch below `pitchGood` (the quality at which close control starts to suffer) makes it
 * heavy, and a good pitch under clear skies is firm.
 */
export function pitchStateFor(weather: Weather, pitchCondition: number): PitchState {
  if (weather === 'snow') return 'frozen';
  if (weather === 'rain' || pitchCondition < CONFIG.match.conditions.pitchGood) return 'heavy';
  return weather === 'clear' ? 'firm' : 'good';
}
