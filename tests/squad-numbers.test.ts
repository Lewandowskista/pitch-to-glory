import { beforeAll, describe, expect, it } from 'vitest';
import type { Player, World, WorldState } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { transferPlayer } from '../src/engine/world/transfers';
import { POSITIONS } from '../src/engine/world/catalog';
import { createRng } from '../src/engine/rng';
import {
  assignSquadNumbers,
  backfillSquadNumbers,
  joinSquad,
  pickSquadNumber,
  squadNumberProblems,
  squadNumbersFor,
} from '../src/engine/world/squadNumbers';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { careerInvariants } from '../src/engine/career/invariants';
import { applyMatchCommand, createMatchSession, createMatchSetup } from '../src/engine/match';
import { createSave, DEFAULT_SETTINGS, migrateSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const squad = (world: World, clubId: string): Player[] =>
  world.clubs[clubId]!.playerIds.map((id) => world.players[id]!);
const numbersOf = (world: World) =>
  Object.fromEntries(Object.values(world.players).map((player) => [player.id, player.squadNumber]));
/** The world as a save from before v21: no player wears a number. */
function withoutNumbers<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, entry: unknown) => (key === 'squadNumber' ? undefined : entry)),
  ) as T;
}

describe('squad number rules', () => {
  it('give keepers 1, 13 and 31, then the lowest free number', () => {
    expect(pickSquadNumber('GK', new Set())).toBe(1);
    expect(pickSquadNumber('GK', new Set([1]))).toBe(13);
    expect(pickSquadNumber('GK', new Set([1, 13]))).toBe(31);
    expect(pickSquadNumber('GK', new Set([1, 13, 31]))).toBe(2);
  });
  it('give outfield players their conventional number, then their line band, then any', () => {
    expect(pickSquadNumber('RB', new Set())).toBe(2);
    expect(pickSquadNumber('LB', new Set())).toBe(3);
    expect(pickSquadNumber('CB', new Set([4, 5]))).toBe(6);
    expect(pickSquadNumber('DM', new Set())).toBe(6);
    expect(pickSquadNumber('CM', new Set())).toBe(8);
    expect(pickSquadNumber('AM', new Set())).toBe(10);
    expect(pickSquadNumber('RW', new Set())).toBe(7);
    expect(pickSquadNumber('LW', new Set())).toBe(11);
    expect(pickSquadNumber('ST', new Set())).toBe(9);
    expect(pickSquadNumber('CB', new Set([4, 5, 6]))).toBe(14);
    expect(pickSquadNumber('DM', new Set([6]))).toBe(20);
    expect(pickSquadNumber('ST', new Set([9]))).toBe(25);
    const crowded = new Set([9, 25, 26, 27, 28, 29, 1, 2, 3]);
    expect(pickSquadNumber('ST', crowded)).toBe(4);
  });
  it('number youth-intake players from 30 and keep a free number on a move', () => {
    expect(pickSquadNumber('ST', new Set(), { youth: true })).toBe(30);
    expect(pickSquadNumber('GK', new Set([30]), { youth: true })).toBe(31);
    expect(pickSquadNumber('ST', new Set([9]), { keep: 23 })).toBe(23);
    expect(pickSquadNumber('ST', new Set([23]), { keep: 23 })).toBe(9);
    expect(pickSquadNumber('ST', new Set(), { keep: 0 })).toBe(9);
    expect(pickSquadNumber('ST', new Set(), { keep: 100 })).toBe(9);
  });
  it('number a generated squad conventionally, the holding midfielder before a third centre-back', () => {
    expect(squadNumbersFor(POSITIONS)).toEqual([
      1, 13, 4, 5, 16, 17, 3, 15, 2, 14, 6, 22, 8, 20, 21, 10, 11, 27, 7, 26, 9, 25,
    ]);
    // Youth-intake players claim after the seniors, from 30.
    expect(
      assignSquadNumbers([
        { id: 'youth:2027:club:0', primaryPosition: 'ST' },
        { id: 'player:1', primaryPosition: 'ST' },
      ]),
    ).toEqual([30, 9]);
  });
});

describe('squad numbers in generated worlds', () => {
  it.each(['legacy', 'national'] as const)(
    'are unique per club, keeper first, in the %s format',
    (format) => {
      const world = generateWorld(`numbers-${format}`, { format });
      expect(squadNumberProblems(world)).toEqual([]);
      for (const club of Object.values(world.clubs)) {
        const one = squad(world, club.id).find((player) => player.squadNumber === 1);
        expect(one?.primaryPosition).toBe('GK');
      }
      // Generation draws nothing for numbers: a second run is identical.
      expect(numbersOf(generateWorld(`numbers-${format}`, { format }))).toEqual(numbersOf(world));
      expect(() => validateWorld(world)).not.toThrow();
    },
  );
  it('give the career player a free number at the trial club', () => {
    const base = generateWorld('numbers-career', { format: 'legacy' });
    const club = trialOffers(base, 'country:0', 'numbers')[0]!;
    const world = createCareer(
      base,
      {
        name: 'Nico Number',
        avatar: {
          face: 1,
          skin: 2,
          hair: 3,
          hairColor: 4,
          facialHair: 0,
          eyebrows: 1,
          eyes: 2,
          accessory: 3,
        },
        nationalityId: 'country:0',
        position: 'ST',
        foot: 'right',
        age: 17,
        archetype: 'finisher',
      },
      club.id,
      'numbers',
    );
    const player = world.players[world.career!.playerId]!;
    // 9 and 25 are the strikers', 26 and 27 the wingers': the attack band's next number.
    expect(squad(base, club.id).map((p) => p.squadNumber)).toEqual(squadNumbersFor(POSITIONS));
    expect(player.squadNumber).toBe(28);
    expect(squadNumberProblems(world)).toEqual([]);
    expect(careerInvariants(world)).toEqual([]);
  });
});

describe('squad numbers on moves', () => {
  it('keep a transferred player’s number when it is free at the buyer, otherwise pick a free one', () => {
    const world = generateWorld('numbers-moves', { format: 'legacy' });
    const [seller, buyer] = Object.values(world.clubs);
    const rng = createRng('numbers-moves');
    const striker = squad(world, seller!.id).find((player) => player.squadNumber === 9)!;
    striker.squadNumber = 77;
    transferPlayer(world, striker, seller!, buyer!, 0, rng);
    expect(striker.squadNumber).toBe(77);
    const keeper = squad(world, seller!.id).find((player) => player.squadNumber === 1)!;
    transferPlayer(world, keeper, seller!, buyer!, 0, rng);
    // 1 and 13 are worn at the buyer: the third keeper's number.
    expect(keeper.squadNumber).toBe(31);
    expect(squadNumberProblems(world)).toEqual([]);
    // Joining again changes nothing: his own number never counts as taken.
    joinSquad(world, keeper, buyer!);
    expect(keeper.squadNumber).toBe(31);
  });
});

describe('squad numbers across simulated seasons', () => {
  let world: World;
  const moves = { transfer: 0, signing: 0, 'youth-intake': 0 } as Record<string, number>;
  beforeAll(() => {
    world = generateWorld('numbers-seasons', { format: 'legacy' });
    for (let season = 0; season < 2; season++) {
      const weeks = world.season.end.week;
      for (let week = 0; week < weeks; week++) {
        world = simulateWeek(world);
        expect(squadNumberProblems(world)).toEqual([]);
      }
      for (const event of world.events) if (event.kind in moves) moves[event.kind]!++;
      world = startNextSeason(world);
      expect(squadNumberProblems(world)).toEqual([]);
    }
  }, 240000);
  it('stay unique per club through transfers, signings and youth intakes', () => {
    expect(moves.transfer).toBeGreaterThan(0);
    expect(moves.signing).toBeGreaterThan(0);
    expect(moves['youth-intake']).toBeGreaterThan(0);
    expect(squadNumberProblems(world)).toEqual([]);
    // Academy graduates still at their academy start at 30.
    const graduates = Object.values(world.players).filter(
      (player) =>
        player.id.startsWith('youth:') && player.clubId && player.id.includes(`:${player.clubId}:`),
    );
    expect(graduates.length).toBeGreaterThan(0);
    for (const player of graduates) expect(player.squadNumber).toBeGreaterThanOrEqual(30);
  });
  it('backfill deterministically to valid numbers, keeping numbers already worn', () => {
    const first = withoutNumbers(world);
    const second = withoutNumbers(world);
    backfillSquadNumbers(first);
    backfillSquadNumbers(second);
    expect(numbersOf(first)).toEqual(numbersOf(second));
    expect(squadNumberProblems(first)).toEqual([]);
    expect(() => validateWorld(first)).not.toThrow();
    const kept = clone(world);
    backfillSquadNumbers(kept);
    expect(kept).toEqual(world);
    // A fresh world backfills to exactly the numbers generation gives it.
    const fresh = generateWorld('numbers-fresh', { format: 'legacy' });
    const stripped = withoutNumbers(fresh);
    backfillSquadNumbers(stripped);
    expect(stripped).toEqual(fresh);
  });
});

describe('schema 21 migration', () => {
  const settings = DEFAULT_SETTINGS;
  it.each(['legacy', 'national'] as const)('backfills a v20 %s world', (format) => {
    const world = generateWorld(`migrate-${format}`, { format });
    const state: WorldState = {
      kind: 'world',
      world,
      gallery: { seed: 'migrate', generation: 0 },
      settings,
    };
    const v20 = { ...withoutNumbers(createSave(1, 'Old', state)), schemaVersion: 20 };
    if (v20.payload.kind !== 'world') throw new Error('Expected world');
    expect(Object.values(v20.payload.world.players)[0]).not.toHaveProperty('squadNumber');
    const migrated = migrateSave(clone(v20));
    expect(migrated.schemaVersion).toBe(21);
    if (migrated.payload.kind !== 'world') throw new Error('Expected world');
    expect(squadNumberProblems(migrated.payload.world)).toEqual([]);
    // The same rules as generation, so an untouched world gets the numbers it would have had.
    expect(migrated.payload.world).toEqual(world);
    const again = migrateSave(clone(v20));
    if (again.payload.kind !== 'world') throw new Error('Expected world');
    expect(numbersOf(again.payload.world)).toEqual(numbersOf(migrated.payload.world));
  });
  it('keeps an in-progress match session, its squads numbered like the world', () => {
    const world = generateWorld('migrate-match', { format: 'legacy' });
    const [home, away] = Object.values(world.clubs);
    const setup = createMatchSetup(world, home!.id, away!.id, home!.playerIds[0]!, 'migrate');
    const state: WorldState = {
      kind: 'world',
      world,
      gallery: { seed: 'migrate', generation: 0 },
      settings,
      matchSession: applyMatchCommand(
        createMatchSession(setup, { role: 'balanced', risk: 'balanced', mentality: 'balanced' }),
        { type: 'kickoff' },
      ),
    };
    const save = createSave(1, 'Matchday', state);
    expect(save.recovery).toBeUndefined();
    const v20 = { ...withoutNumbers(save), schemaVersion: 20 };
    const migrated = migrateSave(v20);
    expect(migrated.recovery).toBeUndefined();
    if (migrated.payload.kind !== 'world') throw new Error('Expected world');
    const session = migrated.payload.matchSession!;
    expect(session).toBeDefined();
    expect(session.state).toEqual(state.matchSession!.state);
    for (const id of [...home!.playerIds, ...away!.playerIds])
      expect(session.setup.players[id]!.squadNumber).toBe(world.players[id]!.squadNumber);
  });
});
