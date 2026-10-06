import type {
  Club,
  Player,
  Match,
  MatchReport,
  KeyMoment,
  ReplayFrame,
  Tactics,
} from '../../model/domain';
export type { Tactics } from '../../model/domain';
export interface MatchSetup {
  version: 1;
  seed: string;
  season: number;
  home: Club;
  away: Club;
  players: Record<string, Player>;
  selectedPlayerId: string;
  neutral: boolean;
}
export type MatchCommand =
  | { type: 'kickoff' }
  | { type: 'advance' }
  | { type: 'choose'; choiceId: string }
  | { type: 'halftime'; response: 'motivate' | 'role' | 'complain' }
  | { type: 'substitution'; response: 'accept' | 'encourage' }
  | { type: 'captain'; instruction: 'push' | 'calm' };
export interface LiveStats {
  homeShots: number;
  awayShots: number;
  homePossession: number;
  passesAttempted: number;
  passesCompleted: number;
  tackles: number;
  saves: number;
  goals: number;
  assists: number;
  rating: number;
  fatigue: number;
}
export interface MatchState {
  match: Match;
  currentMoment: KeyMoment | null;
  frames: ReplayFrame[];
  selectedPlayerMinutes: number;
  substituted: boolean;
  substitutionDecisionPending: boolean;
  captain: boolean;
  captainDecisionPending: boolean;
  expectedGoals: [number, number];
  stats: LiveStats;
  report: MatchReport | null;
  momentMinutes: number[];
  managerTrustDelta: number;
  managerReactionKey: string;
  fanReactionKey: string;
  headlineKey: string;
}
export interface MatchSession {
  version: 1;
  setup: MatchSetup;
  initialTactics: Tactics;
  commands: MatchCommand[];
  state: MatchState;
}
