import type { Avatar, ClubKits, Crest } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng } from '../rng';
import { generateAvatar } from './avatar';
import { CREST_SHAPES, CREST_SYMBOLS, generateCrest } from './crest';
import { generateKits, KIT_PATTERNS } from './kit';
const CITIES = [
  'Alderwick',
  'Port Sol',
  'Northmere',
  'Valdora',
  'Ashford',
  'Bellhaven',
  'Highfield',
  'Marston',
  'Westhaven',
  'Riverton',
  'Larkspur',
  'Stonebridge',
  'Fairmont',
  'Eastvale',
  'Redmoor',
];
const SUFFIXES = ['Athletic', 'United', 'Rovers', 'FC', 'City'];
export interface GalleryClub {
  id: string;
  name: string;
  crest: Crest;
  kits: ClubKits;
}
export interface GalleryPlayer {
  id: string;
  name: string;
  avatar: Avatar;
}
export function generateGallery(seed: string): { clubs: GalleryClub[]; players: GalleryPlayer[] } {
  const rng = createRng(seed);
  const offset = rng.int(0, CREST_SYMBOLS.length - 1);
  return {
    clubs: Array.from({ length: CONFIG.gallery.clubs }, (_, i) => {
      const scoped = rng.fork(`club-${i}`);
      const crest = generateCrest(scoped);
      // A review collection exposes every silhouette and kit pattern on every seed.
      crest.shape = i % CREST_SHAPES.length;
      crest.symbol = (i + offset) % CREST_SYMBOLS.length;
      const kits = generateKits(scoped, crest.colors);
      kits.home.pattern = KIT_PATTERNS[i % 8]!;
      return { id: `club-${i}`, name: `${CITIES[i]} ${scoped.pick(SUFFIXES)}`, crest, kits };
    }),
    players: Array.from({ length: CONFIG.gallery.players }, (_, i) => {
      const avatar = generateAvatar(rng.fork(`player-${i}`));
      avatar.face = i;
      avatar.hair = i;
      avatar.skin = i;
      return {
        id: `player-${i}`,
        name: [
          'Alex Moreno',
          'Noah Vale',
          'Leon Okafor',
          'Rafael Costa',
          'Samir Duran',
          'Theo March',
          'Nico Mensah',
          'Jules Arlen',
        ][i]!,
        avatar,
      };
    }),
  };
}
