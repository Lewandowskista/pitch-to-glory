import { useId, useMemo } from 'react';
import type { DecisionOutcome, ProbabilityFactor, World } from '../../model/domain';
import { plural } from '../../i18n/locale';
import type { MatchSession } from '../../engine/match';
import { renderAvatar } from '../../engine/assets/avatar';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { Artwork } from '../../ui/Artwork';
import { cx } from '../../ui/kit';
import { Factors, strongest, verdictOf } from './Shared';
import { selectedSide, surname } from './cam';

/*
 * What interrupts live play: the half-time talk, the captain's call, a substitution, a dismissal
 * and a decision's outcome. Loaded with the match session (release 1.0 step 5.4, to keep the live
 * screen's first load within its budget) rather than with the page; each shows only at its
 * moment, by which time it has arrived.
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
  const icons = {
    motivate: 'M4 10V14H7L13 18V6L7 10ZM16 9Q18 12 16 15M18.5 7Q22 12 18.5 17',
    role: 'M4 8H17M13 4L17 8L13 12M20 16H7M11 12L7 16L11 20',
    complain: 'M5 21V4M5 4H17L14 8L17 12H5',
  } as const;
  return (
    <section className="match-panel match-interrupt" aria-labelledby={`${id}-ht`}>
      <div className="match-interrupt-head">
        <ManagerFace world={world} clubId={own.id} />
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            <span className="match-pill">{m.halftime}</span>
            {matchFormat(u.halftimeMeta, {
              home: setup.home.name,
              away: setup.away.name,
              homeScore: state.match.score[0],
              awayScore: state.match.score[1],
            })}
            {manager ? ` · ${manager.name}` : ''}
          </p>
          <h2 id={`${id}-ht`} className="match-interrupt-title">
            {m.managerTalk}
          </h2>
        </div>
      </div>
      <div className="match-talk">
        {(['motivate', 'role', 'complain'] as const).map((response) => (
          <button
            type="button"
            className={`match-talk-option is-${response}`}
            key={response}
            onClick={() => onTalk(response)}
          >
            <span className="match-talk-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  d={icons[response]}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <strong>
              {response === 'role' ? m.roleTalk : response === 'complain' ? m.demand : m[response]}
            </strong>
            <span>
              {response === 'role'
                ? m.roleBody
                : response === 'motivate'
                  ? m.motivateBody
                  : m.demandBody}
            </span>
          </button>
        ))}
      </div>
      <p className="match-card-note">{u.halftimeNote}</p>
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

/**
 * After a decision: success or not, the roll against the chance, every signed factor summing
 * to that chance, the biggest help or drag, and "Continue play" (nothing counts down).
 */
export function OutcomePanel({
  outcome,
  minute,
  choice,
  onContinue,
}: {
  outcome: DecisionOutcome;
  minute: number;
  choice: string;
  onContinue: () => void;
}) {
  const id = useId();
  const chance = outcome.probability * 100;
  const roll = outcome.roll * 100;
  const verdict = verdictOf(outcome.probability, outcome.success);
  const key = outcome.success ? strongest(outcome.factors, 1) : strongest(outcome.factors, -1);
  const shown = (factor: ProbabilityFactor) => Number((factor.contribution * 100).toFixed(1)) !== 0;
  const moved = outcome.factors.filter(shown);
  const still = outcome.factors.filter((factor) => !shown(factor));
  return (
    <section
      className={cx('match-panel match-outcome', outcome.success ? 'is-success' : 'is-miss')}
      role="status"
      data-tour="outcome"
      aria-labelledby={`${id}-outcome`}
    >
      <div className="match-outcome-head">
        <span className="match-outcome-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path
              d={outcome.success ? 'M5 12L10 17L19 7' : 'M6 6L18 18M18 6L6 18'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="match-interrupt-meta">{matchFormat(u.outcomeChose, { minute, choice })}</p>
          <h2 id={`${id}-outcome`} className="match-outcome-title">
            {outcome.success ? m.succeeded : m.failed}
          </h2>
        </div>
      </div>
      <div className="match-roll">
        <div className="match-roll-track" aria-hidden="true">
          <span className="match-roll-zone" style={{ width: `${chance}%` }} />
          <span className="match-roll-label is-zone">
            {matchFormat(u.successZone, { chance: chance.toFixed(1) })}
          </span>
          <span className="match-roll-label is-miss">{u.miss}</span>
          <span
            className="match-roll-marker"
            style={{ left: `${Math.min(99, Math.max(1, roll))}%` }}
          >
            <span>{matchFormat(u.rollTag, { roll: roll.toFixed(1) })}</span>
          </span>
        </div>
        <p className="match-roll-line">
          {matchFormat(m.roll, { probability: chance.toFixed(1), roll: roll.toFixed(1) })}
        </p>
        <p className="sr-only">
          {matchFormat(outcome.success ? u.rollInside : u.rollOutside, {
            roll: roll.toFixed(1),
            chance: chance.toFixed(1),
          })}
        </p>
        <p className="match-card-note">{u.rollExplain}</p>
      </div>
      {verdict && <p className="match-verdict">{verdict}</p>}
      {outcome.booking && (
        // A failed defending choice's booking roll (match-16), on its own stream.
        <p className="match-booking-roll">
          <span
            className={cx(
              'match-card-chip',
              !outcome.booking.card && 'is-none',
              outcome.booking.card && outcome.booking.card !== 'yellow' && 'is-red',
            )}
            aria-hidden="true"
          />
          {matchFormat(u.bookingRoll, {
            roll: (outcome.booking.roll * 100).toFixed(1),
            chance: (outcome.booking.foul * 100).toFixed(1),
            result: u.bookingResults[outcome.booking.card ?? 'none'],
          })}
        </p>
      )}
      <div>
        <h3 className="match-factors-title">{m.factors}</h3>
        {/* What moved the chance; the factors that moved nothing fold away (review U13). */}
        <Factors factors={moved} total={outcome.probability} />
        {still.length > 0 && (
          <details className="match-factors-more">
            <summary>{plural(still.length, u.zeroFactors)}</summary>
            <Factors factors={still} />
          </details>
        )}
      </div>
      {key && (
        <p className="match-key-factor">
          {matchFormat(outcome.success ? u.biggestHelp : u.biggestDrag, {
            factor: matchLabel(key.labelKey),
          })}
        </p>
      )}
      <div className="match-outcome-actions">
        <button type="button" className="button" onClick={onContinue}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4L19 12L7 20Z" fill="currentColor" />
          </svg>
          {u.continuePlay}
        </button>
        <span className="match-card-note">
          {m.returnToPlay} <kbd>Space</kbd>
        </span>
      </div>
    </section>
  );
}
