/**
 * How finely the pitch renders (release 1.0 step 3.10, review P11). The backing store is capped
 * at 1.5 device pixels per CSS pixel: flat shapes on a moving pitch look the same at 1.5× and
 * 2× or 3×, while the pixel count (fill rate, GPU memory, battery) grows with its square.
 * Multisample antialiasing is dropped where it buys least or costs most: on dense screens
 * (2× and above, whose 1.5× store already smooths edges) and on devices reporting 4 GB of
 * memory or less (`navigator.deviceMemory`, Chromium only).
 */
export const PITCH_MAX_RESOLUTION = 1.5;
export const PITCH_DENSE_RATIO = 2;
export const PITCH_LOW_MEMORY_GB = 4;

export function pitchQuality(
  devicePixelRatio: number,
  deviceMemory?: number,
): { resolution: number; antialias: boolean } {
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const lowMemory = deviceMemory !== undefined && deviceMemory <= PITCH_LOW_MEMORY_GB;
  return {
    resolution: Math.min(ratio, PITCH_MAX_RESOLUTION),
    antialias: ratio < PITCH_DENSE_RATIO && !lowMemory,
  };
}
