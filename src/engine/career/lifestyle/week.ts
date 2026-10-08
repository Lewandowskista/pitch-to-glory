import type { World } from '../../../model/domain';
import { createRng } from '../../rng';
import { postMessage } from '../market/records';
import { chronicle } from '../honours/chronicle';
import { assetWeek, sponsorRollover, sponsorWeek } from './lifestyle';
import { careerFameLevel, initialStyle, L } from './wardrobe';

/**
 * The career's lifestyle week, after the social week: fame level-ups are announced,
 * sponsors pay and check their obligations, and assets cost or earn money.
 */
export function lifestyleWeek(world: World): void {
  const career = world.career!;
  const rng = createRng(`${world.seed}:lifestyle:${world.date.season}:${world.date.week}`);
  const level = careerFameLevel(world);
  if (level > career.style.fameLevel) {
    postMessage(world, 'fame-level', { level });
    if (level >= 5) chronicle(world, 'fame', { level });
  }
  career.style.fameLevel = level;
  sponsorWeek(world, rng);
  assetWeek(world);
}

/** Season change: sponsorship deals are judged, and fame above the floor fades a little. */
export function lifestyleRollover(world: World): void {
  sponsorRollover(world);
  const career = world.career!;
  const F = L.fameDecay;
  if (career.fame > F.above)
    career.fame = Math.round(F.above + (career.fame - F.above) * (1 - F.share));
}

/**
 * Fame from celebrating with the signature celebration in a big match. Called from the
 * single commit path with the match's importance; returns the fame added.
 */
export function celebrationFame(world: World, goals: number, importance: number): number {
  const style = world.career?.style;
  if (!style?.equipped.celebration || goals <= 0 || importance < L.bigMatchImportance) return 0;
  const fame = goals * L.signatureFame;
  world.career!.fame += fame;
  style.signatureUses += goals;
  return fame;
}

/** The style record for a new career, or one saved before milestone 7. */
export function attachLifestyle(world: World): void {
  const career = world.career!;
  career.style ??= initialStyle(world.players[career.playerId]!);
  career.style.fameLevel = careerFameLevel(world);
}
