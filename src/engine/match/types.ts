import type {
  Beat,
  Club,
  Player,
  Match,
  MatchReport,
  KeyMoment,
  ReplayFrame,
  SentOff,
  Tactics,
} from '../../model/domain';
import type { RatingFamily } from './situations';
import type { Formation } from '../selection/formations';
export type { Tactics } from '../../model/domain';

/**
 * Bumped whenever replayed state changes; saved sessions from another engine are discarded.
 * `match-14` annotated the choreography (beats, a focus range) and kept bookkeeping stats
 * without changing any outcome of `match-13`. `match-15` (redesign phase 6) changes outcomes
 * by design: key moments name their cast and each choice's target (a pass reaches the teammate
 * named before the choice), "Track the runner" when defending, objectives on their own stream,
 * cosmetic yellow cards, AI substitutions with a bench of seven, and weather intensity with a
 * pitch state as separate odds factors. `match-16` (the discipline phase, decision 5) adds full
 * discipline: second yellows and straight reds, sides playing on with fewer men, the career
 * player's own dismissal and a booking risk on defending choices. `match-17` (review phase 2,
 * step 2.1) gives the selected player one effective role: the formation slot they start in sets
 * their role choices, objectives, involvement, half-time role change and back-line credit, not
 * their primary position. `match-18` (review phase 3, step 3.1) plays extra time in the session
 * when a tie needs it, with key moments, and settles the shootout there: the player's kick is
 * taken after extra time, only if the sides are still level. `match-19` (review phase 4, steps
 * 4.1 and 4.2) gives the opposition an identity and the player a stronger foot: the opponent's
 * playing style tilts which situations reach the player and the odds of the choices it
 * affects, and a shot or carry with the weaker foot costs odds unless the player is
 * two-footed. `match-20` (review phase 6) makes defending decide more: a back-line player's
 * moments carry more of the opposition's goals, and their attributes move defending odds
 * further, so choosing well measurably prevents goals. `match-21` goes further where match-20
 * left the choices close: a defensive midfielder's moments carry more of the opposition's
 * goals, and a keeper's saves lean harder on the attributes behind them.
 */
export const MATCH_ENGINE_VERSION = 'match-21';
/**
 * The engine before screening (match-21). A setup with `defending` but without `screening`
 * still replays as it was.
 */
export const DEFENDING_MATCH_ENGINE = 'match-20';
/**
 * The engine before decisive defending. A setup with `identity` but without `defending` still
 * replays as it was.
 */
export const IDENTITY_MATCH_ENGINE = 'match-19';
/**
 * The engine before opponent identity and the preferred foot. A setup with `extraTimePlay` but
 * without `identity` still replays as it was.
 */
export const EXTRA_TIME_MATCH_ENGINE = 'match-18';
/**
 * The engine before playable extra time: the shootout kick came at 90 minutes and extra time
 * and penalties were simulated afterwards. A setup with `roleSlot` but without
 * `extraTimePlay` still replays as it was.
 */
export const ROLE_MATCH_ENGINE = 'match-17';
/**
 * The engine before the effective role: the primary position set role choices, objectives and
 * involvement. A setup with `discipline` but without `roleSlot` still replays as it was.
 */
export const DISCIPLINE_MATCH_ENGINE = 'match-16';
/**
 * The engine before full discipline (redesign phase 6): yellow cards are cosmetic. A setup with
 * `occasions` but without `discipline` still replays as it was, so sessions saved by match-15
 * keep playing.
 */
export const OCCASIONS_MATCH_ENGINE = 'match-15';
/**
 * The engine before big occasions (a shootout kick, chained moments, final and derby
 * headlines). A setup with `dramaMoments` but without `occasions` still replays as it was.
 */
export const DRAMA_MATCH_ENGINE = 'match-12';
/**
 * The engine before key moments followed the state of the game (late moments in a close game,
 * set pieces, situations weighted by the score). A setup without `dramaMoments` still replays
 * with slot-aware moments only, so sessions saved before keep playing.
 */
export const SLOT_MATCH_ENGINE = 'match-11';
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
export const engineFor = (
  setup: Pick<
    MatchSetup,
    | 'formations'
    | 'slotMoments'
    | 'dramaMoments'
    | 'occasions'
    | 'discipline'
    | 'roleSlot'
    | 'extraTimePlay'
    | 'identity'
    | 'defending'
    | 'screening'
  >,
): string =>
  !setup.formations
    ? LEGACY_MATCH_ENGINE
    : !setup.slotMoments
      ? PREVIOUS_MATCH_ENGINE
      : !setup.dramaMoments
        ? SLOT_MATCH_ENGINE
        : setup.occasions
          ? setup.discipline
            ? setup.roleSlot
              ? setup.extraTimePlay
                ? setup.identity
                  ? setup.defending
                    ? setup.screening
                      ? MATCH_ENGINE_VERSION
                      : DEFENDING_MATCH_ENGINE
                    : IDENTITY_MATCH_ENGINE
                  : EXTRA_TIME_MATCH_ENGINE
                : ROLE_MATCH_ENGINE
              : DISCIPLINE_MATCH_ENGINE
            : OCCASIONS_MATCH_ENGINE
          : DRAMA_MATCH_ENGINE;

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
  /**
   * Key moments follow the state of the game (`match-12`): the last one comes late when the
   * game is close, the score weights attacking or defending situations, set pieces can fall to
   * the player, and situations are framed with the people in them. Absent in sessions saved
   * before, which replay as they were.
   */
  dramaMoments?: true;
  /**
   * Big occasions (`match-13`): a level knockout tie asks for the player's shootout kick, a
   * beaten defender leads straight into the shot, and finals and derbies have their own
   * headlines. Absent in sessions saved before, which replay as they were.
   */
  occasions?: true;
  /**
   * Full discipline (`match-16`): second yellows and straight reds send players off, a side
   * plays on with fewer men, and defending choices carry a booking risk. Absent in sessions
   * saved before, which replay with cosmetic yellow cards.
   */
  discipline?: true;
  /**
   * The effective role (`match-17`): the slot the selected player starts in, not their primary
   * position, sets their role choices, objectives, involvement and back-line credit.
   */
  roleSlot?: true;
  /**
   * Playable extra time (`match-18`): a tie that needs it plays on to 120 minutes in the session,
   * and the shootout is settled there.
   */
  extraTimePlay?: true;
  /**
   * Opponent identity and the preferred foot (`match-19`): the opposition's playing style
   * shapes the moments and their odds, and the weaker foot costs odds.
   */
  identity?: true;
  /** The player studied this opponent in training (`match-19`): their style costs less. */
  prepared?: true;
  /**
   * Decisive defending (`match-20`): more of the opposition's goals pass through a back-line
   * player's moments, and attributes move defending odds further.
   */
  defending?: true;
  /**
   * Screening (`match-21`): a defensive midfielder's moments carry more of the opposition's
   * goals, and a keeper's saves lean harder on their attributes.
   */
  screening?: true;
  /**
   * The late-winner and late-equaliser headlines (0.9.1) ask that the player's late goal
   * decided the result, not only that they scored late. Narrative only, so the engine is
   * unchanged; absent in sessions saved before, which keep the headline they finished with.
   */
  decidingHeadline?: true;
  /** Players serving a suspension in this fixture's competition, never picked (`match-16`). */
  suspended?: string[];
  /** Each side's team-strength bonus from its manager's ability (0 when absent). */
  strengthBonus?: [number, number];
  /** The selected player's chemistry with their teammates (0–100; 60 when absent). */
  chemistry?: number;
  /**
   * The selected player is their club's captain (the career's captaincy), whatever the
   * leadership order. Absent, the most experienced leader on the pitch wears the armband.
   */
  captain?: true;
}
export interface MatchFixture {
  id: string;
  competitionId: string;
  /** 1 for league games, higher for cups, playoffs and finals (feeds big-game skills and XP). */
  importance: number;
  /**
   * In a knockout that goes to extra time and penalties when level: the home side's aggregate
   * lead before this match (0 for a single match). Absent where a draw stands or a tie is
   * decided by ranking.
   */
  shootoutLead?: number;
  /**
   * The home side's aggregate lead before this match when, level on aggregate at full time, it
   * goes to extra time (match-18): the last leg of a tie whose rule plays extra time. Absent
   * where a level match goes straight to penalties, a draw stands or ranking decides.
   */
  extraTimeLead?: number;
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
  /**
   * Bookkeeping (engine match-14; no random draws). Expected goals [home, away]: the sum of
   * each recorded shot's chance of a goal (`MatchEvent.xg`).
   */
  xg: [number, number];
  /** Shots that ended in the net or in the keeper's hands [home, away], as choreographed. */
  shotsOnTarget: [number, number];
  /** The selected player's completed decision passes that led to a teammate's shot. */
  keyPasses: number;
  /** The selected player's tackling decisions, won or lost (`tackles` counts those won). */
  tacklesAttempted: number;
  /** Metres the selected player covered across the shown keyframes. */
  distanceM: number;
  /** Times the selected player played, received or won the ball in the shown keyframes. */
  touches: number;
}
/** The heat grid: columns along the pitch and rows across it (cells of about 5 m × 5 m). */
export const HEAT_COLUMNS = 20;
export const HEAT_ROWS = 13;
/** `discipline` (cards) exists only on the match-16 path. */
export type RatingPart =
  RatingFamily | 'goals' | 'assists' | 'saves' | 'errors' | 'team' | 'discipline';
/** How play restarts at the start of the next passage (see motion.ts). */
export type Restart = 'kickoff' | 'goal' | 'second-half' | 'goal-kick' | 'corner';
/** Who has the ball between passages. */
export interface PlayState {
  /** Team in possession: 0 home, 1 away (the team taking a pending restart). */
  side: 0 | 1;
  /** Player on the ball, or null while it runs loose or is out of play. */
  carrierId: string | null;
  restart: Restart | null;
  /** The most recent ball action (engine match-14): a shot met from a cross is a header. */
  last?: Beat;
}
/**
 * Keyframes of the most recent passage of play, starting at the previously shown frame:
 * a simulated minute, the build-up to a key moment, or a resolved decision.
 */
export interface MatchMotion {
  kind: 'kickoff' | 'minute' | 'moment' | 'outcome';
  frames: ReplayFrame[];
  /**
   * In an outcome passage: the keyframes (indices into `frames`, inclusive) from where the
   * chosen action starts to the end of what it led to (the follow-up shot, a goal's
   * celebration), so a camera can replay just the decision.
   */
  focus?: { start: number; end: number };
  /**
   * Where this passage's narration starts in `MatchState.narration` (match-14): lines from this
   * index on describe `frames` (`NarrationLine.frame`); earlier lines were already shown.
   */
  narrationStart?: number;
}
/**
 * A line of narration (match-14, redesign step M3), generated from a passage's beats after it
 * is choreographed (see narration.ts). The copy lives in `src/i18n/narration.ts`.
 */
export interface NarrationLine {
  minute: number;
  /** The keyframe it describes, as an index into the passage's `frames`. */
  frame: number;
  /** `match.narration.<family>.<variant>`. */
  key: string;
  /**
   * `player` and `receiver` are player ids (opponents in the `…cut` families: the passer and
   * the player who cut it out); `flank` (left, centre, right), `zone` (def, mid, final), `post`
   * (near, far) and `pattern` (a PatternId) are plain descriptors.
   */
  params: Record<string, string>;
  /** The engine event the move led to (a shot, or the decision it played). */
  eventId?: string;
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
  /** The live rating at the end of each played minute, to two decimals (engine match-14). */
  ratingByMinute: number[];
  /** What the pitch showed, as narration lines in the order they were played (match-14). */
  narration: NarrationLine[];
  /**
   * Milliseconds the selected player spent in each heat cell (`HEAT_COLUMNS` × `HEAT_ROWS`,
   * row-major), sampled along every keyframe span and oriented with their team attacking
   * towards x = 100 in both halves.
   */
  heat: number[];
  /** Rating contributions above the base, by decision family and outcome bonus. */
  ratingParts: Record<Exclude<RatingPart, 'discipline'>, number> & { discipline?: number };
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
  /** Names and numbers the headline refers to (engine match-12). */
  headlineParams?: Record<string, string>;
  /** The player's shootout kick (or save), taken at full time in a level knockout (match-13). */
  shootout?: { choiceId: string; probability: number; roll: number; success: boolean };
  /**
   * The score at 90 minutes when the match went to extra time (match-18): the session then
   * plays on to 120, and the goals since are extra time's.
   */
  regulation?: [number, number];
  /** The shootout's result, home first, decided in the session (match-18). */
  penalties?: [number, number];
  /**
   * The selected player's dismissal (match-16): the minute and why. Their match ends there and
   * the rest is simulated to full time.
   */
  sentOff?: SentOff;
  /** A follow-up moment due after a beaten defender (match-13): the chance it carries. */
  chain?: { goal: number };
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
