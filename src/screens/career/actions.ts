import { useAppStore } from '../../store';
import { startWorldJob } from '../../workers/client';

/** Advance the career world: the previous match report gives way to the next fixture. */
export function continueToMatchday(): void {
  useAppStore.getState().setCareerResult(null);
  void startWorldJob('simulate-to-match');
}
export function simulateCareerSeason(autoPlay: boolean): void {
  useAppStore.getState().setCareerResult(null);
  void startWorldJob('simulate-season', { autoPlay });
}
export function startNextCareerSeason(): void {
  useAppStore.getState().setCareerResult(null);
  void startWorldJob('next-season');
}
