import type { Avatar, ClubKits, Crest } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng } from '../rng';
import { AVATAR_OPTIONS, AVATAR_PARTS, type AvatarPart } from './avatar';
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
const PLAYER_NAMES = [
  'Alex Moreno',
  'Noah Vale',
  'Leon Okafor',
  'Rafael Costa',
  'Samir Duran',
  'Theo March',
  'Nico Mensah',
  'Jules Arlen',
  'Elias Brandt',
  'Marco Silvi',
  'Owen Hartley',
  'Luca Ferrand',
] as const;
/**
 * How far each portrait part steps from one gallery player to the next. Every stride shares no
 * factor with its part's option count, so any run of `count` consecutive players shows every
 * option of that part exactly once, and the parts move out of step so the faces mix.
 */
const STRIDES: Record<AvatarPart, number> = {
  face: 1,
  skin: 3,
  hair: 5,
  hairColor: 5,
  facialHair: 4,
  eyebrows: 3,
  eyes: 5,
  iris: 7,
  nose: 3,
  mouth: 5,
  accessory: 7,
};
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
  // Portraits draw only from their own scoped stream (`fork` ignores the parent's state), so a
  // seed's crests and kits stay exactly as they were before the portrait range widened.
  const portraits = rng.fork('portrait-range');
  const start = Object.fromEntries(
    AVATAR_PARTS.map((part) => [part, portraits.int(0, AVATAR_OPTIONS[part] - 1)]),
  ) as Record<AvatarPart, number>;
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
    // It also shows every portrait option: twelve players cover the twelve hairstyles, the nine
    // facial-hair styles and accessories, and the eight options of every other part.
    players: Array.from({ length: CONFIG.gallery.players }, (_, i) => ({
      id: `player-${i}`,
      name: PLAYER_NAMES[i % PLAYER_NAMES.length]!,
      avatar: Object.fromEntries(
        AVATAR_PARTS.map((part) => [
          part,
          (start[part] + i * STRIDES[part]) % AVATAR_OPTIONS[part],
        ]),
      ) as unknown as Avatar,
    })),
  };
}
