import {
  Suspense,
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { lazyPage, loadWithRetry } from '../ui/lazyPage';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore, worldBusy } from '../store';
import {
  applyMatchCommand,
  chainsReady,
  createMatchSession,
  createMatchSetup,
  loadChains,
  rules22,
  type MatchCommand,
  type MatchSession,
} from '../engine/match/core';
import type { SlotId } from '../model/domain';
import { errorCode } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { errorText, format, t } from '../i18n';
import { matchText as m, matchLabel } from '../i18n/match';
import { careerText as c } from '../i18n/career';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { FootballIllustration } from '../ui/FootballIllustration';
import type { FormResult } from './match/Preview';
import {
  pendingTournamentFixture,
  pendingWindowFixture,
} from '../engine/career/honours/international';
import { pendingCareerFixture } from '../engine/career/fixtures';
import { careerMatchSetup, defaultTactics } from '../engine/career/matchSetup';
import { startWorldJob } from '../workers/client';
import { competitionName, recentForm } from './career/selectors';
import { CareerSelectionBriefing } from './match/SelectionBriefing';
import { COSMETIC_BY_ID } from '../engine/career/lifestyle/catalogue';
import { celebrationNames } from '../i18n/celebrations';
import '../styles/match.css';
import '../styles/reel.css';
import { Tutorial } from '../ui/TutorialLoader';
import { StakeLine } from './career/stakesUi';
import { useRestoredReport } from './match/restoreReport';
import type { ReelBeat, ReelMode } from './match/reel/useReel';

/*
 * Matchday's states each load their own screen (release 1.0, X1b), so the route's first load
 * carries the engine and only the screen it shows: the pre-match screen, the live reel, the
 * career's matchday panels, or the report.
 */
const loadReel = () => import('./match/reel/ReelScreen');
const ReelScreen = lazyPage(loadReel);
const loadPreview = () => import('./match/Preview');
const Preview = lazyPage(() => loadPreview().then((module) => ({ default: module.Preview })));
const loadMatchday = () => import('./match/CareerMatchday');
const CareerFixture = lazyPage(() =>
  loadMatchday().then((module) => ({ default: module.CareerFixture })),
);
const CareerNoMatch = lazyPage(() =>
  loadMatchday().then((module) => ({ default: module.CareerNoMatch })),
);
const CareerReportActions = lazyPage(() =>
  loadMatchday().then((module) => ({ default: module.CareerReportActions })),
);
const TournamentMatch = lazyPage(() =>
  loadMatchday().then((module) => ({ default: module.TournamentMatch })),
);
const WindowMatch = lazyPage(() =>
  loadMatchday().then((module) => ({ default: module.WindowMatch })),
);
/** A friendly between any two clubs, for a world without a career: loaded only there. */
const Selection = lazyPage(() =>
  import('./match/Selection').then((module) => ({ default: module.Selection })),
);
/** The commentary's words and the narration copy (step 5.5), for the Match log. */
const loadLines = () => import('./match/lines');
type LinesModule = Awaited<ReturnType<typeof loadLines>>;
/** The headless policy (Watch highlights, Simulate), fetched when either is offered. */
const loadPolicy = () => import('./match/reel/policy');
/** The clip renderer (Pixi): fetched with the pre-match screen, never on the first load. */
const loadClipScene = () => import('./match/reel/clipScene');
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
/** Loading one of matchday's screens. */
function Loading() {
  return (
    <section className="match-panel match-loading">
      <span className="match-spinner" aria-hidden="true" />
      <p role="status">{m.loading}</p>
    </section>
  );
}
/** Whether the viewport matches `query`, following changes. */
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
/** The two-column match layout, with the live numbers beside the reel. */
const WIDE = '(min-width: 951px)';
/** Phones held upright draw the clips on a vertical pitch. */
const UPRIGHT = '(orientation: portrait) and (max-width: 950px)';
/** Yield to the browser between slices of a simulated match, so no task runs long. */
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Matchday once there is a world to play in (or a save to load). */
export default function MatchBody() {
  const world = useAppStore((store) => store.world);
  const job = useAppStore((store) => store.worldJob);
  const session = useAppStore((store) => store.matchSession);
  const [lines, setLines] = useState<LinesModule>();
  const occasions = Boolean(session && rules22(session.setup));
  const state = session?.state;
  const status = state?.match.status;
  const live = status === 'live' || status === 'decision' || status === 'halftime';
  // While a match is prepared or played, fetch what comes next: the reel and its renderer, the
  // Match log's words and the report, so neither the first chain nor full time waits.
  const hasSession = Boolean(session);
  // The decision chains (X1a) load with the session; the reel plays once they are in.
  const [chainsIn, setChainsIn] = useState(chainsReady);
  useEffect(() => {
    if (!hasSession || chainsIn) return;
    let current = true;
    void loadWithRetry(loadChains).then(
      () => current && setChainsIn(true),
      () => current && setError(m.error),
    );
    return () => {
      current = false;
    };
  }, [hasSession, chainsIn]);
  useEffect(() => {
    if (!hasSession) return;
    let current = true;
    const idle = window.setTimeout(() => {
      void loadReel().catch(() => undefined);
      void loadClipScene().catch(() => undefined);
      void loadReport().catch(() => undefined);
      void loadWithRetry(loadLines)
        .then((module) => current && setLines(module))
        .catch(() => undefined);
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(idle);
    };
  }, [hasSession]);
  const active = useAppStore((store) => store.activeSave);
  const settings = useAppStore((store) => store.settings);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reduced = settings.reducedMotion || systemReduced;
  const wide = useMediaQuery(WIDE);
  const vertical = useMediaQuery(UPRIGHT);
  const [params, setParams] = useSearchParams();
  const attemptedSlot = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // A save that could not be restored (open in another tab, say) can be tried again (step 4.8).
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryLoad = () => {
    attemptedSlot.current = null;
    setError('');
    setLoadFailed(false);
    setLoadAttempt((count) => count + 1);
  };
  const [mode, setMode] = useState<ReelMode>('play');
  const [simulating, setSimulating] = useState(false);
  const [policy, setPolicy] = useState<{ run: (s: MatchSession) => MatchCommand } | null>(null);
  const [beat, setBeat] = useState<ReelBeat['kind']>('idle');
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => setAnnouncement(text), []);
  useEffect(() => {
    if (!live) setBeat('idle');
  }, [live]);
  useEffect(() => {
    if (status === 'finished') setAnnouncement(matchLabel('match.status.finished'));
  }, [status]);

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
        .catch((cause: unknown) => {
          setError(errorText(errorCode(cause)));
          setLoadFailed(true);
        })
        .finally(() => setLoading(false));
    }
  }, [world, active, job, params, setParams, loadAttempt]);

  /** Apply a command to the stored session; returns the sessions before and after. */
  const apply = useCallback((input: MatchCommand) => {
    const before = useAppStore.getState().matchSession;
    if (!before || useAppStore.getState().worldJob) return null;
    try {
      const after = applyMatchCommand(before, input);
      useAppStore.getState().setMatchSession(after);
      setError('');
      return { before, after };
    } catch {
      setError(m.error);
      return null;
    }
  }, []);
  const command = useCallback((input: MatchCommand) => void apply(input), [apply]);

  // The headless policy, for Watch highlights and Simulate.
  const ensurePolicy = useCallback(async () => {
    const module = await loadPolicy();
    const run = (current: MatchSession) => module.reelPolicy(current);
    setPolicy((value) => value ?? { run });
    return run;
  }, []);
  useEffect(() => {
    if (status !== 'preview') return;
    const idle = window.setTimeout(() => void loadPolicy().catch(() => undefined), 1200);
    return () => window.clearTimeout(idle);
  }, [status]);

  /** Simulate: the whole match with the headless policy, in slices, then the report. */
  const simulate = useCallback(async () => {
    if (simulating || useAppStore.getState().worldJob) return;
    setSimulating(true);
    try {
      const [run] = await Promise.all([ensurePolicy(), loadWithRetry(loadChains)]);
      let current = useAppStore.getState().matchSession;
      for (
        let slice = 0;
        current && current.state.match.status !== 'finished' && slice < 400;
        slice++
      ) {
        for (let step = 0; step < 30 && current.state.match.status !== 'finished'; step++)
          current = applyMatchCommand(current, run(current));
        await yieldTask();
      }
      if (current) useAppStore.getState().setMatchSession(current);
    } catch {
      setError(m.error);
    } finally {
      setSimulating(false);
    }
  }, [simulating, ensurePolicy]);

  // Career fixtures: the session's setup names the scheduled fixture it plays.
  const careerResult = useAppStore((store) => store.careerResult);
  // The recorded match's report survives a refresh (step 4.8).
  useRestoredReport(
    world,
    active?.payload.kind === 'world' ? active.slot : null,
    !session && !careerResult && !job,
  );
  const careerFixture = session?.setup.fixture;
  const pending = world?.career && !session ? pendingCareerFixture(world) : null;
  const tournamentPending =
    world?.career && !session && !pending ? pendingTournamentFixture(world) : null;
  const windowPending =
    world?.career && !session && !pending && !tournamentPending
      ? pendingWindowFixture(world)
      : null;
  const prepareCareer = useCallback(() => {
    try {
      const current = useAppStore.getState().world;
      if (!current || useAppStore.getState().worldJob || useAppStore.getState().matchSession)
        return;
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
  }, []);
  // Play matchday goes straight to the pre-match screen: the fixture is prepared on arrival.
  const pendingId = pending?.id;
  useEffect(() => {
    if (!pendingId || careerResult || job || useAppStore.getState().careerResult) return;
    prepareCareer();
  }, [pendingId, careerResult, job, prepareCareer]);
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
  // The career player's signature celebration after their goals (milestone 7).
  const celebrationItem =
    world?.career?.style?.equipped.celebration &&
    session?.setup.selectedPlayerId === world.career.playerId
      ? COSMETIC_BY_ID[world.career.style.equipped.celebration]
      : undefined;
  const reset = () => {
    setMode('play');
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
  // A step answered (the key moments opened, but for one still waiting).
  const decided = Boolean(state && state.match.keyMoments.length > (state.currentMoment ? 1 : 0));
  const committed =
    careerResult && world?.career && (!session || status === 'finished') ? careerResult : null;
  const reportSession = committed?.session ?? (status === 'finished' ? session : null);
  const form: FormResult[] | undefined =
    careerFixture && world?.career
      ? recentForm(world.career).map((record) => record.result)
      : undefined;
  const kickoff = (next: ReelMode) => {
    setMode(next);
    if (chainsReady()) return command({ type: 'kickoff' });
    void loadWithRetry(loadChains).then(
      () => command({ type: 'kickoff' }),
      () => setError(m.error),
    );
  };
  const takeOver = useCallback(() => setMode('play'), []);
  return (
    <Page className={`match-page${inMatch ? ' is-live' : ''}`}>
      {/* During play the scoreboard leads, and the report has its own title: one heading. */}
      <header
        className={`page-heading match-heading${session || reportSession ? ' is-quiet' : ''}`}
      >
        <div>
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
        data-beat={beat}
        data-mode={mode}
        data-moment={state?.currentMoment?.id}
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
          {loadFailed && !world && (
            <button type="button" className="text-button" onClick={retryLoad}>
              {t.app.boundary.retry}
            </button>
          )}
        </p>
      )}
      {loading ? (
        <Loading />
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
      ) : reportSession ? (
        <Report
          session={reportSession}
          {...(committed
            ? {
                career: {
                  outcome: committed.outcome,
                  recording: false,
                  onRecord: recordResult,
                  actions: (
                    <Suspense fallback={null}>
                      <CareerReportActions world={world} />
                    </Suspense>
                  ),
                },
              }
            : reportSession.setup.fixture
              ? {
                  career: {
                    outcome: null,
                    recording: job?.type === 'commit-match',
                    onRecord: recordResult,
                    actions: null,
                  },
                }
              : {
                  onAgain: () => {
                    setMode('play');
                    useAppStore
                      .getState()
                      .setMatchSession(
                        createMatchSession(reportSession.setup, reportSession.initialTactics),
                      );
                  },
                  onNew: reset,
                })}
        />
      ) : !session && world.career ? (
        <Suspense fallback={<Loading />}>
          {pending ? (
            <CareerFixture
              world={world}
              fixture={pending}
              disabled={Boolean(job)}
              onPrepare={prepareCareer}
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
                    const store = useAppStore.getState();
                    const current = store.world;
                    if (!current?.career || worldBusy(store)) return;
                    store.setWorld(applyHonoursAction(current, { type: 'simulate-window' }));
                    setError('');
                  })
                  .catch(() => setError(m.unavailable));
              }}
            />
          ) : (
            <CareerNoMatch world={world} />
          )}
        </Suspense>
      ) : !session ? (
        job ? (
          <section className="match-panel match-busy">
            <span className="match-spinner is-info" aria-hidden="true" />
            <p role="status">{m.busy}</p>
          </section>
        ) : (
          <Suspense fallback={<Loading />}>
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
      ) : status === 'preview' ? (
        <Suspense fallback={<Loading />}>
          <Preview
            session={session}
            competition={competition}
            form={form}
            stake={
              careerFixture && world?.career && world.fixtures[careerFixture.id] ? (
                <StakeLine world={world} fixture={world.fixtures[careerFixture.id]!} tone="panel" />
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
            onKickoff={() => kickoff('play')}
            onWatch={() => {
              void ensurePolicy()
                .then(() => kickoff('watch'))
                .catch(() => setError(m.unavailable));
            }}
            onSimulate={() => void simulate()}
            simulating={simulating}
            watchFirst={settings.simulationOnly}
            onNewFixture={careerFixture ? undefined : reset}
          />
        </Suspense>
      ) : !chainsIn ? (
        <Loading />
      ) : (
        <Suspense fallback={<Loading />}>
          <ReelScreen
            session={session}
            world={world}
            mode={mode}
            policy={policy?.run ?? null}
            apply={apply}
            command={command}
            competition={competition}
            lines={lines}
            celebration={celebrationItem ? celebrationNames[celebrationItem.id] : undefined}
            occasions={occasions}
            wide={wide}
            vertical={vertical}
            reduced={reduced}
            busy={Boolean(job)}
            announce={announce}
            onBeat={setBeat}
            onTakeOver={takeOver}
          />
        </Suspense>
      )}
      <Tutorial
        track="match"
        enabled={Boolean(session) && status !== 'finished'}
        steps={(tt) => [
          { target: 'tactics', ...tt.match.tactics, when: status === 'preview' },
          { target: 'kickoff', ...tt.match.kickoff, action: true, done: status !== 'preview' },
          { target: 'controls', ...tt.match.controls, when: inMatch && beat === 'ticker' },
          {
            target: 'decision',
            ...tt.match.decision,
            when: beat === 'card',
            action: true,
            done: decided,
          },
          // After the first answer only, so the decision's step is never skipped past.
          {
            target: 'controls',
            ...tt.match.outcome,
            when: inMatch && beat === 'ticker' && decided,
          },
        ]}
      />
    </Page>
  );
}
