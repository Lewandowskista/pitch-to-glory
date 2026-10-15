import type { Match } from '../../model/domain';
import { CONFIG } from '../config';

/**
 * Weather intensity and the state of the pitch (engine match-15, redesign step M8). Pure: the
 * intensity is drawn once by the match (after the weather, on the preview stream), the state is
 * derived from the weather, its intensity and the pitch's quality without a draw.
 */
export type Weather = Match['weather'];
export type Intensity = 'light' | 'steady' | 'heavy';
export type PitchState = 'firm' | 'good' | 'heavy' | 'frozen';
export const INTENSITIES: readonly Intensity[] = ['light', 'steady', 'heavy'];

const K = CONFIG.match.conditions;

/**
 * The pitch's state: snow freezes it (light snow only softens it), rain makes it heavy unless
 * it is light rain on a good surface, a surface below `pitchGood` is heavy whatever the sky,
 * and a good surface is firm under clear skies, otherwise good. Without an intensity (earlier
 * engines, the art gallery) the weather counts as steady.
 */
export function pitchStateFor(
  weather: Weather,
  pitchCondition: number,
  intensity: Intensity = 'steady',
): PitchState {
  const good = pitchCondition >= K.pitchGood;
  if (weather === 'snow') return intensity === 'light' ? 'heavy' : 'frozen';
  if (weather === 'rain') return intensity === 'light' && good ? 'good' : 'heavy';
  if (!good) return 'heavy';
  return weather === 'clear' ? 'firm' : 'good';
}

/** The intensity of the match's weather, from one draw in [0, 1). */
export function intensityFor(roll: number): Intensity {
  let cumulative = 0;
  for (const intensity of INTENSITIES) {
    cumulative += K.intensityWeights[intensity];
    if (roll < cumulative) return intensity;
  }
  return 'heavy';
}

/**
 * The weather's own effect on a choice's odds (match-15): the catalogue's technical or direct
 * effect for the weather, scaled by its intensity (light ½, steady 1, heavy 1½).
 */
export function weatherEffect(
  sensitivity: 'technical' | 'direct' | 'neutral',
  weather: Weather,
  intensity: Intensity,
): number {
  if (sensitivity === 'neutral') return 0;
  return K.split[sensitivity][weather] * K.intensity[intensity];
}

/**
 * The pitch's effect on technical choices (match-15): the larger of the loss from a surface the
 * rain or snow has made heavy or frozen (`pitchState`) and the loss from a poor surface
 * (`pitchSlope` per point below `pitchGood`, as before). Direct choices are not affected.
 */
export function pitchEffect(
  sensitivity: 'technical' | 'direct' | 'neutral',
  weather: Weather,
  state: PitchState,
  pitchCondition: number,
): number {
  if (sensitivity !== 'technical') return 0;
  const wet = weather === 'rain' || weather === 'snow' ? K.pitchState[state] : 0;
  return -Math.max(wet, Math.max(0, K.pitchGood - pitchCondition) * K.pitchSlope);
}
