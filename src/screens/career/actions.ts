import { startWorldJob } from '../../workers/client';

/** Advance the career world: the previous match report gives way to the next fixture. */
export function continueToMatchday(): void {
  void startWorldJob('simulate-to-match');
}
export function simulateCareerSeason(autoPlay: boolean): void {
  void startWorldJob('simulate-season', { autoPlay });
}
export function startNextCareerSeason(): void {
  void startWorldJob('next-season');
}
/**
 * The tournament between seasons: on to the career player's next match, or with
 * `simulateCareer` through the one waiting for them (review phase 3).
 */
export function continueTournament(simulateCareer: boolean): void {
  void startWorldJob('tournament', { simulateCareer });
}
