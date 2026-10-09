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
  | 'loss';
export const HEADLINE_KINDS: readonly HeadlineKind[] = [
  'late-winner',
  'late-equaliser',
  'hat-trick',
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
];
export const HEADLINE_VARIANTS = 3;
export type ResultKind = 'win' | 'draw' | 'loss';
export type PerformanceKind = 'star' | 'solid' | 'poor';
/** Rating at or above which a performance is a star turn, and below which it is poor. */
const STAR = 7.3,
  POOR = 6.3;
const LATE = 85;

export function headlineKind(session: MatchSession, rating: number): HeadlineKind {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const id = setup.selectedPlayerId;
  const own = setup.players[id]!.clubId === setup.home.id ? 0 : 1;
  const margin = m.score[own]! - m.score[1 - own]!;
  const goals = s.stats.goals;
  const lateGoal = m.events.some((e) => e.kind === 'goal' && e.playerId === id && e.minute >= LATE);
  const back = ['GK', 'CB', 'LB', 'RB', 'DM'].includes(setup.players[id]!.primaryPosition);
  const savedPenalty = m.keyMoments.some(
    (moment) =>
      moment.situationId === 'penalty-save' &&
      m.events.some((e) => e.outcome?.input.momentId === moment.id && e.outcome.success),
  );
  if (lateGoal && margin === 1) return 'late-winner';
  if (lateGoal && margin === 0) return 'late-equaliser';
  if (goals >= 3) return 'hat-trick';
  if (savedPenalty && margin >= 0) return 'penalty-save';
  if (goals === 2 && margin >= 0) return 'brace';
  if (goals > 0) return margin > 0 ? 'scorer-win' : margin === 0 ? 'scorer-draw' : 'scorer-loss';
  if (s.stats.assists >= 2 && margin >= 0) return 'provider';
  if (s.stats.errors >= 2 && margin < 0) return 'nightmare';
  if (back && m.score[1 - own] === 0 && margin >= 0 && rating >= 7 && !s.substituted) return 'wall';
  if (margin >= 3) return 'rout';
  if (margin <= -3) return 'thrashed';
  if (margin > 0) return rating >= STAR ? 'strong-win' : 'win';
  if (margin === 0) return 'draw';
  return rating >= STAR ? 'strong-loss' : 'loss';
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
    managerReactionKey: `match.reaction.manager.${result}.${performance}`,
    fanReactionKey: `match.reaction.fans.${result}.${performance}`,
  };
}
