import type {
  Club,
  Player,
  Match,
  MatchReport,
  KeyMoment,
  ReplayFrame,
  Tactics,
} from '../../model/domain';
import type { RatingFamily } from './situations';
export type { Tactics } from '../../model/domain';

/** Bumped whenever replayed state changes; saved sessions from another engine are discarded. */
export const MATCH_ENGINE_VERSION = 'match-5';

export interface MatchSetup {
  version: 1;
  seed: string;
  season: number;
  home: Club;
  away: Club;
  players: Record<string, Player>;
  selectedPlayerId: string;
  neutral: boolean;
  /** A scheduled fixture played by the career player; absent for friendlies. */
  fixture?: MatchFixture;
}
export interface MatchFixture {
  id: string;
  competitionId: string;
  /** 1 for league games, higher for cups, playoffs and finals (feeds big-game skills and XP). */
  importance: number;
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
  errors: number;
  rating: number;
  fatigue: number;
}
export type RatingPart = RatingFamily | 'goals' | 'assists' | 'saves' | 'errors';
export interface MatchState {
  match: Match;
  currentMoment: KeyMoment | null;
  frames: ReplayFrame[];
  selectedPlayerMinutes: number;
  substituted: boolean;
  substitutionDecisionPending: boolean;
  captain: boolean;
  captainDecisionPending: boolean;
  /** Team strengths from the shared strength model, using the selected lineups. */
  strength: [number, number];
  /** Mean ability of both starting elevens: the reference for attribute multipliers. */
  matchLevel: number;
  /** Strength-model expectations after personal tactics, rounded to six decimals. */
  expectedGoals: [number, number];
  /** Fractions of own attack and opposition attack replaced by personal key moments. */
  shares: { attack: number; defence: number };
  stats: LiveStats;
  /** Rating contributions above the base, by decision family and outcome bonus. */
  ratingParts: Record<RatingPart, number>;
  report: MatchReport | null;
  momentMinutes: number[];
  managerTrustDelta: number;
  managerReactionKey: string;
  fanReactionKey: string;
  headlineKey: string;
}
export interface MatchSession {
  version: 1;
  /** Engine that produced this session; must equal MATCH_ENGINE_VERSION to replay. */
  engine: string;
  setup: MatchSetup;
  initialTactics: Tactics;
  commands: MatchCommand[];
  state: MatchState;
}
