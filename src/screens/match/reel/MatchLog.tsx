import { useEffect, useId, useMemo, useRef } from 'react';
import type { MatchSession } from '../../../engine/match';
import { reelText as r } from '../../../i18n/reel';
import { matchText as m, matchFormat } from '../../../i18n/match';
import { celebrationCommentary } from '../../../i18n/celebrations';
import { cx } from '../../../ui/kit';
import { buildFeed, type FeedRow, type NarrationLine } from '../feed';
import { clockText } from './clock';
import type * as Lines from '../lines';

const ICON: Record<FeedRow['kind'], string> = {
  moment: 'M12 3L14.6 9L21 9.5L16 13.6L17.6 20L12 16.6L6.4 20L8 13.6L3 9.5L9.4 9Z',
  goal: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3ZM12 8L15.5 10.5L14.2 14.5H9.8L8.5 10.5Z',
  whistle: 'M12 7V12L15 14M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3Z',
  save: 'M5 12L10 17L19 7',
  card: 'M8 4H16V20H8Z',
  substitution: 'M4 8H17M13 4L17 8L13 12M20 16H7M11 12L7 16L11 20',
  play: 'M5 12H19M13 6L19 12L13 18',
  line: 'M5 12H19',
};

/**
 * The Match log (docs/EXPERIENCE-REDESIGN-1.0.md §1.2): the full commentary, newest first, in a
 * sheet over the reel — from the bottom on phones, beside it on wide screens. It is a modal
 * dialog in the address (`?log=1`), so Back, Escape and the close button all shut it and
 * focus returns to the button that opened it.
 */
export function MatchLog({
  session,
  lines,
  narration,
  hidden,
  celebration,
  onClose,
}: {
  session: MatchSession;
  lines?: typeof Lines;
  narration?: readonly NarrationLine[];
  /** A goal still being shown on the pitch. */
  hidden?: string;
  celebration?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { setup, state } = session;
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  const rows = useMemo(() => {
    if (!lines) return [];
    const words = lines.feedLines({ setup, state });
    return buildFeed(
      hidden ? state.match.events.filter((event) => event.id !== hidden) : state.match.events,
      words.text,
      (event) =>
        event.playerId
          ? setup.players[event.playerId]?.name
          : event.teamId === setup.home.id
            ? setup.home.name
            : setup.away.name,
      hidden ? narration?.filter((line) => line.eventId !== hidden) : narration,
      { spell: words.spell },
    );
  }, [lines, state, setup, narration, hidden]);
  return (
    <dialog
      ref={ref}
      className="reel-log"
      aria-labelledby={`${id}-title`}
      data-testid="match-log"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="reel-log-sheet">
        <div className="reel-log-head">
          <h2 id={`${id}-title`}>{r.log}</h2>
          <button type="button" className="reel-log-close" onClick={onClose}>
            {r.logClose}
          </button>
        </div>
        {!rows.length && (
          <p className="match-card-note">
            {lines || !state.match.events.length ? r.logEmpty : r.logLoading}
          </p>
        )}
        <ol className="reel-log-list" tabIndex={0} aria-labelledby={`${id}-title`}>
          {rows.map((row) => (
            <li
              key={row.id}
              className={cx(
                `is-${row.kind}`,
                row.event?.card && row.event.card !== 'yellow' && 'is-red',
              )}
            >
              <time>{clockText(row.minute, row.addedTime)}</time>
              <span className="reel-log-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path
                    d={ICON[row.kind]}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <p>
                  {row.kind === 'goal' && <span className="reel-log-tag">{m.ui.goalTag}</span>}
                  {row.kind === 'moment' && <span className="reel-log-tag">{m.ui.momentTag}</span>}
                  {row.text}
                </p>
                {celebration &&
                  row.event?.kind === 'goal' &&
                  row.event.playerId === setup.selectedPlayerId && (
                    <p className="reel-log-celebration">
                      {matchFormat(celebrationCommentary, {
                        player: setup.players[row.event.playerId]?.name ?? '',
                        name: celebration,
                      })}
                    </p>
                  )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </dialog>
  );
}
