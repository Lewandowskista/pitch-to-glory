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
import type { Formation } from '../selection/formations';
export type { Tactics } from '../../model/domain';

/** Bumped whenever replayed state changes; saved sessions from another engine are discarded. */
export const MATCH_ENGINE_VERSION = 'match-11';
/**
 * The engine before key moments followed the formation slot. A setup without `slotMoments`
 * still replays with moments drawn for the primary position, so sessions saved before keep
 * playing.
 */
export const PREVIOUS_MATCH_ENGINE = 'match-10';
/**
 * The engine before formations (Phase 5.1). A setup without `formations` still replays with
 * its 4-3-3 lineup and strength, so sessions saved before keep playing.
 */
export const LEGACY_MATCH_ENGINE = 'match-10-lines';
/** The engine a setup replays with. */
export const engineFor = (setup: Pick<MatchSetup, 'formations' | 'slotMoments'>): string =>
  !setup.formations
    ? LEGACY_MATCH_ENGINE
    : setup.slotMoments
      ? MATCH_ENGINE_VERSION
      : PREVIOUS_MATCH_ENGINE;

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
  /** Home and away managers' formations; absent for a world on the earlier 4-3-3 selection. */
  formations?: [Formation, Formation];
  /**
   * Key moments follow the formation slot the selected player fills, and an unfamiliar slot
   * costs odds (`match-11`). Absent in sessions saved before, which replay as they were.
   */
  slotMoments?: true;
  /** Each side's team-strength bonus from its manager's ability (0 when absent). */
  strengthBonus?: [number, number];
  /** The selected player's chemistry with their teammates (0–100; 60 when absent). */
  chemistry?: number;
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
  /** The selected player's own shots. */
  shots: number;
  errors: number;
  rating: number;
  fatigue: number;
}
export type RatingPart = RatingFamily | 'goals' | 'assists' | 'saves' | 'errors' | 'team';
/** How play restarts at the start of the next passage (see motion.ts). */
export type Restart = 'kickoff' | 'goal' | 'second-half' | 'goal-kick' | 'corner';
/** Who has the ball between passages. */
export interface PlayState {
  /** Team in possession: 0 home, 1 away (the team taking a pending restart). */
  side: 0 | 1;
  /** Player on the ball, or null while it runs loose or is out of play. */
  carrierId: string | null;
  restart: Restart | null;
}
/**
 * Keyframes of the most recent passage of play, starting at the previously shown frame:
 * a simulated minute, the build-up to a key moment, or a resolved decision.
 */
export interface MatchMotion {
  kind: 'kickoff' | 'minute' | 'moment' | 'outcome';
  frames: ReplayFrame[];
}
export interface MatchState {
  match: Match;
  currentMoment: KeyMoment | null;
  /** One snapshot per played minute, taken at the end of the minute. */
  frames: ReplayFrame[];
  play: PlayState;
  motion: MatchMotion;
  /** Keyframes of the selected player's goals, cut for Moments clips (at most 12 each). */
  highlights: { eventId: string; frames: ReplayFrame[] }[];
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
  /** Second-half odds multiplier from the half-time talk. */
  talkOdds: number;
  /** This match's shift of the player's governing attributes, from their consistency. */
  consistencyShift: number;
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
