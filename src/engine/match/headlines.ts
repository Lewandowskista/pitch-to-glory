import { createRng } from '../rng';
import type { MatchSession } from './types';

/**
 * The morning headline and the touchline reactions for a match-12 game (AGENTS.md §7: manager
 * and fan reactions, generated newspaper headline). The headline is the story of the match
 * from the player's side: a late winner, a hat-trick, a saved penalty, a rout or a nightmare;
 * the reactions read the result against how the player played. Each has several wordings,
 * drawn from the match seed so a replay reads the same.
 */
export type HeadlineKind =
  | 'late-winner'
  | 'late-equaliser'
  | 'hat-trick'
  | 'final-won'
  | 'final-lost'
  | 'derby-won'
  | 'derby-lost'
  | 'brace'
  | 'penalty-save'
  | 'scorer-win'
  | 'scorer-draw'
  | 'scorer-loss'
  | 'provider'
  | 'wall'
  | 'rout'
  | 'thrashed'
  | 'nightmare'
  | 'strong-win'
  | 'win'
  | 'draw'
  | 'strong-loss'
  | 'loss'
  | 'sent-off';
export const HEADLINE_KINDS: readonly HeadlineKind[] = [
  'late-winner',
  'late-equaliser',
  'hat-trick',
  'final-won',
  'final-lost',
  'derby-won',
  'derby-lost',
  'brace',
  'penalty-save',
  'scorer-win',
  'scorer-draw',
  'scorer-loss',
  'provider',
  'wall',
  'rout',
  'thrashed',
  'nightmare',
  'strong-win',
  'win',
  'draw',
  'strong-loss',
  'loss',
  'sent-off',
];
export const HEADLINE_VARIANTS = 3;
export type ResultKind = 'win' | 'draw' | 'loss';
export type PerformanceKind = 'star' | 'solid' | 'poor';
/** Rating at or above which a performance is a star turn, and below which it is poor. */
const STAR = 7.3,
  POOR = 6.3;
const LATE = 85;
/** A fixture this important is a final (`career.importance.final`). */
const FINAL_IMPORTANCE = 1.5;

export function headlineKind(session: MatchSession, rating: number): HeadlineKind {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const id = setup.selectedPlayerId;
  const own = setup.players[id]!.clubId === setup.home.id ? 0 : 1;
  const margin = m.score[own]! - m.score[1 - own]!;
  const goals = s.stats.goals;
  const lateGoal = setup.decidingHeadline
    ? decidingGoalIsLate(session, own, margin)
    : m.events.some((e) => e.kind === 'goal' && e.playerId === id && e.minute >= LATE);
  const back = ['GK', 'CB', 'LB', 'RB', 'DM'].includes(setup.players[id]!.primaryPosition);
  const savedPenalty = m.keyMoments.some(
    (moment) =>
      moment.situationId === 'penalty-save' &&
      m.events.some((e) => e.outcome?.input.momentId === moment.id && e.outcome.success),
  );
  // A dismissal (match-16) is the story of the player's match.
  if (s.sentOff) return 'sent-off';
  if (lateGoal && margin === 1) return 'late-winner';
  if (lateGoal && margin === 0) return 'late-equaliser';
  if (goals >= 3) return 'hat-trick';
  // Big occasions (match-13): a final or a derby is the story, unless it is level.
  if (setup.occasions && margin !== 0) {
    if ((setup.fixture?.importance ?? 1) >= FINAL_IMPORTANCE)
      return margin > 0 ? 'final-won' : 'final-lost';
    if (setup.home.city && setup.home.city === setup.away.city)
      return margin > 0 ? 'derby-won' : 'derby-lost';
  }
  if (savedPenalty && margin >= 0) return 'penalty-save';
  if (goals === 2 && margin >= 0) return 'brace';
  if (goals > 0) return margin > 0 ? 'scorer-win' : margin === 0 ? 'scorer-draw' : 'scorer-loss';
  if (s.stats.assists >= 2 && margin >= 0) return 'provider';
  if (s.stats.errors >= 2 && margin < 0) return 'nightmare';
  if (back && m.score[1 - own] === 0 && margin >= 0 && rating >= 7 && !s.substituted && !s.sentOff)
    return 'wall';
  if (margin >= 3) return 'rout';
  if (margin <= -3) return 'thrashed';
  if (margin > 0) return rating >= STAR ? 'strong-win' : 'win';
  if (margin === 0) return 'draw';
  return rating >= STAR ? 'strong-loss' : 'loss';
}

/**
 * The player scored the goal that decided a one-goal win or a draw, late (0.9.1): the side's
 * last goal in a one-goal win, which put it ahead for good, or the match's last goal in a
 * draw, which levelled it for good.
 */
function decidingGoalIsLate(session: MatchSession, own: number, margin: number): boolean {
  const setup = session.setup;
  const goals = session.state.match.events.filter((e) => e.kind === 'goal');
  const ownId = own === 0 ? setup.home.id : setup.away.id;
  const deciding =
    margin === 1
      ? goals.filter((e) => e.teamId === ownId).at(-1)
      : margin === 0
        ? goals.at(-1)
        : undefined;
  return Boolean(
    deciding &&
    deciding.teamId === ownId &&
    deciding.playerId === setup.selectedPlayerId &&
    deciding.minute >= LATE,
  );
}

export function resultKind(session: MatchSession): ResultKind {
  const setup = session.setup,
    score = session.state.match.score;
  const own = setup.players[setup.selectedPlayerId]!.clubId === setup.home.id ? 0 : 1;
  const margin = score[own]! - score[1 - own]!;
  return margin > 0 ? 'win' : margin < 0 ? 'loss' : 'draw';
}
export function performanceKind(rating: number): PerformanceKind {
  return rating >= STAR ? 'star' : rating < POOR ? 'poor' : 'solid';
}

/** Keys and parameters for the report: headline, manager and fans. */
export function reportCopy(
  session: MatchSession,
  rating: number,
): {
  headlineKey: string;
  headlineParams: Record<string, string>;
  managerReactionKey: string;
  fanReactionKey: string;
} {
  const setup = session.setup,
    m = session.state.match;
  const id = setup.selectedPlayerId;
  const own = setup.players[id]!.clubId === setup.home.id ? 0 : 1;
  const rng = createRng(`${setup.seed}:headline`);
  const kind = headlineKind(session, rating);
  const result = resultKind(session);
  const performance = performanceKind(rating);
  return {
    headlineKey: `match.headline.${kind}.${rng.int(0, HEADLINE_VARIANTS - 1)}`,
    headlineParams: {
      player: setup.players[id]!.name,
      club: (own === 0 ? setup.home : setup.away).name,
      opponent: (own === 0 ? setup.away : setup.home).name,
      score: `${m.score[own]}–${m.score[1 - own]}`,
      goals: String(session.state.stats.goals),
      assists: String(session.state.stats.assists),
    },
    // A dismissal (match-16) is what the manager and the fans react to.
    managerReactionKey: session.state.sentOff
      ? `match.reaction.manager.sent-off.${session.state.sentOff.reason}`
      : `match.reaction.manager.${result}.${performance}`,
    fanReactionKey: session.state.sentOff
      ? `match.reaction.fans.sent-off.${result}`
      : `match.reaction.fans.${result}.${performance}`,
  };
}
