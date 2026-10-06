import type { NationalProfile, World } from '../../../model/domain';
import { createRng } from '../../rng';
import type { CountryIdentity, Town } from './types';
import { ENGLAND } from './england';
import { FRANCE } from './france';
import { SPAIN } from './spain';
import { GERMANY } from './germany';
import { ITALY } from './italy';
import { PORTUGAL } from './portugal';

export type { CountryIdentity, ReferencedClub, Town } from './types';

/** Identities in country-index order, matching NATIONAL_PROFILES. */
export const IDENTITIES: readonly CountryIdentity[] = [
  ENGLAND,
  FRANCE,
  SPAIN,
  GERMANY,
  ITALY,
  PORTUGAL,
];

/** Fictional competition names for the continental cups (milestone 8). */
export const CONTINENTAL = {
  champions: { name: 'European Champions Cup', reference: 'UEFA Champions League' },
  second: { name: 'European Shield', reference: 'UEFA Europa League' },
  third: { name: 'European Conference Trophy', reference: 'UEFA Conference League' },
} as const;

/**
 * A copy of the profile carrying the identity's display names and real-competition
 * references. Rules are untouched, so the profile's rule fingerprint is unchanged.
 */
export function identityProfile(profile: NationalProfile, identity: CountryIdentity) {
  const copy = JSON.parse(JSON.stringify(profile)) as NationalProfile;
  for (const division of copy.divisions) {
    const names = identity.divisions[division.tier]!;
    division.name = names.name;
    division.reference = names.reference;
    division.groups.forEach((group, index) => {
      group.name = names.groups?.[index] ?? group.name;
    });
  }
  copy.adaptations = [
    'Real countries and geography; clubs and competitions are fictional but reference their real counterparts.',
    ...profile.adaptations.filter((note) => !note.startsWith('Fictional')),
  ];
  return copy;
}

/**
 * Hands out real towns for generated clubs, without repeats. Each region's towns are shuffled
 * by seed; a request draws from whichever allowed region has the most towns left.
 */
export class TownPicker {
  private readonly pools = new Map<string, Town[]>();
  constructor(
    identity: CountryIdentity,
    seed: string,
    private readonly used: Set<string>,
  ) {
    for (const [region, towns] of Object.entries(identity.towns)) {
      const rng = createRng(`${seed}:towns:${identity.counterpart}:${region}`);
      const shuffled = [...towns];
      for (let index = shuffled.length - 1; index > 0; index--) {
        const target = rng.int(0, index);
        [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
      }
      this.pools.set(region, shuffled);
    }
  }
  take(regions: readonly string[]): (Town & { region: string }) | null {
    const available = (region: string) =>
      (this.pools.get(region) ?? []).filter((town) => !this.used.has(town.name));
    const region = [...regions].sort((a, b) => available(b).length - available(a).length)[0];
    const town = region ? available(region)[0] : undefined;
    if (!region || !town) return null;
    this.used.add(town.name);
    return { ...town, region };
  }
}

/** Towns already used by clubs of a country, so feeder clubs never repeat one. */
export function usedTowns(world: World, countryId: string): Set<string> {
  return new Set(
    Object.values(world.clubs)
      .filter((club) => club.countryId === countryId)
      .map((club) => club.city),
  );
}
