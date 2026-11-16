import { useEffect, useId, useMemo, useRef } from 'react';
import type { World } from '../../model/domain';
import type { MatchSession } from '../../engine/match';
import { renderAvatar } from '../../engine/assets/avatar';
import { matchText as m, matchFormat } from '../../i18n/match';
import { reelText as r } from '../../i18n/reel';
import { Artwork } from '../../ui/Artwork';
import { selectedSide, surname } from './cam';

/*
 * What interrupts live play: the half-time talk, the captain's call, a substitution and a
 * dismissal, as compact cards in the reel (release 1.0, X1b). Loaded with the match session
 * (step 5.4, to keep the live screen's first load within its budget) rather than with the page;
 * each shows only at its moment, by which time it has arrived. A decision's outcome is no longer
 * a panel: it is the reel's inline beat.
 */
const u = m.ui;

/** The manager's portrait, when the world knows the manager. */
function ManagerFace({ world, clubId }: { world: World | null; clubId: string }) {
  const manager = world ? world.managers[world.clubs[clubId]?.managerId ?? ''] : undefined;
  const svg = useMemo(
    () => (manager ? renderAvatar(manager.avatar, manager.age) : null),
    [manager],
  );
  if (!manager || !svg) return null;
  return <Artwork svg={svg} alt={manager.name} className="match-manager-face" />;
}

/** Half-time: three answers to the manager, each with what it does. */
export function HalfTimePanel({
  session,
  world,
  onTalk,
}: {
  session: MatchSession;
  world: World | null;
  onTalk: (response: 'motivate' | 'role' | 'complain') => void;
}) {
  const { setup, state } = session;
  const id = useId();
  const own = selectedSide(setup) === 0 ? setup.home : setup.away;
  const manager = world?.managers[world.clubs[own.id]?.managerId ?? ''];
  const first = useRef<HTMLButtonElement>(null);
  // The manager's pick is pre-selected: focused, so Enter answers with it.
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      className="reel-interrupt is-halftime"
      aria-labelledby={`${id}-ht`}
      data-testid="halftime-talk"
    >
      <div className="match-interrupt-head">
        <ManagerFace world={world} clubId={own.id} />
        <div className="min-w-0">
          <p className="reel-interrupt-meta">
            <span className="match-pill">{m.halftime}</span>
            {matchFormat(u.halftimeMeta, {
              home: setup.home.name,
              away: setup.away.name,
              homeScore: state.match.score[0],
              awayScore: state.match.score[1],
            })}
            {manager ? ` · ${manager.name}` : ''}
          </p>
          <h2 id={`${id}-ht`} className="reel-interrupt-title">
            {m.managerTalk}
          </h2>
        </div>
      </div>
      <div className="reel-interrupt-options">
        {(['motivate', 'complain'] as const).map((response, index) => (
          <button
            type="button"
            className="reel-interrupt-option"
            key={response}
            ref={index === 0 ? first : undefined}
            data-default={index === 0 ? '' : undefined}
            onClick={() => onTalk(response)}
          >
            <strong>
              {response === 'complain' ? m.demand : m[response]}
              {index === 0 && <span className="reel-pick">{r.halftime.pick}</span>}
            </strong>
            <span>{response === 'motivate' ? m.motivateBody : m.demandBody}</span>
          </button>
        ))}
      </div>
      <p className="reel-interrupt-note">{r.halftime.resume}</p>
    </section>
  );
}

/** The captain's call: two ways to set the tone, on the always-dark captain card. */
export function CaptainPanel({
  session,
  onCall,
}: {
  session: MatchSession;
  onCall: (instruction: 'push' | 'calm') => void;
}) {
  const { state } = session;
  const id = useId();
  return (
    <section className="match-captain" aria-labelledby={`${id}-captain`}>
      <div className="match-interrupt-head">
        <span className="match-armband" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24">
            <path d="M3 9H21V15H3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M9.5 10.6Q8 10.6 8 12Q8 13.4 9.5 13.4M12 10.6V13.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div>
          <p className="match-interrupt-meta is-dark">
            {matchFormat(u.captainMeta, {
              minute: state.match.minute,
              score: `${state.match.score[0]}–${state.match.score[1]}`,
            })}
          </p>
          <h2 id={`${id}-captain`} className="match-interrupt-title">
            {m.captainTalk}
          </h2>
        </div>
      </div>
      <div className="match-captain-options">
        {(['push', 'calm'] as const).map((instruction) => (
          <button type="button" key={instruction} onClick={() => onCall(instruction)}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d={instruction === 'push' ? 'M12 20V5M6 11L12 5L18 11' : 'M4 9H20M4 15H20'}
                fill="none"
                stroke={instruction === 'push' ? 'var(--color-gold)' : 'var(--color-mint)'}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {m[instruction]}
          </button>
        ))}
      </div>
      <p className="match-captain-note">{u.captainNote}</p>
    </section>
  );
}

/** Substituted: the board with your number, and your answer while it is still open. */
export function SubstitutionPanel({
  session,
  onResponse,
}: {
  session: MatchSession;
  onResponse: (response: 'accept' | 'encourage') => void;
}) {
  const { setup, state } = session;
  const id = useId();
  const player = setup.players[setup.selectedPlayerId]!;
  const off = state.match.events.findLast(
    (event) => event.kind === 'substitution' && event.playerId === player.id,
  );
  // The engine names who comes on (match-15).
  const incoming = off?.receiverId ? setup.players[off.receiverId] : undefined;
  return (
    <section className="match-panel match-interrupt" role="status" aria-labelledby={`${id}-sub`}>
      <div className="match-interrupt-head">
        <div className="match-sub-board">
          <span className="sr-only">
            {incoming
              ? matchFormat(u.substitutionBoardOn, {
                  number: player.squadNumber,
                  incoming: incoming.squadNumber,
                })
              : matchFormat(u.substitutionBoard, { number: player.squadNumber })}
          </span>
          <span aria-hidden="true">
            <small>{u.off}</small>
            {player.squadNumber}
          </span>
          {incoming && (
            <span aria-hidden="true" className="is-on">
              <small>{u.on}</small>
              {incoming.squadNumber}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            {incoming
              ? matchFormat(u.substitutionMetaOn, {
                  minute: off?.minute ?? state.match.minute,
                  name: surname(player.name),
                  incoming: surname(incoming.name),
                })
              : matchFormat(u.substitutionMeta, {
                  minute: off?.minute ?? state.match.minute,
                  name: surname(player.name),
                })}
          </p>
          <h2 id={`${id}-sub`} className="match-interrupt-title">
            {m.substitution}
          </h2>
        </div>
      </div>
      <p>{m.substitutionBody}</p>
      {state.substitutionDecisionPending && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="button secondary" onClick={() => onResponse('accept')}>
            {m.acceptSubstitution}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => onResponse('encourage')}
          >
            {m.encourageSubstitution}
          </button>
        </div>
      )}
      <p className="match-card-note">{u.substitutionNote}</p>
    </section>
  );
}

/**
 * The career player is sent off (match-16): the card, the minute and why, and what happens
 * now. Nothing to answer: the match plays on to full time without them.
 */
export function SentOffPanel({ session }: { session: MatchSession }) {
  const { setup, state } = session;
  const id = useId();
  const sentOff = state.sentOff!;
  const player = setup.players[setup.selectedPlayerId]!;
  return (
    <section className="match-panel match-interrupt" role="status" aria-labelledby={`${id}-off`}>
      <div className="match-interrupt-head">
        <span className="match-card-chip is-red is-large" aria-hidden="true" />
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            {surname(player.name)} ·{' '}
            {matchFormat(u.sentOffMeta, {
              minute: sentOff.minute,
              reason: u.sentOffReasons[sentOff.reason],
            })}
          </p>
          <h2 id={`${id}-off`} className="match-interrupt-title">
            {u.sentOff}
          </h2>
        </div>
      </div>
      <p>{u.sentOffBody}</p>
      {setup.fixture && <p className="match-card-note">{u.sentOffBan}</p>}
    </section>
  );
}
