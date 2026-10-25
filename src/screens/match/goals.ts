import type { MatchEvent } from '../../model/domain';
import type { MatchSetup } from '../../engine/match';
import { hashSeed } from '../../engine/rng';
import { goalCopy } from '../../i18n/goals';
import { matchFormat } from '../../i18n/match';

/** What a goal meant when it went in (release 1.0, step 5.1), read from the event log. */
export interface GoalStory {
  event: MatchEvent;
  /** The side credited with the goal: 0 home, 1 away. */
  side: 0 | 1;
  /** The score once it went in, home first. */
  score: [number, number];
  /** Scored by a player of the other side (no engine produces these yet; read if one does). */
  own: boolean;
  context: 'equaliser' | 'goAhead' | 'other';
  /** In the 85th minute or later. */
  late: boolean;
}

/** A goal event's story: who it counted for, the score after it, and what it changed. */
export function goalStory(
  setup: Pick<MatchSetup, 'home' | 'away'>,
  events: readonly MatchEvent[],
  event: MatchEvent,
): GoalStory {
  const score: [number, number] = [0, 0];
  for (const entry of events) {
    if (entry.kind === 'goal') score[entry.teamId === setup.home.id ? 0 : 1]++;
    if (entry.id === event.id) break;
  }
  const side = event.teamId === setup.home.id ? 0 : 1;
  const scorerSide = event.playerId
    ? setup.home.playerIds.includes(event.playerId)
      ? 0
      : setup.away.playerIds.includes(event.playerId)
        ? 1
        : side
    : side;
  const before = side === 0 ? score[0] - 1 - score[1] : score[1] - 1 - score[0];
  return {
    event,
    side,
    score,
    own: scorerSide !== side,
    context:
      before === -1 ? 'equaliser' : before === 0 && score[0] + score[1] > 1 ? 'goAhead' : 'other',
    late: event.minute >= 85,
  };
}

/**
 * The commentary line for a goal, naming the team and the new score. The variant is drawn from
 * the event id, so a goal reads the same on every render and after a reload.
 */
export function goalLine(
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'neutral'>,
  story: GoalStory,
): string {
  const lines = goalCopy.lines;
  const pool = story.own
    ? lines.ownGoal
    : story.late && story.context === 'equaliser'
      ? lines.lateEqualiser
      : story.late && story.context === 'goAhead'
        ? lines.lateGoAhead
        : story.context === 'equaliser'
          ? lines.equaliser
          : story.context === 'goAhead'
            ? lines.goAhead
            : setup.neutral
              ? lines.neutral
              : story.side === 0
                ? lines.home
                : lines.away;
  const team = story.side === 0 ? setup.home : setup.away;
  const opponent = story.side === 0 ? setup.away : setup.home;
  return matchFormat(pool[hashSeed(story.event.id) % pool.length]!, {
    scorer: (story.event.playerId && setup.players[story.event.playerId]?.name) || team.name,
    team: team.name,
    opponent: opponent.name,
    minute: story.event.minute,
    scoreline: scoreline(setup, story.score),
  });
}

/** "Vale 2–1 Ashby". */
export const scoreline = (setup: Pick<MatchSetup, 'home' | 'away'>, score: [number, number]) =>
  `${setup.home.name} ${score[0]}–${score[1]} ${setup.away.name}`;
