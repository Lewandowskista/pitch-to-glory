import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { NATIONAL_PROFILES } from '../src/engine/world/profiles';
import { IDENTITIES } from '../src/engine/world/identities';
import { REAL_COUNTRY_NAMES } from '../src/engine/world/catalog';
import { generateWorld } from '../src/engine/world/generate';
import { createFeederClub } from '../src/engine/world/feeder';
import { validateWorld } from '../src/persistence/worldSchema';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const hex = /^#[0-9a-f]{6}$/;

describe('real countries with referenced fictional clubs', () => {
  it('describes every country consistently with its sporting profile', () => {
    expect(IDENTITIES.map((identity) => identity.name)).toEqual([...REAL_COUNTRY_NAMES]);
    for (const [index, identity] of IDENTITIES.entries()) {
      const profile = NATIONAL_PROFILES[index]!;
      expect(identity.counterpart).toBe(profile.counterpart);
      const regions = profile.divisions.at(-1)!.groups.map((g) => g.region);
      const names = new Set<string>();
      const cities = new Set<string>();
      for (const division of profile.divisions) {
        const display = identity.divisions[division.tier]!;
        expect(display.name).toBeTruthy();
        expect(display.reference).toBeTruthy();
        if (division.groups.length > 1) expect(display.groups).toHaveLength(division.groups.length);
        const clubs = identity.clubs[division.tier];
        if (!clubs) {
          expect(identity.groupRegions[division.tier]).toHaveLength(division.groups.length);
          continue;
        }
        expect(clubs).toHaveLength(division.groups.reduce((n, g) => n + g.size, 0));
        for (const club of clubs) {
          expect(names.has(club.name), club.name).toBe(false);
          names.add(club.name);
          cities.add(club.city);
          expect(regions).toContain(club.region);
          expect(
            club.colours.every((c) => hex.test(c)),
            club.name,
          ).toBe(true);
          expect(club.name.toLowerCase()).not.toBe(club.reference.toLowerCase());
          expect(club.stature).toBeGreaterThanOrEqual(1);
          expect(club.stature).toBeLessThanOrEqual(10);
        }
      }
      const towns = Object.values(identity.towns).flat();
      expect(new Set(towns.map((t) => t.name)).size).toBe(towns.length);
      for (const town of towns) expect(cities.has(town.name), town.name).toBe(false);
    }
  });
  it('generates a valid world with real countries, referenced clubs and real towns', () => {
    const world = generateWorld('identity-world');
    expect(world.identityVersion).toBe(2);
    expect(Object.values(world.countries).map((c) => c.name)).toEqual([...REAL_COUNTRY_NAMES]);
    for (const [index, identity] of IDENTITIES.entries()) {
      const country = world.countries[`country:${index}`]!;
      const leagues = country.leagueIds.map((id) => world.leagues[id]!);
      const towns = new Set(
        Object.values(identity.towns)
          .flat()
          .map((t) => t.name),
      );
      for (const league of leagues) {
        const referenced = identity.clubs[league.tier];
        const clubs = league.clubIds.map((id) => world.clubs[id]!);
        expect(league.name.startsWith(identity.divisions[league.tier]!.name)).toBe(true);
        if (referenced) {
          expect(clubs.map((club) => club.name)).toEqual(referenced.map((club) => club.name));
          for (const [i, club] of clubs.entries()) {
            expect(club.crest.colors.slice(0, 2)).toEqual(referenced[i]!.colours.slice(0, 2));
            expect(club.kits.home.pattern).toBe(referenced[i]!.pattern);
            expect(club.stadium.name).toBe(referenced[i]!.stadium);
            expect(club.identity!.latitude).toBe(referenced[i]!.lat);
          }
        } else
          for (const club of clubs)
            if (!club.identity!.reserveParentId) expect(towns.has(club.city), club.city).toBe(true);
      }
      expect(world.competitions[country.domesticCupId]!.name).toBe(identity.cup.name);
      const profile = world.pyramid!.profiles[country.id]!;
      expect(profile.divisions[0]!.reference).toBe(identity.divisions[1]!.reference);
    }
    // Referenced reserve teams point at their real parent clubs.
    for (const club of Object.values(world.clubs).filter((c) => c.identity?.reserveParentId))
      expect(world.clubs[club.identity!.reserveParentId!]!.countryId).toBe(club.countryId);
    expect(() => validateWorld(clone(world))).not.toThrow();
  }, 60000);
  it('places feeder clubs in unused real towns, and keeps older worlds fictional', () => {
    const world = generateWorld('identity-feeder');
    const feeder = createFeederClub(world, 'country:0', 'North');
    expect(Object.values(IDENTITIES[0]!.towns.North!).some((t) => t.name === feeder.city)).toBe(
      true,
    );
    const cities = Object.values(world.clubs)
      .filter((c) => c.countryId === 'country:0')
      .map((c) => c.city);
    expect(cities.filter((city) => city === feeder.city)).toHaveLength(1);
    const older = generateWorld('identity-older');
    delete older.identityVersion;
    const fictional = createFeederClub(older, 'country:0', 'North');
    const realTowns = new Set(
      Object.values(IDENTITIES[0]!.towns)
        .flat()
        .map((t) => t.name),
    );
    expect(realTowns.has(fictional.city)).toBe(false);
  }, 60000);
  it('keeps saves from fictional-country worlds valid: display names are not rules', () => {
    const world = generateWorld('identity-compat');
    const profile = world.pyramid!.profiles['country:0']!;
    profile.divisions[0]!.name = 'Aldoria Premier League';
    delete profile.divisions[0]!.reference;
    profile.adaptations = [
      'Fictional club identities and geography; sporting reference rules remain frozen.',
    ];
    world.countries['country:0']!.name = 'Aldoria';
    delete world.identityVersion;
    expect(() => validateWorld(clone(world))).not.toThrow();
  }, 60000);
});
