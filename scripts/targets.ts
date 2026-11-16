/**
 * The 1.0 targets (docs/RELEASE-1.0-PLAN.md, step 2.3). Every balance harness reports its
 * targets through this module, next to the gates it already asserts.
 *
 * A target is REPORTED until the phase that meets it flips its `asserted` flag to true; from
 * then on a missed target fails the harness's check like any gate. `--assert-targets` treats
 * every target as asserted, to preview what a phase still has to meet.
 *
 * Gates (each harness's `GATES`) guard what is already true; targets describe what 1.0 must
 * reach. Never read a reported target as a pass.
 */

export interface TargetOutcome {
  /** Null when the run carries no data for the target (too few seeds, positions or seasons). */
  met: boolean | null;
  /** The measured value, short and human-readable. */
  value: string;
}
export interface Target<T> {
  id: string;
  /** The target as the plan words it. */
  name: string;
  /** The plan phase whose work meets it, and which turns it into an asserted gate. */
  phase: number;
  /** False while the target is only reported; set to true in the phase that meets it. */
  asserted: boolean;
  evaluate: (data: T) => TargetOutcome;
}
export interface TargetResult extends TargetOutcome {
  id: string;
  name: string;
  phase: number;
  asserted: boolean;
}

/** `--assert-targets` on the command line: treat every target as asserted. */
export const assertAllTargets = (argv: readonly string[] = process.argv) =>
  argv.includes('--assert-targets');

export function evaluateTargets<T>(
  targets: readonly Target<T>[],
  data: T,
  assertAll = false,
): TargetResult[] {
  return targets.map((target) => {
    let outcome: TargetOutcome;
    try {
      outcome = target.evaluate(data);
    } catch (error) {
      outcome = { met: null, value: `not measured: ${(error as Error).message}` };
    }
    return {
      id: target.id,
      name: target.name,
      phase: target.phase,
      asserted: assertAll || target.asserted,
      ...outcome,
    };
  });
}

/**
 * Print the results, asserted and reported apart, and return how many asserted targets failed
 * (a target without data fails only when asserted).
 */
export function printTargets(
  results: readonly TargetResult[],
  log: (line: string) => void = console.log,
): number {
  let failed = 0;
  log('1.0 targets (docs/RELEASE-1.0-PLAN.md step 2.3):');
  for (const result of results) {
    const status = result.met === null ? 'n/a ' : result.met ? 'met ' : 'MISS';
    const mode = result.asserted ? 'asserted' : `reported, asserted from phase ${result.phase}`;
    log(`${status} [${mode}] ${result.name} — ${result.value}`);
    if (result.asserted && result.met !== true) failed++;
  }
  const missed = results.filter((r) => !r.asserted && r.met === false).length;
  if (missed) log(`${missed} reported target(s) not met yet (not a failure).`);
  return failed;
}

// Small statistics shared by the harnesses' targets.
export const mean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
/** Population standard deviation. */
export function standardDeviation(values: readonly number[]): number {
  if (!values.length) return Number.NaN;
  const centre = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - centre) ** 2)));
}
/** The value at a share of the sorted values (nearest rank, rounded down). */
export function percentile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * share)))]!;
}
export const median = (values: readonly number[]) => percentile(values, 0.5);
export const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
export const within = (value: number, low: number, high: number) =>
  Number.isFinite(value) && value >= low && value <= high;
