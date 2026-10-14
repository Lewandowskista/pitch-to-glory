/**
 * Squad numbers (redesign decision 2): real, per player, kept. Every rule here is pure and
 * draws nothing from an RNG, so assigning numbers never shifts a seeded stream and world
 * generation, simulation and match outcomes stay exactly as they were.
 *
 * - A keeper takes 1, then 13, then 31.
 * - Outfield players take their position's conventional numbers (2 RB, 3 LB, 4–6 CB, 6 DM,
 *   8 CM, 10 AM, 7 RW, 11 LW, 9 ST), then a number from their line's band (defence 14–19,
 *   midfield 20–24, attack 25–29).
 * - A youth-intake player starts at 30.
 * - Otherwise, and once those are taken, the lowest free number from 1 to 99.
 *
 * Numbers are unique within a club's current squad. A player who moves keeps his number when
 * it is free at the new club. Released and retired players keep their last number on record;
 * it only matters again if they sign somewhere.
 */
import type { Club, Player, Position, World } from '../../model/domain';

export const SQUAD_NUMBER_MIN = 1;
export const SQUAD_NUMBER_MAX = 99;
/** Where a youth-intake player's numbering starts. */
export const YOUTH_NUMBER_START = 30;

const CONVENTIONAL: Readonly<Record<Position, readonly number[]>> = {
  GK: [1, 13, 31],
  RB: [2],
  LB: [3],
  CB: [4, 5, 6],
  DM: [6],
  CM: [8],
  AM: [10],
  RW: [7],
  LW: [11],
  ST: [9],
};
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);
const DEFENCE = range(14, 19);
const MIDFIELD = range(20, 24);
const ATTACK = range(25, 29);
const BAND: Readonly<Record<Position, readonly number[]>> = {
  GK: [],
  RB: DEFENCE,
  LB: DEFENCE,
  CB: DEFENCE,
  DM: MIDFIELD,
  CM: MIDFIELD,
  AM: MIDFIELD,
  RW: ATTACK,
  LW: ATTACK,
  ST: ATTACK,
};
/**
 * Order in which a whole squad claims numbers: positions with one conventional number go
 * first, so a holding midfielder takes 6 before a third centre-back reaches for it.
 */
const CLAIM_ORDER: readonly Position[] = [
  'GK',
  'RB',
  'LB',
  'ST',
  'RW',
  'LW',
  'AM',
  'CM',
  'DM',
  'CB',
];

export function isSquadNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= SQUAD_NUMBER_MIN &&
    value <= SQUAD_NUMBER_MAX
  );
}
/** Youth-intake players are recognised by the id the intake gives them. */
export function isYouthIntake(id: string): boolean {
  return id.startsWith('youth:');
}

export interface SquadNumberOptions {
  /** The number the player already wears: kept when it is free. */
  keep?: number;
  /** A youth-intake player: numbered from 30 up. */
  youth?: boolean;
}
/** The number a player in `position` takes when `taken` are already worn. */
export function pickSquadNumber(
  position: Position,
  taken: ReadonlySet<number>,
  options: SquadNumberOptions = {},
): number {
  const free = (value: number | undefined): value is number =>
    isSquadNumber(value) && !taken.has(value);
  if (free(options.keep)) return options.keep;
  if (options.youth) {
    for (let value = YOUTH_NUMBER_START; value <= SQUAD_NUMBER_MAX; value++)
      if (free(value)) return value;
  }
  for (const value of CONVENTIONAL[position]) if (free(value)) return value;
  for (const value of BAND[position]) if (free(value)) return value;
  for (let value = SQUAD_NUMBER_MIN; value <= SQUAD_NUMBER_MAX; value++)
    if (free(value)) return value;
  // Rosters are validated to at most 40 players, so 99 numbers never run out.
  return SQUAD_NUMBER_MAX;
}

/**
 * Numbers for a whole squad at once (generation and the v21 backfill), in input order.
 * Senior players claim before youth-intake players, then by `CLAIM_ORDER`, then by their
 * place in the input, which for a club's `playerIds` is the order they joined.
 */
export function assignSquadNumbers(
  players: readonly Pick<Player, 'id' | 'primaryPosition'>[],
  taken: ReadonlySet<number> = new Set(),
): number[] {
  const worn = new Set(taken);
  const numbers: number[] = new Array<number>(players.length);
  const order = players
    .map((player, index) => ({ player, index, youth: isYouthIntake(player.id) }))
    .sort(
      (a, b) =>
        Number(a.youth) - Number(b.youth) ||
        CLAIM_ORDER.indexOf(a.player.primaryPosition) -
          CLAIM_ORDER.indexOf(b.player.primaryPosition) ||
        a.index - b.index,
    );
  for (const { player, index, youth } of order) {
    const value = pickSquadNumber(player.primaryPosition, worn, { youth });
    worn.add(value);
    numbers[index] = value;
  }
  return numbers;
}

/** Numbers for a newly generated senior squad listed by position (no youth-intake players). */
export function squadNumbersFor(positions: readonly Position[]): number[] {
  return assignSquadNumbers(
    positions.map((primaryPosition, index) => ({ id: `squad:${index}`, primaryPosition })),
  );
}

/** Numbers worn at `club`, leaving out `exceptId` (the player being numbered). */
export function takenSquadNumbers(world: World, club: Club, exceptId?: string): Set<number> {
  const taken = new Set<number>();
  for (const id of club.playerIds) {
    if (id === exceptId) continue;
    const value = world.players[id]?.squadNumber;
    if (isSquadNumber(value)) taken.add(value);
  }
  return taken;
}

/** The number a newcomer in `position` would take at `club` today. */
export function nextSquadNumber(
  world: World,
  club: Club,
  position: Position,
  options: SquadNumberOptions = {},
): number {
  return pickSquadNumber(position, takenSquadNumbers(world, club), options);
}

/**
 * Number a player who has just joined `club` (a transfer, loan, free signing or move): he
 * keeps his number when no team-mate wears it, otherwise he takes a free one.
 */
export function joinSquad(world: World, player: Player, club: Club): void {
  player.squadNumber = pickSquadNumber(
    player.primaryPosition,
    takenSquadNumbers(world, club, player.id),
    { keep: player.squadNumber },
  );
}

/**
 * Give every club's squad valid, unique numbers in place, keeping numbers already valid and
 * unique (the first wearer in squad order keeps a duplicate). Free agents and retired players
 * without a number get one as if for an empty squad. Used by the v21 save migration.
 */
export function backfillSquadNumbers(world: World): void {
  const players = world.players;
  const numbered = new Set<string>();
  for (const club of Object.values(world.clubs)) {
    const squad = club.playerIds
      .map((id) => players[id])
      .filter((player): player is Player => !!player && !numbered.has(player.id));
    const taken = new Set<number>();
    const missing: Player[] = [];
    for (const player of squad) {
      numbered.add(player.id);
      if (isSquadNumber(player.squadNumber) && !taken.has(player.squadNumber))
        taken.add(player.squadNumber);
      else missing.push(player);
    }
    assignSquadNumbers(missing, taken).forEach((value, index) => {
      missing[index]!.squadNumber = value;
    });
  }
  for (const player of Object.values(players))
    if (!numbered.has(player.id) && !isSquadNumber(player.squadNumber))
      player.squadNumber = pickSquadNumber(player.primaryPosition, new Set(), {
        youth: isYouthIntake(player.id),
      });
}

/** Clubs whose current squad has a missing, out-of-range or repeated number. */
export function squadNumberProblems(world: World): string[] {
  const problems: string[] = [];
  for (const club of Object.values(world.clubs)) {
    const seen = new Set<number>();
    for (const id of club.playerIds) {
      const value = world.players[id]?.squadNumber;
      if (!isSquadNumber(value) || seen.has(value)) {
        problems.push(club.id);
        break;
      }
      seen.add(value);
    }
  }
  return problems;
}
