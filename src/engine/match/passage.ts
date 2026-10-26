/**
 * Storing a choreographed passage of play in the session: the current motion, the minute's
 * snapshot, its narration, and the bookkeeping read from what is shown.
 */
import type { ReplayFrame } from '../../model/domain';
import type { MatchMotion, MatchSession } from './types';
import {
  METRES_PER_UNIT,
  attacksRightAt,
  followPlayer,
  timedNarration,
  type Passage,
} from './motion';
import { narrate } from './narration';
import { cutHighlight } from './highlight';
import { selectedSide } from './shared';

/**
 * Store a passage of play: its keyframes become the current motion and its last frame the
 * snapshot of this minute. The selected player's goals keep their build-up for Moments.
 */
export function applyPassage(
  session: MatchSession,
  kind: MatchMotion['kind'],
  passage: Passage,
  lead: ReplayFrame[] = [],
  /** The passage continues the minute already snapshotted (an outcome, or a follow-up moment). */
  replace = kind === 'outcome',
): void {
  const s = session.state;
  const last = passage.frames[passage.frames.length - 1]!;
  // Snapshots keep positions only: beats live in the passage's keyframes (and the last one in
  // the play state), so the per-minute history stays small.
  const snapshot: ReplayFrame = { ...last, timeMs: (s.match.minute + (s.added ?? 0)) * 60000 };
  delete snapshot.beat;
  if (replace) s.frames[s.frames.length - 1] = snapshot;
  else s.frames.push(snapshot);
  s.play = passage.play;
  // Narration from the passage's beats (match-14), on its own stream.
  const narrationStart = s.narration.length;
  const told = timedNarration(() => narrate(session, passage.frames, kind, narrationStart));
  // In added time (match-22) each line is stamped with its added minute.
  const added = s.added;
  const lines = added ? told.map((entry) => ({ ...entry, addedTime: added })) : told;
  if (lines.length) s.narration = [...s.narration, ...lines];
  s.motion = {
    kind,
    frames: passage.frames,
    ...(passage.focus ? { focus: passage.focus } : {}),
    narrationStart,
  };
  // Bookkeeping from what is shown (match-14): shots on target, and the selected player's
  // distance, touches and heat, oriented with their team attacking towards x = 100.
  const stats = s.stats;
  stats.shotsOnTarget = [
    stats.shotsOnTarget[0] + passage.onTarget[0],
    stats.shotsOnTarget[1] + passage.onTarget[1],
  ];
  s.heat = [...s.heat];
  const followed = followPlayer(
    passage.frames,
    session.setup.selectedPlayerId,
    !attacksRightAt(selectedSide(session.setup), s.match.minute),
    s.heat,
  );
  stats.distanceM = Math.round((stats.distanceM + followed.distance * METRES_PER_UNIT) * 10) / 10;
  stats.touches += followed.touches;
  for (const goal of passage.goals)
    if (goal.playerId === session.setup.selectedPlayerId)
      s.highlights = [
        ...s.highlights,
        {
          eventId: goal.eventId,
          frames: cutHighlight(
            [...lead, ...passage.frames.slice(0, goal.frame + 1)],
            goal.playerId,
            new Set(session.setup.home.playerIds),
          ),
        },
      ];
}
