import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { contrastRatio, withContrast } from '../src/engine/assets/shared';
import { CREST_SHAPES, CREST_SYMBOLS } from '../src/engine/assets/crest';

describe('national world identities', () => {
  const world = generateWorld('identity-test');
  const clubs = Object.values(world.clubs);

  it('spreads crest shape and symbol pairs across countries and keeps symbols visible', () => {
    const pairs = new Map<string, number>();
    for (const club of clubs) {
      const key = `${club.crest.shape}:${club.crest.symbol}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      expect(contrastRatio(club.crest.colors[2], club.crest.colors[0])).toBeGreaterThanOrEqual(3);
    }
    const combinations = CREST_SHAPES.length * CREST_SYMBOLS.length;
    expect(Math.max(...pairs.values())).toBeLessThanOrEqual(Math.ceil(clubs.length / combinations));
  });

  it('rarely repeats a full name within a squad', () => {
    const repeated = clubs.filter((club) => {
      const names = club.playerIds.map((id) => world.players[id]!.name);
      return new Set(names).size !== names.length;
    });
    expect(repeated.length / clubs.length).toBeLessThan(0.1);
  });

  it('adjusts a low-contrast colour towards black or white without losing a good one', () => {
    expect(withContrast('#ffffff', '#075e45')).toBe('#ffffff');
    const adjusted = withContrast('#f0f0e8', '#f9f5e9');
    expect(contrastRatio(adjusted, '#f9f5e9')).toBeGreaterThanOrEqual(3);
  });
});
