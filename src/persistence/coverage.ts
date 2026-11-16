/**
 * Validator coverage of the persisted types (release 1.0 step 4.9, finding K8).
 *
 * The validators are hand-written and check a world in place, so a field added to a type in
 * `src/model/domain.ts` without a check is silently accepted unchecked (or, where a validator
 * rebuilds an object, silently dropped). Each validator therefore declares, next to its code,
 * a manifest of the type it validates: every field of the type, with how it is checked. The
 * manifest is typed `FieldCoverage<T>`, which requires exactly the keys of `T` (optional ones
 * included), so adding, renaming or removing a field fails the typecheck until the manifest,
 * and with it the validator, is updated.
 *
 * `tests/validator-coverage.test.ts` ties the manifests to the code: on a fully populated world
 * it records which fields each validator actually reads at the manifest's path, and fails for
 * a field marked `true` that is never read, or that the fixture does not populate.
 */
/**
 * `true`: the validator reads and checks the field. A string: why it is deliberately not
 * checked (written down, so the gap is a decision rather than an accident).
 */
export type FieldCheck = true | string;
/** Exactly the fields of `T`, optional ones included. */
export type FieldCoverage<T> = { readonly [K in keyof Required<T>]-?: FieldCheck };
export interface CoverageManifest {
  /**
   * Where the type sits in a world, dot-separated from the world (`''` for the world itself),
   * with `*` for any key of a record or index of an array: `players.*`, `career.market`.
   */
  path: string;
  fields: Readonly<Record<string, FieldCheck>>;
}
/** A validator's manifest for `T` at `path`; the object literal must list every field of `T`. */
export const covers = <T>(path: string, fields: FieldCoverage<T>): CoverageManifest => ({
  path,
  fields,
});
