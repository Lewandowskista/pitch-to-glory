/**
 * Where the career player's attributes come from (review phase 2, step 2.4): whole points from
 * playing (passive growth), training, spent attribute points and skills, and points lost to
 * age, counted per season. It makes visible how much each lever does, for the player on their
 * profile and for the balance harness.
 */
import type { Career, GrowthSeason } from '../../model/domain';
import { CONFIG } from '../config';

export type GrowthSource = Exclude<keyof GrowthSeason, 'season'>;
export const GROWTH_SOURCES: readonly GrowthSource[] = [
  'playing',
  'training',
  'points',
  'skills',
  'decline',
];

/** Count whole attribute points from a source in a season (decline counts points lost). */
export function recordGrowth(
  career: Career,
  season: number,
  source: GrowthSource,
  points: number,
): void {
  if (!points) return;
  const ledger = (career.growth ??= []);
  let entry = ledger.find((line) => line.season === season);
  if (!entry) {
    entry = { season, playing: 0, training: 0, points: 0, skills: 0, decline: 0 };
    ledger.push(entry);
    if (ledger.length > CONFIG.career.growthSeasons)
      ledger.splice(0, ledger.length - CONFIG.career.growthSeasons);
  }
  entry[source] += points;
}

/** A season's growth, or zeros before anything was recorded. */
export function growthOf(career: Career, season: number): GrowthSeason {
  return (
    career.growth?.find((line) => line.season === season) ?? {
      season,
      playing: 0,
      training: 0,
      points: 0,
      skills: 0,
      decline: 0,
    }
  );
}
