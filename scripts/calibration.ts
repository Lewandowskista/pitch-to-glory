/**
 * Are stated key-moment odds honest? Each bucket's success rate is a sample: it may stray from
 * the stated odds by sampling noise, about √(p(1 − p)/n). A bucket fails beyond three standard
 * errors (plus a point for rounding to whole percents); with a hundred buckets, a fixed margin
 * of a few points would fail on noise alone. Bias shows in the pooled decisions instead, whose
 * standard error is under a point: all of a profile's decisions together must land within three
 * of their standard errors of what was stated.
 */
export interface Bucket {
  n: number;
  /** Mean stated probability, in whole percent. */
  stated: number;
  /** Observed success rate, in whole percent. */
  actual: number;
}
const MINIMUM = 100;
const SIGMAS = 3;
const ROUNDING = 1;

export function calibrationProblems(buckets: Record<string, Bucket>, label: string): string[] {
  const problems: string[] = [];
  let n = 0,
    stated = 0,
    actual = 0,
    variance = 0;
  for (const [key, bucket] of Object.entries(buckets)) {
    n += bucket.n;
    stated += bucket.stated * bucket.n;
    actual += bucket.actual * bucket.n;
    const p = Math.min(0.98, Math.max(0.02, bucket.stated / 100));
    variance += p * (1 - p) * bucket.n;
    if (bucket.n < MINIMUM) continue;
    const error = Math.sqrt((p * (1 - p)) / bucket.n) * 100;
    if (Math.abs(bucket.stated - bucket.actual) > SIGMAS * error + ROUNDING)
      problems.push(`${label} ${key} ${bucket.stated} vs ${bucket.actual} (n ${bucket.n})`);
  }
  if (n && Math.abs(stated / n - actual / n) > (SIGMAS * Math.sqrt(variance) * 100) / n + 0.5)
    problems.push(
      `${label} pooled ${(stated / n).toFixed(1)} vs ${(actual / n).toFixed(1)} (n ${n})`,
    );
  return problems;
}
export const CALIBRATION_GATE =
  'stated odds honest: every bucket and all decisions pooled within 3 standard errors';
