import type {
  Club,
  Contract,
  Fixture,
  GameDate,
  Loan,
  Player,
  Position,
  World,
} from '../../../model/domain';
import { CONFIG } from '../../config';
import { createRng } from '../../rng';
import { playerAbility, selectStartingPlayers } from '../../strength';
import { getSeasonWeeks } from '../../world/calendar';

/**
 * Pure market rules: transfer windows, market value, wages, the role a club can promise,
 * matchday selection against that promise, and the player's standing with agents.
 */
export const M = CONFIG.career.market;
export type Role = Contract['role'];
export type Line = keyof typeof M.slots;
export const ROLES: readonly Role[] = ['key', 'rotation', 'youth', 'backup'];
/** Higher is a stronger promise. Youth sits above backup: it carries a development promise. */
export const ROLE_RANK: Record<Role, number> = { key: 3, rotation: 2, youth: 1, backup: 0 };

const LINE: Record<Position, Line> = {
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
export const lineOf = (position: Position): Line => LINE[position];
export const money = (value: number): number => Math.max(0, Math.round(value));
/** Fees and clauses are quoted in round hundreds. */
export const fee = (value: number): number => Math.max(0, Math.round(value / 100) * 100);
export const ageOf = (world: World, player: Player): number =>
  world.date.season - player.birthSeason;

export function compareDates(a: GameDate, b: GameDate): number {
  return a.season - b.season || a.week - b.week || a.day - b.day;
}
export function addWeeks(world: World, date: GameDate, weeks: number): GameDate {
  const seasonWeeks = getSeasonWeeks(world);
  let season = date.season;
  let week = date.week + weeks;
  while (week > seasonWeeks) {
    week -= seasonWeeks;
    season++;
  }
  return { season, week, day: 1 };
}
export const today = (world: World): GameDate => ({ ...world.date });

/** The season's transfer windows as inclusive [first, last] weeks. */
export function transferWindows(world: World): [number, number][] {
  const weeks = getSeasonWeeks(world);
  return M.windows.map(([from, to]) => [
    Math.max(1, Math.floor(from * weeks) + 1),
    Math.max(1, Math.ceil(to * weeks)),
  ]);
}
export interface WindowState {
  open: boolean;
  /** Last week of the open window. */
  closes: number | null;
  /** First week of the next window this season, or null if none remains. */
  opens: number | null;
}
export function windowState(world: World, week = world.date.week): WindowState {
  const windows = transferWindows(world);
  const current = windows.find(([from, to]) => week >= from && week <= to);
  const next = windows.find(([from]) => from > week);
  return { open: Boolean(current), closes: current?.[1] ?? null, opens: next?.[0] ?? null };
}

export function activeLoan(world: World, playerId: string): Loan | undefined {
  return world.loans.find((loan) => loan.playerId === playerId);
}
export function careerContract(world: World): Contract {
  const player = world.players[world.career!.playerId]!;
  return world.contracts[player.contractId!]!;
}
/** The role that governs selection: the loan club's promise while on loan. */
export function currentRole(world: World): Role {
  const career = world.career!;
  return activeLoan(world, career.playerId)?.role ?? careerContract(world).role;
}
/** Seasons left after the current one. */
export function yearsLeft(world: World, contract: Contract): number {
  return Math.max(0, contract.end.season - world.date.season);
}

/** Mean ability of a club's strongest eleven. */
export function clubLevel(world: World, club: Club): number {
  const starters = selectStartingPlayers(club.playerIds.map((id) => world.players[id]!));
  return starters.reduce((sum, p) => sum + playerAbility(p), 0) / Math.max(1, starters.length);
}
/** Ability plus a share of a young player's remaining upside, as clubs project it. */
export function projectedAbility(world: World, player: Player): number {
  const ability = playerAbility(player);
  if (ageOf(world, player) > M.youngAge) return ability;
  return (
    ability +
    Math.min(
      M.scouting.projectedCap,
      Math.max(0, player.potential - ability) * M.scouting.projectedUpside,
    )
  );
}

export function marketValue(world: World, player: Player): number {
  const ability = playerAbility(player);
  const age = ageOf(world, player);
  const gap = Math.max(0, player.potential - ability);
  const ageFactor =
    age <= M.youngAge
      ? Math.min(M.youthCap, 1 + gap * M.youthUpside)
      : age < M.peakAge
        ? 1 + gap * M.primeUpside
        : age <= 30
          ? M.peakFactor
          : Math.max(M.minimumAgeFactor, M.peakFactor - M.veteranStep * (age - 30));
  const contract = player.contractId ? world.contracts[player.contractId] : undefined;
  const left = contract ? Math.min(2, yearsLeft(world, contract)) : 2;
  return fee(
    M.valueAtAbility *
      Math.exp(M.valueSlope * (ability - M.referenceAbility)) *
      ageFactor *
      M.contractFactor[left]!,
  );
}

/** Weekly wage a club pays for this ability and role (the generation formula, by role). */
export function marketWage(club: Club, player: Player, role: Role): number {
  const G = CONFIG.world.generation;
  const ability = playerAbility(player);
  return Math.max(
    G.wageFloor,
    Math.round(
      ability *
        ability *
        (G.wageBase + club.reputation / G.wageReputationDivisor) *
        M.roleWage[role],
    ),
  );
}
export function bonusesFor(weeklyWage: number) {
  const G = CONFIG.world.generation;
  return {
    appearanceBonus: Math.round(weeklyWage * G.appearanceBonus),
    goalBonus: Math.round(weeklyWage * G.goalBonus),
    cleanSheetBonus: Math.round(weeklyWage * G.cleanSheetBonus),
    loyaltyBonus: weeklyWage * G.loyaltyWageMultiplier,
  };
}

/** Teammates in the player's line who are better than them: their place in the pecking order. */
export function lineRank(world: World, club: Club, player: Player): number {
  const line = lineOf(player.primaryPosition);
  const ability = playerAbility(player);
  return club.playerIds.filter((id) => {
    if (id === player.id) return false;
    const other = world.players[id]!;
    return (
      lineOf(other.primaryPosition) === line &&
      !other.injuryId &&
      (playerAbility(other) > ability || (playerAbility(other) === ability && other.id < player.id))
    );
  }).length;
}
/** The squad role a club can honestly promise, from where the player would rank. */
export function deservedRole(world: World, club: Club, player: Player): Role {
  const slots = M.slots[lineOf(player.primaryPosition)];
  const rank = lineRank(world, club, player);
  const young = ageOf(world, player) <= M.youngAge - 1;
  if (slots === 1) return rank === 0 ? 'key' : young ? 'youth' : 'backup';
  if (rank < slots - 1) return 'key';
  if (rank < slots + 1) return 'rotation';
  return young ? 'youth' : 'backup';
}

export function relationshipValue(
  world: World,
  kind: 'manager' | 'fans',
  targetId: string,
): number {
  const career = world.career!;
  return (
    world.relationships.find(
      (r) => r.sourceId === career.playerId && r.kind === kind && r.targetId === targetId,
    )?.value ?? (kind === 'manager' ? M.relationships.newManager : M.relationships.fans)
  );
}
export function managerTrust(world: World): number {
  const player = world.players[world.career!.playerId]!;
  const club = world.clubs[player.clubId!]!;
  return relationshipValue(world, 'manager', club.managerId);
}

export interface Selection {
  selected: boolean;
  probability: number;
  registered: boolean;
}
/**
 * Whether the manager picks the career player for a fixture: a seeded draw against a
 * probability set by the role promised, the player's place in the pecking order, form,
 * fatigue and the manager's trust. A key-player promise all but guarantees a start.
 */
export function careerSelection(world: World, fixture: Fixture): Selection {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const club = world.clubs[player.clubId!]!;
  const registered = compareDates(world.date, career.market.registeredFrom) >= 0;
  const S = M.selection;
  const role = currentRole(world);
  const slots = M.slots[lineOf(player.primaryPosition)];
  const rank = lineRank(world, club, player);
  let probability =
    S.base[role] +
    (rank < slots
      ? S.inTeam
      : -S.perPlaceOutside * Math.min(S.maximumPlacesOutside, rank - slots + 1)) +
    (player.form - 60) * S.form +
    (managerTrust(world) - 50) * S.trust -
    (player.fatigue > S.tiredFatigue ? S.tired : 0);
  probability = Math.max(S.minimum, Math.min(1, probability));
  if (role === 'key') probability = Math.max(probability, S.keyFloor);
  const draw = createRng(`${world.seed}:selection:${fixture.id}`).next();
  return { selected: registered && draw < probability, probability, registered };
}

/** How seriously agents take the player: ability, club stature and fame. */
export function careerStanding(world: World): number {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  const S = M.standing;
  return Math.round(
    Math.min(
      99,
      playerAbility(player) * S.ability +
        (club?.reputation ?? 0) * S.reputation +
        Math.min(S.fameCap, career.fame / S.fameDivisor),
    ),
  );
}

/** The player's recent average rating, or a neutral value without recent matches. */
export function recentRating(world: World): { rating: number; matches: number } {
  const S = M.scouting;
  const seasonWeeks = getSeasonWeeks(world);
  const now = world.date.season * seasonWeeks + world.date.week;
  const recent = world
    .career!.matches.filter((m) => now - (m.season * seasonWeeks + m.week) <= S.recentWeeks)
    .slice(-S.recentMatches);
  if (!recent.length) return { rating: S.neutralRating, matches: 0 };
  return {
    rating: recent.reduce((sum, m) => sum + m.rating, 0) / recent.length,
    matches: recent.length,
  };
}
