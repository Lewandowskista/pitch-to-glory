import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { MatchCommand, MatchSession } from '../../../engine/match';
import type { World } from '../../../model/domain';
import { reelText as r } from '../../../i18n/reel';
import { matchText as m } from '../../../i18n/match';
import { lazyPage } from '../../../ui/lazyPage';
import { cx } from '../../../ui/kit';
import { goalLine, goalStory } from '../goals';
import { kitAppearance } from '../pitchKit';
import { RatingCard, StatsCard } from '../Live';
import { ClipStage } from './ClipStage';
import { TickerPanel } from './Ticker';
import { castDescription } from './cast';
import type { Reel, ReelMode } from './useReel';

/** The decision card and its copy: fetched with the reel's lazy parts, shown after a lead-in. */
const loadDecision = () => import('./DecisionCard');
const DecisionStep = lazyPage(loadDecision);
const loadGoalBanner = () => import('../GoalBanner');
const GoalBanner = lazyPage(loadGoalBanner);
const loadOccasions = () => import('../Occasions');
const loadClipStills = () => import('./ClipStills');
const OccasionPanels = lazyPage(() =>
  loadOccasions().then((module) => ({ default: module.OccasionPanels })),
);
const loadInterrupts = () => import('../Interrupts');
const HalfTimePanel = lazyPage(() =>
  loadInterrupts().then((module) => ({ default: module.HalfTimePanel })),
);
const CaptainPanel = lazyPage(() =>
  loadInterrupts().then((module) => ({ default: module.CaptainPanel })),
);
const SubstitutionPanel = lazyPage(() =>
  loadInterrupts().then((module) => ({ default: module.SubstitutionPanel })),
);
const SentOffPanel = lazyPage(() =>
  loadInterrupts().then((module) => ({ default: module.SentOffPanel })),
);
/**
 * The reel's lazy parts, fetched while the reel is idle after it opens: none is needed before
 * a goal, a call or the first chain.
 */
export function prefetchReelParts(occasions: boolean): () => void {
  const idle = window.setTimeout(() => {
    void loadDecision().catch(() => undefined);
    void loadGoalBanner().catch(() => undefined);
    void loadInterrupts().catch(() => undefined);
    void loadClipStills().catch(() => undefined);
    if (occasions) void loadOccasions().catch(() => undefined);
  }, 400);
  return () => window.clearTimeout(idle);
}
/** Whether a match-22 session has an occasion to show (OccasionPanels renders nothing else). */
const hasOccasion = (state: MatchSession['state']) =>
  state.match.status === 'halftime' ||
  Boolean(state.injuryDecisionPending) ||
  Boolean(state.substituted) ||
  Boolean(state.bench && state.match.status !== 'finished') ||
  Boolean(state.roleRequest && state.match.status === 'live' && state.match.minute <= 52) ||
  Boolean(state.penaltyShootout);

/**
 * The live match as a highlights reel (docs/EXPERIENCE-REDESIGN-1.0.md §1.2–1.5): the ticker
 * while play is dead, the clip stage (with the outcome beat and the GOAL banner over it) for
 * the player's steps and every goal, the decision card under the clip, the half-time and
 * touchline cards, and one control: Skip to next moment. On wide screens the ticker, the clip
 * and the live numbers sit side by side.
 */
export function ReelLive({
  session,
  world,
  reel,
  mode,
  occasions,
  wide,
  vertical,
  reduced,
  paused,
  score,
  announce,
  choicesRef,
  skipRef,
  onCommand,
  onChoose,
  onSkip,
  onResume,
  onOpenLog,
  onTakeOver,
}: {
  session: MatchSession;
  world: World | null;
  reel: Reel;
  mode: ReelMode;
  occasions: boolean;
  wide: boolean;
  vertical: boolean;
  reduced: boolean;
  paused: boolean;
  score: readonly [number, number];
  announce: (text: string) => void;
  choicesRef: RefObject<HTMLDivElement>;
  skipRef: RefObject<HTMLButtonElement>;
  onCommand: (command: MatchCommand) => void;
  onChoose: (choiceId: string) => void;
  onSkip: () => void;
  onResume: () => void;
  onOpenLog: () => void;
  onTakeOver: () => void;
}) {
  const { setup, state } = session;
  const beat = reel.beat;
  const clip =
    beat.kind === 'clip' || beat.kind === 'banner' || beat.kind === 'card' ? beat.clip : null;
  const staged = Boolean(clip);
  const building = beat.kind === 'build' ? beat.chain : null;
  const kits = kitAppearance(setup.home, setup.away);
  const story = useMemo(() => {
    if (beat.kind !== 'banner') return null;
    const event = state.match.events.find((entry) => entry.id === beat.eventId);
    return event ? goalStory(setup, state.match.events, event) : null;
  }, [beat, setup, state.match.events]);
  const label = clip
    ? `${clip.type === 'goal' ? r.goalClip : r.cardRegion}. ${castDescription(clip.cast, setup, { you: r.you })}`
    : r.goalClip;
  const skipLabel = paused ? m.play : beat.kind === 'clip' && !beat.skipped ? r.skipClip : r.skip;
  const skippable =
    paused ||
    beat.kind === 'ticker' ||
    beat.kind === 'build' ||
    beat.kind === 'banner' ||
    (beat.kind === 'clip' && !beat.skipped);
  // A card that goes leaves focus on the one control, never on the page.
  const hadCard = useRef(false);
  useEffect(() => {
    const has = beat.kind === 'card';
    if (hadCard.current && !has) {
      const active = document.activeElement;
      if (!active || active === document.body) skipRef.current?.focus({ preventScroll: true });
    }
    hadCard.current = has;
  }, [beat.kind, skipRef]);
  return (
    <div
      className={cx('reel-live', staged && 'is-staged', wide && 'is-wide')}
      data-beat={beat.kind}
      data-mode={mode}
    >
      <div className="reel-main">
        {(!staged || wide) && (
          <TickerPanel
            session={session}
            heldGoalId={reel.heldGoalId}
            building={building}
            compact={staged}
          />
        )}
        <div className={cx('reel-stage', staged && 'is-on')} data-testid="clip-stage">
          <ClipStage
            spec={clip}
            setup={setup}
            vertical={vertical}
            reduced={reduced}
            skipKey={reel.skipKey}
            label={label}
          >
            {beat.kind === 'clip' && !beat.skipped && (
              <button
                type="button"
                className="reel-stage-skip"
                aria-label={r.skipClip}
                tabIndex={-1}
                onClick={onSkip}
              />
            )}
            {clip?.beat && reel.showBeat && (
              <div
                className="reel-beat"
                data-success={clip.beat.success ? '' : undefined}
                data-testid="outcome-beat"
              >
                <span className="reel-beat-mark" aria-hidden="true">
                  {clip.beat.success ? '✓' : '✗'}
                </span>
                <span className="min-w-0">
                  <strong>{clip.beat.title}</strong>
                  <span>{clip.beat.cause}</span>
                </span>
              </div>
            )}
            {story && (
              <Suspense fallback={null}>
                <GoalBanner
                  setup={setup}
                  story={story}
                  line={goalLine(setup, story, state.match.events)}
                  colour={story.side === 0 ? kits.home : kits.away}
                  placement="pitch"
                />
              </Suspense>
            )}
            {mode === 'watch' && staged && (
              <span className="reel-watching" aria-hidden="true">
                {r.watching}
              </span>
            )}
          </ClipStage>
        </div>
        {beat.kind === 'card' && (
          <Suspense fallback={null}>
            <DecisionStep
              session={session}
              score={score}
              choicesRef={choicesRef}
              onChoose={onChoose}
              announce={announce}
            />
          </Suspense>
        )}
        {/* The touchline waits for the goal and the step in front of it. */}
        {/* The shootout's board stays up through its kicks. */}
        {occasions &&
          state.penaltyShootout &&
          beat.kind !== 'wait' &&
          beat.kind !== 'ticker' &&
          beat.kind !== 'idle' && (
            <Suspense fallback={null}>
              <OccasionPanels session={session} world={world} onCommand={onCommand} />
            </Suspense>
          )}
        {(beat.kind === 'wait' || beat.kind === 'ticker' || beat.kind === 'idle') && (
          <Suspense fallback={null}>
            {occasions && hasOccasion(state) && (
              <OccasionPanels session={session} world={world} onCommand={onCommand} />
            )}
            {state.match.status === 'halftime' && !occasions && (
              <HalfTimePanel
                session={session}
                world={world}
                onTalk={(response) => onCommand({ type: 'halftime', response })}
              />
            )}
            {state.captainDecisionPending && (
              <CaptainPanel
                session={session}
                onCall={(instruction) => onCommand({ type: 'captain', instruction })}
              />
            )}
            {state.substituted && !occasions && (
              <SubstitutionPanel
                session={session}
                onResponse={(response) => onCommand({ type: 'substitution', response })}
              />
            )}
            {state.sentOff && <SentOffPanel session={session} />}
          </Suspense>
        )}
        <div className="reel-controls" data-tour="controls">
          <button
            ref={skipRef}
            type="button"
            className="button play reel-skip"
            aria-disabled={!skippable || undefined}
            aria-keyshortcuts="Space"
            onClick={() => {
              if (paused) onResume();
              else if (skippable) onSkip();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5L12 12L4 19ZM12 5L20 12L12 19Z" fill="currentColor" />
            </svg>
            {skipLabel}
          </button>
          <button
            type="button"
            className="button secondary reel-log-open"
            aria-haspopup="dialog"
            onClick={onOpenLog}
          >
            {r.log}
          </button>
          {mode === 'watch' && (
            <button type="button" className="text-button reel-take-over" onClick={onTakeOver}>
              {r.takeOver}
            </button>
          )}
        </div>
        <p className="reel-shortcuts">{r.shortcuts}</p>
      </div>
      {wide && (
        <aside className="reel-aside" aria-label={m.stats}>
          <RatingCard session={session} />
          <StatsCard session={session} />
        </aside>
      )}
    </div>
  );
}
