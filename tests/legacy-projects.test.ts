import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { seasonalSquadReview } from '../src/engine/world/lifecycle';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import {
  applyLifestyleAction,
  firstClubOf,
  lifestyleRollover,
  priceOf,
} from '../src/engine/career/lifestyle';
import { LIFESTYLE_BY_ID } from '../src/engine/career/lifestyle/catalogue';
import { validateWorld } from '../src/persistence/worldSchema';
import { messageText } from '../src/screens/career/marketUi';

const G = CONFIG.career.lifestyle.legacy;
const draft: CareerDraft = {
  name: 'Robin Vale',
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
  foot: 'left',
  age: 17,
  archetype: 'finisher',
};
let rich: World;
beforeAll(() => {
  const base = generateWorld('legacy-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'legacy-tests')[0]!;
  rich = createCareer(base, draft, trial.id, 'legacy-tests');
  rich.career!.fame = 10_000;
  rich.career!.market.finances.cash = 10_000_000;
}, 60000);
const clone = (world: World): World => structuredClone(world);
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const buy = (world: World, itemId: string) =>
  applyLifestyleAction(world, { type: 'buy-asset', itemId });

describe('legacy projects at the first club', () => {
  it('fund the first club from a stake, leaving the input untouched, once', () => {
    const clubId = firstClubOf(rich)!;
    const before = rich.clubs[clubId]!.finances.transferBudget;
    const price = priceOf(rich, LIFESTYLE_BY_ID['legacy:stake']!);
    const world = buy(rich, 'legacy:stake');
    expect(rich.clubs[clubId]!.finances.transferBudget).toBe(before);
    expect(world.clubs[clubId]!.finances.transferBudget).toBe(
      before + Math.round(price * G.stakeBudget),
    );
    expect(world.career!.market.finances.cash).toBe(rich.career!.market.finances.cash - price);
    expect(() => buy(world, 'legacy:stake')).toThrow();
    const message = world.inbox.at(-1)!;
    expect(message.subjectKey).toBe('legacy-project');
    expect(messageText(message).body).toContain(world.clubs[clubId]!.name);
    valid(world);
    // Each season it is held, the club's standing rises.
    const reputation = world.clubs[clubId]!.reputation;
    const later = clone(world);
    lifestyleRollover(later);
    expect(later.clubs[clubId]!.reputation).toBe(Math.min(99, reputation + G.stakeReputation));
  });

  it('build an academy whose youngsters come through with more potential, for good', () => {
    const clubId = firstClubOf(rich)!;
    const world = buy(rich, 'legacy:academy');
    expect(rich.clubs[clubId]!.academy).toBeUndefined();
    expect(world.clubs[clubId]!.academy).toMatchObject({ patronId: rich.career!.playerId });
    valid(world);
    // The same intake, with and without the academy.
    const without = clone(rich);
    const withAcademy = clone(world);
    seasonalSquadReview(without, createRng('intake'));
    seasonalSquadReview(withAcademy, createRng('intake'));
    const youth = (w: World) =>
      w.clubs[clubId]!.playerIds.filter((id) => id.startsWith('youth:')).map(
        (id) => w.players[id]!,
      );
    const plain = youth(without);
    const boosted = youth(withAcademy);
    expect(boosted.length).toBe(plain.length);
    expect(plain.length).toBeGreaterThan(0);
    for (const [index, player] of boosted.entries())
      expect(player.potential).toBe(Math.min(99, plain[index]!.potential + G.academyPotential));
  });
});
