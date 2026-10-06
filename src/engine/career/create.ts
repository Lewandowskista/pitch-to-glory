import type { Avatar, Career, Club, Foot, Id, Position, World } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng, hashSeed } from '../rng';
import {
  careerCap,
  isUntrained,
  positionalEmphasis,
  untrainedValue,
  ATTRIBUTE_KEYS,
  KEEPER_KEYS,
  type AnyAttribute,
} from '../ageing';
import { playerAbility } from '../strength';
import { generatePlayer } from '../world/generate';
import { refreshDressingRoom } from '../world/dressing';
import { getSeasonWeeks } from '../world/calendar';
import { ARCHETYPE_BY_ID } from './catalogue';
import { grantStartingSkill } from './progression';
import { defaultTrainingPlan } from './training';
import { initialMarket } from './market/records';
import { bonusesFor, marketWage } from './market/rules';
import { attachMarket } from './market/agents';
import { attachSocial, initialSocial } from './social/week';
import { attachLifestyle } from './lifestyle/week';
import { attachHonours, initialHonours } from './honours/week';
import { chronicle } from './honours/chronicle';
import { initialStyle } from './lifestyle/wardrobe';

const S = CONFIG.career.start;

export interface CareerDraft {
  name: string;
  avatar: Avatar;
  nationalityId: Id;
  position: Position;
  foot: Foot;
  age: number;
  archetype: string;
  /** Play as the child of a retired career player (milestone 8). */
  parentLegacyId?: string;
}

/**
 * Trial offers from semi-professional clubs at the bottom simulated tier of the player's
 * country, spread across regional groups where there are several.
 */
export function trialOffers(world: World, nationalityId: Id, seed: string): Club[] {
  const country = world.countries[nationalityId];
  if (!country) throw new Error('Unknown nationality');
  const leagues = country.leagueIds.map((id) => world.leagues[id]!);
  const bottom = Math.max(...leagues.map((league) => league.tier));
  const groups = leagues.filter((league) => league.tier === bottom);
  const rng = createRng(`${seed}:trials:${nationalityId}`);
  const offers: Club[] = [];
  const pools = groups.map((league) =>
    league.clubIds
      .map((id) => world.clubs[id]!)
      .filter((club) => !club.identity?.reserveParentId)
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  );
  for (let round = 0; offers.length < S.offers && round < 50; round++) {
    const pool = pools[round % pools.length]!.filter((club) => !offers.includes(club));
    if (pool.length) offers.push(rng.pick(pool));
  }
  return offers;
}

export function validateDraft(world: World, draft: CareerDraft): void {
  const archetype = ARCHETYPE_BY_ID[draft.archetype];
  const name = draft.name.trim();
  if (
    !archetype ||
    !name ||
    name.length > 40 ||
    !world.countries[draft.nationalityId] ||
    !Number.isInteger(draft.age) ||
    draft.age < S.ageRange[0] ||
    draft.age > S.ageRange[1] ||
    (archetype.family === 'keeper') !== (draft.position === 'GK') ||
    !['left', 'right', 'both'].includes(draft.foot) ||
    Object.values(draft.avatar).some((part) => !Number.isInteger(part) || part < 0 || part > 7)
  )
    throw new Error('Invalid career draft');
  if (draft.parentLegacyId !== undefined) {
    const parent = world.legacies.find((legacy) => legacy.id === draft.parentLegacyId);
    if (!parent || parent.childPlayerId || parent.nationalityId !== draft.nationalityId)
      throw new Error('Invalid career draft');
  }
}

/** Create the career player at a trial club and attach the career to a copy of the world. */
export function createCareer(input: World, draft: CareerDraft, clubId: Id, seed: string): World {
  if (input.career) throw new Error('This world already hosts a career');
  validateDraft(input, draft);
  const world = JSON.parse(JSON.stringify(input)) as World;
  const club = world.clubs[clubId];
  if (!club || !world.leagues[club.leagueId]) throw new Error('Invalid trial club');
  const rng = createRng(`${seed}:career:create`);
  const id = `career:${hashSeed(`${seed}:${draft.name}`)}`;
  if (world.players[id]) throw new Error('Career player already exists');
  const archetype = ARCHETYPE_BY_ID[draft.archetype]!;
  const { player, contract } = generatePlayer(id, club, draft.position, draft.age, world.date, rng);
  player.name = draft.name.trim();
  player.avatar = { ...draft.avatar };
  player.nationalityId = draft.nationalityId;
  player.foot = draft.foot;
  player.potential = rng.int(S.potential[0], S.potential[1]);
  // Start around the trial club's level, shaped by archetype and position.
  const squad = club.playerIds
    .map((pid) => world.players[pid]!)
    .filter((p) => (p.primaryPosition === 'GK') === (draft.position === 'GK'));
  const level = squad.reduce((sum, p) => sum + playerAbility(p), 0) / Math.max(1, squad.length);
  for (const key of [...ATTRIBUTE_KEYS, ...KEEPER_KEYS] as AnyAttribute[]) {
    const value = isUntrained(draft.position, key)
      ? untrainedValue(player, key)
      : Math.min(
          careerCap(player, key, draft.age),
          Math.round(
            level -
              S.belowClub +
              (archetype.emphasis[key] ?? 0) * S.emphasisScale +
              positionalEmphasis(draft.position, key) / 2 +
              rng.int(-S.noise, S.noise),
          ),
        );
    const bounded = Math.max(1, Math.min(99, value));
    if ((KEEPER_KEYS as readonly string[]).includes(key))
      player.keeperAttributes[key as (typeof KEEPER_KEYS)[number]] = bounded;
    else player.attributes[key as (typeof ATTRIBUTE_KEYS)[number]] = bounded;
  }
  player.form = 60;
  player.morale = 75;
  player.fitness = 100;
  player.fatigue = 0;
  // A trial earns a squad place: rotation, so the player is picked often enough to develop.
  // Terms are priced from the player's actual starting ability.
  contract.role = 'rotation';
  const terms = { weeklyWage: marketWage(club, player, 'rotation') };
  Object.assign(contract, terms, bonusesFor(terms.weeklyWage), {
    releaseClause: terms.weeklyWage * CONFIG.world.generation.releaseWageMultiplier,
  });
  contract.end = { season: world.date.season + 3, week: getSeasonWeeks(world), day: 7 };
  world.players[id] = player;
  world.contracts[contract.id] = contract;
  club.playerIds.push(id);
  refreshDressingRoom(world, club);
  const career: Career = {
    version: 1,
    playerId: id,
    archetype: archetype.id,
    startSeason: world.date.season,
    level: 1,
    xp: 0,
    attributePoints: 0,
    skillPoints: 0,
    skills: [],
    training: defaultTrainingPlan(draft.position),
    trainingProgress: {},
    lastTraining: null,
    injury: null,
    reinjury: null,
    fame: 0,
    matches: [],
    market: initialMarket(world),
    social: initialSocial(),
    style: initialStyle(player),
    honours: initialHonours(playerAbility(player), draft.parentLegacyId ?? null),
  };
  grantStartingSkill(career, player, archetype.startingSkill);
  world.career = career;
  attachMarket(world);
  attachSocial(world);
  attachLifestyle(world);
  attachHonours(world);
  // A former player's child: a famous surname, a little more talent, fame and money.
  const parent = draft.parentLegacyId
    ? world.legacies.find((legacy) => legacy.id === draft.parentLegacyId)
    : undefined;
  if (parent) {
    const K = CONFIG.career.honours.child;
    player.potential = Math.min(99, player.potential + K.potential);
    career.fame = Math.min(K.fameCap, Math.round(parent.fame * K.fameShare));
    const inheritance = Math.round(parent.savings * K.inheritance);
    career.market.finances.cash += inheritance;
    career.market.finances.lifetimeEarnings += inheritance;
    parent.childPlayerId = player.id;
  }
  chronicle(world, 'start', {
    club: club.name,
    age: draft.age,
    ...(parent ? { parent: parent.name } : {}),
  });
  return world;
}
