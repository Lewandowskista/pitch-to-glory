import type { Attributes, KeeperAttributes, Position } from '../../model/domain';
import type { Rng } from '../rng';

/** Country names in new worlds (real countries, fictional clubs). */
export const REAL_COUNTRY_NAMES = [
  'England',
  'France',
  'Spain',
  'Germany',
  'Italy',
  'Portugal',
] as const;
/** Fictional country names of worlds generated before identity version 2, and legacy worlds. */
export const COUNTRY_NAMES = [
  'Aldoria',
  'Valmere',
  'Solara',
  'Nordhaven',
  'Belloria',
  'Kestrelia',
] as const;
const CITY_ROOTS = [
  ['Alder', 'Ash', 'Birch', 'Elm', 'Oak', 'Rose', 'Thorn', 'Willow'],
  ['Vale', 'Raven', 'Stone', 'Dale', 'West', 'Fair', 'Lark', 'Silver'],
  ['Sol', 'Luna', 'Monte', 'Cala', 'Rio', 'Costa', 'Sierra', 'Vela'],
  ['Nord', 'Frost', 'Ice', 'Pine', 'Storm', 'Snow', 'Fjord', 'Winter'],
  ['Bella', 'Flor', 'Porta', 'Vera', 'Casa', 'Lago', 'Terra', 'Vita'],
  ['Kestrel', 'Falcon', 'Eagle', 'Heron', 'Swift', 'Hawk', 'Finch', 'Wren'],
] as const;
const CITY_ENDINGS = ['haven', 'bridge', 'wick', 'field'] as const;
const FIRST_NAMES = [
  'Alex',
  'Noah',
  'Leon',
  'Rafael',
  'Samir',
  'Theo',
  'Nico',
  'Jules',
  'Luca',
  'Emil',
  'Idris',
  'Mateo',
  'Oscar',
  'Dario',
  'Jonas',
  'Kian',
  'Felix',
  'Malik',
  'Ivo',
  'Soren',
  'Luis',
  'Aron',
  'Ciro',
  'Hugo',
  'Elias',
  'Adam',
  'Tomas',
  'Remy',
  'Omar',
  'Ben',
  'Evan',
  'Finn',
];
const SURNAMES = [
  'Moreno',
  'Vale',
  'Okafor',
  'Costa',
  'Duran',
  'March',
  'Mensah',
  'Arlen',
  'Voss',
  'Silva',
  'Rossi',
  'Santos',
  'Berg',
  'Lind',
  'Vega',
  'Diallo',
  'Meyer',
  'Moreau',
  'Alves',
  'Marin',
  'Jensen',
  'Kovac',
  'Nouri',
  'Reed',
  'Torres',
  'Bauer',
  'Doyle',
  'Novak',
  'Aziz',
  'Mora',
  'Hart',
  'Stein',
];
export const CLUB_SUFFIXES = [
  'Athletic',
  'United',
  'Rovers',
  'FC',
  'City',
  'Sporting',
  'Wanderers',
  'Albion',
] as const;
export const STYLES = ['possession', 'direct', 'press', 'counter', 'balanced'] as const;
export const FORMATIONS = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'] as const;
export const POSITIONS: readonly Position[] = [
  'GK',
  'GK',
  'CB',
  'CB',
  'CB',
  'CB',
  'LB',
  'LB',
  'RB',
  'RB',
  'DM',
  'DM',
  'CM',
  'CM',
  'CM',
  'AM',
  'LW',
  'LW',
  'RW',
  'RW',
  'ST',
  'ST',
];
export const ATTRIBUTE_KEYS: readonly (keyof Attributes)[] = [
  'finishing',
  'passing',
  'dribbling',
  'firstTouch',
  'crossing',
  'heading',
  'tackling',
  'longShots',
  'setPieces',
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'jumping',
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
  'aggression',
];
export const KEEPER_KEYS: readonly (keyof KeeperAttributes)[] = [
  'handling',
  'reflexes',
  'diving',
  'oneOnOnes',
  'kicking',
  'commandOfArea',
  'aerialReach',
];
export const PHYSICAL_KEYS: readonly (keyof Attributes)[] = [
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'jumping',
];
export const MENTAL_KEYS: readonly (keyof Attributes)[] = [
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
];
export function personName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`;
}
export function cityName(countryIndex: number, clubIndex: number): string {
  return `${CITY_ROOTS[countryIndex]![clubIndex % 8]}${CITY_ENDINGS[Math.floor(clubIndex / 8)]}`;
}
export function clampAttribute(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}
