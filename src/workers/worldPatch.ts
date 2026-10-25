/**
 * Small, exact changes between two states of a world (docs/RELEASE-1.0-PLAN.md steps 3.2 and
 * 3.4). The UI never edits a world in place: every action copies what it changes and shares the
 * rest (tests/action-immutability.test.ts), so comparing two worlds by reference visits only
 * what changed. The resulting patches bring the world worker's copy up to date without sending
 * the whole world, and are stored beside the saved world so a press answer or a purchase is
 * saved without rewriting it.
 *
 * Patches set or delete one value at a path. Applying a list twice gives the same result as
 * applying it once, and applying it to a JSON copy of the base gives a JSON copy of the target.
 * Pure: no browser or framework dependencies, so the world worker, the persistence worker and
 * the tests share it.
 */
export type WorldPatch =
  { op: 'set'; path: string[]; value: unknown } | { op: 'delete'; path: string[] };

export interface DiffLimits {
  /** Stop and return null beyond this many patches (the caller then sends the whole world). */
  maxPatches: number;
  /** Stop and return null beyond this many visited values. */
  maxVisits: number;
}
export const DEFAULT_DIFF_LIMITS: DiffLimits = { maxPatches: 20000, maxVisits: 2_000_000 };

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const same = (a: unknown, b: unknown) => a === b || (a !== a && b !== b);

/**
 * The patches that turn `base` into `next`, or null when there are more than the limits allow.
 * Unchanged references are skipped without looking inside, so the cost follows the size of the
 * change, not of the world.
 */
export function diffWorld(
  base: unknown,
  next: unknown,
  limits: DiffLimits = DEFAULT_DIFF_LIMITS,
): WorldPatch[] | null {
  const patches: WorldPatch[] = [];
  let visits = 0;
  const visit = (a: unknown, b: unknown, path: string[]): boolean => {
    if (++visits > limits.maxVisits) return false;
    if (same(a, b)) return true;
    if (isPlain(a) && isPlain(b)) {
      for (const key of Object.keys(a))
        if (!Object.hasOwn(b, key)) {
          patches.push({ op: 'delete', path: [...path, key] });
          if (patches.length > limits.maxPatches) return false;
        }
      for (const key of Object.keys(b)) {
        if (!Object.hasOwn(a, key)) {
          patches.push({ op: 'set', path: [...path, key], value: b[key] });
          if (patches.length > limits.maxPatches) return false;
        } else if (!visit(a[key], b[key], [...path, key])) return false;
      }
      return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      // A shorter array is cut first, so the indices that follow stay inside it.
      if (b.length < a.length)
        patches.push({ op: 'set', path: [...path, 'length'], value: b.length });
      const common = Math.min(a.length, b.length);
      for (let index = 0; index < common; index++)
        if (!visit(a[index], b[index], [...path, String(index)])) return false;
      for (let index = common; index < b.length; index++)
        patches.push({ op: 'set', path: [...path, String(index)], value: b[index] });
      return patches.length <= limits.maxPatches;
    }
    patches.push({ op: 'set', path, value: b });
    return patches.length <= limits.maxPatches;
  };
  if (!isPlain(base) || !isPlain(next)) return null;
  return visit(base, next, []) ? patches : null;
}

export class WorldPatchError extends Error {
  constructor() {
    super('patch');
  }
}
/** Apply patches in order, changing `world` in place. Throws WorldPatchError on a bad path. */
export function applyWorldPatches(world: unknown, patches: readonly WorldPatch[]): void {
  if (!isPlain(world)) throw new WorldPatchError();
  for (const patch of patches) {
    const path = patch.path;
    if (!Array.isArray(path) || path.length === 0) throw new WorldPatchError();
    let target: unknown = world;
    for (let index = 0; index < path.length - 1; index++) {
      const key = path[index]!;
      if (typeof key !== 'string' || target === null || typeof target !== 'object')
        throw new WorldPatchError();
      // Only own values are followed: never a prototype reached through `__proto__`.
      if (!Object.hasOwn(target, key)) throw new WorldPatchError();
      target = (target as Plain)[key];
    }
    const last = path.at(-1)!;
    if (typeof last !== 'string' || target === null || typeof target !== 'object')
      throw new WorldPatchError();
    if (Array.isArray(target)) {
      if (last !== 'length' && !/^(0|[1-9]\d*)$/.test(last)) throw new WorldPatchError();
      if (patch.op === 'delete') throw new WorldPatchError();
      if (last === 'length' && (!Number.isSafeInteger(patch.value) || (patch.value as number) < 0))
        throw new WorldPatchError();
      (target as unknown[] & Plain)[last] = patch.value;
    } else if (patch.op === 'delete') delete (target as Plain)[last];
    else if (patch.op === 'set')
      Object.defineProperty(target, last, {
        value: patch.value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    else throw new WorldPatchError();
  }
}

/** Patches as stored: a structural check only, as the world they apply to is checked on load. */
export function validPatches(value: unknown, max: number): value is WorldPatch[] {
  if (!Array.isArray(value) || value.length > max) return false;
  return value.every(
    (patch) =>
      isPlain(patch) &&
      (patch.op === 'set' || patch.op === 'delete') &&
      Array.isArray(patch.path) &&
      patch.path.length > 0 &&
      patch.path.length <= 32 &&
      patch.path.every((key) => typeof key === 'string' && key.length <= 512) &&
      (patch.op === 'set' ? Object.hasOwn(patch, 'value') : !Object.hasOwn(patch, 'value')),
  );
}

/** The approximate stored size of some patches, in characters of JSON. */
export const patchSize = (patches: readonly WorldPatch[]): number => JSON.stringify(patches).length;
