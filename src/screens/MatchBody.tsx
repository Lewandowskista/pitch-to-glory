import {
  Suspense,
  type ComponentProps,
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
  fullTime,
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchCommand,
  type MatchMotion,
  type MatchSession,
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
import { Preview } from './match/Preview';
import { DecisionPanel, DecisionReplay } from './match/DecisionPanel';
import {
  CareerFixture,
  CareerNoMatch,
  CareerReportActions,
  TournamentMatch,
  WindowMatch,
} from './match/CareerMatchday';
import {
  pendingTournamentFixture,
  pendingWindowFixture,
} from '../engine/career/honours/international';
import {
  CaptainPanel,
  CommentaryCard,
  HalfTimePanel,
  liveText,
  MatchControls,
  OutcomePanel,
  PitchOverlay,
  RatingCard,
  Scoreboard,
  SentOffPanel,
  SimulationCard,
  StatsCard,
  SubstitutionPanel,
  Timeline,
} from './match/Live';
import type { NarrationLine } from './match/feed';
import { narrationFeed } from '../i18n/narration';
import { pendingCareerFixture } from '../engine/career/fixtures';
import { careerMatchSetup, defaultTactics } from '../engine/career/matchSetup';
import { startWorldJob } from '../workers/client';
import { competitionName } from './career/selectors';
import { CareerSelectionBriefing } from './match/SelectionBriefing';
import { COSMETIC_BY_ID } from '../engine/career/lifestyle/catalogue';
import { celebrationNames } from '../i18n/celebrations';
import '../styles/match.css';

import { useMatchAudio } from './match/useMatchAudio';
import { preparePassage } from './match/playback';
import {
  GOAL_BUILD_UP_BEATS,
  JUMP_GOAL_HOLD_MS,
  KICKOFF_MS,
  JUMP_MS,
  REPLAY_PACE,
  passageGoal,
  passagePace,
  passageWait,
} from './match/pace';
import { goalLine, goalStory } from './match/goals';
import { rememberSpeed, storedSpeed, MATCH_SPEEDS, type MatchSpeed } from './match/speed';
import { usePlayClock } from './match/usePlayClock';
import type { PitchReplay } from './match/Pitch';
import { kitAppearance } from './match/pitchKit';
import { shirtNumbers } from './match/pitchArt';
import { Tutorial } from '../ui/TutorialLoader';
import { StakeLine } from './career/stakesUi';
const Pitch = lazyPage(() => import('./match/Pitch'));
/** The GOAL banner: fetched once a match is under way, shown when a goal goes in. */
const loadGoalBanner = () => import('./match/GoalBanner');
const GoalBanner = lazyPage(loadGoalBanner);
/** A friendly between any two clubs, for a world without a career: loaded only there. */
const Selection = lazyPage(() =>
  import('./match/Selection').then((module) => ({ default: module.Selection })),
);
/** The report is needed only at the final whistle: loaded then, or fetched ahead during play. */
const loadReport = () => import('./match/Report');
const LazyReport = lazyPage(() => loadReport().then((module) => ({ default: module.Report })));
function Report(props: ComponentProps<typeof LazyReport>) {
  return (
    <Suspense
      fallback={
        <p className="match-pitch-loading" role="status">
          {m.reportLoading}
        </p>
      }
    >
      <LazyReport {...props} />
    </Suspense>
  );
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

/** Matchday once there is a world to play in (or a save to load): the engine and live panels. */
export default function MatchBody() {
  const world = useAppStore((store) => store.world);
  const job = useAppStore((store) => store.worldJob);
  const session = useAppStore((store) => store.matchSession);
  // Fetch the report's code while the match is played, so the final whistle never waits.
  const hasSession = Boolean(session);
  useEffect(() => {
    if (!hasSession) return;
    void loadReport().catch(() => undefined);
    void loadGoalBanner().catch(() => undefined);
  }, [hasSession]);
  const active = useAppStore((store) => store.activeSave);
  const settings = useAppStore((store) => store.settings);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [params, setParams] = useSearchParams();
  const attemptedSlot = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  // The speed the last match was watched at on this device (review M19).
  const [speed, setSpeedState] = useState<MatchSpeed>(storedSpeed);
  const setSpeed = useCallback((value: number) => {
    const next = MATCH_SPEEDS.find((entry) => entry === value) ?? 1;
    setSpeedState(next);
    rememberSpeed(next);
  }, []);
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
        current.state.match.minute < fullTime(current)
      )
        current = applyMatchCommand(current, { type: 'advance' });
      useAppStore.getState().setMatchSession(current);
      setError('');
    } catch {
      setError(m.error);
    }
  }, []);

  /**
   * Simulation-only mode jumps straight to the next key moment, interruption or goal instead of
   * running the clock minute by minute (review M15); a goal stops the jump for its banner.
   */
  const jump = useCallback(() => {
    let current = useAppStore.getState().matchSession;
    if (!current || useAppStore.getState().worldJob) return;
    const waiting = (s: MatchSession['state']) =>
      s.match.status !== 'live' || s.captainDecisionPending || s.substitutionDecisionPending;
    try {
      for (let step = 0; step < 240 && !waiting(current.state); step++) {
        current = applyMatchCommand(current, { type: 'advance' });
        if (passageGoal(current.state.motion.frames)) break;
      }
      useAppStore.getState().setMatchSession(current);
      setError('');
      if (waiting(current.state)) setPlaying(false);
    } catch {
      setError(m.error);
      setPlaying(false);
    }
  }, []);

  // Each passage plays at the pace that fills its minute; a goal slows down and holds.
  const pace = useMemo(() => (motion ? passagePace(motion, speed) : null), [motion, speed]);
  const passage = useMemo(
    () => (motion && pace ? preparePassage(motion.frames, pace) : null),
    [motion, pace],
  );
  const goal = useMemo(() => (motion ? passageGoal(motion.frames) : null), [motion]);
  const simulationOnly = settings.simulationOnly;
  const [replay, setReplay] = useState<(PitchReplay & { motion: MatchMotion }) | null>(null);
  const replays = useRef(0);
  const replayActive = Boolean(replay && motion && replay.motion === motion);
  // The pitch moves while the match plays, while a decision's outcome plays out, and during a
  // replay; the passage clock runs with it, but not during a replay, so play waits for it.
  const pitchPaused = !playing && status === 'live' && !outcomeId && !replayActive;
  // The first passage this page shows (a reloaded match's last one) is drawn at its end, not
  // played: nothing to wait for. Every later one arrives live.
  const firstMotion = useRef(motion);
  if (!firstMotion.current) firstMotion.current = motion;
  const arrivedLive = Boolean(motion) && motion !== firstMotion.current;
  const elapsed = usePlayClock(
    motion,
    status === 'live' && (playing || Boolean(outcomeId)) && !replayActive && !job,
  );
  useEffect(() => {
    if (
      !playing ||
      status !== 'live' ||
      state?.captainDecisionPending ||
      state?.substitutionDecisionPending ||
      job ||
      replayActive ||
      !motion
    )
      return;
    const wait = simulationOnly
      ? (goal ? JUMP_GOAL_HOLD_MS : JUMP_MS) / speed
      : !arrivedLive || motion.kind === 'kickoff'
        ? KICKOFF_MS / speed
        : passageWait(motion, passage?.duration ?? 0, speed);
    const timer = window.setTimeout(
      () => {
        if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
          setPlaying(false);
          return;
        }
        if (simulationOnly) jump();
        else command({ type: 'advance' });
      },
      Math.max(0, wait - elapsed()),
    );
    return () => window.clearTimeout(timer);
  }, [
    playing,
    speed,
    status,
    state?.captainDecisionPending,
    state?.substitutionDecisionPending,
    motion,
    passage,
    goal,
    simulationOnly,
    arrivedLive,
    replayActive,
    elapsed,
    job,
    command,
    jump,
  ]);
  // The GOAL banner (review M3): over the pitch once the ball is in the net; at once without
  // the pitch (simulation only, reduced motion) or after a decision's outcome.
  const [bannerFor, setBannerFor] = useState<MatchMotion | null>(null);
  const bannerOnPitch = Boolean(motion?.kind === 'minute' && !simulationOnly);
  const goalRunning = status === 'live' && (playing || Boolean(outcomeId));
  useEffect(() => {
    if (!motion || !goal || bannerFor === motion) return;
    if (!bannerOnPitch || reduced || !arrivedLive) {
      setBannerFor(motion);
      return;
    }
    if (!goalRunning) return;
    const timer = window.setTimeout(
      () => setBannerFor(motion),
      Math.max(0, (passage?.times[goal.shot] ?? 0) - elapsed()),
    );
    return () => window.clearTimeout(timer);
  }, [motion, goal, bannerFor, bannerOnPitch, reduced, arrivedLive, goalRunning, passage, elapsed]);
  const goalEvent =
    goal && motion && bannerFor === motion
      ? (state?.match.events.find((event) => event.id === goal.eventId) ??
        state?.match.events.findLast((event) => event.kind === 'goal'))
      : undefined;
  const story =
    goalEvent && session ? goalStory(session.setup, session.state.match.events, goalEvent) : null;
  // Until the ball is in the net on the pitch, the score, the commentary and the announcement
  // keep the goal back, so the build-up is not spoiled.
  const heldGoal =
    goal && motion && bannerFor !== motion
      ? state?.match.events.find((event) => event.id === goal.eventId)
      : undefined;
  const shownScore: [number, number] | undefined =
    state && session
      ? heldGoal
        ? heldGoal.teamId === session.setup.home.id
          ? [state.match.score[0] - 1, state.match.score[1]]
          : [state.match.score[0], state.match.score[1] - 1]
        : state.match.score
      : undefined;
  const latestEvent = state?.match.events.findLast((event) => event.id !== heldGoal?.id);
  const latestText =
    latestEvent && session ? liveText(session.setup, session.state.match.events, latestEvent) : '';
  const scoreText =
    session && shownScore
      ? matchFormat(m.announceScore, {
          home: session.setup.home.name,
          away: session.setup.away.name,
          homeScore: shownScore[0],
          awayScore: shownScore[1],
        })
      : '';
  // An instant replay of the goal's build-up, shot and celebration, on the live pitch.
  const canReplay = Boolean(story && bannerOnPitch && !reduced && status === 'live');
  const replayGoal = useCallback(() => {
    const current = useAppStore.getState().matchSession?.state.motion;
    const scored = current?.kind === 'minute' ? passageGoal(current.frames) : null;
    if (!current || !scored) return;
    replays.current += 1;
    setReplay({
      key: replays.current,
      frames: current.frames.slice(Math.max(0, scored.shot - GOAL_BUILD_UP_BEATS)),
      pace: REPLAY_PACE,
      motion: current,
    });
  }, []);
  const replayable = useRef(false);
  replayable.current = canReplay && !replayActive;
  useEffect(() => {
    if (!replay || !replayActive) return;
    const timer = window.setTimeout(
      () => setReplay(null),
      preparePassage(replay.frames, replay.pace).duration + 400,
    );
    return () => window.clearTimeout(timer);
  }, [replay, replayActive]);
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
      // R replays the goal just scored, while its banner is up.
      if ((event.key === 'r' || event.key === 'R') && replayable.current) {
        event.preventDefault();
        replayGoal();
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
        // Reveal the whole choice (clear of the phone tab bar); browsers differ in how far
        // focus alone scrolls.
        const next = buttons[(index + direction + buttons.length) % buttons.length];
        next?.focus({ preventScroll: true });
        next?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [command, replayGoal]);

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

  // The briefing opens at its top (review U3); kick-off brings the score bar and the pitch
  // into view (U4), wherever the briefing was scrolled to.
  const shownStatus = useRef(status);
  useEffect(() => {
    const was = shownStatus.current;
    shownStatus.current = status;
    if (status === 'preview' && was !== 'preview') window.scrollTo({ top: 0 });
    const live = document.querySelector('.match-live');
    if (was === 'preview' && status === 'live' && live)
      window.scrollTo({
        top: live.getBoundingClientRect().top + window.scrollY - 8,
        behavior: reduced ? 'auto' : 'smooth',
      });
  }, [status, reduced]);

  // A decision's outcome starts with its replay: bring it back into view if the player had
  // scrolled down the choices or their breakdowns (review U13).
  useEffect(() => {
    const layout = layoutRef.current;
    if (outcomeId && layout && layout.getBoundingClientRect().top < 0)
      layout.scrollIntoView({ block: 'start' });
  }, [outcomeId]);

  // Career fixtures: the session's setup names the scheduled fixture it plays.
  const careerResult = useAppStore((store) => store.careerResult);
  const careerFixture = session?.setup.fixture;
  const pending = world?.career && !session ? pendingCareerFixture(world) : null;
  // Between seasons, the career player's nation's tournament match (review phase 3).
  const tournamentPending =
    world?.career && !session && !pending ? pendingTournamentFixture(world) : null;
  // In an international window, the player's nation's match when they play it (0.9.0).
  const windowPending =
    world?.career && !session && !pending && !tournamentPending
      ? pendingWindowFixture(world)
      : null;
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
  const kits = session ? kitAppearance(session.setup.home, session.setup.away) : null;
  const teamColour = (side: 0 | 1) => (side === 0 ? kits!.home : kits!.away);
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
                const setup = careerMatchSetup(current, fixture);
                useAppStore
                  .getState()
                  .setMatchSession(createMatchSession(setup, defaultTactics(current, setup)));
                setError('');
              } catch {
                setError(m.unavailable);
              }
            }}
          />
        ) : tournamentPending ? (
          <TournamentMatch
            world={world}
            fixture={tournamentPending}
            disabled={Boolean(job)}
            onPrepare={() => {
              // The nations' squads are built on demand: their generator stays out of this route.
              void import('../engine/career/honours/nationalMatch')
                .then(({ tournamentMatchSetup }) => {
                  const current = useAppStore.getState().world;
                  if (!current || useAppStore.getState().worldJob) return;
                  const fixture = pendingTournamentFixture(current);
                  if (!fixture) return;
                  const setup = tournamentMatchSetup(current, fixture);
                  useAppStore
                    .getState()
                    .setMatchSession(createMatchSession(setup, defaultTactics(current, setup)));
                  setError('');
                })
                .catch(() => setError(m.unavailable));
            }}
          />
        ) : windowPending ? (
          <WindowMatch
            world={world}
            fixture={windowPending}
            disabled={Boolean(job)}
            onPrepare={() => {
              void import('../engine/career/honours/nationalMatch')
                .then(({ windowMatchSetup }) => {
                  const current = useAppStore.getState().world;
                  if (!current || useAppStore.getState().worldJob) return;
                  const fixture = pendingWindowFixture(current);
                  if (!fixture) return;
                  const setup = windowMatchSetup(current, fixture);
                  useAppStore
                    .getState()
                    .setMatchSession(createMatchSession(setup, defaultTactics(current, setup)));
                  setError('');
                })
                .catch(() => setError(m.unavailable));
            }}
            onSimulate={() => {
              // Honours actions load on demand: retirement's code stays out of this route.
              void import('../engine/career/honours/actions')
                .then(({ applyHonoursAction }) => {
                  const current = useAppStore.getState().world;
                  if (!current?.career || useAppStore.getState().worldJob) return;
                  useAppStore
                    .getState()
                    .setWorld(applyHonoursAction(current, { type: 'simulate-window' }));
                  setError('');
                })
                .catch(() => setError(m.unavailable));
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
          <Suspense
            fallback={
              <section className="match-panel match-loading">
                <span className="match-spinner" aria-hidden="true" />
                <p role="status">{m.loading}</p>
              </section>
            }
          >
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
          </Suspense>
        )
      ) : (
        <div className={inMatch ? 'match-live' : 'match-session'}>
          <Scoreboard
            session={session}
            score={shownScore}
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
                {state!.sentOff && <SentOffPanel session={session} />}
                {replaying && outcomeMoment && (
                  <DecisionReplay
                    session={session}
                    moment={outcomeMoment}
                    compact={!wide}
                    reducedMotion={reduced}
                  />
                )}
                {story && !bannerOnPitch && !simulationOnly && (
                  <Suspense fallback={null}>
                    <GoalBanner
                      setup={session.setup}
                      story={story}
                      line={goalLine(session.setup, story)}
                      colour={teamColour(story.side)}
                      placement="strip"
                    />
                  </Suspense>
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
                    <>
                      {story && (
                        <Suspense fallback={null}>
                          <GoalBanner
                            setup={session.setup}
                            story={story}
                            line={goalLine(session.setup, story)}
                            colour={teamColour(story.side)}
                            placement="strip"
                          />
                        </Suspense>
                      )}
                      <SimulationCard session={session} />
                    </>
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
                        rate={pace?.rate}
                        maxMs={pace?.maxMs}
                        slow={pace?.slow}
                        replay={replayActive ? replay : null}
                        reducedMotion={reduced}
                        paused={pitchPaused}
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
                        header={<PitchOverlay session={session} />}
                        overlay={
                          <>
                            {story && bannerOnPitch && (
                              <Suspense fallback={null}>
                                <GoalBanner
                                  setup={session.setup}
                                  story={story}
                                  line={goalLine(session.setup, story)}
                                  colour={teamColour(story.side)}
                                  placement="pitch"
                                  replaying={replayActive}
                                  onReplay={canReplay ? replayGoal : undefined}
                                />
                              </Suspense>
                            )}
                          </>
                        }
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
                  hidden={heldGoal?.id}
                  narration={narration}
                  celebration={celebrationItem ? celebrationNames[celebrationItem.id] : undefined}
                />
              </aside>
            </div>
          )}
        </div>
      )}
      <Tutorial
        track="match"
        enabled={Boolean(session) && status !== 'finished'}
        steps={(tt) => [
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
