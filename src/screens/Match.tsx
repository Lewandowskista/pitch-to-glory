import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { lazyPage } from '../ui/lazyPage';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchCommand,
  type MatchMotion,
} from '../engine/match';
import type { SlotId } from '../model/domain';
import { errorCode } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { errorText, format } from '../i18n';
import {
  matchText as m,
  matchLabel,
  matchFormat,
  pressureText,
  situationText,
} from '../i18n/match';
import { pitchCopy } from '../i18n/pitch';
import { careerText as c } from '../i18n/career';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { FootballIllustration } from '../ui/FootballIllustration';
import { Selection } from './match/Selection';
import { Preview } from './match/Preview';
import { Report } from './match/Report';
import { DecisionPanel, DecisionReplay } from './match/DecisionPanel';
import { CareerFixture, CareerNoMatch, CareerReportActions } from './match/CareerMatchday';
import {
  CaptainPanel,
  CommentaryCard,
  commentaryText,
  HalfTimePanel,
  MatchControls,
  OutcomePanel,
  PitchOverlay,
  RatingCard,
  Scoreboard,
  SimulationCard,
  StatsCard,
  SubstitutionPanel,
  Timeline,
} from './match/Live';
import type { NarrationLine } from './match/feed';
import { narrationFeed } from '../i18n/narration';
import { pendingCareerFixture } from '../engine/career/fixtures';
import { careerMatchSetup, defaultTactics } from '../engine/career/matches';
import { startWorldJob } from '../workers/client';
import { competitionName } from './career/selectors';
import { CareerSelectionBriefing } from './match/SelectionBriefing';
import { COSMETIC_BY_ID } from '../engine/career/lifestyle/catalogue';
import { lifestyleText as l } from '../i18n/lifestyle';
import '../styles/match.css';

import { useMatchAudio } from './match/useMatchAudio';
import { preparePlayback } from './match/playback';
import { shirtNumbers } from './match/pitchArt';
import { Tutorial } from '../ui/Tutorial';
import { tutorialText as tt } from '../i18n/tutorial';
import { StakeLine } from './career/stakesUi';
const Pitch = lazyPage(() => import('./match/Pitch'));
/** Real milliseconds per simulated minute at 1× speed. */
const MINUTE_MS = 2200;
/**
 * Normal play leaves time to follow the ball; decision build-ups and outcomes play slower.
 */
function motionPace(kind: MatchMotion['kind'], speed: number) {
  if (kind === 'minute') return { rate: 18 * speed, maxMs: (MINUTE_MS / speed) * 0.95 };
  if (kind === 'kickoff') return { rate: 1, maxMs: 0 };
  return { rate: 6, maxMs: 4200 };
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
/** The two-column match layout, with the live numbers beside the pitch. */
const WIDE = '(min-width: 951px)';

export default function MatchScreen() {
  const world = useAppStore((store) => store.world);
  const job = useAppStore((store) => store.worldJob);
  const session = useAppStore((store) => store.matchSession);
  const active = useAppStore((store) => store.activeSave);
  const settings = useAppStore((store) => store.settings);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
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
  const motion = state?.motion;
  const status = state?.match.status;
  const [announcement, setAnnouncement] = useState('');
  const announcedScore = useRef('');
  useMatchAudio(session, playing);
  // Beat-based narration (engine M3) joins the commentary through the feed adapter.
  const narration = useMemo<NarrationLine[] | undefined>(
    () =>
      session?.state.narration
        ? narrationFeed(session).map((entry) => ({
            id: String(entry.index),
            minute: entry.minute,
            text: entry.text,
            ...(entry.eventId ? { eventId: entry.eventId } : {}),
          }))
        : undefined,
    [session],
  );
  const reduced = settings.reducedMotion || systemReduced;
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
        situation: [pressureText(state.currentMoment), situationText(state.currentMoment)]
          .filter(Boolean)
          .join(' '),
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
    const pace = motionPace(motion!.kind, speed);
    const passage = preparePlayback(motion!.frames, pace.rate, pace.maxMs);
    const timer = window.setTimeout(
      () => {
        if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
          setPlaying(false);
          return;
        }
        command({ type: 'advance' });
      },
      Math.max(MINUTE_MS / speed, passage.duration + 80 / speed),
    );
    return () => window.clearTimeout(timer);
  }, [
    playing,
    speed,
    status,
    state?.captainDecisionPending,
    state?.substitutionDecisionPending,
    motion,
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
  // Focus alone would scroll the camera away; instead the view starts at the camera and the
  // choices under it (wide screens), or at the decision with its camera (phones).
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
  const outcomeEvent = state?.match.events.find((event) => event.id === outcomeId);
  const outcome = outcomeEvent?.outcome;
  const outcomeMoment = outcome
    ? state?.match.keyMoments.find((moment) => moment.id === outcome.input.momentId)
    : undefined;
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
  const deciding = Boolean(state?.currentMoment);
  const camera = !settings.simulationOnly;
  const replaying = Boolean(outcome && outcomeMoment && camera && motion?.kind === 'outcome');
  // While the camera has the stage, the live pitch waits out of view.
  const pitchAway = camera && (deciding || replaying);
  const reset = () => {
    setPlaying(false);
    setOutcomeId(null);
    useAppStore.getState().setMatchSession(null);
  };
  const competition =
    careerFixture && world
      ? [
          competitionName(world, careerFixture.competitionId),
          world.fixtures[careerFixture.id]
            ? format(m.ui.week, { week: world.fixtures[careerFixture.id]!.date.week })
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : m.friendly;
  const inMatch = Boolean(session) && status !== 'preview' && status !== 'finished';
  const numbers = session ? shirtNumbers(session.setup.players) : undefined;
  return (
    <Page className={`match-page${inMatch ? ' is-live' : ''}`}>
      <header className={`page-heading match-heading${inMatch ? ' is-quiet' : ''}`}>
        <div>
          {/* The competition (or a friendly); never a repeat of the title. */}
          {(careerFixture || !world?.career) && (
            <span className="eyebrow">
              {careerFixture && world
                ? competitionName(world, careerFixture.competitionId)
                : m.friendly}
            </span>
          )}
          <h1>{m.title}</h1>
          <p>{m.description}</p>
        </div>
        {!inMatch && (
          <Link className="match-back" to={world?.career ? '/career' : '/world'}>
            <Icon name="arrow" />
            {world?.career ? c.report.hub : m.backWorld}
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
        <p className="notice match-notice">
          <Icon name="save" />
          <span>
            {m.saveHint} <Link to="/saves">{m.saveLink}</Link>
          </span>
        </p>
      )}
      {error && (
        <p className="notice error match-notice" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </p>
      )}
      {loading ? (
        <section className="match-panel match-loading">
          <span className="match-spinner" aria-hidden="true" />
          <p role="status">{m.loading}</p>
        </section>
      ) : !world ? (
        <section className="match-panel match-empty illustrated-empty max-w-3xl">
          <div className="grid justify-items-start gap-4">
            <span className="match-empty-icon" aria-hidden="true">
              <Icon name="globe" />
            </span>
            <h2>{m.empty}</h2>
            <p>{m.emptyBody}</p>
            <Link className="button" to="/world">
              {m.world}
            </Link>
          </div>
          <FootballIllustration kind="match" />
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
          <section className="match-panel match-busy">
            <span className="match-spinner is-info" aria-hidden="true" />
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
        <div className={inMatch ? 'match-live' : 'match-session'}>
          <Scoreboard
            session={session}
            status={status!}
            playing={playing}
            competition={competition}
            stadium={session.setup.neutral ? undefined : session.setup.home.stadium.name}
            controls={
              inMatch ? (
                <MatchControls
                  playing={playing}
                  canPlay={canPlay}
                  speed={speed}
                  onToggle={() => {
                    setOutcomeId(null);
                    setPlaying(!playing);
                  }}
                  onSpeed={setSpeed}
                  onNext={nextMoment}
                />
              ) : undefined
            }
          />
          {status === 'preview' ? (
            <Preview
              session={session}
              note={careerFixture ? c.report.previewNote : undefined}
              stake={
                careerFixture && world?.career && world.fixtures[careerFixture.id] ? (
                  <StakeLine
                    world={world}
                    fixture={world.fixtures[careerFixture.id]!}
                    tone="panel"
                  />
                ) : undefined
              }
              selection={
                careerFixture && world?.career && world.fixtures[careerFixture.id] ? (
                  <CareerSelectionBriefing world={world} fixtureId={careerFixture.id} />
                ) : undefined
              }
              onTactics={(tactics) =>
                useAppStore.getState().setMatchSession(createMatchSession(session.setup, tactics))
              }
              onKickoff={() => {
                command({ type: 'kickoff' });
                setPlaying(false);
              }}
              onNewFixture={careerFixture ? undefined : reset}
            />
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
            <div className={`match-live-layout${deciding ? ' is-deciding' : ''}`} ref={layoutRef}>
              <div className="match-live-main">
                {deciding && (
                  <DecisionPanel
                    session={session}
                    choicesRef={choicesRef}
                    camera={camera}
                    compact={!wide}
                    reducedMotion={reduced}
                    onChoose={(choiceId) => command({ type: 'choose', choiceId })}
                  />
                )}
                {/* What the match is waiting on comes first. */}
                {status === 'halftime' && (
                  <HalfTimePanel
                    session={session}
                    world={world}
                    onTalk={(response) => {
                      setOutcomeId(null);
                      command({ type: 'halftime', response });
                    }}
                  />
                )}
                {state!.captainDecisionPending && (
                  <CaptainPanel
                    session={session}
                    onCall={(instruction) => command({ type: 'captain', instruction })}
                  />
                )}
                {state!.substituted && (
                  <SubstitutionPanel
                    session={session}
                    onResponse={(response) => command({ type: 'substitution', response })}
                  />
                )}
                {replaying && outcomeMoment && (
                  <DecisionReplay
                    session={session}
                    moment={outcomeMoment}
                    compact={!wide}
                    reducedMotion={reduced}
                  />
                )}
                {outcome && outcomeMoment && (
                  <OutcomePanel
                    outcome={outcome}
                    minute={outcomeMoment.minute}
                    choice={matchLabel(
                      outcomeMoment.choices.find((choice) => choice.id === outcome.input.choiceId)
                        ?.labelKey ?? '',
                    )}
                    onContinue={() => {
                      setOutcomeId(null);
                      if (canPlay) setPlaying(true);
                    }}
                  />
                )}
                <section
                  className={`match-panel match-stage${pitchAway ? ' is-away' : ' match-pitch-panel'}`}
                  aria-labelledby="match-stage-heading"
                >
                  {settings.simulationOnly ? (
                    <SimulationCard session={session} />
                  ) : (
                    <Suspense
                      fallback={
                        <p className="match-pitch-loading" role="status">
                          {m.pitchLoading}
                        </p>
                      }
                    >
                      <Pitch
                        frame={
                          state!.currentMoment?.frame ?? state!.frames[state!.frames.length - 1]!
                        }
                        home={session.setup.home}
                        away={session.setup.away}
                        selectedPlayerId={session.setup.selectedPlayerId}
                        numbers={numbers}
                        motion={state!.motion.frames}
                        {...motionPace(state!.motion.kind, speed)}
                        reducedMotion={reduced}
                        paused={!playing && status === 'live' && !outcomeId}
                        still={pitchAway}
                        celebration={celebration}
                        label={matchFormat(pitchCopy.liveLabel, {
                          formations: matchFormat(m.ui.formations, {
                            home: session.setup.home.name,
                            homeFormation: state!.match.home.formation,
                            away: session.setup.away.name,
                            awayFormation: state!.match.away.formation,
                          }),
                        })}
                        overlay={<PitchOverlay session={session} />}
                      />
                    </Suspense>
                  )}
                  <div className="match-stage-body">
                    <div className="match-stage-head">
                      <h2 id="match-stage-heading">{session.setup.home.stadium.name}</h2>
                      <span className="match-card-note">
                        {matchFormat(m.ui.keyMoments, {
                          count: state!.match.keyMoments.filter((moment) =>
                            state!.match.events.some(
                              (event) => event.outcome?.input.momentId === moment.id,
                            ),
                          ).length,
                        })}
                      </span>
                      <label className="match-toggle">
                        <input
                          type="checkbox"
                          role="switch"
                          className="switch"
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
                    <Timeline session={session} />
                  </div>
                </section>
                <p className="match-shortcuts">{m.shortcuts}</p>
              </div>
              <aside className="match-live-aside" aria-label={m.stats}>
                <RatingCard session={session} />
                <StatsCard session={session} />
                <CommentaryCard
                  session={session}
                  narration={narration}
                  celebration={
                    celebrationItem ? l.celebrations.names[celebrationItem.id] : undefined
                  }
                />
              </aside>
            </div>
          )}
        </div>
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
