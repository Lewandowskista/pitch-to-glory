import type {
  Club,
  ClubKits,
  Contract,
  GameDate,
  Manager,
  Personality,
  Player,
  Position,
  World,
  Tier,
} from '../../model/domain';
import { generateAvatar } from '../assets/avatar';
import { CREST_SHAPES, CREST_SYMBOLS, generateCrest } from '../assets/crest';
import { generateKits } from '../assets/kit';
import { generateAttributes } from '../ageing';
import { playerAbility } from '../strength';
import { withContrast } from '../assets/shared';
import { IDENTITIES, TownPicker, identityProfile, type ReferencedClub } from './identities';
import { startContinental } from './continental';
import { CONFIG } from '../config';
import { createRng, hashSeed, type Rng } from '../rng';
import {
  CLUB_SUFFIXES,
  COUNTRY_NAMES,
  FORMATIONS,
  POSITIONS,
  STYLES,
  cityName,
  clampAttribute,
  personName,
} from './catalog';
import { addCupRound, createLeagueFixtures, emptyStanding } from './schedule';
import { NATIONAL_PROFILES, germanRegionalZones } from './profiles';
import {
  nationalCityName,
  nationalClubName,
  nationalPersonName,
  nationalStadiumName,
} from './names';

const GEN = CONFIG.world.generation;
function within(rng: Rng, range: readonly [number, number]): number {
  return rng.int(...range);
}

function personality(rng: Rng): Personality {
  return {
    ambition: within(rng, GEN.personality),
    loyalty: within(rng, GEN.personality),
    temperament: within(rng, GEN.personality),
    sociability: within(rng, GEN.personality),
  };
}
export function generateManager(id: string, rng: Rng, countryIndex?: number): Manager {
  return {
    id,
    name: countryIndex === undefined ? personName(rng) : nationalPersonName(rng, countryIndex),
    age: within(rng, GEN.managerAge),
    avatar: generateAvatar(rng),
    personality: personality(rng),
    preferredFormation: rng.pick(FORMATIONS),
    ability: within(rng, GEN.managerAbility),
    formerPlayerId: null,
  };
}
export function generatePlayer(
  id: string,
  club: Club,
  position: Position,
  age: number,
  date: GameDate,
  rng: Rng,
): { player: Player; contract: Contract } {
  const nationalityIndex = club.identity
    ? rng.next() < 0.08
      ? rng.int(0, CONFIG.world.countries - 1)
      : Number(club.countryId.split(':')[1])
    : null;
  // Potential is the player's peak overall ability; attributes sit on the age curve toward it,
  // so generated worlds start at the same equilibrium the weekly development maintains.
  const potential = clampAttribute(
    club.reputation * GEN.peakReputationWeight +
      GEN.peakBase +
      rng.int(-GEN.talentSpread, GEN.talentSpread),
  );
  const { attributes, keeperAttributes } = generateAttributes(
    { id, primaryPosition: position, potential },
    age,
    rng,
  );
  const base = playerAbility({ primaryPosition: position, attributes, keeperAttributes });
  const contractId = `contract:${id}`;
  const weeklyWage = Math.max(
    GEN.wageFloor,
    Math.round(base * base * (GEN.wageBase + club.reputation / GEN.wageReputationDivisor)),
  );
  const contract: Contract = {
    id: contractId,
    playerId: id,
    clubId: club.id,
    start: { ...date },
    end: {
      season: date.season + within(rng, GEN.contractYears),
      week: club.identity ? CONFIG.world.nationalWeeksPerSeason : CONFIG.world.weeksPerSeason,
      day: 7,
    },
    weeklyWage,
    role: age < GEN.youngAge ? 'youth' : rng.pick(['key', 'rotation', 'backup'] as const),
    appearanceBonus: Math.round(weeklyWage * GEN.appearanceBonus),
    goalBonus: Math.round(weeklyWage * GEN.goalBonus),
    cleanSheetBonus: Math.round(weeklyWage * GEN.cleanSheetBonus),
    releaseClause: weeklyWage * GEN.releaseWageMultiplier,
    sellOnPercent: within(rng, GEN.sellOnPercent),
    loyaltyBonus: weeklyWage * GEN.loyaltyWageMultiplier,
  };
  const alternatives: Partial<Record<Position, Position[]>> = {
    CB: ['DM'],
    LB: ['LW', 'CB'],
    RB: ['RW', 'CB'],
    DM: ['CM', 'CB'],
    CM: ['AM', 'DM'],
    AM: ['CM', 'ST'],
    LW: ['RW', 'AM'],
    RW: ['LW', 'AM'],
    ST: ['AM'],
  };
  const player: Player = {
    id,
    name: nationalityIndex === null ? personName(rng) : nationalPersonName(rng, nationalityIndex),
    birthSeason: date.season - age,
    nationalityId: nationalityIndex === null ? club.countryId : `country:${nationalityIndex}`,
    clubId: club.id,
    avatar: generateAvatar(rng),
    foot: rng.pick(['left', 'right', 'right', 'both'] as const),
    primaryPosition: position,
    secondaryPositions: (alternatives[position] ?? []).map((position) => ({
      position,
      familiarity: within(rng, GEN.secondaryFamiliarity),
    })),
    attributes,
    keeperAttributes,
    hidden: {
      injuryProneness: rng.int(1, 99),
      bigMatchTemperament: rng.int(1, 99),
      consistency: rng.int(1, 99),
      professionalism: rng.int(1, 99),
      ambition: rng.int(1, 99),
      revealed: [],
    },
    potential,
    personality: personality(rng),
    contractId,
    traits: [],
    fitness: 100,
    fatigue: 0,
    morale: within(rng, GEN.morale),
    form: within(rng, GEN.form),
    injuryId: null,
    retired: false,
    stats: {
      appearances: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      ratingTotal: 0,
      trophies: [],
    },
  };
  return { player, contract };
}

/** Referenced clubs wear their real home-shirt pattern in their own colours. */
function referencedKits(kits: ClubKits, referenced: ReferencedClub | undefined): ClubKits {
  if (!referenced) return kits;
  return {
    ...kits,
    home: { ...kits.home, pattern: referenced.pattern, colors: [...referenced.colours] },
  };
}
export function generateWorld(
  seed: string,
  options: { format?: 'legacy' | 'national' } = {},
): World {
  const national = options.format !== 'legacy';
  const rng = createRng(seed);
  const year = CONFIG.world.startSeason;
  const date = { season: year, week: 1, day: 1 };
  const world: World = {
    ...(national
      ? {
          format: 'national-v1' as const,
          pyramid: {
            version: 1 as const,
            profiles: {},
            phases: {},
            ties: {},
            movements: [],
            stage: 'regular' as const,
            completedSteps: [],
            feederClubIds: [],
          },
        }
      : {}),
    developmentVersion: 2,
    ...(national ? { identityVersion: 2 as const } : {}),
    id: `world:${hashSeed(seed)}`,
    seed,
    rng: rng.snapshot(),
    date,
    phase: 'active',
    season: {
      year,
      start: { ...date },
      end: {
        season: year,
        week: national ? CONFIG.world.nationalWeeksPerSeason : CONFIG.world.weeksPerSeason,
        day: 7,
      },
      competitionIds: [],
      awardIds: [],
    },
    countries: {},
    leagues: {},
    clubs: {},
    managers: {},
    players: {},
    contracts: {},
    competitions: {},
    fixtures: {},
    matches: {},
    results: {},
    // New worlds keep complete competition statistics from their first fixture.
    seasonStats: { version: 1, season: year, competitions: {} },
    history: [],
    agents: {},
    scouting: [],
    offers: [],
    loans: [],
    negotiations: {},
    relationships: [],
    rivalries: [],
    dressingRooms: {},
    media: [],
    inbox: [],
    sponsorships: [],
    challenges: [],
    nationalTeams: {},
    callUps: [],
    awards: [],
    trophies: [],
    records: [],
    legacies: [],
    chronicle: [],
    moments: [],
    events: [],
  };
  const crestOffset = rng.int(0, CREST_SHAPES.length * CREST_SYMBOLS.length - 1);
  // National worlds number crests across countries so no shape/symbol pair repeats until
  // every pair has been used once; legacy worlds keep their original per-country stride.
  let crestSequence = 0;
  for (let countryIndex = 0; countryIndex < CONFIG.world.countries; countryIndex++) {
    const countryId = `country:${countryIndex}`;
    const cupId = `cup:${countryIndex}`;
    const identity = IDENTITIES[countryIndex]!;
    const profile = national
      ? identityProfile(NATIONAL_PROFILES[countryIndex]!, identity)
      : NATIONAL_PROFILES[countryIndex]!;
    const name = national ? identity.name : COUNTRY_NAMES[countryIndex]!;
    // Real towns for generated clubs; referenced clubs' home cities are never reused.
    const towns = new TownPicker(
      identity,
      seed,
      new Set(
        Object.values(identity.clubs)
          .flatMap((list) => list ?? [])
          .map((club) => club.city),
      ),
    );
    const referencedIds = new Map<string, string>();
    const country = {
      id: countryId,
      name,
      leagueIds: [] as string[],
      domesticCupId: cupId,
      nationalTeamIds: [],
      ...(national
        ? { counterpart: profile.counterpart, referenceSeason: profile.referenceSeason }
        : {}),
    };
    world.countries[countryId] = country;
    if (national)
      world.pyramid!.profiles[countryId] = JSON.parse(JSON.stringify(profile)) as typeof profile;
    const definitions = national
      ? profile.divisions.flatMap((division) =>
          division.groups.map((group, groupIndex) => ({
            tier: division.tier,
            size: group.size,
            division,
            group,
            groupIndex,
          })),
        )
      : Array.from({ length: CONFIG.world.tiers }, (_, index) => ({
          tier: (index + 1) as Tier,
          size: CONFIG.world.clubsPerLeague,
          division: null,
          group: null,
          groupIndex: 0,
        }));
    let nationalClubIndex = 0;
    for (const definition of definitions) {
      const { tier, size, division, group, groupIndex } = definition;
      const leagueId = `league:${countryIndex}:${tier}${groupIndex ? `:${groupIndex}` : ''}`;
      country.leagueIds.push(leagueId);
      world.season.competitionIds.push(leagueId);
      const clubIds: string[] = [];
      for (let index = 0; index < size; index++) {
        const clubIndex = national
          ? nationalClubIndex++
          : (tier - 1) * CONFIG.world.clubsPerLeague + index;
        const clubId = `club:${countryIndex}:${clubIndex}`;
        const scoped = rng.fork(clubId);
        const regions = profile.divisions.at(-1)!.groups;
        // National worlds: a referenced club from the identity data, or a real town.
        const referenced = national ? identity.clubs[tier]?.[index] : undefined;
        const town =
          national && !referenced
            ? towns.take(identity.groupRegions[tier]?.[groupIndex] ?? regions.map((r) => r.region))
            : null;
        const place = referenced
          ? {
              city: referenced.city,
              lat: referenced.lat,
              lon: referenced.lon,
              region: referenced.region,
            }
          : town
            ? { city: town.name, lat: town.lat, lon: town.lon, region: town.region }
            : null;
        const regionIndex =
          division?.tier === profile.divisions.at(-1)!.tier
            ? groupIndex
            : clubIndex % regions.length;
        const city = place
          ? place.city
          : national
            ? nationalCityName(countryIndex, clubIndex)
            : cityName(countryIndex, clubIndex);
        const crest = generateCrest(scoped);
        const crestIndex =
          (crestOffset + (national ? crestSequence++ : countryIndex * 32 + clubIndex)) %
          (CREST_SHAPES.length * CREST_SYMBOLS.length);
        crest.shape = crestIndex % CREST_SHAPES.length;
        crest.symbol = Math.floor(crestIndex / CREST_SHAPES.length);
        if (referenced)
          crest.colors = [
            referenced.colours[0],
            referenced.colours[1],
            withContrast(referenced.colours[2], referenced.colours[0]),
          ];
        else if (national)
          // The hashed symbol colour keeps recipes distinct; contrast keeps the symbol visible.
          crest.colors[2] = withContrast(
            `#${(((crestOffset + countryIndex * 10000 + clubIndex + 1) * 2654435761) >>> 0).toString(16).padStart(8, '0').slice(-6)}`,
            crest.colors[0],
          );
        const band = [
          Math.max(5, GEN.reputationFloor - tier * GEN.reputationTierStep),
          Math.max(15, GEN.reputationCeiling - tier * GEN.reputationTierStep),
        ] as const;
        // Referenced clubs sit in their tier's band by real stature; others are drawn at random.
        const reputation = referenced
          ? Math.max(
              band[0],
              Math.min(
                band[1],
                Math.round(band[0] + ((band[1] - band[0]) * (referenced.stature - 1)) / 9) +
                  scoped.int(-2, 2),
              ),
            )
          : scoped.int(band[0], band[1]);
        const club: Club = {
          id: clubId,
          name: referenced
            ? referenced.name
            : national
              ? nationalClubName(city, profile.counterpart)
              : `${city} ${scoped.pick(CLUB_SUFFIXES)}`,
          city,
          countryId,
          leagueId,
          crest,
          kits: referencedKits(generateKits(scoped, crest.colors), referenced),
          stadium: {
            id: `stadium:${clubId}`,
            name: referenced
              ? referenced.stadium
              : national
                ? nationalStadiumName(city, countryIndex)
                : `${city} Park`,
            capacity:
              referenced?.capacity ??
              within(scoped, GEN.stadiumCapacityFactor) *
                Math.round((reputation * reputation) / GEN.stadiumReputationDivisor),
            pitchQuality: within(scoped, GEN.pitchQuality),
          },
          reputation,
          finances: {
            balance: reputation * reputation * GEN.balanceFactor,
            weeklyIncome: reputation * reputation * GEN.incomeFactor,
            weeklyCosts: reputation * reputation * GEN.costsFactor,
            transferBudget: reputation * reputation * GEN.transferFactor,
            wageBudget: reputation * reputation * GEN.wageBudgetFactor,
          },
          youthFocus: within(scoped, GEN.cultureRange),
          playingStyle: scoped.pick(STYLES),
          culture: {
            youth: within(scoped, GEN.cultureRange),
            winNow: within(scoped, GEN.cultureRange),
            fanOwned: scoped.next() < GEN.fanOwnedChance,
            discipline: within(scoped, GEN.cultureRange),
            attacking: within(scoped, GEN.cultureRange),
          },
          managerId: `manager:${clubId}:initial`,
          playerIds: [],
          dressingRoomId: `dressing:${clubId}`,
          ...(national
            ? {
                identity: {
                  counterpart: profile.counterpart,
                  region: place?.region ?? regions[regionIndex]!.region,
                  latitude: place ? place.lat : 55 - regionIndex * 3 + scoped.next(),
                  longitude: place ? place.lon : -5 + regionIndex * 3 + scoped.next(),
                  status: division!.status,
                  reserveParentId: null,
                },
              }
            : {}),
        };
        world.clubs[clubId] = club;
        clubIds.push(clubId);
        if (referenced) referencedIds.set(referenced.name, clubId);
        world.managers[club.managerId] = generateManager(
          club.managerId,
          scoped,
          national ? countryIndex : undefined,
        );
        for (let playerIndex = 0; playerIndex < CONFIG.world.squadSize; playerIndex++) {
          const id = `player:${countryIndex}:${clubIndex}:${playerIndex}`;
          const age =
            playerIndex === CONFIG.world.squadSize - 1
              ? within(scoped, GEN.veteranAge)
              : within(scoped, GEN.adultAge);
          const { player, contract } = generatePlayer(
            id,
            club,
            POSITIONS[playerIndex]!,
            age,
            date,
            scoped,
          );
          world.players[id] = player;
          world.contracts[contract.id] = contract;
          club.playerIds.push(id);
        }
        world.dressingRooms[club.dressingRoomId] = {
          id: club.dressingRoomId,
          clubId,
          leaderIds: [club.playerIds[2]!],
          cliques: [],
          mood: GEN.roomMood,
        };
      }
      const fixtures = createLeagueFixtures(
        clubIds,
        leagueId,
        year,
        national ? { cycles: 2 } : undefined,
      );
      for (const fixture of fixtures) world.fixtures[fixture.id] = fixture;
      world.leagues[leagueId] = {
        id: leagueId,
        countryId,
        name: national
          ? `${division!.name}${division!.groups.length > 1 ? ` · ${group!.name}` : ''}`
          : `${name} ${['Premier League', 'Championship', 'League One', 'Regional League'][tier - 1]}`,
        tier,
        clubIds,
        fixtureIds: fixtures.map((fixture) => fixture.id),
        standings: clubIds.map(emptyStanding),
        promotionPlaces: national
          ? division!.automaticPromotion
          : tier > 1
            ? CONFIG.world.movementPlaces
            : 0,
        relegationPlaces: national
          ? division!.automaticRelegation
          : tier < 4
            ? CONFIG.world.movementPlaces
            : 0,
        ...(national
          ? {
              divisionId: division!.id,
              group: group!.name,
              region: group!.region,
              status: division!.status,
              capacity: size,
              rules: division!.rules,
              zones:
                profile.counterpart === 'Germany' && tier === 4
                  ? germanRegionalZones(group!.region, year)
                  : division!.zones.map((zone) => ({ ...zone })),
            }
          : {}),
      };
    }
    // Reserve teams in referenced tiers follow the real league; their parents are fixed.
    const usedParents = new Set<string>();
    if (national)
      for (const club of Object.values(identity.clubs).flatMap((list) => list ?? [])) {
        if (!club.reserveOf) continue;
        const reserve = world.clubs[referencedIds.get(club.name)!]!;
        const parentId = referencedIds.get(club.reserveOf)!;
        reserve.identity!.reserveParentId = parentId;
        // Same kits and colours as the first team; the home town is the real reserve ground.
        reserve.crest.colors = [...world.clubs[parentId]!.crest.colors];
        reserve.kits = structuredClone(world.clubs[parentId]!.kits);
        usedParents.add(parentId);
        for (const [playerIndex, id] of reserve.playerIds.entries())
          world.players[id]!.birthSeason = year - (18 + (playerIndex % 6));
      }
    if (national && profile.counterpart !== 'England') {
      const parents = world.leagues[country.leagueIds[0]!]!.clubIds;
      const reserveLeagues = country.leagueIds
        .map((id) => world.leagues[id]!)
        .filter((league) => !identity.clubs[league.tier])
        .filter((league) =>
          profile.counterpart === 'France'
            ? league.tier === 4
            : profile.counterpart === 'Germany'
              ? league.tier >= 3
              : profile.counterpart === 'Italy'
                ? league.tier === 3
                : league.tier >= 2,
        );
      for (const [index, league] of reserveLeagues.entries()) {
        const reserve = world.clubs[league.clubIds.at(-1)!]!;
        const candidates = parents
          .map((id) => world.clubs[id]!)
          .filter((club) => !usedParents.has(club.id));
        const parent =
          candidates.find((club) => club.identity!.region === reserve.identity!.region) ??
          candidates[index % candidates.length]!;
        usedParents.add(parent.id);
        reserve.identity!.reserveParentId = parent.id;
        reserve.name = `${parent.name} ${profile.counterpart === 'Germany' || profile.counterpart === 'France' ? 'II' : profile.counterpart === 'Italy' ? 'U23' : 'B'}`;
        reserve.city = parent.city;
        reserve.crest.colors = [...parent.crest.colors];
        reserve.kits = structuredClone(parent.kits);
        reserve.identity!.region = parent.identity!.region;
        reserve.identity!.latitude = parent.identity!.latitude;
        reserve.identity!.longitude = parent.identity!.longitude;
        reserve.stadium.name = nationalStadiumName(parent.city, countryIndex);
        for (const [playerIndex, id] of reserve.playerIds.entries())
          world.players[id]!.birthSeason = year - (18 + (playerIndex % 6));
      }
    }
    const cup = {
      id: cupId,
      name: national ? identity.cup.name : `${name} Cup`,
      kind: 'domestic' as const,
      format: 'knockout' as const,
      season: year,
      stages: [],
      winnerId: null,
      ...(national ? { countryId } : {}),
    };
    world.competitions[cupId] = cup;
    world.season.competitionIds.push(cupId);
    addCupRound(
      world,
      cup,
      country.leagueIds.flatMap((id) => world.leagues[id]!.clubIds),
    );
    if (national && profile.counterpart === 'Italy') {
      const cupId = `cup:${countryIndex}:serie-c`;
      const cup = {
        id: cupId,
        name: identity.tierCup?.name ?? `${name} Serie C Cup`,
        kind: 'domestic' as const,
        format: 'knockout' as const,
        season: year,
        stages: [],
        winnerId: null,
        countryId,
        divisionId: 'italy:3',
      };
      world.competitions[cupId] = cup;
      world.season.competitionIds.push(cupId);
      addCupRound(
        world,
        cup,
        country.leagueIds
          .filter((id) => world.leagues[id]!.tier === 3)
          .flatMap((id) => world.leagues[id]!.clubIds),
      );
    }
  }
  // Continental cups by reputation for a new national world (milestone 8).
  if (national) startContinental(world, false);
  world.rng = rng.snapshot();
  return world;
}
