import { platform } from '../../platform';

/** The live match's speeds. */
export const MATCH_SPEEDS = [1, 2, 4] as const;
export type MatchSpeed = (typeof MATCH_SPEEDS)[number];

/**
 * The speed the last match was watched at on this device (review M19), from the platform's
 * `match` preferences; 1× when none is stored or the record is unreadable.
 */
export function storedSpeed(): MatchSpeed {
  const record = platform.readPreferences('match') as { speed?: unknown } | null;
  const speed = record && typeof record === 'object' ? record.speed : undefined;
  return MATCH_SPEEDS.find((value) => value === speed) ?? 1;
}
/** Remember a chosen speed for the next match on this device. */
export function rememberSpeed(speed: MatchSpeed): void {
  platform.writePreferences({ speed }, 'match');
}
