import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import {
  CREST_SHAPES,
  CREST_SYMBOLS,
  generateCrest,
  renderCrest,
} from '../src/engine/assets/crest';
import { KIT_PATTERNS, generateKits, renderKit } from '../src/engine/assets/kit';
import { AVATAR_OPTIONS, generateAvatar, renderAvatar } from '../src/engine/assets/avatar';

describe('procedural SVG artwork', () => {
  it('contains 15 distinct silhouettes and 30 distinct symbols', () => {
    expect(new Set(CREST_SHAPES).size).toBeGreaterThanOrEqual(15);
    expect(new Set(CREST_SYMBOLS).size).toBeGreaterThanOrEqual(30);
    const crest = generateCrest(createRng('all'));
    expect(new Set(CREST_SHAPES.map((_, shape) => renderCrest({ ...crest, shape }))).size).toBe(
      CREST_SHAPES.length,
    );
    expect(new Set(CREST_SYMBOLS.map((_, symbol) => renderCrest({ ...crest, symbol }))).size).toBe(
      CREST_SYMBOLS.length,
    );
  });
  it('has eight visible options in every avatar category', () => {
    const avatar = generateAvatar(createRng('parts'));
    for (const [part, count] of Object.entries(AVATAR_OPTIONS)) {
      expect(count).toBeGreaterThanOrEqual(8);
      const svgs = Array.from({ length: count }, (_, i) =>
        renderAvatar({ ...avatar, [part]: i }, 28),
      );
      expect(new Set(svgs).size).toBe(count);
    }
  });
  it('is reproducible and produces complete home, away and third kits', () => {
    const a = createRng('club');
    const b = createRng('club');
    expect(generateCrest(a)).toEqual(generateCrest(b));
    const kits = generateKits(a);
    expect(kits).toEqual(generateKits(b));
    expect(Object.keys(kits)).toEqual(['home', 'away', 'third']);
    expect(kits.home.colors[0]).not.toBe(kits.away.colors[0]);
    expect(KIT_PATTERNS).toHaveLength(8);
    expect(new Set(KIT_PATTERNS.map((pattern) => renderKit({ ...kits.home, pattern }))).size).toBe(
      8,
    );
    expect(
      new Set(Array.from({ length: 8 }, (_, collar) => renderKit({ ...kits.home, collar }))).size,
    ).toBe(8);
    expect(
      new Set(Array.from({ length: 8 }, (_, trim) => renderKit({ ...kits.home, trim }))).size,
    ).toBe(8);
  });
  it('ages the same identity through hairline, gray hair and wrinkles', () => {
    const avatar = generateAvatar(createRng('age'));
    const original = structuredClone(avatar);
    const young = renderAvatar(avatar, 17);
    const old = renderAvatar(avatar, 42);
    expect(young).not.toEqual(renderAvatar(avatar, 28));
    expect(young).not.toEqual(old);
    expect(old).toContain('data-ageing');
    expect(old).toContain('data-gray');
    expect(old).toContain('data-hairline');
    expect(avatar).toEqual(original);
  });
  it('emits safe standalone SVG without duplicate resource IDs', () => {
    const rng = createRng('safe');
    const outputs = Array.from({ length: 64 }, () => [
      renderCrest(generateCrest(rng)),
      renderKit(generateKits(rng).home),
      renderAvatar(generateAvatar(rng), 42),
    ]).flat();
    for (const svg of outputs) {
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
      expect(svg).toContain('viewBox=');
      expect(svg).toMatch(/<\/svg>$/);
      expect(svg).not.toMatch(/script|foreignObject|https?:\/\/(?!www.w3.org)|onload=/);
    }
  });
});
