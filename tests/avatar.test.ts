import { describe, expect, it } from 'vitest';
import type { Avatar, Hex } from '../src/model/domain';
import { createRng, hashSeed } from '../src/engine/rng';
import {
  AVATAR_OPTIONS,
  AVATAR_PARTS,
  avatarHead,
  clubDress,
  generateAvatar,
  isAvatar,
  renderAvatar,
  resolveAvatar,
} from '../src/engine/assets/avatar';
import { renderFigure } from '../src/engine/assets/gear';
import { generateCrest } from '../src/engine/assets/crest';
import { generateKits } from '../src/engine/assets/kit';
import { generateWorld } from '../src/engine/world/generate';
import { generateAgents } from '../src/engine/career/market/agents';
import { COSMETIC_BY_ID } from '../src/engine/career/lifestyle/catalogue';
import { avatar as validateAvatar } from '../src/persistence/worldValidation';

/** An entity's fields in their original order, without its avatar. */
// Squad numbers (added in the same release, assigned without random draws and covered by
// tests/squad-numbers.test.ts) are left out with the avatar, so these hashes keep their
// pre-redesign values.
const withoutAvatar = <T extends { avatar: Avatar }>(entity: T) =>
  Object.fromEntries(
    Object.entries(entity).filter(([key]) => key !== 'avatar' && key !== 'squadNumber'),
  ) as Omit<T, 'avatar'>;
const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

describe('avatar parts', () => {
  it('has at least eight options per part, and nine to twelve where the design widened them', () => {
    expect(AVATAR_OPTIONS).toEqual({
      face: 8,
      skin: 8,
      hair: 12,
      hairColor: 8,
      facialHair: 9,
      eyebrows: 8,
      eyes: 8,
      iris: 8,
      nose: 8,
      mouth: 8,
      accessory: 9,
    });
  });
  it('generates every part within its range, never handing out the captain armband', () => {
    const rng = createRng('avatar-ranges');
    const seen = Object.fromEntries(AVATAR_PARTS.map((part) => [part, new Set<number>()]));
    for (let i = 0; i < 4000; i++) {
      const avatar = generateAvatar(rng);
      expect(isAvatar(avatar)).toBe(true);
      expect(() => validateAvatar(avatar)).not.toThrow();
      for (const [part, value] of Object.entries(resolveAvatar(avatar))) seen[part]!.add(value);
    }
    for (const part of AVATAR_PARTS) {
      const expected = Array.from({ length: AVATAR_OPTIONS[part] }, (_, i) => i).filter(
        (option) => !(part === 'accessory' && option === 3),
      );
      expect([...seen[part]!].sort((a, b) => a - b)).toEqual(expected);
    }
  });
  it('accepts old avatars without the new parts and rejects options out of range', () => {
    const old: Avatar = {
      face: 7,
      skin: 7,
      hair: 7,
      hairColor: 7,
      facialHair: 7,
      eyebrows: 7,
      eyes: 7,
      accessory: 7,
    };
    expect(isAvatar(old)).toBe(true);
    expect(() => validateAvatar(old)).not.toThrow();
    expect(() => validateAvatar({ ...old, hair: 11, facialHair: 8, accessory: 8 })).not.toThrow();
    expect(() => validateAvatar({ ...old, iris: 7, nose: 0, mouth: 3 })).not.toThrow();
    for (const [part, count] of Object.entries(AVATAR_OPTIONS)) {
      expect(isAvatar({ ...old, [part]: count })).toBe(false);
      expect(() => validateAvatar({ ...old, [part]: count })).toThrow();
      expect(isAvatar({ ...old, [part]: -1 })).toBe(false);
    }
    expect(isAvatar({ ...old, face: undefined })).toBe(false);
    expect(isAvatar({ ...old, freckles: 1 })).toBe(false);
  });
  it('sells or awards every hairstyle and accessory a generated player can start with', () => {
    for (let hair = 0; hair < AVATAR_OPTIONS.hair; hair++)
      expect(COSMETIC_BY_ID[`hair:${hair}`]?.kind).toBe('hair');
    for (let accessory = 0; accessory < AVATAR_OPTIONS.accessory; accessory++)
      expect(COSMETIC_BY_ID[`accessory:${accessory}`]?.kind).toBe('accessory');
  });
});

describe('avatar determinism', () => {
  it('leaves world generation unchanged: same names, attributes and draw counts as before', () => {
    // Captured on the commit before the avatar parts were widened. Avatars are left out: their
    // option indices may map differently, but every other draw must land where it did.
    const world = generateWorld('avatar-determinism');
    const players = Object.values(world.players).map(withoutAvatar);
    const managers = Object.values(world.managers).map(withoutAvatar);
    const agents = Object.values(generateAgents(world)).map(withoutAvatar);
    expect(players).toHaveLength(21098);
    expect(players.slice(0, 3).map((p) => [p.id, p.name, p.potential])).toEqual([
      ['player:0:0:0', 'Kofi Holmes', 86],
      ['player:0:0:1', 'Nicolas Bernard', 84],
      ['player:0:0:2', 'Toby King', 77],
    ]);
    expect(managers[0]).toMatchObject({ name: 'Ellis Mason', age: 40 });
    expect(hashSeed(JSON.stringify(players))).toBe(1171940817);
    expect(hashSeed(JSON.stringify(managers))).toBe(326043937);
    expect(hashSeed(JSON.stringify(agents))).toBe(986092761);
    expect(hashSeed(JSON.stringify(world.clubs))).toBe(143282897);
    expect(world.rng).toEqual({
      algorithm: 'mulberry32',
      seed: 'avatar-determinism',
      state: 3952374061,
      draws: 1,
    });
  });
  it('takes exactly eight draws from the stream it is given', () => {
    for (let i = 0; i < 200; i++) {
      const rng = createRng(`draws-${i}`);
      generateAvatar(rng);
      expect(rng.snapshot().draws).toBe(8);
    }
  });
  it('gives the same person the same face, and keeps derived features through wardrobe changes', () => {
    const a = generateAvatar(createRng('same-person'));
    const b = generateAvatar(createRng('same-person'));
    expect(a).toEqual(b);
    expect(a).not.toHaveProperty('iris');
    const features = resolveAvatar(a);
    expect(resolveAvatar(b)).toEqual(features);
    expect(renderAvatar(a, 24)).toBe(renderAvatar(b, 24));
    // The wardrobe changes hair, hair colour, facial hair and accessories only.
    const restyled = resolveAvatar({ ...a, hair: 9, hairColor: 2, facialHair: 4, accessory: 5 });
    expect([restyled.iris, restyled.nose, restyled.mouth]).toEqual([
      features.iris,
      features.nose,
      features.mouth,
    ]);
    // Stored choices win over derived ones.
    expect(resolveAvatar({ ...a, iris: 6, nose: 1, mouth: 2 })).toMatchObject({
      iris: 6,
      nose: 1,
      mouth: 2,
    });
  });
});

describe('avatar rendering', () => {
  const base = generateAvatar(createRng('render'));
  it('renders every option of every part as distinct, valid SVG with unique IDs', () => {
    for (const part of AVATAR_PARTS) {
      const svgs = Array.from({ length: AVATAR_OPTIONS[part] }, (_, option) =>
        renderAvatar({ ...base, [part]: option }, 28),
      );
      expect(new Set(svgs).size).toBe(AVATAR_OPTIONS[part]);
      for (const svg of svgs) {
        expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 200 200"/);
        expect(svg).toMatch(/<\/svg>$/);
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        const found = ids(svg);
        expect(new Set(found).size).toBe(found.length);
        for (const reference of svg.matchAll(/url\(#([^)]+)\)/g))
          expect(found).toContain(reference[1]);
      }
    }
    expect(() => renderAvatar({ ...base, hair: 12 }, 20)).toThrow('Invalid asset option');
    expect(() => renderAvatar(base, Number.NaN)).toThrow('Invalid avatar age');
  });
  it('recedes the hairline, greys the hair and lines the face with age', () => {
    const avatar = { ...base, hair: 1, hairColor: 0 };
    const at = (age: number) => renderAvatar(avatar, age);
    const hairline = (svg: string) => Number(svg.match(/data-hairline="([-\d.]+)"/)![1]);
    expect(hairline(at(20))).toBe(0);
    expect(hairline(at(34))).toBeLessThan(0);
    expect(hairline(at(40))).toBeLessThan(hairline(at(34)));
    expect(at(20)).not.toContain('data-gray');
    expect(at(20)).not.toContain('data-ageing');
    expect(at(42)).toContain('data-gray="0.85"');
    expect(at(42)).toContain('data-ageing="wrinkles"');
    // Grey blends into the hair colour rather than replacing it.
    expect(at(20)).toContain('fill="#1d2124"');
    expect(at(42)).not.toContain('fill="#1d2124"');
  });
  it('fills in facial hair as a young player grows up', () => {
    const avatar = { ...base, facialHair: 2 };
    const opacity = (age: number) =>
      Number(
        renderAvatar(avatar, age).match(
          /fill="#[0-9a-f]{6}" opacity="([\d.]+)"\/><g data-hairline/,
        )![1],
      );
    expect(opacity(16)).toBeLessThan(opacity(19));
    expect(opacity(19)).toBeLessThan(opacity(24));
    expect(opacity(24)).toBe(0.96);
  });
  it('dresses the bust in the club kit and crest, or the neutral brand shirt', () => {
    const crest = {
      ...generateCrest(createRng('dress')),
      colors: ['#123456', '#abcdef', '#fedcba'] as [Hex, Hex, Hex],
    };
    const kit = {
      ...generateKits(createRng('dress')).home,
      pattern: 'stripes' as const,
      colors: ['#b8322e', '#f7f3ea', '#202f40'] as [Hex, Hex, Hex],
    };
    const dressed = renderAvatar(base, 22, { kit, crest, background: '#f4ead4' });
    for (const color of ['#b8322e', '#f7f3ea', '#123456', '#abcdef', '#f4ead4'])
      expect(dressed).toContain(`fill="${color}"`);
    const neutral = renderAvatar(base, 22);
    expect(neutral).toContain('fill="#075e45"');
    expect(neutral).toContain('fill="#efcf63"');
    expect(neutral).not.toContain('#b8322e');
    // The club headband takes the kit's second colour.
    expect(renderAvatar({ ...base, accessory: 8 }, 22, { kit })).toMatch(
      /fill="#f7f3ea" fill-rule="evenodd"/,
    );
    expect(clubDress(null)).toEqual({});
    expect(clubDress({ kits: generateKits(createRng('dress')), crest })).toMatchObject({ crest });
    // Every kit pattern and collar style renders.
    for (const pattern of [
      'solid',
      'stripes',
      'hoops',
      'halves',
      'sash',
      'chevron',
      'pinstripe',
      'gradient',
    ] as const)
      for (let collar = 0; collar < 8; collar++)
        expect(renderAvatar(base, 22, { kit: { ...kit, pattern, collar } })).toMatch(/<\/svg>$/);
  });
  it('draws a head-only version without the disc, shirt or IDs', () => {
    const head = renderAvatar(base, 22, { headOnly: true });
    expect(ids(head)).toEqual([]);
    expect(head).not.toContain('clip-path');
    expect(head).toContain(avatarHead(base, 22));
  });
  it('builds the wardrobe figure from the portrait head and the kit, socks and boots', () => {
    const kits = generateKits(createRng('figure'));
    const crest = generateCrest(createRng('figure'));
    for (const socks of [
      'socks:classic',
      'socks:rolled',
      'socks:taped',
      'socks:high',
      'socks:striped',
    ])
      for (const sleeves of ['short', 'long'] as const) {
        const figure = renderFigure(base, 25, {
          kit: kits.home,
          crest,
          sleeves,
          armband: null,
          socks,
          boots: ['#101820', '#3ddc97'],
        });
        expect(figure).toMatch(/viewBox="0 0 200 368"/);
        expect(figure).toContain(avatarHead(base, 25, kits.home.colors[1]));
        expect(figure).toContain('fill="#101820"');
        expect(figure).toContain('fill="#3ddc97"');
        expect(figure).toContain(`fill="${crest.colors[0]}"`);
        const found = ids(figure);
        expect(new Set(found).size).toBe(found.length);
      }
    // Without a captain's armband, the armband accessory still shows on the sleeve.
    const plain = {
      kit: kits.home,
      sleeves: 'short' as const,
      armband: null,
      socks: 'socks:classic',
      boots: ['#101820', '#3ddc97'] as [Hex, Hex],
    };
    expect(renderFigure({ ...base, accessory: 3 }, 25, plain)).toContain('>C</text>');
    expect(renderFigure({ ...base, accessory: 0 }, 25, plain)).not.toContain('>C</text>');
  });
});
