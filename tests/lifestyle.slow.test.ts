import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { startNextSeason } from '../src/engine/world/simulate';
import { advanceCareerWeek } from '../src/engine/career/season';
import { applyLifestyleAction } from '../src/engine/career/lifestyle';
import { validateWorld } from '../src/persistence/worldSchema';
import { nationalCareer } from './support/world';

/** Lifestyle records across a whole national season (the slow project). */
const L = CONFIG.career.lifestyle;

describe('lifestyle over a national season', () => {
  it('plays through a season rollover with lifestyle records intact', () => {
    let world: World = nationalCareer();
    world.career!.fame = L.fameLevels[2];
    world.career!.market.finances.cash = 20_000;
    world = applyLifestyleAction(world, { type: 'buy-asset', itemId: 'house:flat' });
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const next = startNextSeason(world);
    expect(next.sponsorships.every((d) => d.status !== 'offered')).toBe(true);
    expect(next.career!.style.assets.some((asset) => asset.itemId === 'house:flat')).toBe(true);
    expect(() => validateWorld(JSON.parse(JSON.stringify(next)) as World)).not.toThrow();
  }, 300000);
});
