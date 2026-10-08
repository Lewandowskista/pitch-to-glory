import type {
  Club,
  Contract,
  Fixture,
  GameDate,
  Id,
  Loan,
  Player,
  Position,
  World,
} from '../../../model/domain';
import { CONFIG } from '../../config';
import { createRng } from '../../rng';
import { playerAbility } from '../../strength';
import { effectiveAbility, available, selectLineup, slotFit } from '../../selection/lineup';
import { FORMATION_SLOTS, type Formation } from '../../selection/formations';
import { clubFormation, clubStarters, usesFormations } from '../../selection/world';
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
  const starters = clubStarters(world, club);
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

/** Where the career player stands for a place in the manager's eleven. */
export interface SlotCompetition {
  /** The manager's formation; null in a world still on line-based selection. */
  formation: Formation | null;
  inTeam: boolean;
  /** The slot the player fills, or the one they are closest to. */
  position: Position;
  /** Fit for that slot: 100 primary, familiarity for a secondary position. */
  fit: number;
  /** Players ahead of them for that slot (0 when in the team). */
  placesOutside: number;
  /** The teammates ahead for that slot, closest first (at most two). */
  aheadIds: Id[];
}
/**
 * The career player's competition for a place. With formations: picked in the eleven the
 * club would field, or else the slot with the fewest teammates ahead (valued in that slot,
 * so a familiar secondary position can be the way in). Before: the place in the line's
 * pecking order by ability.
 */
export function slotCompetition(world: World, club: Club, player: Player): SlotCompetition {
  if (!usesFormations(world)) {
    const slots = M.slots[lineOf(player.primaryPosition)];
    const rank = lineRank(world, club, player);
    return {
      formation: null,
      inTeam: rank < slots,
      position: player.primaryPosition,
      fit: 100,
      placesOutside: rank < slots ? 0 : rank - slots + 1,
      aheadIds: [],
    };
  }
  const formation = clubFormation(world, club);
  const lineup = selectLineup(club.playerIds, world.players, formation);
  const at = lineup.starterIds.indexOf(player.id);
  if (at >= 0)
    return {
      formation,
      inTeam: true,
      position: lineup.slots[at]!,
      fit: slotFit(player, lineup.slots[at]!),
      placesOutside: 0,
      aheadIds: [],
    };
  const keeper = player.primaryPosition === 'GK';
  const others = club.playerIds
    .map((id) => world.players[id])
    .filter(available)
    .filter((other) => other.id !== player.id && (other.primaryPosition === 'GK') === keeper);
  let best: SlotCompetition | null = null;
  FORMATION_SLOTS[formation].forEach((slot, index) => {
    if ((index === 0) !== keeper) return;
    const value = effectiveAbility(player, slot.position);
    const ahead = others
      .map((other) => ({ other, value: effectiveAbility(other, slot.position) }))
      .filter(
        (entry) => entry.value > value || (entry.value === value && entry.other.id < player.id),
      )
      .sort((a, b) => a.value - b.value || (a.other.id < b.other.id ? 1 : -1));
    const incumbent = lineup.starterIds[index];
    // The starter in the slot is ahead even when, valued here, they look weaker: they won it.
    const aheadIds = ahead.map((entry) => entry.other.id);
    if (incumbent && !aheadIds.includes(incumbent)) aheadIds.unshift(incumbent);
    const candidate: SlotCompetition = {
      formation,
      inTeam: false,
      position: slot.position,
      fit: slotFit(player, slot.position),
      placesOutside: Math.max(1, aheadIds.length),
      aheadIds: aheadIds.slice(0, 2),
    };
    if (!best || candidate.placesOutside < best.placesOutside) best = candidate;
  });
  return (
    best ?? {
      formation,
      inTeam: false,
      position: player.primaryPosition,
      fit: 100,
      placesOutside: M.selection.maximumPlacesOutside,
      aheadIds: [],
    }
  );
}

export type SelectionReasonKind =
  'role' | 'competition' | 'form' | 'trust' | 'fatigue' | 'limit' | 'registration';
/** One part of the selection chance, in probability points (null when it only gates). */
export interface SelectionReason {
  kind: SelectionReasonKind;
  contribution: number | null;
  /** The input behind it: the role promised, or the form, trust or fatigue value. */
  detail?: string | number;
}
export interface Selection {
  selected: boolean;
  probability: number;
  registered: boolean;
  competition: SlotCompetition;
  /** The parts of `probability`, in the order they are applied. */
  reasons: SelectionReason[];
}
/**
 * Whether the manager picks the career player for a fixture: a seeded draw against a
 * probability set by the role promised, the competition for a place, form, fatigue and the
 * manager's trust. A key-player promise all but guarantees a start. The reasons are the
 * same numbers the probability adds up, so explanations always match the calculation.
 */
export function careerSelection(world: World, fixture: Fixture): Selection {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const club = world.clubs[player.clubId!]!;
  const registered = compareDates(world.date, career.market.registeredFrom) >= 0;
  const S = M.selection;
  const role = currentRole(world);
  const competition = slotCompetition(world, club, player);
  const trust = managerTrust(world);
  const reasons: SelectionReason[] = [
    { kind: 'role', contribution: S.base[role], detail: role },
    {
      kind: 'competition',
      contribution: competition.inTeam
        ? S.inTeam
        : -S.perPlaceOutside * Math.min(S.maximumPlacesOutside, competition.placesOutside),
    },
    { kind: 'form', contribution: (player.form - 60) * S.form, detail: player.form },
    { kind: 'trust', contribution: (trust - 50) * S.trust, detail: trust },
    {
      kind: 'fatigue',
      contribution: player.fatigue > S.tiredFatigue ? -S.tired : 0,
      detail: player.fatigue,
    },
  ];
  const raw = reasons.reduce((sum, reason) => sum + reason.contribution!, 0);
  let probability = Math.max(S.minimum, Math.min(1, raw));
  if (role === 'key') probability = Math.max(probability, S.keyFloor);
  if (probability !== raw) reasons.push({ kind: 'limit', contribution: probability - raw });
  if (!registered) reasons.push({ kind: 'registration', contribution: null });
  const draw = createRng(`${world.seed}:selection:${fixture.id}`).next();
  return {
    selected: registered && draw < probability,
    probability,
    registered,
    competition,
    reasons,
  };
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
