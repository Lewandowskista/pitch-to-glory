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
