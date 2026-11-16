import { useId, type CSSProperties } from 'react';
import type { MatchSetup } from '../../engine/match';
import { goalCopy as g } from '../../i18n/goals';
import { matchFormat } from '../../i18n/match';
import { cx } from '../../ui/kit';
import { ClubBadge } from './Shared';
import { surname } from './cam';
import type { GoalStory } from './goals';

/**
 * The GOAL banner (release 1.0, step 5.1): the scoring club and its colour, the new score with
 * the scoring side lit, the scorer and minute, the commentary line, and the instant replay.
 * Over the live pitch it rises in once the ball is in the net; as a strip it heads a decision's
 * outcome or the simulation card. Reduced motion shows it without movement.
 */
export default function GoalBanner({
  setup,
  story,
  line,
  colour,
  placement,
  onReplay,
  replaying = false,
}: {
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>;
  story: GoalStory;
  line: string;
  /** The scoring side's colour on the pitch. */
  colour: string;
  placement: 'pitch' | 'strip';
  /** Offered while the goal's passage can be played again on the live pitch. */
  onReplay?: () => void;
  replaying?: boolean;
}) {
  const id = useId();
  const club = story.side === 0 ? setup.home : setup.away;
  const scorer = story.event.playerId ? setup.players[story.event.playerId] : undefined;
  const yours = story.event.playerId === setup.selectedPlayerId && !story.own;
  return (
    <>
      {/* While the goal is replayed, a chip says so and the pitch stays clear. */}
      {replaying && (
        <span className="match-goal-replaying" data-testid="goal-replaying">
          {g.replaying}
        </span>
      )}
      <section
        className={cx('match-goal', `is-${placement}`)}
        aria-labelledby={`${id}-title`}
        data-testid="goal-banner"
        hidden={replaying}
        style={{ '--goal-colour': colour } as CSSProperties}
      >
        <div className="match-goal-card">
          <span className="match-goal-band" aria-hidden="true" />
          <ClubBadge club={club} className="match-goal-crest" />
          <h2 id={`${id}-title`} className="match-goal-title">
            {story.own ? g.ownGoal : g.goal}
          </h2>
          <div className="match-goal-meta">
            <p className="match-goal-score">
              <span className={cx(story.side === 0 && 'is-scorer')}>{setup.home.name}</span>{' '}
              <strong>
                {story.score[0]}–{story.score[1]}
              </strong>{' '}
              <span className={cx(story.side === 1 && 'is-scorer')}>{setup.away.name}</span>
            </p>
            <p className="match-goal-scorer">
              {matchFormat(g.scorer, {
                scorer: scorer ? surname(scorer.name) : club.name,
                minute: story.event.minute,
              })}
              {yours && <span className="match-goal-you">{g.yourGoal}</span>}
            </p>
          </div>
          <p className="match-goal-line">{line}</p>
          {onReplay && (
            <button
              type="button"
              className="match-goal-replay"
              onClick={onReplay}
              title={g.replayHint}
              aria-keyshortcuts="R"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 12A8 8 0 1 0 7 5.8M4 4V9H9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {g.replay}
              <kbd aria-hidden="true">R</kbd>
            </button>
          )}
        </div>
      </section>
    </>
  );
}
