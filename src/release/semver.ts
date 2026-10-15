/**
 * Release versions: plain `major.minor.patch` (docs/RELEASING.md). No pre-release or build
 * tags, because every release is a deploy of `main`. Tiny and dependency-free: the app shell's
 * "Updated" notice uses it.
 */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** The three numbers of a version, or null when it is not a plain `x.y.z`. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = SEMVER.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export const isVersion = (version: string): boolean => parseVersion(version) !== null;

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. Throws on invalid. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new Error(`Not a release version: ${left ? b : a}`);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return 0;
}
