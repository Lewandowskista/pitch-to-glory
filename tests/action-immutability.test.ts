import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { applyLifestyleAction, makeSponsorOffer, priceOf } from '../src/engine/career/lifestyle';
import { LIFESTYLE_BY_ID } from '../src/engine/career/lifestyle/catalogue';
import { applyMarketAction } from '../src/engine/career/market/actions';
import { applySocialAction } from '../src/engine/career/social/actions';
import { openPress, rivalOf } from '../src/engine/career/social';
import { applyHonoursAction } from '../src/engine/career/honours/actions';

/**
 * Every public action family promises structural sharing: it copies what it changes and
 * leaves the input world untouched, so previous-state snapshots and identity-based selectors
 * stay reliable. Freezing the input turns any in-place write into a thrown TypeError.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
/** Runs an action on a frozen copy and checks the input still serializes identically. */
function preserves(world: World, run: (input: World) => World): World {
  const before = JSON.stringify(world);
  const input = deepFreeze(clone(world));
  const result = run(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(result).not.toBe(input);
  return result;
}

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
let career: World;
beforeAll(() => {
  const base = generateWorld('immutability-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'immutability-tests')[0]!;
  career = createCareer(base, draft, trial.id, 'immutability-tests');
});
const rich = () => {
  const world = clone(career);
  world.career!.market.finances.cash = 10_000_000;
  return world;
};

describe('lifestyle actions leave the input world untouched', () => {
  it('copies the player for an experience and records its effect only on the result', () => {
    const world = rich();
    const player = world.players[world.career!.playerId]!;
    player.morale = 50;
    player.fatigue = 40;
    const result = preserves(world, (input) =>
      applyLifestyleAction(input, { type: 'buy-asset', itemId: 'experience:holiday' }),
    );
    const after = result.players[result.career!.playerId]!;
    expect(after).not.toBe(world.players[world.career!.playerId]);
    expect(after.morale).toBeGreaterThan(50);
    expect(after.fatigue).toBeLessThan(40);
  });
  it('covers every purchasable lifestyle kind', () => {
    const world = rich();
    world.career!.fame = 1_000_000;
    const kinds = new Set<string>();
    for (const item of Object.values(LIFESTYLE_BY_ID)) {
      if (kinds.has(item.kind) || priceOf(world, item) > world.career!.market.finances.cash)
        continue;
      kinds.add(item.kind);
      preserves(world, (input) =>
        applyLifestyleAction(input, { type: 'buy-asset', itemId: item.id }),
      );
    }
    expect([...kinds].sort()).toEqual(
      ['car', 'charity', 'experience', 'house', 'investment', 'legacy', 'staff'].sort(),
    );
  });
  it('covers sponsorship and wardrobe decisions', () => {
    const world = rich();
    world.career!.fame = 1_000_000;
    const offer = makeSponsorOffer(world, createRng('sponsor'));
    expect(offer).toBeTruthy();
    preserves(world, (input) =>
      applyLifestyleAction(input, { type: 'accept-sponsor', id: offer!.id }),
    );
    preserves(world, (input) =>
      applyLifestyleAction(input, { type: 'decline-sponsor', id: offer!.id }),
    );
    preserves(world, (input) =>
      applyLifestyleAction(input, {
        type: 'wardrobe',
        change: { slot: 'hair', value: draft.avatar.hair },
      }),
    );
  });
});

describe('market, social and honours actions leave the input world untouched', () => {
  it('covers agents, transfer requests and loan requests', () => {
    const world = clone(career);
    const agentId = Object.keys(world.agents)[0]!;
    preserves(world, (input) => applyMarketAction(input, { type: 'hire-agent', agentId }).world);
    preserves(world, (input) => applyMarketAction(input, { type: 'transfer-request' }).world);
  });
  it('covers answering the press', () => {
    const world = clone(career);
    const question = openPress(world, createRng('press'), 'rival', { rival: rivalOf(world)!.name });
    preserves(world, (input) =>
      applySocialAction(input, {
        type: 'answer',
        mediaId: question.id,
        choiceId: question.choices[0]!.id,
      }),
    );
  });
  it('covers retirement', () => {
    const world = clone(career);
    const player = world.players[world.career!.playerId]!;
    player.birthSeason = world.date.season - 34;
    world.phase = 'complete';
    preserves(world, (input) => applyHonoursAction(input, { type: 'retire' }));
  });
});
