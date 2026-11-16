import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MatchCommand, MatchSession } from '../../../engine/match';
import type { World } from '../../../model/domain';
import { useAppStore } from '../../../store';
import { reelText as r } from '../../../i18n/reel';
import { matchText as m, matchFormat, matchLabel } from '../../../i18n/match';
import { lazyPage } from '../../../ui/lazyPage';
import { Scoreboard } from '../Live';
import type { NarrationLine } from '../feed';
import type * as Lines from '../lines';
import { useMatchAudio } from '../useMatchAudio';
import { ReelLive, prefetchReelParts } from './ReelLive';
import { useReel, type ReelBeat, type ReelMode } from './useReel';

const MatchLog = lazyPage(() =>
  import('./MatchLog').then((module) => ({ default: module.MatchLog })),
);

type Apply = (input: MatchCommand) => { before: MatchSession; after: MatchSession } | null;

/**
 * The live match screen (release 1.0, X1b), loaded once a match is under way: the reel's
 * director, the sticky scoreboard with the live rating, the reel itself, the Match log sheet,
 * the keys (Space skips, 1–3 choose, arrows move between choices) and what screen readers
 * hear — the chains' stakes and outcomes, the goals and the score, never every chip.
 */
export default function ReelScreen({
  session,
  world,
  mode,
  policy,
  apply,
  command,
  competition,
  lines,
  celebration,
  occasions,
  wide,
  vertical,
  reduced,
  busy,
  announce,
  onBeat,
  onTakeOver,
}: {
  session: MatchSession;
  world: World | null;
  mode: ReelMode;
  policy: ((session: MatchSession) => MatchCommand) | null;
  apply: Apply;
  command: (input: MatchCommand) => void;
  competition: string;
  lines?: typeof Lines;
  /** The career player's equipped celebration's name, for the Match log. */
  celebration?: string;
  occasions: boolean;
  wide: boolean;
  vertical: boolean;
  reduced: boolean;
  busy: boolean;
  announce: (text: string) => void;
  onBeat: (beat: ReelBeat['kind']) => void;
  onTakeOver: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const choicesRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const state = session.state;
  const status = state.match.status;
  const reel = useReel({ session, mode, paused, busy, apply, policy });
  const beat = reel.beat;
  useMatchAudio(session, beat.kind, reel.heldGoalId);
  useEffect(() => onBeat(beat.kind), [beat.kind, onBeat]);
  useEffect(() => prefetchReelParts(occasions), [occasions]);

  // The tab hidden pauses the reel; it waits for the player to come back and resume.
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPaused(true);
    };
    const leave = () => setPaused(true);
    document.addEventListener('visibilitychange', pause);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  // The Match log lives in the address, so Back closes it.
  const [params, setParams] = useSearchParams();
  const logOpen = params.get('log') === '1';
  const openLog = useCallback(() => {
    const next = new URLSearchParams(params);
    next.set('log', '1');
    setParams(next);
  }, [params, setParams]);
  const closeLog = useCallback(() => {
    if ((window.history.state as { idx?: number } | null)?.idx) window.history.back();
    else {
      const next = new URLSearchParams(params);
      next.delete('log');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);
  const wasOpen = useRef(logOpen);
  useEffect(() => {
    if (wasOpen.current && !logOpen)
      document.querySelector<HTMLButtonElement>('.reel-log-open')?.focus({ preventScroll: true });
    wasOpen.current = logOpen;
  }, [logOpen]);
  const narration = useMemo<NarrationLine[] | undefined>(
    () => (logOpen && state.narration && lines ? lines.narrationLines(session) : undefined),
    [logOpen, session, state.narration, lines],
  );

  // Keys: Space skips (or resumes), 1–3 choose, arrows move between choices.
  const reelRef = useRef(reel);
  reelRef.current = reel;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') ||
        (event.target instanceof HTMLElement &&
          (event.target.matches('input,select,textarea,summary') || event.target.isContentEditable))
      )
        return;
      const current = useAppStore.getState().matchSession;
      if (!current) return;
      const live = current.state.match.status;
      if (live !== 'live' && live !== 'decision') return;
      const focused = document.activeElement;
      const onChoice = focused instanceof HTMLElement && focused.matches('button[data-choice]');
      const onOtherControl =
        focused instanceof HTMLElement &&
        !onChoice &&
        focused.matches('button,a[href]') &&
        !focused.matches('.reel-skip');
      if (event.code === 'Space' && !onOtherControl) {
        event.preventDefault();
        if (pausedRef.current) setPaused(false);
        else reelRef.current.skip();
        return;
      }
      const option = /^[1-3]$/.test(event.key) ? Number(event.key) - 1 : -1;
      const choice = current.state.currentMoment?.choices[option];
      if (choice) {
        event.preventDefault();
        reelRef.current.choose(choice.id);
        return;
      }
      if (
        reelRef.current.beat.kind === 'card' &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        const buttons = Array.from(
          choicesRef.current?.querySelectorAll<HTMLButtonElement>('button[data-choice]') ?? [],
        );
        const index = buttons.findIndex((button) => button === document.activeElement);
        const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        event.preventDefault();
        const next = buttons[(index + direction + buttons.length) % buttons.length];
        next?.focus({ preventScroll: true });
        next?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  // The score the board shows: a goal still on the pitch is kept back until it goes in.
  const held = reel.heldGoalId
    ? state.match.events.find((event) => event.id === reel.heldGoalId)
    : undefined;
  const shownScore: [number, number] = held
    ? held.teamId === session.setup.home.id
      ? [state.match.score[0] - 1, state.match.score[1]]
      : [state.match.score[0], state.match.score[1] - 1]
    : state.match.score;

  // Announcements: the card, the outcome, the goal's score, half-time.
  const beatText = beat.kind === 'clip' && reel.showBeat ? beat.clip.beat?.announce : undefined;
  const bannerId = beat.kind === 'banner' ? beat.eventId : undefined;
  useEffect(() => {
    if (beatText) announce(beatText);
  }, [beatText, announce]);
  useEffect(() => {
    if (!bannerId) return;
    announce(
      matchFormat(m.announceScore, {
        home: session.setup.home.name,
        away: session.setup.away.name,
        homeScore: shownScore[0],
        awayScore: shownScore[1],
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per goal
  }, [bannerId]);
  useEffect(() => {
    if (status === 'halftime') announce(matchLabel('match.status.halftime'));
  }, [status, announce]);
  const building = beat.kind === 'build';
  useEffect(() => {
    if (building) announce(r.building.attack);
  }, [building, announce]);

  return (
    <div className="reel-screen">
      <Scoreboard session={session} score={shownScore} status={status} competition={competition} />
      <ReelLive
        session={session}
        world={world}
        reel={reel}
        mode={mode}
        occasions={occasions}
        wide={wide}
        vertical={vertical}
        reduced={reduced}
        paused={paused}
        score={shownScore}
        announce={announce}
        choicesRef={choicesRef}
        skipRef={skipRef}
        onCommand={command}
        onChoose={reel.choose}
        onSkip={reel.skip}
        onResume={() => setPaused(false)}
        onOpenLog={openLog}
        onTakeOver={onTakeOver}
      />
      {logOpen && (
        <Suspense fallback={null}>
          <MatchLog
            session={session}
            lines={lines}
            narration={narration}
            hidden={reel.heldGoalId}
            celebration={celebration}
            onClose={closeLog}
          />
        </Suspense>
      )}
      <span className="sr-only" data-testid="reel-paused" data-paused={paused || undefined} />
    </div>
  );
}
