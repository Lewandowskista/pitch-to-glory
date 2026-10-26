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
 * Bumped whenever replayed state changes. A saved session replays only on the engine that made
 * it; a build keeps at most the previous engine as well, for one minor release
 * (docs/COMPATIBILITY.md), and loading discards any other session with a notice.
 *
 * History: `match-14` annotated the choreography (beats, a focus range) and kept bookkeeping
 * stats. `match-15` (redesign phase 6): key moments name their cast and each choice's target,
 * "Track the runner" when defending, objectives on their own stream, AI substitutions with a
 * bench of seven, and weather intensity with a pitch state. `match-16`: full discipline (second
 * yellows, straight reds, sides a man short, booking risks). `match-17`: the formation slot the
 * player starts in sets their role. `match-18`: extra time and the shootout are played in the
 * session. `match-19`: the opponent's playing style and the player's stronger foot. `match-20`:
 * a back-line player's moments carry more of the opposition's goals. `match-21`: so do a
 * defensive midfielder's, and a keeper's saves lean harder on their attributes.
 *
 * The 1.0 compatibility cut (docs/RELEASE-1.0-PLAN.md step 2.4) removed every engine before
 * match-21; their sessions restart from kick-off. `match-22` (release 1.0, Phase 5) gathers the
 * 1.0 match rules behind one setup flag, `rules22`; match-21 is kept as the previous engine, so
 * a session saved by 0.9.x or 0.10.0 finishes under the rules it started with.
 */
export const MATCH_ENGINE_VERSION = 'match-22';
/**
 * The engine before this one, kept for one minor release (docs/COMPATIBILITY.md): a setup with
 * every one of its flags (`PREVIOUS_SETUP_FLAGS`) but not `rules22` replays on it.
 */
export const PREVIOUS_MATCH_ENGINE = 'match-21';
/**
 * The setup flags of the previous engine (match-21), in the order setups store them. Each one
 * switched on a step of the engine history above; a setup without any of them is from an
 * engine this build no longer plays.
 */
export const PREVIOUS_SETUP_FLAGS = {
  slotMoments: true,
  dramaMoments: true,
  occasions: true,
  discipline: true,
  roleSlot: true,
  extraTimePlay: true,
  identity: true,
  defending: true,
  screening: true,
} as const;
/** The setup flags of the current engine: the previous engine's and `rules22` (match-22). */
export const CURRENT_SETUP_FLAGS = { ...PREVIOUS_SETUP_FLAGS, rules22: true } as const;
const hasFlags = (setup: Partial<MatchSetup>, flags: object): boolean =>
  Array.isArray(setup.formations) &&
  (Object.keys(flags) as (keyof MatchSetup)[]).every((flag) => setup[flag] === true);
/** Whether a setup is the current engine's: formations and every current flag. */
export const isCurrentSetup = (setup: Partial<MatchSetup>): boolean =>
  hasFlags(setup, CURRENT_SETUP_FLAGS);
/**
 * The engine a setup plays on: the current one when it has every current flag, the previous
 * one when it has every previous flag but not `rules22`, and undefined for a setup from an
 * engine this build no longer plays.
 */
export function setupEngine(setup: Partial<MatchSetup>): string | undefined {
  if (isCurrentSetup(setup)) return MATCH_ENGINE_VERSION;
  return setup.rules22 === undefined && hasFlags(setup, PREVIOUS_SETUP_FLAGS)
    ? PREVIOUS_MATCH_ENGINE
    : undefined;
}
/**
 * Whether the 1.0 match rules (`match-22`) apply. Every rule change of release 1.0 Phase 5
 * (steps 5.2 to 5.5) is gated on it, so a match-21 session saved before the update replays and
 * finishes exactly as it would have (docs/COMPATIBILITY.md, "How to change match rules in
 * match-22"):
 *
 *   const odds = rules22(session.setup) ? newOdds(context) : odds21(context);
 *
 * Keep the match-21 branch byte-for-byte as it was: same draws, same streams, same order, same
 * rounding. New random draws go on new streams. `tests/match-outcome-snapshot.test.ts` pins the
 * match-21 table, and the golden 0.9.1 session must still replay.
 */
export const rules22 = (setup: Pick<MatchSetup, 'rules22'>): boolean => setup.rules22 === true;

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
  /**
   * Home and away managers' formations. Every current setup has them (`isCurrentSetup`); the
   * stored shape keeps them optional because sessions from before formations lacked them.
   */
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
   * The 1.0 match rules (`match-22`, release 1.0 Phase 5): every rule change since match-21 is
   * gated on it (`rules22`). Absent in sessions saved before, which replay on match-21.
   */
  rules22?: true;
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
/** `discipline` (cards) counts from match-16. */
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
  /**
   * Engine that produced this session: `MATCH_ENGINE_VERSION`, or `PREVIOUS_MATCH_ENGINE` for a
   * setup without `rules22`. It must be the engine its setup plays on (`setupEngine`) to replay.
   */
  engine: string;
  setup: MatchSetup;
  initialTactics: Tactics;
  commands: MatchCommand[];
  state: MatchState;
}
