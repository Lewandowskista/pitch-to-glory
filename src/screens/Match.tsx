import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useAppStore } from '../store';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchCommand,
} from '../engine/match';
import type { SlotId } from '../model/domain';
import { loadSlot, errorCode } from '../persistence/session';
import { errorText } from '../i18n';
import { matchText as m, matchLabel, matchFormat } from '../i18n/match';
import { Page } from '../ui/Page';
import { Selection } from './match/Selection';
import { Preview } from './match/Preview';
import { Report } from './match/Report';
import { ClubBadge, Factors } from './match/Shared';
import '../styles/match.css';

const Pitch = lazy(() => import('./match/Pitch'));

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
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const state = session?.state;
  const status = state?.match.status;

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
      void loadSlot(Number(slot) as SlotId)
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
      if (document.querySelector('dialog[open], [role="dialog"]')) {
        setPlaying(false);
        return;
      }
      command({ type: 'advance' });
    }, 850 / speed);
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
        document.querySelector('dialog[open], [role="dialog"]') ||
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
        buttons[(index + direction + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [command]);

  const outcome = state?.match.events.find((event) => event.id === outcomeId)?.outcome;
  const canPlay =
    status === 'live' &&
    !state?.captainDecisionPending &&
    !state?.substitutionDecisionPending &&
    !job;
  const reset = () => {
    setPlaying(false);
    setOutcomeId(null);
    useAppStore.getState().setMatchSession(null);
  };
  return (
    <Page className="match-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{m.friendly}</span>
          <h1>{m.title}</h1>
          <p>{m.description}</p>
        </div>
        <Link className="button secondary" to="/world">
          {m.backWorld}
        </Link>
      </header>
      <span
        className="sr-only"
        data-testid="match-state"
        data-status={status ?? 'selection'}
        data-minute={state?.match.minute ?? 0}
      >
        {status ? matchLabel(`match.status.${status}`) : m.selection}
      </span>
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
                onTactics={(tactics) =>
                  useAppStore.getState().setMatchSession(createMatchSession(session.setup, tactics))
                }
                onKickoff={() => {
                  command({ type: 'kickoff' });
                  setPlaying(false);
                }}
              />
              <div className="match-controls" style={{ marginTop: '1rem' }}>
                <button className="button secondary" onClick={reset}>
                  {m.newFixture}
                </button>
              </div>
            </>
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
              <div className="match-live-layout">
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
                          playing={playing}
                          reducedMotion={settings.reducedMotion || !!systemReduced}
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
                  {state!.currentMoment && (
                    <section
                      className="match-panel match-decision"
                      aria-labelledby="decision-heading"
                    >
                      <span className="match-eyebrow">
                        {m.decision} · {matchFormat(m.minute, { minute: state!.match.minute })}
                      </span>
                      <h2 id="decision-heading">{matchLabel(state!.currentMoment.situationKey)}</h2>
                      <div className="match-choices" ref={choicesRef}>
                        {state!.currentMoment.choices.map((choice, index) => (
                          <div className="match-choice" key={choice.id}>
                            <button
                              data-choice={choice.id}
                              onClick={() => command({ type: 'choose', choiceId: choice.id })}
                            >
                              <span className="match-choice-number">{index + 1}</span>
                              <strong>{matchLabel(choice.labelKey)}</strong>
                              <span>
                                {matchFormat(m.chance, {
                                  percent: Math.round(choice.probability * 100),
                                })}
                              </span>
                            </button>
                            <details>
                              <summary>{m.transparency}</summary>
                              <Factors factors={choice.factors} />
                            </details>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {outcome && (
                    <section className="match-panel match-outcome" role="status">
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
                  <section className="match-panel">
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
                  <section className="match-panel match-commentary">
                    <h2>{m.commentary}</h2>
                    {!state!.match.events.length && <p className="muted">{m.opening}</p>}
                    <ol>
                      {[...state!.match.events].reverse().map((event) => (
                        <li key={event.id}>
                          <time>{matchFormat(m.minute, { minute: event.minute })}</time>
                          <div>
                            <p>{matchLabel(event.commentaryKey)}</p>
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
    </Page>
  );
}
