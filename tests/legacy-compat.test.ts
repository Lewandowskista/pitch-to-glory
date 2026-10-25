import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { lifecycleWeeks, startNextSeason } from '../src/engine/world/simulate';
import { getSeasonWeeks } from '../src/engine/world/calendar';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { makeTransferBid, transferWindows, windowState } from '../src/engine/career/market';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';
import { TEST_DRAFT } from './support/world';

/**
 * legacy-compat: the compact legacy world (docs/REALISM.md) is no longer created, but careers
 * saved in one must keep loading and playing under their own rules. Every other career suite
 * runs on the national world (tests/support/world.ts); tests that deliberately keep the legacy
 * format put "legacy-compat" in their describe title, so `vitest run -t legacy-compat` lists
 * them all. See also the compact-world structure tests in tests/world.test.ts.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
let career: World;
beforeAll(() => {
  const base = generateWorld('legacy-compat', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'legacy-compat')[0]!;
  career = createCareer(base, TEST_DRAFT, trial.id, 'legacy-compat');
});
const player = (world: World) => world.players[world.career!.playerId]!;

describe('legacy-compat: a career in a compact world', () => {
  it('keeps the 34-week calendar, its transfer windows and lifecycle weeks', () => {
    expect(career.format).toBeUndefined();
    expect(getSeasonWeeks(career)).toBe(34);
    expect(transferWindows(career)).toEqual([
      [1, 5],
      [16, 19],
    ]);
    expect(windowState(career, 3)).toMatchObject({ open: true, closes: 5 });
    expect(windowState(career, 10)).toMatchObject({ open: false, opens: 16 });
    expect(windowState(career, 30)).toMatchObject({ open: false, opens: null });
    expect(lifecycleWeeks(career)).toEqual({ transfer: [8, 18, 31], intake: 31 });
  });

  it('negotiates a transfer under the same market rules', () => {
    const world = clone(career);
    const parent = world.clubs[player(world).clubId!]!;
    const buyer = Object.values(world.clubs)
      .filter((club) => club.id !== parent.id && club.reputation > parent.reputation)
      .sort((a, b) => a.reputation - b.reputation || (a.id < b.id ? -1 : 1))[0]!;
    buyer.finances.transferBudget = 1e9;
    expect(makeTransferBid(world, buyer, 90)!.status).toBe('terms');
    expect(() => validateWorld(clone(world))).not.toThrow();
  });

  it('plays a season, rolls over and round trips a save', () => {
    let world = clone(career);
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    expect(world.season.end.week).toBe(34);
    expect(world.career!.matches.length).toBeGreaterThan(0);
    // No continental cups in a compact world.
    expect(Object.keys(world.competitions).some((id) => id.startsWith('continental:'))).toBe(false);
    const next = startNextSeason(world);
    expect(player(next).clubId).not.toBeNull();
    expect(next.format).toBeUndefined();
    const save = createSave(1, 'Legacy career', {
      kind: 'world',
      world: next,
      gallery: { seed: 'legacy-compat', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  }, 120000);
});
