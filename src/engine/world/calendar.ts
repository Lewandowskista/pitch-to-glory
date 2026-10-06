import type { World } from '../../model/domain';
import { CONFIG } from '../config';

export function getSeasonWeeks(world: World): number {
  return world.format === 'national-v1' ? world.season.end.week : CONFIG.world.weeksPerSeason;
}

export function isNationalWorld(world: World): boolean {
  return world.format === 'national-v1';
}
