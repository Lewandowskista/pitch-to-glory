import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { createRng } from '../src/engine/rng';
import {
  applyWorldPatches,
  diffWorld,
  validPatches,
  WorldPatchError,
  type WorldPatch,
} from '../src/workers/worldPatch';
import { decodeWorld, decodeWorldBytes, encodeWorld } from '../src/workers/worldCodec';
import { applyLifestyleAction } from '../src/engine/career/lifestyle';
import { applySocialAction } from '../src/engine/career/social/actions';
import { nationalCareer } from './support/world';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
/** Apply `patches` to a JSON copy of `base`, as storage and the world worker do. */
const replay = (base: unknown, patches: WorldPatch[]) => {
  const copy = json(base);
  applyWorldPatches(copy, patches);
  return copy;
};

describe('world patches (steps 3.2 and 3.4)', () => {
  it('turn a JSON copy of the base into a JSON copy of the target, and apply twice the same', () => {
    const base = {
      a: 1,
      b: { c: [1, 2, 3], d: 'x', gone: true },
      list: [{ id: 1 }, { id: 2 }, { id: 3 }],
      shared: { deep: { value: 1 } },
    };
    const next = {
      ...base,
      a: 2,
      b: { c: [1, 5], d: 'x', added: { nested: [null] } },
      list: [...base.list, { id: 4 }],
    };
    const patches = diffWorld(base, next)!;
    expect(patches).not.toBeNull();
    // Unchanged references are never visited, so the shared subtree yields nothing.
    expect(patches.some((patch) => patch.path[0] === 'shared')).toBe(false);
    expect(replay(base, patches)).toEqual(json(next));
    const twice = json(base);
    applyWorldPatches(twice, patches);
    applyWorldPatches(twice, patches);
    expect(twice).toEqual(json(next));
    expect(validPatches(json(patches), 100)).toBe(true);
  });
  it('agree with random structural edits, including shrinking arrays and deleted keys', () => {
    const rng = createRng('world-patch-fuzz');
    const random = (n: number) => Math.floor(rng.next() * n);
    const make = (depth: number): unknown => {
      const kind = random(depth > 3 ? 2 : 5);
      if (kind === 0) return random(100);
      if (kind === 1) return ['a', 'b', null, true][random(4)];
      if (kind === 2) return Array.from({ length: random(5) }, () => make(depth + 1));
      return Object.fromEntries(
        Array.from({ length: random(5) }, (_, index) => [`k${index}`, make(depth + 1)]),
      );
    };
    /** A structurally shared edit of a random place, as UI actions make them. */
    const edit = (value: unknown, depth = 0): unknown => {
      if (Array.isArray(value)) {
        const copy = [...value];
        const choice = random(4);
        if (choice === 0 && copy.length) copy.pop();
        else if (choice === 1) copy.push(make(depth + 1));
        else if (copy.length) {
          const index = random(copy.length);
          copy[index] = edit(copy[index], depth + 1);
        }
        return copy;
      }
      if (value && typeof value === 'object') {
        const copy = { ...(value as Record<string, unknown>) };
        const keys = Object.keys(copy);
        const choice = random(4);
        if (choice === 0 && keys.length) delete copy[keys[random(keys.length)]!];
        else if (choice === 1) copy[`n${random(1000)}`] = make(depth + 1);
        else if (keys.length) {
          const key = keys[random(keys.length)]!;
          copy[key] = edit(copy[key], depth + 1);
        }
        return copy;
      }
      return make(depth);
    };
    for (let run = 0; run < 400; run++) {
      const base = { root: make(0), other: make(0) };
      let next: unknown = base;
      for (let step = 0; step < 1 + random(4); step++) next = edit(next);
      if (!next || typeof next !== 'object' || Array.isArray(next)) continue;
      const patches = diffWorld(base, next);
      expect(patches).not.toBeNull();
      expect(replay(base, patches!)).toEqual(json(next));
    }
  });
  it('are small for real UI actions on a national career, and exact', () => {
    const world = nationalCareer();
    const refreshed = applyLifestyleAction(world, {
      type: 'refresh-challenges',
      date: '2026-10-25',
    });
    const press = applySocialAction(refreshed, { type: 'press-tone', tone: 'humble' });
    const patches = diffWorld(world, press)!;
    expect(patches).not.toBeNull();
    expect(JSON.stringify(patches).length).toBeLessThan(20000);
    expect(replay(world, patches)).toEqual(json(press));
  });
  it('give up beyond their limits, and refuse paths that do not exist or reach a prototype', () => {
    const base = { list: Array.from({ length: 50 }, (_, index) => index) };
    const next = { list: base.list.map((value) => value + 1) };
    expect(diffWorld(base, next, { maxPatches: 10, maxVisits: 1000 })).toBeNull();
    expect(() => applyWorldPatches({ a: {} }, [{ op: 'set', path: ['b', 'c'], value: 1 }])).toThrow(
      WorldPatchError,
    );
    expect(() =>
      applyWorldPatches({ a: {} }, [{ op: 'set', path: ['__proto__', 'polluted'], value: 1 }]),
    ).toThrow(WorldPatchError);
    const target = { a: {} };
    applyWorldPatches(target, [{ op: 'set', path: ['__proto__'], value: { polluted: true } }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect(validPatches([{ op: 'move', path: ['a'] }], 10)).toBe(false);
    expect(validPatches([{ op: 'set', path: [], value: 1 }], 10)).toBe(false);
  });
});

describe('world bytes (step 3.3)', () => {
  it('are exactly JSON.stringify of the world, and decode part by part to the same world', async () => {
    const world = nationalCareer();
    const encoded = encodeWorld(world, 1024);
    expect(new TextDecoder().decode(encoded.bytes) === JSON.stringify(world)).toBe(true);
    expect(decodeWorldBytes(encoded.bytes)).toEqual(json(world));
    let yields = 0;
    const decoded = (await decodeWorld(encoded, {
      sliceMs: 0,
      yieldControl: async () => {
        yields++;
      },
    })) as World;
    expect(yields).toBeGreaterThan(10);
    expect(JSON.stringify(decoded) === JSON.stringify(world)).toBe(true);
    // Wide records are split, so no part is large.
    const largest = Math.max(
      ...encoded.parts.map((part) => ('end' in part ? part.end - part.start : 0)),
    );
    expect(largest).toBeLessThan(4 * 1024 * 1024);
  });
  it('keep key order, odd keys and nested wide records', async () => {
    const wide = Object.fromEntries(
      Array.from({ length: 2500 }, (_, index) => [index % 3 ? `p${index}` : String(index), index]),
    );
    const value = {
      id: 'w',
      archive: { players: wide, note: 'x' },
      players: { ...wide, ['__proto__']: 1 },
      skip: undefined,
      text: 'naïve — “quoted” 🐐',
    };
    const encoded = encodeWorld(value, 16);
    expect(new TextDecoder().decode(encoded.bytes)).toBe(JSON.stringify(value));
    const decoded = await decodeWorld(encoded, { yieldControl: async () => {} });
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(value));
    expect(Object.getPrototypeOf((decoded as { players: object }).players)).toBe(Object.prototype);
  });
});
