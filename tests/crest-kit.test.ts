import { describe, expect, it } from 'vitest';
import type { Crest, Hex } from '../src/model/domain';
import { createRng, hashSeed } from '../src/engine/rng';
import {
  CREST_DIVISIONS,
  CREST_SHAPES,
  CREST_SYMBOLS,
  crestDivision,
  foundedYear,
  generateCrest,
  renderCrest,
} from '../src/engine/assets/crest';
import { COLLAR_STYLES, generateKits, renderKit } from '../src/engine/assets/kit';
import { GLYPHS, textPath, textWidth } from '../src/engine/assets/glyphs';
import { renderFigure } from '../src/engine/assets/gear';
import { contrastRatio, PALETTES } from '../src/engine/assets/shared';
import { generateWorld } from '../src/engine/world/generate';
import { t } from '../src/i18n';
import { kitArt } from '../src/ui/kitArt';

function expectSafe(svg: string) {
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(svg).toMatch(/<\/svg>$/);
  expect(svg).not.toMatch(/script|foreignObject|<text|https?:\/\/(?!www.w3.org)|onload=/);
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const reference of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(reference[1]);
}
const emblemInk = (svg: string) =>
  svg.match(/<g transform="[^"]+" fill="(#[0-9a-f]{6})" color="#[0-9a-f]{6}" data-emblem/i)?.[1] as
    Hex | undefined;

describe('crest v2', () => {
  it('derives the division from the crest alone, without touching the world RNG', () => {
    const rng = createRng('crest-draws');
    const crest = generateCrest(rng);
    // generateCrest must stay at exactly three draws (shape, symbol, palette).
    expect(rng.snapshot().draws).toBe(3);
    expect(crestDivision(crest)).toBe(crestDivision(structuredClone(crest)));
    // Pinned so a refactor cannot silently re-divide every saved club's badge.
    expect(crestDivision({ shape: 0, symbol: 0, colors: ['#075e45', '#f1cf58', '#f9f5e9'] })).toBe(
      crestDivision({ shape: 0, symbol: 0, colors: ['#075E45', '#F1CF58', '#F9F5E9'] }),
    );
    const seen = new Set<number>();
    for (let shape = 0; shape < CREST_SHAPES.length; shape++)
      for (let symbol = 0; symbol < CREST_SYMBOLS.length; symbol++) {
        const division = crestDivision({ shape, symbol, colors: [...PALETTES[0]!] });
        expect(division).toBeGreaterThanOrEqual(0);
        expect(division).toBeLessThan(CREST_DIVISIONS.length);
        seen.add(division);
      }
    // Every division appears, so a new shape or symbol ("Draw a new crest") can change it.
    expect(seen.size).toBe(CREST_DIVISIONS.length);
  });

  it('dates clubs from a pure function of their id and identity', () => {
    const club = {
      id: 'club-eng-1-3',
      identity: { status: 'professional', reserveParentId: null },
    };
    const year = foundedYear(club as Parameters<typeof foundedYear>[0]);
    expect(foundedYear({ ...club } as Parameters<typeof foundedYear>[0])).toBe(year);
    expect(year).toBeGreaterThanOrEqual(1863);
    expect(year).toBeLessThanOrEqual(1925);
    const years = (status: string, reserve: string | null = null) =>
      Array.from({ length: 200 }, (_, i) =>
        foundedYear({
          id: `club-${i}`,
          identity: { status, reserveParentId: reserve },
        } as Parameters<typeof foundedYear>[0]),
      );
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean(years('professional'))).toBeLessThan(mean(years('amateur')));
    expect(Math.min(...years('amateur', 'club-1'))).toBeGreaterThanOrEqual(1946);
    for (const value of years('amateur')) expect(value).toBeLessThanOrEqual(1995);
    // Legacy worlds have no identity.
    expect(foundedYear({ id: 'club-0' })).toBeGreaterThanOrEqual(1867);
    // Every world club gets a plausible year.
    const world = generateWorld('founded', { format: 'legacy' });
    for (const each of Object.values(world.clubs)) {
      const founded = foundedYear(each);
      expect(founded).toBeGreaterThanOrEqual(1863);
      expect(founded).toBeLessThan(world.date.season);
    }
  });

  it('keeps the emblem readable against both field colours of every division', () => {
    const palettes: [Hex, Hex, Hex][] = [
      ...PALETTES.flatMap(([a, b, c]) => [
        [a, b, c] as [Hex, Hex, Hex],
        [c, a, b] as [Hex, Hex, Hex],
        [b, c, a] as [Hex, Hex, Hex],
      ]),
      ['#123456', '#123457', '#123458'],
      ['#ffffff', '#000000', '#808080'],
    ];
    for (const colors of palettes)
      for (let division = 0; division < CREST_DIVISIONS.length; division++) {
        const svg = renderCrest({ shape: 0, symbol: 9, colors }, { division });
        const ink = emblemInk(svg)!;
        expect(ink).toBeDefined();
        expect(contrastRatio(ink, colors[0])).toBeGreaterThanOrEqual(3);
        if (division && contrastRatio(ink, colors[1]) < 3) {
          // No colour reads on both fields: the emblem is outlined in the base colour,
          // which stands out from the second field.
          expect(svg).toContain(`<g data-halo="" transform="`);
          expect(svg).toContain(`fill="${colors[0]}" stroke="${colors[0]}"`);
          expect(contrastRatio(colors[0], colors[1])).toBeGreaterThanOrEqual(3);
        }
      }
  });

  it('renders every shape with every division, with and without a founding ribbon', () => {
    const outputs = new Set<string>();
    for (let shape = 0; shape < CREST_SHAPES.length; shape++)
      for (let division = 0; division < CREST_DIVISIONS.length; division++) {
        const crest: Crest = {
          shape,
          symbol: (shape * 3 + division) % 33,
          colors: [...PALETTES[shape % 10]!],
        };
        const plain = renderCrest(crest, { division });
        const ribbon = renderCrest(crest, { division, founded: 1887 });
        expectSafe(plain);
        expectSafe(ribbon);
        expect(plain).toContain('clip-path="url(#crest-field)"');
        expect(ribbon).toContain('stroke-linecap="square"');
        expect(ribbon).toContain(
          textPath('EST 1887', {
            x: 80,
            y: 157,
            size: 10.5,
            anchor: 'middle',
            fill: '#000000',
          }).match(/d="([^"]+)"/)![1],
        );
        outputs.add(plain);
      }
    expect(outputs.size).toBe(CREST_SHAPES.length * CREST_DIVISIONS.length);
    // The default division is the derived one.
    const crest = generateCrest(createRng('default-division'));
    expect(renderCrest(crest)).toBe(renderCrest(crest, { division: crestDivision(crest) }));
    expect(() => renderCrest(crest, { division: 8 })).toThrow('Invalid asset option');
    expect(() => renderCrest(crest, { founded: 18.5 })).toThrow('Invalid founding year');
  });
});

describe('art lettering', () => {
  it('draws every glyph as an outlined path and lays text out by anchor', () => {
    const drawn = new Set<string>();
    for (const char of Object.keys(GLYPHS)) {
      const path = textPath(`${char}`, { x: 0, y: 20, size: 12, fill: '#075e45' });
      if (char === ' ') {
        expect(path).toBe('');
        continue;
      }
      expect(path).toMatch(/^<path d="M[^"]+" stroke="#075e45"/);
      expect(path).not.toContain('NaN');
      drawn.add(path);
    }
    // A–Z, 0–9, dot and ampersand, all distinct.
    expect(drawn.size).toBe(26 + 10 + 2);
    expect(textWidth('EST 1887', 10)).toBeGreaterThan(textWidth('EST', 10));
    expect(textWidth('ab', 20)).toBeCloseTo(textWidth('AB', 10) * 2);
    // Accents fold to their base letter; unsupported characters are skipped.
    expect(textPath('Évora', { x: 5, y: 9, size: 8, fill: '#000000' })).toBe(
      textPath('EVORA', { x: 5, y: 9, size: 8, fill: '#000000' }),
    );
    expect(textPath('#!', { x: 0, y: 0, size: 8, fill: '#000000' })).toBe('');
    const start = textPath('GOAL', { x: 50, y: 20, size: 10, fill: '#000000' });
    const middle = textPath('GOAL', { x: 50, y: 20, size: 10, fill: '#000000', anchor: 'middle' });
    const end = textPath('GOAL', { x: 50, y: 20, size: 10, fill: '#000000', anchor: 'end' });
    const firstX = (path: string) => Number(path.match(/d="M([\d.]+)/)![1]);
    expect(firstX(middle)).toBeCloseTo(firstX(start) - textWidth('GOAL', 10) / 2, 1);
    expect(firstX(end)).toBeCloseTo(firstX(start) - textWidth('GOAL', 10), 1);
    expect(() => textPath('A', { x: 0, y: 0, size: 0, fill: '#000000' })).toThrow();
    expect(() => textPath('A', { x: 0, y: 0, size: 5, fill: 'red' as Hex })).toThrow();
  });
});

describe('kit v2', () => {
  const kits = generateKits(createRng('kit-v2'));
  const crest = generateCrest(createRng('kit-v2-crest'));

  it('wears the club crest and names the sponsor', () => {
    const plain = renderKit(kits.home);
    const dressed = renderKit(kits.home, { crest, sponsorName: 'Greenleaf' });
    expectSafe(plain);
    expectSafe(dressed);
    expect(dressed).toContain('id="kit-badge-field"');
    expect(dressed).toContain('id="kit-body"');
    expect(plain).not.toContain('kit-badge');
    const names = renderKit(kits.home, { sponsorName: 'Northline' });
    expect(names).not.toBe(renderKit(kits.home, { sponsorName: 'Greenleaf' }));
    expect(renderKit(kits.home, { sponsorName: 'Greenleaf' })).toContain('stroke-linecap="square"');
    // Long names shrink to fit the sponsor block.
    expectSafe(renderKit(kits.home, { sponsorName: 'Oakmont Building Society & Co' }));

    expect(t.art.sponsors.length).toBeGreaterThanOrEqual(8);
    expect(new Set(t.art.sponsors).size).toBe(t.art.sponsors.length);
    for (let sponsor = 0; sponsor < 8; sponsor++) {
      const kit = { ...kits.home, sponsor };
      const options = kitArt(kit, crest);
      expect(options.sponsorName).toBe(t.art.sponsors[sponsor]);
      expect(options.crest).toBe(crest);
      expectSafe(renderKit(kit, options));
    }
    // The wardrobe figure wears the club crest as its badge and keeps ids unique.
    const avatar = {
      face: 0,
      skin: 2,
      hair: 1,
      hairColor: 2,
      facialHair: 0,
      eyebrows: 1,
      eyes: 0,
      accessory: 0,
    };
    const figure = renderFigure(avatar, 20, {
      kit: kits.home,
      crest,
      sleeves: 'long',
      armband: ['#f1cf58', '#075e45'],
      socks: 'socks:classic',
      boots: ['#1d1d1f', '#ffffff'],
    });
    expectSafe(figure.replace(/<text[^>]*>C<\/text>/, ''));
    expect(figure.toLowerCase()).toContain(crest.colors[0].toLowerCase());
  });

  it('keeps eight distinct collars and trims', () => {
    expect(COLLAR_STYLES).toEqual(['crew', 'v-neck', 'polo', 'grandad']);
    const options = { crest, sponsorName: 'Greenleaf' };
    expect(
      new Set(
        Array.from({ length: 8 }, (_, collar) => renderKit({ ...kits.home, collar }, options)),
      ).size,
    ).toBe(8);
    expect(
      new Set(Array.from({ length: 8 }, (_, trim) => renderKit({ ...kits.home, trim }, options)))
        .size,
    ).toBe(8);
    for (const field of ['collar', 'trim', 'sponsor'] as const) {
      expect(() => renderKit({ ...kits.home, [field]: 8 })).toThrow('Invalid asset option');
      expect(() => renderKit({ ...kits.home, [field]: -1 })).toThrow('Invalid asset option');
    }
  });
});

describe('world generation determinism', () => {
  // Fingerprints of a fixed-seed world taken on the commit before crest and kit v2: the art
  // upgrade must not add or move a single draw in the seeded generators. Avatars (whose option
  // indices were remapped by the portrait redesign) and squad numbers (assigned without draws)
  // are left out; tests/avatar.test.ts and tests/squad-numbers.test.ts cover them. Values
  // recomputed with these exclusions on f71f9e5 (before phase 2) and unchanged after it.
  const strip = <T extends object>(entity: T | undefined) =>
    entity &&
    Object.fromEntries(
      Object.entries(entity).filter(([key]) => key !== 'avatar' && key !== 'squadNumber'),
    );
  it.each([
    ['legacy', 859704115],
    ['national', 2096879332],
  ] as const)('generates the same %s clubs, kits, managers and squads', (format, expected) => {
    const world = generateWorld('crest-kit-determinism', { format });
    const clubs = Object.values(world.clubs)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((club) => ({
        id: club.id,
        crest: club.crest,
        kits: club.kits,
        manager: strip(world.managers[club.managerId]),
        squad: club.playerIds.map((id) => strip(world.players[id])),
      }));
    expect(hashSeed(JSON.stringify(clubs))).toBe(expected);
  });
});
