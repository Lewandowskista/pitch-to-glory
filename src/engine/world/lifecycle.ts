import type { ArchivedPlayer, Club, Contract, Player, Position, World } from '../../model/domain';
import { CONFIG } from '../config';
import { createRng, type Rng } from '../rng';
import { getSeasonWeeks } from './calendar';
import { recordEvent } from './events';
import { generatePlayer } from './generate';
import { playerAbility } from '../strength';
import { isActiveClub, refreshDressingRoom } from './dressing';

/**
 * Squad lifecycle for AI clubs: retirement, contract renewal or release, academy intake,
 * squad trimming and free-agent signings, plus archiving of retired people. Every club in
 * a simulated league is processed; clubs below the simulated frontier are dormant and keep
 * their squads untouched until they are admitted again.
 */
const L = CONFIG.world.lifecycle;
const GEN = CONFIG.world.generation;
type Group = 'GK' | 'DEF' | 'MID' | 'ATT';
const GROUPS: readonly Group[] = ['GK', 'DEF', 'MID', 'ATT'];
const GROUP: Record<Position, Group> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};
/** Shape of a generated 22-player squad, used to choose positions for new arrivals. */
const TEMPLATE: Record<Position, number> = {
  GK: 2,
  CB: 4,
  LB: 2,
  RB: 2,
  DM: 2,
  CM: 3,
  AM: 1,
  LW: 2,
  RW: 2,
  ST: 2,
};
const TEMPLATE_POSITIONS = Object.keys(TEMPLATE) as Position[];
const groupTemplate = (group: Group) =>
  TEMPLATE_POSITIONS.filter((position) => GROUP[position] === group).reduce(
    (sum, position) => sum + TEMPLATE[position],
    0,
  );

export { isActiveClub, refreshDressingRoom } from './dressing';
const ageOf = (world: World, player: Player) => world.date.season - player.birthSeason;
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function retirementProbability(age: number): number {
  if (age >= L.forcedRetirementAge) return 1;
  let probability = 0;
  for (const [threshold, chance] of L.retirementCurve) if (age >= threshold) probability = chance;
  return probability;
}
/** How much a club values keeping a player: ability, youthful upside and age. */
function squadValue(world: World, player: Player): number {
  const age = ageOf(world, player);
  const ability = playerAbility(player);
  return (
    ability +
    (age < L.youngAge ? Math.max(0, player.potential - ability) * L.potentialValueWeight : 0) -
    (age > L.veteranAge ? (age - L.veteranAge) * L.agedValuePenalty : 0)
  );
}
function rankByValue(world: World, players: Player[]): Player[] {
  const values = new Map(players.map((player) => [player.id, squadValue(world, player)]));
  return [...players].sort((a, b) => values.get(b.id)! - values.get(a.id)! || byId(a, b));
}
function roster(world: World, club: Club): Player[] {
  return club.playerIds.map((id) => world.players[id]!);
}
function groupCounts(world: World, club: Club): Record<Group, number> {
  const counts: Record<Group, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const player of roster(world, club)) counts[GROUP[player.primaryPosition]]++;
  return counts;
}
/** The position furthest below the template, optionally within one group. */
function neededPosition(world: World, club: Club, group?: Group): Position {
  const counts = new Map<Position, number>();
  for (const player of roster(world, club))
    counts.set(player.primaryPosition, (counts.get(player.primaryPosition) ?? 0) + 1);
  let best: Position = group ? TEMPLATE_POSITIONS.find((p) => GROUP[p] === group)! : 'CB';
  let deficit = -Infinity;
  for (const position of TEMPLATE_POSITIONS) {
    if (group && GROUP[position] !== group) continue;
    if (!group && position === 'GK' && (counts.get('GK') ?? 0) >= TEMPLATE.GK) continue;
    const gap = TEMPLATE[position] - (counts.get(position) ?? 0);
    if (gap > deficit) {
      deficit = gap;
      best = position;
    }
  }
  return best;
}
function contractYears(age: number, rng: Rng): number {
  const range =
    age < L.youngAge
      ? L.contractYears.young
      : age >= L.veteranAge
        ? L.contractYears.veteran
        : L.contractYears.prime;
  return rng.int(range[0], range[1]);
}
function role(world: World, rank: number, player: Player): Contract['role'] {
  return ageOf(world, player) < GEN.youngAge
    ? 'youth'
    : rank < 11
      ? 'key'
      : rank < 18
        ? 'rotation'
        : 'backup';
}
/** Fresh terms for a player at a club, priced from current ability and club stature. */
function terms(
  world: World,
  club: Club,
  player: Player,
  contract: Pick<Contract, 'id' | 'role'>,
  rng: Rng,
): Contract {
  const ability = playerAbility(player);
  const weeklyWage = Math.max(
    GEN.wageFloor,
    Math.round(ability * ability * (GEN.wageBase + club.reputation / GEN.wageReputationDivisor)),
  );
  return {
    id: contract.id,
    playerId: player.id,
    clubId: club.id,
    start: { ...world.date },
    end: {
      season: world.date.season + contractYears(ageOf(world, player), rng),
      week: getSeasonWeeks(world),
      day: 7,
    },
    weeklyWage,
    role: contract.role,
    appearanceBonus: Math.round(weeklyWage * GEN.appearanceBonus),
    goalBonus: Math.round(weeklyWage * GEN.goalBonus),
    cleanSheetBonus: Math.round(weeklyWage * GEN.cleanSheetBonus),
    releaseClause: weeklyWage * GEN.releaseWageMultiplier,
    sellOnPercent: rng.int(...GEN.sellOnPercent),
    loyaltyBonus: weeklyWage * GEN.loyaltyWageMultiplier,
  };
}
function detach(world: World, player: Player, club: Club | null): void {
  if (player.contractId) delete world.contracts[player.contractId];
  player.contractId = null;
  player.clubId = null;
  if (club) club.playerIds = club.playerIds.filter((id) => id !== player.id);
}
export function retirePlayer(world: World, player: Player, club: Club | null): void {
  const age = ageOf(world, player);
  detach(world, player, club);
  player.retired = true;
  delete player.releasedSeason;
  recordEvent(world, 'retirement', club ? [player.id, club.id] : [player.id], {
    name: player.name,
    club: club?.name ?? '',
    age,
  });
}
function releasePlayer(world: World, player: Player, club: Club): void {
  detach(world, player, club);
  player.releasedSeason = world.date.season;
  recordEvent(world, 'release', [player.id, club.id], { name: player.name, club: club.name });
}
function signPlayer(world: World, player: Player, club: Club, rng: Rng): void {
  player.clubId = club.id;
  delete player.releasedSeason;
  const contract = terms(
    world,
    club,
    player,
    {
      id: `contract:${player.id}:${world.date.season}:${world.date.week}`,
      role: role(world, club.playerIds.length, player),
    },
    rng,
  );
  world.contracts[contract.id] = contract;
  player.contractId = contract.id;
  club.playerIds.push(player.id);
  recordEvent(world, 'signing', [player.id, club.id], { name: player.name, club: club.name });
}
function addGenerated(
  world: World,
  club: Club,
  position: Position,
  age: number,
  id: string,
  rng: Rng,
): Player {
  const { player, contract } = generatePlayer(id, club, position, age, world.date, rng);
  world.players[id] = player;
  world.contracts[contract.id] = contract;
  club.playerIds.push(id);
  return player;
}
/** Annual review at the intake week: retirements, contracts, academy, trimming, signings. */
export function seasonalSquadReview(world: World, rng: Rng): void {
  const season = world.date.season;
  // Unattached players drift out of professional football if nobody signs them.
  for (const player of Object.values(world.players)) {
    if (player.retired || player.clubId) continue;
    const age = ageOf(world, player);
    const roll = rng.next();
    const unsigned = season - (player.releasedSeason ?? season - 1);
    if (
      roll < retirementProbability(age) ||
      (unsigned >= 1 && age >= L.freeAgentRetirementAge) ||
      unsigned >= L.freeAgentSeasons
    )
      retirePlayer(world, player, null);
  }
  // The career player retires, renews and leaves only through their own decisions.
  const careerId = world.career?.playerId;
  for (const club of Object.values(world.clubs)) {
    if (!isActiveClub(world, club)) continue;
    for (const player of roster(world, club))
      if (rng.next() < retirementProbability(ageOf(world, player)) && player.id !== careerId)
        retirePlayer(world, player, club);
    const ranked = rankByValue(world, roster(world, club));
    for (const [rank, player] of ranked.entries()) {
      if (player.id === careerId) continue;
      const contract = world.contracts[player.contractId!]!;
      if (contract.end.season > season) continue;
      const age = ageOf(world, player);
      if ((rank < L.renewalRank || age <= L.renewalYouthAge) && age <= L.renewalMaximumAge)
        world.contracts[contract.id] = terms(
          world,
          club,
          player,
          { id: contract.id, role: role(world, rank, player) },
          rng,
        );
      else releasePlayer(world, player, club);
    }
    for (let index = 0; index < CONFIG.world.youthIntakePerClub; index++) {
      const player = addGenerated(
        world,
        club,
        neededPosition(world, club),
        rng.int(...GEN.youthAge),
        `youth:${season}:${club.id}:${index}`,
        rng,
      );
      recordEvent(world, 'youth-intake', [player.id, club.id], {
        name: player.name,
        club: club.name,
        position: player.primaryPosition,
      });
    }
    // Trim the weakest surplus players while keeping every positional group viable.
    const counts = groupCounts(world, club);
    for (const player of rankByValue(world, roster(world, club)).reverse()) {
      if (club.playerIds.length <= L.squadMaximum) break;
      if (player.id === careerId) continue;
      const group = GROUP[player.primaryPosition];
      if (counts[group] <= L.groupMinimum[group]) continue;
      counts[group]--;
      releasePlayer(world, player, club);
    }
    refreshDressingRoom(world, club);
  }
  fillSquads(world, rng);
}

/**
 * Clubs below their target or a positional minimum sign the best free agent they can
 * attract. Stronger clubs choose first. When nobody suitable is available for a minimum,
 * a trialist is generated so every club can always field a valid squad.
 */
export function fillSquads(world: World, rng: Rng): void {
  const pool = new Map<Group, Player[]>(GROUPS.map((group) => [group, []]));
  for (const player of Object.values(world.players))
    if (!player.retired && !player.clubId) pool.get(GROUP[player.primaryPosition])!.push(player);
  const abilities = new Map<string, number>();
  for (const players of pool.values()) {
    for (const player of players) abilities.set(player.id, playerAbility(player));
    players.sort((a, b) => abilities.get(b.id)! - abilities.get(a.id)! || byId(a, b));
  }
  const taken = new Set<string>();
  const clubs = Object.values(world.clubs)
    .filter((club) => isActiveClub(world, club))
    .sort((a, b) => b.reputation - a.reputation || byId(a, b));
  let generated = 0;
  for (const club of clubs) {
    const level =
      roster(world, club)
        .map(playerAbility)
        .sort((a, b) => b - a)
        .slice(0, 11)
        .reduce((sum, value, _, list) => sum + value / list.length, 0) + L.signingAbilityMargin;
    let changed = false;
    for (;;) {
      const counts = groupCounts(world, club);
      const short = GROUPS.find((group) => counts[group] < L.groupMinimum[group]);
      const group =
        short ??
        (club.playerIds.length < L.squadTarget
          ? [...GROUPS]
              .filter((g) => g !== 'GK')
              .sort((a, b) => counts[a] / groupTemplate(a) - counts[b] / groupTemplate(b))[0]!
          : undefined);
      if (!group) break;
      const candidate = pool
        .get(group)!
        .find((player) => !taken.has(player.id) && abilities.get(player.id)! <= level);
      if (candidate) {
        taken.add(candidate.id);
        signPlayer(world, candidate, club, rng);
      } else if (short) {
        const player = addGenerated(
          world,
          club,
          neededPosition(world, club, short),
          rng.int(...L.fillerAge),
          `trialist:${world.date.season}:${world.date.week}:${club.id}:${generated++}`,
          rng,
        );
        recordEvent(world, 'signing', [player.id, club.id], {
          name: player.name,
          club: club.name,
        });
      } else break;
      changed = true;
    }
    if (changed) refreshDressingRoom(world, club);
  }
}

/** A club returning from below the simulated frontier refreshes ageing players and terms. */
export function refreshReturningClub(world: World, club: Club): void {
  const rng = createRng(`${world.seed}:readmission:${world.date.season}:${club.id}`);
  for (const [index, player] of roster(world, club).entries()) {
    if (player.id === world.career?.playerId) continue;
    if (ageOf(world, player) >= L.readmissionRetirementAge) {
      const position = player.primaryPosition;
      retirePlayer(world, player, club);
      addGenerated(
        world,
        club,
        position,
        rng.int(...L.fillerAge),
        `returning:${world.date.season}:${club.id}:${index}`,
        rng,
      );
      continue;
    }
    const contract = world.contracts[player.contractId!]!;
    if (contract.end.season < world.date.season)
      world.contracts[contract.id] = terms(
        world,
        club,
        player,
        { id: contract.id, role: contract.role },
        rng,
      );
  }
  refreshDressingRoom(world, club);
}

/**
 * Season rollover housekeeping: retired people become compact archive records, events
 * older than the kept window are dropped and managers no club employs are removed.
 * Without this the save grew ~15 MiB per season and exceeded the import limit by season 3.
 */
export function archiveAndPrune(world: World, completedSeason: number): void {
  const archive = (world.archive ??= { players: {} });
  for (const player of Object.values(world.players)) {
    if (!player.retired) continue;
    const record: ArchivedPlayer = {
      id: player.id,
      name: player.name,
      birthSeason: player.birthSeason,
      nationalityId: player.nationalityId,
      primaryPosition: player.primaryPosition,
      avatar: { ...player.avatar },
      retiredSeason: completedSeason,
      stats: {
        appearances: player.stats.appearances,
        minutes: player.stats.minutes,
        goals: player.stats.goals,
        assists: player.stats.assists,
        cleanSheets: player.stats.cleanSheets,
      },
    };
    archive.players[player.id] = record;
    delete world.players[player.id];
  }
  const oldest = completedSeason + 2 - L.eventSeasonsKept;
  world.events = world.events.filter((event) => event.date.season >= oldest);
  const employed = new Set(Object.values(world.clubs).map((club) => club.managerId));
  for (const id of Object.keys(world.managers)) if (!employed.has(id)) delete world.managers[id];
}
