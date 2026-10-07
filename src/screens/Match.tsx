import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useAppStore } from '../store';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchCommand,
  type MatchMotion,
} from '../engine/match';
import type { MatchEvent, SlotId } from '../model/domain';
import { errorCode } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { errorText } from '../i18n';
import { matchText as m, matchLabel, matchFormat } from '../i18n/match';
import { careerText as c } from '../i18n/career';
import { Page } from '../ui/Page';
import { Selection } from './match/Selection';
import { Preview } from './match/Preview';
import { Report } from './match/Report';
import { ClubBadge, Factors } from './match/Shared';
import { DecisionPanel } from './match/DecisionPanel';
import { CareerFixture, CareerNoMatch, CareerReportActions } from './match/CareerMatchday';
import { pendingCareerFixture } from '../engine/career/fixtures';
import { careerMatchSetup, defaultTactics } from '../engine/career/matches';
import { startWorldJob } from '../workers/client';
import { competitionName } from './career/selectors';
import { COSMETIC_BY_ID } from '../engine/career/lifestyle/catalogue';
import { lifestyleText as l } from '../i18n/lifestyle';
import '../styles/match.css';

import { useMatchAudio } from './match/useMatchAudio';
import { Tutorial } from '../ui/Tutorial';
import { tutorialText as tt } from '../i18n/tutorial';
const Pitch = lazy(() => import('./match/Pitch'));
/** Real milliseconds per simulated minute at 1× speed. */
const MINUTE_MS = 850;
/**
 * How fast a passage of play is shown: live minutes run at a steady 18× real time and always
 * finish before the next minute; the build-up to a decision and its outcome play slower.
 */
function motionPace(kind: MatchMotion['kind'], speed: number) {
  if (kind === 'minute') return { rate: 18 * speed, maxMs: (MINUTE_MS / speed) * 0.95 };
  if (kind === 'kickoff') return { rate: 1, maxMs: 0 };
  return { rate: 8, maxMs: 3200 };
}
function commentaryText(event: MatchEvent): string {
  return matchFormat(matchLabel(event.commentaryKey), event.commentaryParams ?? {});
}
/** Whether the viewport is at least `query` wide, following resizes. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (change) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
/** The two-column match layout, with the decision beside the pitch. */
const WIDE = '(min-width: 951px)';

export default function MatchScreen() {
  const world = useAppStore((store) => store.world);
  const job = useAppStore((store) => store.worldJob);
  const session = useAppStore((store) => store.matchSession);
  const active = useAppStore((store) => store.activeSave);
  const settings = useAppStore((store) => store.settings);
  const systemReduced = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const attemptedSlot = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const choicesRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery(WIDE);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const state = session?.state;
  const status = state?.match.status;
  const [announcement, setAnnouncement] = useState('');
  const announcedScore = useRef('');
  useMatchAudio(session, playing);
  const momentId = state?.currentMoment?.id;
  const latestEvent = state?.match.events[state.match.events.length - 1];
  const latestText = latestEvent ? commentaryText(latestEvent) : '';
  const scoreText =
    session && state
      ? matchFormat(m.announceScore, {
          home: session.setup.home.name,
          away: session.setup.away.name,
          homeScore: state.match.score[0],
          awayScore: state.match.score[1],
        })
      : '';
  const momentText = state?.currentMoment
    ? matchFormat(m.announceMoment, {
        minute: state.currentMoment.minute,
        situation: matchLabel(state.currentMoment.situationKey),
        count: state.currentMoment.choices.length,
      })
    : '';

  useEffect(() => {
    const slot = params.get('save');
    if (world && active?.payload.kind === 'world' && slot !== String(active.slot)) {
      const next = new URLSearchParams(params);
      next.set('save', String(active.slot));
      setParams(next, { replace: true });
    } else if (
      !world &&
      !job &&
      slot &&
      ['1', '2', '3'].includes(slot) &&
      attemptedSlot.current !== slot
    ) {
      attemptedSlot.current = slot;
      setLoading(true);
      void persistence()
        .then((p) => p.loadSlot(Number(slot) as SlotId))
        .catch((cause: unknown) => setError(errorText(errorCode(cause))))
        .finally(() => setLoading(false));
    }
  }, [world, active, job, params, setParams]);

  const command = useCallback((input: MatchCommand) => {
    const current = useAppStore.getState().matchSession;
    if (!current || useAppStore.getState().worldJob) return;
    try {
      const next = applyMatchCommand(current, input);
      useAppStore.getState().setMatchSession(next);
      setError('');
      if (input.type === 'choose') {
        setOutcomeId(
          next.state.match.events.findLast(
            (event) =>
              event.outcome?.input.momentId === current.state.currentMoment?.id &&
              event.outcome?.input.choiceId === input.choiceId,
          )?.id ?? null,
        );
        setPlaying(false);
      }
      if (
        next.state.match.status !== 'live' ||
        next.state.captainDecisionPending ||
        next.state.substitutionDecisionPending
      )
        setPlaying(false);
    } catch {
      setError(m.error);
      setPlaying(false);
    }
  }, []);

  const nextMoment = useCallback(() => {
    let current = useAppStore.getState().matchSession;
    if (
      !current ||
      useAppStore.getState().worldJob ||
      current.state.captainDecisionPending ||
      current.state.substitutionDecisionPending
    )
      return;
    setPlaying(false);
    setOutcomeId(null);
    try {
      while (
        current.state.match.status === 'live' &&
        !current.state.captainDecisionPending &&
        !current.state.substitutionDecisionPending &&
        current.state.match.minute < 90
      )
        current = applyMatchCommand(current, { type: 'advance' });
      useAppStore.getState().setMatchSession(current);
      setError('');
    } catch {
      setError(m.error);
    }
  }, []);

  useEffect(() => {
    if (
      !playing ||
      status !== 'live' ||
      state?.captainDecisionPending ||
      state?.substitutionDecisionPending ||
      job
    )
      return;
    const timer = window.setInterval(() => {
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        setPlaying(false);
        return;
      }
      command({ type: 'advance' });
    }, MINUTE_MS / speed);
    return () => window.clearInterval(timer);
  }, [
    playing,
    speed,
    status,
    state?.captainDecisionPending,
    state?.substitutionDecisionPending,
    job,
    command,
  ]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    const leave = () => setPlaying(false);
    document.addEventListener('visibilitychange', pause);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') ||
        (event.target instanceof HTMLElement &&
          (event.target.matches('input,select,textarea') || event.target.isContentEditable))
      )
        return;
      const current = useAppStore.getState().matchSession;
      if (!current) return;
      if (
        event.code === 'Space' &&
        current.state.match.status === 'live' &&
        !current.state.captainDecisionPending &&
        !current.state.substitutionDecisionPending
      ) {
        event.preventDefault();
        setOutcomeId(null);
        setPlaying((value) => !value);
      }
      // Focus jumps to the first choice when a moment opens, so a Space pressed to play or
      // pause must not pick that choice by accident; Enter and 1–4 choose.
      if (event.code === 'Space' && current.state.currentMoment) event.preventDefault();
      const choice = current.state.currentMoment?.choices[Number(event.key) - 1];
      if (choice && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        command({ type: 'choose', choiceId: choice.id });
      }
      if (
        current.state.currentMoment &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        const buttons = Array.from(
          choicesRef.current?.querySelectorAll<HTMLButtonElement>('button[data-choice]') ?? [],
        );
        const index = buttons.findIndex((button) => button === document.activeElement);
        const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        event.preventDefault();
        // Reveal the whole choice (clear of the phone tab bar); browsers differ in how far
        // focus alone scrolls.
        const next = buttons[(index + direction + buttons.length) % buttons.length];
        next?.focus({ preventScroll: true });
        next?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [command]);

  // Polite announcements: score changes, then the key moment or the latest commentary line.
  useEffect(() => {
    if (!scoreText) {
      announcedScore.current = '';
      return;
    }
    const scoreChanged = announcedScore.current !== '' && announcedScore.current !== scoreText;
    announcedScore.current = scoreText;
    setAnnouncement(
      [scoreChanged ? scoreText : '', momentText || latestText].filter(Boolean).join(' '),
    );
  }, [scoreText, momentText, latestText, latestEvent?.id]);
  // A new key moment moves focus to its first choice unless the player is typing elsewhere.
  // Focus alone would scroll the pitch away; instead the view starts at the pitch and the
  // decision beside it (wide screens), or at the decision with its situation preview (phones).
  useEffect(() => {
    if (!momentId) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.matches('input:not([type="checkbox"]),select,textarea') || active.isContentEditable)
    )
      return;
    const first = choicesRef.current?.querySelector<HTMLButtonElement>('button[data-choice]');
    if (!first) return;
    first.focus({ preventScroll: true });
    const target = window.matchMedia(WIDE).matches
      ? layoutRef.current
      : first.closest<HTMLElement>('.match-decision');
    target?.scrollIntoView({ block: 'start' });
  }, [momentId]);

  // Career fixtures: the session's setup names the scheduled fixture it plays.
  const careerResult = useAppStore((store) => store.careerResult);
  const careerFixture = session?.setup.fixture;
  const pending = world?.career && !session ? pendingCareerFixture(world) : null;
  const recordResult = useCallback(() => {
    const current = useAppStore.getState().matchSession;
    if (
      !current?.setup.fixture ||
      current.state.match.status !== 'finished' ||
      useAppStore.getState().worldJob
    )
      return;
    void startWorldJob('commit-match', { session: current });
  }, []);
  // Full time reached while playing records the result once. A session restored already
  // finished (after a refresh) waits for the explicit "Record result" action instead.
  const previousStatus = useRef(status);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = status;
    if (status === 'finished' && was && was !== 'finished' && careerFixture) recordResult();
  }, [status, careerFixture, recordResult]);
  const outcome = state?.match.events.find((event) => event.id === outcomeId)?.outcome;
  // The career player's signature celebration after their goals (milestone 7).
  const celebrationItem =
    world?.career?.style?.equipped.celebration &&
    session?.setup.selectedPlayerId === world.career.playerId
      ? COSMETIC_BY_ID[world.career.style.equipped.celebration]
      : undefined;
  const lastEvent = state?.match.events.at(-1);
  const celebration =
    celebrationItem?.motion &&
    lastEvent?.kind === 'goal' &&
    lastEvent.playerId === session?.setup.selectedPlayerId
      ? { key: lastEvent.id, motion: celebrationItem.motion }
      : null;
  const canPlay =
    status === 'live' &&
    !state?.captainDecisionPending &&
    !state?.substitutionDecisionPending &&
    !job;
  const decision = session?.state.currentMoment ? (
    <DecisionPanel
      session={session}
      choicesRef={choicesRef}
      preview={!wide && !settings.simulationOnly}
      onChoose={(choiceId) => command({ type: 'choose', choiceId })}
    />
  ) : null;
  const reset = () => {
    setPlaying(false);
    setOutcomeId(null);
    useAppStore.getState().setMatchSession(null);
  };
  return (
    <Page className="match-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">
            {careerFixture && world
              ? competitionName(world, careerFixture.competitionId)
              : world?.career
                ? c.hub.matchday
                : m.friendly}
          </span>
          <h1>{m.title}</h1>
          <p>{m.description}</p>
        </div>
        {world?.career ? (
          <Link className="button secondary" to="/career">
            {c.report.hub}
          </Link>
        ) : (
          <Link className="button secondary" to="/world">
            {m.backWorld}
          </Link>
        )}
      </header>
      <span
        className="sr-only"
        data-testid="match-state"
        data-status={status ?? 'selection'}
        data-minute={state?.match.minute ?? 0}
      >
        {status ? matchLabel(`match.status.${status}`) : m.selection}
      </span>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="live-updates"
      >
        {announcement}
      </div>
      {world && !active && (
        <p className="notice">
          {m.saveHint} <Link to="/saves">{m.saveLink}</Link>
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">{m.loading}</p>
      ) : !world ? (
        <section className="match-panel">
          <h2>{m.empty}</h2>
          <p>{m.emptyBody}</p>
          <Link className="button" to="/world">
            {m.world}
          </Link>
        </section>
      ) : !session && world.career ? (
        careerResult ? (
          <Report
            session={careerResult.session}
            career={{
              outcome: careerResult.outcome,
              recording: false,
              onRecord: recordResult,
              actions: <CareerReportActions world={world} outcome={careerResult.outcome} />,
            }}
          />
        ) : pending ? (
          <CareerFixture
            world={world}
            fixture={pending}
            disabled={Boolean(job)}
            onPrepare={() => {
              try {
                const current = useAppStore.getState().world;
                if (!current || useAppStore.getState().worldJob) return;
                const fixture = pendingCareerFixture(current);
                if (!fixture) return;
                useAppStore
                  .getState()
                  .setMatchSession(
                    createMatchSession(careerMatchSetup(current, fixture), defaultTactics(current)),
                  );
                setError('');
              } catch {
                setError(m.unavailable);
              }
            }}
          />
        ) : (
          <CareerNoMatch world={world} />
        )
      ) : !session ? (
        job ? (
          <section className="match-panel">
            <p role="status">{m.busy}</p>
          </section>
        ) : (
          <Selection
            world={world}
            onPrepare={(home, away, player, seed) => {
              try {
                if (useAppStore.getState().worldJob) return;
                useAppStore.getState().setMatchSession(
                  createMatchSession(createMatchSetup(world, home, away, player, seed), {
                    role: 'balanced',
                    risk: 'balanced',
                    mentality: 'balanced',
                  }),
                );
                setError('');
              } catch {
                setError(m.unavailable);
              }
            }}
          />
        )
      ) : (
        <>
          <section className="match-scoreboard" aria-label={m.score}>
            <div>
              <ClubBadge club={session.setup.home} />
              <strong>{session.setup.home.name}</strong>
            </div>
            <div className="match-score">
              <span>
                {state!.match.score[0]} <span>–</span> {state!.match.score[1]}
              </span>
              <small>
                {status === 'preview'
                  ? m.preview
                  : status === 'finished'
                    ? m.finished
                    : status === 'halftime'
                      ? m.halftime
                      : status === 'decision'
                        ? m.decision
                        : playing
                          ? m.live
                          : m.paused}{' '}
                · {matchFormat(m.minute, { minute: state!.match.minute })}
              </small>
            </div>
            <div>
              <ClubBadge club={session.setup.away} />
              <strong>{session.setup.away.name}</strong>
            </div>
          </section>
          {status === 'preview' ? (
            <>
              <Preview
                session={session}
                note={careerFixture ? c.report.previewNote : undefined}
                onTactics={(tactics) =>
                  useAppStore.getState().setMatchSession(createMatchSession(session.setup, tactics))
                }
                onKickoff={() => {
                  command({ type: 'kickoff' });
                  setPlaying(false);
                }}
              />
              {!careerFixture && (
                <div className="match-controls" style={{ marginTop: '1rem' }}>
                  <button className="button secondary" onClick={reset}>
                    {m.newFixture}
                  </button>
                </div>
              )}
            </>
          ) : status === 'finished' && careerFixture ? (
            <Report
              session={session}
              career={{
                outcome: null,
                recording: job?.type === 'commit-match',
                onRecord: recordResult,
                actions: null,
              }}
            />
          ) : status === 'finished' ? (
            <Report
              session={session}
              onAgain={() => {
                setOutcomeId(null);
                setPlaying(false);
                useAppStore
                  .getState()
                  .setMatchSession(createMatchSession(session.setup, session.initialTactics));
              }}
              onNew={reset}
            />
          ) : (
            <>
              <div className="match-live-layout" ref={layoutRef}>
                <div className="match-live-main">
                  <section className="match-panel match-pitch-panel">
                    <div className="match-pitch-heading">
                      <strong>{session.setup.home.stadium.name}</strong>
                      <label className="match-toggle">
                        <input
                          type="checkbox"
                          checked={settings.simulationOnly}
                          onChange={(event) =>
                            useAppStore
                              .getState()
                              .updateSettings({ simulationOnly: event.target.checked })
                          }
                        />
                        {m.simulation}
                      </label>
                    </div>
                    {settings.simulationOnly ? (
                      <div className="match-simulation">
                        <span className="match-eyebrow">{m.simulation}</span>
                        <p>{m.simulationBody}</p>
                        <strong>{state!.stats.rating.toFixed(1)}</strong>
                        <span>{m.rating}</span>
                      </div>
                    ) : (
                      <Suspense fallback={<p role="status">{m.pitchLoading}</p>}>
                        <Pitch
                          frame={
                            state!.currentMoment?.frame ?? state!.frames[state!.frames.length - 1]!
                          }
                          home={session.setup.home}
                          away={session.setup.away}
                          selectedPlayerId={session.setup.selectedPlayerId}
                          motion={state!.motion.frames}
                          {...motionPace(state!.motion.kind, speed)}
                          reducedMotion={settings.reducedMotion || !!systemReduced}
                          celebration={celebration}
                        />
                      </Suspense>
                    )}
                    <div className="match-momentum">
                      <span>{m.momentum}</span>
                      <div
                        role="meter"
                        aria-label={m.momentum}
                        aria-valuenow={state!.match.momentum}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ width: `${state!.match.momentum}%` }} />
                      </div>
                    </div>
                  </section>
                  {state!.currentMoment && !wide && decision}
                  {outcome && (
                    <section
                      className="match-panel match-outcome"
                      role="status"
                      data-tour="outcome"
                    >
                      <h2>{outcome.success ? m.succeeded : m.failed}</h2>
                      <p>
                        {matchFormat(m.roll, {
                          probability: (outcome.probability * 100).toFixed(1),
                          roll: (outcome.roll * 100).toFixed(1),
                        })}
                      </p>
                      <Factors factors={outcome.factors} />
                      <p className="muted">{m.returnToPlay}</p>
                    </section>
                  )}
                  {status === 'halftime' && (
                    <section className="match-panel">
                      <span className="match-eyebrow">{m.halftime}</span>
                      <h2>{m.managerTalk}</h2>
                      <div className="match-talk">
                        {(['motivate', 'role', 'complain'] as const).map((response) => (
                          <button
                            className="button secondary"
                            key={response}
                            onClick={() => {
                              setOutcomeId(null);
                              command({ type: 'halftime', response });
                            }}
                          >
                            <strong>{response === 'role' ? m.roleTalk : m[response]}</strong>
                            <span>
                              {response === 'role'
                                ? m.roleBody
                                : response === 'motivate'
                                  ? m.motivateBody
                                  : m.complainBody}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {state!.captainDecisionPending && (
                    <section className="match-panel">
                      <h2>{m.captainTalk}</h2>
                      <div className="match-controls">
                        {(['push', 'calm'] as const).map((instruction) => (
                          <button
                            className="button secondary"
                            key={instruction}
                            onClick={() => command({ type: 'captain', instruction })}
                          >
                            {m[instruction]}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {state!.substituted && (
                    <section className="match-panel" role="status">
                      <h2>{m.substitution}</h2>
                      <p>{m.substitutionBody}</p>
                      {state!.substitutionDecisionPending && (
                        <div className="match-controls">
                          <button
                            className="button secondary"
                            onClick={() => command({ type: 'substitution', response: 'accept' })}
                          >
                            {m.acceptSubstitution}
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => command({ type: 'substitution', response: 'encourage' })}
                          >
                            {m.encourageSubstitution}
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                  <section className="match-panel" data-tour="controls">
                    <div className="match-controls">
                      <button
                        className="button"
                        disabled={!canPlay}
                        onClick={() => {
                          setOutcomeId(null);
                          setPlaying(!playing);
                        }}
                      >
                        {playing ? m.pause : m.play}
                      </button>
                      <div className="match-speeds" role="group" aria-label={m.speed}>
                        {[1, 2, 4].map((value) => (
                          <button
                            key={value}
                            aria-pressed={speed === value}
                            onClick={() => setSpeed(value)}
                          >
                            {matchFormat(m.speedValue, { speed: value })}
                          </button>
                        ))}
                      </div>
                      <button className="button secondary" disabled={!canPlay} onClick={nextMoment}>
                        {m.next}
                      </button>
                    </div>
                    <p className="muted match-shortcuts">{m.shortcuts}</p>
                  </section>
                </div>
                <aside className="match-live-aside">
                  {state!.currentMoment && wide && decision}
                  <section className="match-panel">
                    <h2>{m.stats}</h2>
                    <div className="match-rating">
                      <strong>{state!.stats.rating.toFixed(1)}</strong>
                      <span>{m.rating}</span>
                    </div>
                    <dl className="match-stat-list">
                      <div>
                        <dt>{m.shots}</dt>
                        <dd>
                          {state!.stats.homeShots} – {state!.stats.awayShots}
                        </dd>
                      </div>
                      <div>
                        <dt>{m.possession}</dt>
                        <dd>
                          {state!.stats.homePossession}% – {100 - state!.stats.homePossession}%
                        </dd>
                      </div>
                      <div>
                        <dt>{m.expectedGoals}</dt>
                        <dd>
                          {((state!.expectedGoals[0] * state!.match.minute) / 90).toFixed(2)} –{' '}
                          {((state!.expectedGoals[1] * state!.match.minute) / 90).toFixed(2)}
                        </dd>
                      </div>
                      <div>
                        <dt>{m.passes}</dt>
                        <dd>
                          {state!.stats.passesCompleted}/{state!.stats.passesAttempted}
                        </dd>
                      </div>
                      <div>
                        <dt>{m.fatigue}</dt>
                        <dd>{Math.round(state!.stats.fatigue)}%</dd>
                      </div>
                    </dl>
                  </section>
                  <section className="match-panel match-commentary" data-tour="live">
                    <h2>{m.commentary}</h2>
                    {!state!.match.events.length && <p className="muted">{m.opening}</p>}
                    <ol>
                      {[...state!.match.events].reverse().map((event) => (
                        <li key={event.id}>
                          <time>{matchFormat(m.minute, { minute: event.minute })}</time>
                          <div>
                            <p>{commentaryText(event)}</p>
                            {celebrationItem &&
                              event.kind === 'goal' &&
                              event.playerId === session.setup.selectedPlayerId && (
                                <p className="match-celebration">
                                  {matchFormat(l.celebrations.commentary, {
                                    player: session.setup.players[event.playerId]?.name ?? '',
                                    name: l.celebrations.names[celebrationItem.id] ?? '',
                                  })}
                                </p>
                              )}
                            <small>
                              {event.playerId
                                ? session.setup.players[event.playerId]?.name
                                : event.teamId === session.setup.home.id
                                  ? session.setup.home.name
                                  : session.setup.away.name}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                </aside>
              </div>
            </>
          )}
        </>
      )}
      <Tutorial
        track="match"
        enabled={Boolean(session) && status !== 'finished'}
        steps={[
          { target: 'tactics', ...tt.match.tactics, when: status === 'preview' },
          { target: 'kickoff', ...tt.match.kickoff, action: true, done: status !== 'preview' },
          { target: 'controls', ...tt.match.controls, when: status === 'live' },
          { target: 'live', ...tt.match.live, when: status === 'live' },
          {
            target: 'decision',
            ...tt.match.decision,
            when: status === 'decision',
            action: true,
            done: Boolean(outcome),
          },
          {
            target: 'outcome',
            ...tt.match.outcome,
            when: Boolean(outcome) || status === 'live',
          },
        ]}
      />
    </Page>
  );
}
