import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { startNextSeason } from '../src/engine/world/simulate';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  applyMarketAction,
  careerContract,
  makeLoanOffer,
  transferWindows,
} from '../src/engine/career/market';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalCareer } from './support/world';

/**
 * The market across a whole national season, from a choice made in its first week (the slow
 * project: each test plays a 60-week season of the full national world).
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const player = (world: World) => world.players[world.career!.playerId]!;
const own = (world: World) => world.clubs[player(world).clubId!]!;
function playSeason(input: World): World {
  let world = input;
  while (world.phase === 'active')
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  return world;
}

describe('the market over a national season', () => {
  it('a loan ends at the season rollover', () => {
    const world = nationalCareer();
    const parentId = own(world).id;
    const destination = Object.values(world.clubs).find(
      (club) =>
        club.countryId === own(world).countryId &&
        club.id !== parentId &&
        club.leagueId === own(world).leagueId,
    )!;
    const offer = makeLoanOffer(world, destination);
    const loaned = applyMarketAction(world, { type: 'accept', offerId: offer.id }).world;
    const done = playSeason(loaned);
    expect(player(done).clubId).toBe(destination.id);
    const next = startNextSeason(done);
    expect(next.loans).toHaveLength(0);
    expect(player(next).clubId).toBe(parentId);
    expect(careerContract(next).clubId).toBe(parentId);
    expect(next.career!.market.moves.map((move) => move.kind)).toContain('loan-return');
    valid(next);
  }, 300000);

  it('makes offers for an outstanding player only in the transfer windows', () => {
    const world = nationalCareer();
    // A player well above the trial club's level draws attention.
    const p = player(world);
    for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[])
      p.attributes[key] = Math.min(99, p.attributes[key] + 25);
    world.contracts[p.contractId!]!.role = 'key';
    const done = playSeason(world);
    expect(done.scouting.length).toBeGreaterThan(0);
    const offers = done.offers.filter((o) => o.kind === 'transfer' || o.kind === 'loan');
    expect(offers.length).toBeGreaterThan(0);
    const windows = transferWindows(done);
    for (const offer of offers)
      expect(
        windows.some(([from, to]) => offer.expires.week >= from && offer.expires.week <= to),
      ).toBe(true);
    valid(done);
  }, 300000);
});
