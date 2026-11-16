import type { KeyMoment, ReplayFrame } from '../../../model/domain';
import {
  applyMatchCommand,
  createMatchSession,
  type MatchSession,
} from '../../../engine/match/core';
import { focusFrames, selectedAttacksRight } from '../cam';
import { shirtNumbers } from '../pitchArt';
import { passageGoal } from '../pace';
import { clipCast } from './cast';
import { outcomeOf, stepCast } from './chain';
import { momentArrows, playedStep, rememberStep, type ReelClip } from './clips';
import { leadTimeline, outcomeTimeline } from './timeline';
import { outcomeBeat } from './beat';

/*
 * The report's replays (docs/EXPERIENCE-REDESIGN-1.0.md §2, the report's moment tiles): a
 * chain's clips again, from the keyframes kept while the match was played, or — after a
 * refresh — from the session replayed command by command, in slices so no task runs long.
 */
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Each step's lead-in and outcome keyframes, replaying the session if they were not kept. */
export async function stepFrames(
  session: MatchSession,
  momentIds: readonly string[],
): Promise<Map<string, { lead?: ReplayFrame[]; outcome?: ReplayFrame[] }>> {
  const seed = session.setup.seed;
  const found = new Map(momentIds.map((id) => [id, playedStep(seed, id) ?? {}]));
  if ([...found.values()].every((entry) => entry.lead && entry.outcome)) return found;
  const wanted = new Set(momentIds);
  let current = createMatchSession(session.setup, session.initialTactics);
  for (let index = 0; index < session.commands.length; index++) {
    const before = current;
    const command = session.commands[index]!;
    current = applyMatchCommand(current, command);
    const moment = current.state.currentMoment;
    if (moment && wanted.has(moment.id) && current.state.motion !== before.state.motion) {
      const frames =
        current.state.motion.kind === 'moment' ? current.state.motion.frames : [moment.frame];
      rememberStep(seed, moment.id, 'lead', frames);
    }
    const answered = before.state.currentMoment;
    if (command.type === 'choose' && answered && wanted.has(answered.id)) {
      const motion = current.state.motion;
      const frames =
        motion !== before.state.motion
          ? motion.kind === 'outcome'
            ? focusFrames(motion)
            : motion.frames
          : [answered.frame];
      rememberStep(seed, answered.id, 'outcome', frames);
    }
    if (index % 25 === 24) await yieldTask();
  }
  return new Map(momentIds.map((id) => [id, playedStep(seed, id) ?? {}]));
}

/** A replayed step's clip: its lead-in, then its outcome with the ✓ or ✗. */
export function replayClip(
  session: MatchSession,
  moment: KeyMoment,
  part: 'lead' | 'outcome',
  frames: ReplayFrame[],
  step: number,
): ReelClip {
  const timeline = part === 'lead' ? leadTimeline(frames) : outcomeTimeline(frames);
  const found = part === 'outcome' ? outcomeOf(session.state.match.events, moment.id) : null;
  const goal = part === 'outcome' ? passageGoal(timeline.frames) : null;
  const goalEvent = goal?.eventId
    ? session.state.match.events.find((event) => event.id === goal.eventId)
    : undefined;
  return {
    key: `replay:${part}:${moment.id}`,
    type: part,
    momentId: moment.id,
    timeline,
    attacksRight: selectedAttacksRight(session.setup, moment.minute),
    cast: clipCast(stepCast(session.setup, moment), session.setup, timeline.frames, {
      step,
      numbers: shirtNumbers(session.setup.players),
    }),
    arrows: part === 'lead' ? momentArrows(session, moment) : [],
    deciding: false,
    shotPath: timeline.strike !== null,
    goal: goalEvent ? (goalEvent.teamId === session.setup.home.id ? 0 : 1) : null,
    ...(found ? { beat: outcomeBeat(moment, found.outcome) } : {}),
  };
}
