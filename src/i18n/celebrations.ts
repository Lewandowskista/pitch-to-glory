import { LOCALE, type Translations } from './locale';
/*
 * The signature celebrations' names and their commentary line, apart from the rest of the
 * lifestyle copy (lifestyle.ts) so the live match carries only these.
 */
export const celebrationNamesEn: Record<string, string> = {
  'celebration:fist-pump': 'Fist pump',
  'celebration:arms-wide': 'Arms wide',
  'celebration:knee-slide': 'Knee slide',
  'celebration:badge-kiss': 'Badge kiss',
  'celebration:corner-flag': 'Corner-flag dance',
  'celebration:airplane': 'Aeroplane',
  'celebration:shush': 'Shush the crowd',
  'celebration:robot': 'The robot',
  'celebration:spin': 'Spin',
  'celebration:cartwheel': 'Cartwheel',
  'celebration:backflip': 'Backflip',
  'celebration:ice-cold': 'Ice cold',
};
export const celebrationNames = (
  { en: celebrationNamesEn } satisfies Translations<typeof celebrationNamesEn>
)[LOCALE];
/** Under the career player's goals in the match commentary. */
export const celebrationCommentaryEn = '{player} celebrates: {name}!';
export const celebrationCommentary = (
  { en: celebrationCommentaryEn } satisfies Translations<typeof celebrationCommentaryEn>
)[LOCALE];
