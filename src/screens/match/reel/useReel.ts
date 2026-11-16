import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchCommand, MatchSession } from '../../../engine/match';
import { passageGoal } from '../pace';
import { kindOf, type ChainKind } from './chain';
import { awaiting, decidingClip, goalClip, leadClip, outcomeClip, type ReelClip } from './clips';
import {
  BANNER_MS,
  BEAT_MS,
  BUILD_MS,
  CARD_GUARD_MS,
  GAP_MS,
  SETTLE_MS,
  TICK_MS,
  WATCH_BANNER_MS,
  WATCH_BEAT_MS,
  WATCH_BUILD_MS,
  WATCH_DECIDE_MS,
  WATCH_LEAD_MS,
  WATCH_TICK_MS,
} from './timeline';

/*
 * The reel's director (docs/EXPERIENCE-REDESIGN-1.0.md §1.2–1.4). It moves the engine on and
 * decides what the screen shows, one beat at a time:
 *
 *   ticker  ── advance every 440 ms of dead play ──▶ build (1.3 s) ──▶ lead clip ──▶ card
 *   card ── choose ──▶ outcome clip (✓/✗ inline) ──▶ banner on a goal ──▶ next step or ticker
 *   ticker ── a goal in the minute ──▶ goal clip (3–4 s) ──▶ banner ──▶ ticker
 *   half-time and touchline calls ──▶ wait for the answer ──▶ ticker, by itself
 *
 * Beats change a few times a chain; nothing here runs per frame. "Watch highlights" plays the
 * same beats with the decisions made by the headless policy; the tab being hidden pauses it.
 */
export type ReelMode = 'play' | 'watch';
export type ReelBeat =
  | { kind: 'idle' }
  | { kind: 'ticker' }
  | { kind: 'build'; momentId: string; chain: ChainKind }
  | { kind: 'clip'; clip: ReelClip; skipped?: boolean }
  | { kind: 'banner'; clip: ReelClip; eventId: string }
  | { kind: 'card'; clip: ReelClip; momentId: string; since: number }
  | { kind: 'wait' };

type Apply = (input: MatchCommand) => { before: MatchSession; after: MatchSession } | null;
type Policy = (session: MatchSession) => MatchCommand;

const idle: ReelBeat = { kind: 'idle' };

/** The beat a session calls for when nothing is playing. */
export function restingBeat(
  session: MatchSession | null,
  options: { restored?: boolean; chained?: boolean; shown?: ReadonlySet<string> } = {},
): ReelBeat {
  if (!session) return idle;
  const state = session.state;
  const status = state.match.status;
  if (status === 'preview' || status === 'finished') return idle;
  if (status === 'decision' && state.currentMoment) {
    const moment = state.currentMoment;
    if (options.restored)
      return {
        kind: 'card',
        clip: decidingClip(leadClip(session, moment, true)),
        momentId: moment.id,
        since: 0,
      };
    if (options.chained || moment.follows === 'chain')
      return { kind: 'clip', clip: leadClip(session, moment) };
    return { kind: 'build', momentId: moment.id, chain: kindOf(moment) };
  }
  // Every goal is seen before anything else is asked: the captain's call after conceding
  // waits for the goal's clip.
  if (!options.restored) {
    const goal = goalClip(session);
    if (goal && !options.shown?.has(goal.key)) return { kind: 'clip', clip: goal };
  }
  if (status === 'halftime' || awaiting(state)) return { kind: 'wait' };
  return status === 'live' ? { kind: 'ticker' } : idle;
}

export interface Reel {
  beat: ReelBeat;
  /** Increments when a clip is skipped to its end. */
  skipKey: number;
  /** Skip to the next moment (ticker), or to a clip's outcome. */
  skip: () => void;
  /** Answer the step on the card; ignored for 300 ms after the card changes. */
  choose: (choiceId: string) => void;
  /** After an answer outside the reel (half-time, the touchline): carry on by itself. */
  resume: () => void;
  /** A goal the scoreboard keeps back until it goes in on the pitch. */
  heldGoalId?: string;
  /** The outcome beat is showing over the clip. */
  showBeat: boolean;
}

export function useReel({
  session,
  mode,
  paused,
  busy,
  apply,
  policy,
}: {
  session: MatchSession | null;
  mode: ReelMode;
  /** The tab was hidden, or a dialog is open: the reel holds. */
  paused: boolean;
  /** A world job is running: nothing is applied. */
  busy: boolean;
  apply: Apply;
  /** The headless policy, for Watch highlights (loaded on demand). */
  policy: Policy | null;
}): Reel {
  const [beat, setBeatState] = useState<ReelBeat>(() => restingBeat(session, { restored: true }));
  const beatRef = useRef(beat);
  // Goals already shown, so a passage that ends in one plays it once.
  const shown = useRef(new Set<string>());
  const rest: typeof restingBeat = (next, options = {}) =>
    restingBeat(next, { ...options, shown: shown.current });
  const setBeat = useCallback((next: ReelBeat) => {
    if (next.kind === 'clip' && next.clip.type === 'goal') shown.current.add(next.clip.key);
    beatRef.current = next;
    setBeatState(next);
  }, []);
  const [skipKey, setSkipKey] = useState(0);
  const [showBeat, setShowBeat] = useState(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const watch = mode === 'watch';

  // A different session (kick-off, a restore, a new fixture) or a status the reel did not cause
  // (an answer at half-time) settles into its resting beat.
  const seed = session?.setup.seed;
  const status = session?.state.match.status;
  const waiting = session ? awaiting(session.state) : false;
  useEffect(() => {
    const current = beatRef.current;
    if (!session) return setBeat(idle);
    if (current.kind === 'idle' || current.kind === 'wait')
      setBeat(rest(session, { restored: current.kind === 'idle' && status !== 'live' }));
    else if (status === 'finished') setBeat(idle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on the session's state changes
  }, [seed, status, waiting]);

  /** Advance once, then settle into what that brings. */
  const tick = useCallback(() => {
    const result = apply({ type: 'advance' });
    if (!result) return;
    setBeat(rest(result.after));
  }, [apply, setBeat]);

  /** Advance until something happens: a step, a call to answer, a goal, the end. */
  const jump = useCallback(() => {
    let result = apply({ type: 'advance' });
    for (let step = 0; result && step < 400; step++) {
      const state = result.after.state;
      if (
        state.match.status !== 'live' ||
        awaiting(state) ||
        (state.motion.kind === 'minute' && passageGoal(state.motion.frames)) ||
        state.penaltyShootout
      )
        break;
      result = apply({ type: 'advance' });
    }
    if (result) setBeat(rest(result.after));
  }, [apply, setBeat]);

  const choose = useCallback(
    (choiceId: string) => {
      const current = beatRef.current;
      if (current.kind !== 'card' || performance.now() - current.since < CARD_GUARD_MS) return;
      const moment = sessionRef.current?.state.currentMoment;
      if (!moment || moment.id !== current.momentId) return;
      const result = apply({ type: 'choose', choiceId });
      if (!result) return;
      const clip = outcomeClip(result.before, result.after, moment);
      setShowBeat(false);
      setBeat(clip ? { kind: 'clip', clip } : rest(result.after, { chained: true }));
    },
    [apply, setBeat],
  );

  const skip = useCallback(() => {
    const current = beatRef.current;
    if (busy) return;
    if (current.kind === 'ticker') jump();
    else if (current.kind === 'build') {
      const live = sessionRef.current;
      const moment = live?.state.currentMoment;
      if (live && moment) setBeat({ kind: 'clip', clip: leadClip(live, moment) });
    } else if (current.kind === 'clip' && !current.skipped) {
      setSkipKey((key) => key + 1);
      setBeat({ ...current, skipped: true });
    } else if (current.kind === 'banner') {
      const live = sessionRef.current;
      setBeat(rest(live, { chained: live?.state.match.status === 'decision' }));
    }
  }, [busy, jump, setBeat]);

  const resume = useCallback(() => {
    setBeat(rest(sessionRef.current));
  }, [setBeat]);

  // Each beat's timer. Nothing moves while paused or while a world job runs.
  useEffect(() => {
    if (paused || busy) return;
    const live = sessionRef.current;
    let timer = 0;
    const after = (ms: number, run: () => void) => {
      timer = window.setTimeout(run, Math.max(0, ms));
    };
    if (beat.kind === 'ticker') after(watch ? WATCH_TICK_MS : TICK_MS, tick);
    else if (beat.kind === 'build')
      after(watch ? WATCH_BUILD_MS : BUILD_MS, () => {
        const now = sessionRef.current;
        const moment = now?.state.currentMoment;
        if (now && moment) setBeat({ kind: 'clip', clip: leadClip(now, moment) });
      });
    else if (beat.kind === 'clip') {
      const clip = beat.clip;
      const end = beat.skipped
        ? SETTLE_MS
        : watch && clip.type === 'lead'
          ? Math.min(clip.timeline.duration, WATCH_LEAD_MS) + GAP_MS
          : clip.timeline.duration + GAP_MS;
      const beatMs = watch ? WATCH_BEAT_MS : BEAT_MS;
      // The outcome line shows once the result is visible and stays for its beat.
      let beatTimer = 0;
      if (clip.beat) {
        if (beat.skipped) setShowBeat(true);
        else beatTimer = window.setTimeout(() => setShowBeat(true), clip.timeline.beatAt);
      }
      const hold = clip.beat
        ? Math.max(end, (beat.skipped ? 0 : clip.timeline.beatAt) + beatMs)
        : end;
      after(clip.type === 'lead' ? end : hold, () => {
        const now = sessionRef.current;
        setShowBeat(false);
        if (clip.type === 'lead' && now?.state.currentMoment?.id === clip.momentId)
          setBeat({
            kind: 'card',
            clip: decidingClip(clip),
            momentId: clip.momentId!,
            since: performance.now(),
          });
        else if (clip.goalEventId)
          setBeat({ kind: 'banner', clip: { ...clip, atEnd: true }, eventId: clip.goalEventId });
        else setBeat(rest(now, { chained: now?.state.match.status === 'decision' }));
      });
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(beatTimer);
      };
    } else if (beat.kind === 'banner')
      after(watch ? WATCH_BANNER_MS : BANNER_MS, () => {
        const now = sessionRef.current;
        setBeat(rest(now, { chained: now?.state.match.status === 'decision' }));
      });
    else if (beat.kind === 'card' && watch && policy && live)
      after(WATCH_DECIDE_MS, () => {
        const now = sessionRef.current;
        if (!now?.state.currentMoment) return;
        const command = policy(now);
        if (command.type !== 'choose') return;
        const moment = now.state.currentMoment;
        const result = apply(command);
        if (!result) return;
        const clip = outcomeClip(result.before, result.after, moment);
        setBeat(clip ? { kind: 'clip', clip } : rest(result.after, { chained: true }));
      });
    else if (beat.kind === 'wait' && watch && policy && live)
      after(900, () => {
        const now = sessionRef.current;
        if (!now) return;
        const result = apply(policy(now));
        if (result) setBeat(rest(result.after));
      });
    return () => window.clearTimeout(timer);
  }, [beat, paused, busy, watch, policy, tick, apply, setBeat]);

  const heldGoalId =
    beat.kind === 'clip' && beat.clip.goalEventId && !beat.skipped
      ? beat.clip.goalEventId
      : undefined;
  return { beat, skipKey, skip, choose, resume, heldGoalId, showBeat };
}
