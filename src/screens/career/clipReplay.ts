import type { Clip } from '../../engine/career/honours/clip';
import type { BeatKind, PitchFlank, Point, ReplayFrame } from '../../model/domain';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { preparePlayback, samplePlayback, type Playback } from '../match/playback';

/**
 * Plays Moments clips through the match replay's interpolation (`match/playback.ts`): the
 * same eased runs, dribbles at the runner's feet and arcing lofted balls. Version 1 clips,
 * which carry positions only, keep their even pace of one keyframe every 0.9 s.
 */
export const V1_FRAME_MS = 900;
/** Version 2 clips play this many sporting seconds per second, within a cap. */
export const CLIP_RATE = 3;
export const CLIP_MAX_MS = 9000;

/** Actions drawn as the move's passing trail, its runs, and its finish. */
export const PASS_BEATS: ReadonlySet<BeatKind> = new Set([
  'pass',
  'cross',
  'switch',
  'through',
  'long',
  'cutback',
]);
export const RUN_BEATS: ReadonlySet<BeatKind> = new Set(['carry', 'dribble']);
export const STRIKE_BEATS: ReadonlySet<BeatKind> = new Set(['shot', 'header']);
type AssistKind = keyof typeof h.moments.assistTag;

/** The clip as replay keyframes; players are keyed by their index in the clip. */
export function clipFrames(clip: Clip): ReplayFrame[] {
  const timed = !!clip.players;
  let time = 0;
  return clip.frames.map((frame, index) => {
    time += index === 0 ? 0 : timed ? (frame.ms ?? 0) : V1_FRAME_MS;
    const replay: ReplayFrame = {
      timeMs: time,
      ball: frame.ball,
      players: frame.players.map((point, player) => ({
        id: String(player),
        point,
        animation: '',
      })),
      carrierId:
        frame.carrier === undefined || frame.carrier === null ? null : String(frame.carrier),
    };
    if (frame.motion) replay.ballMotion = frame.motion;
    return replay;
  });
}

export function prepareClip(clip: Clip): Playback {
  const frames = clipFrames(clip);
  return clip.players
    ? preparePlayback(frames, CLIP_RATE, CLIP_MAX_MS)
    : preparePlayback(frames, 1, V1_FRAME_MS * Math.max(0, frames.length - 1));
}

export interface ClipSample {
  players: Point[];
  /** The ball on the ground (its shadow, when lofted). */
  ball: Point;
  /** Height of a lofted ball, 0 on the ground. */
  height: number;
  /** The keyframe the clip is moving towards, and how far along (0–1). */
  index: number;
  progress: number;
}

export function sampleClip(clip: Clip, playback: Playback, elapsed: number): ClipSample {
  const sample = samplePlayback(playback, elapsed);
  const index = Math.max(0, playback.frames.indexOf(sample.to));
  const frame = clip.frames[index]!;
  const lofted = sample.motion === 'air' || sample.motion === 'over';
  const height =
    lofted && frame.apex !== undefined
      ? 4 * sample.progress * (1 - sample.progress) * frame.apex
      : sample.height;
  return {
    players: frame.players.map((point, player) => sample.players.get(String(player)) ?? point),
    ball: sample.ball,
    height,
    index,
    progress: sample.progress,
  };
}

/** Whether a player is on the away side: from the clip in v2, by index in v1. */
export const isAway = (clip: Clip, player: number) =>
  clip.players ? !!clip.players[player]?.away : player >= 11;

export interface ClipStory {
  /** Keyframe of the scorer's strike, or null in a clip without beats. */
  strike: number | null;
  finish: 'shot' | 'header' | null;
  /** The teammate's pass, cross or through ball that the scorer finished, when there is one. */
  assist: { frame: number; kind: AssistKind; actor: number } | null;
  /** The scorer carried the ball into the strike themselves. */
  solo: boolean;
}

/** Who did what in the move, read from the clip's beats. */
export function clipStory(clip: Clip): ClipStory {
  const frames = clip.frames;
  let strike = -1;
  for (let i = frames.length - 1; i > 0; i--) {
    const beat = frames[i]!.beat;
    if (beat && STRIKE_BEATS.has(beat.kind) && beat.actor === clip.selected) {
      strike = i;
      break;
    }
  }
  if (strike < 0) return { strike: null, finish: null, assist: null, solo: false };
  let assist: ClipStory['assist'] = null;
  let solo = false;
  for (let i = strike - 1; i > 0; i--) {
    const beat = frames[i]!.beat;
    if (!beat) continue;
    if (RUN_BEATS.has(beat.kind) && beat.actor === clip.selected) {
      solo = true;
      continue;
    }
    if (
      PASS_BEATS.has(beat.kind) &&
      beat.actor !== null &&
      beat.actor !== clip.selected &&
      isAway(clip, beat.actor) === isAway(clip, clip.selected)
    )
      assist = { frame: i, kind: beat.kind as AssistKind, actor: beat.actor };
    break;
  }
  const kind = frames[strike]!.beat!.kind;
  return {
    strike,
    finish: kind === 'header' ? 'header' : 'shot',
    assist,
    solo: solo && !assist,
  };
}

/** True when the move attacks towards x = 100 (the ball ends in that goal). */
export const attacksRight = (clip: Clip) => (clip.frames.at(-1)?.ball.x ?? 100) >= 50;
const flankOf = (clip: Clip, point: Point): PitchFlank => {
  const w = attacksRight(clip) ? point.y : 100 - point.y;
  return w < 100 / 3 ? 'left' : w > 200 / 3 ? 'right' : 'centre';
};
const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

/** A player's short name from the clip, else (for the scorer) from the moment. */
export function clipName(clip: Clip, player: number, scorer?: string): string | null {
  const name = clip.players?.[player]?.name;
  if (name) return name;
  return player === clip.selected && scorer ? surname(scorer) : null;
}

/**
 * One sentence on how the goal was made, from the clip alone: who set it up, from where,
 * and how the scorer finished. Null for clips without beats (version 1).
 */
export function clipCaption(clip: Clip, scorer: string): string | null {
  const story = clipStory(clip);
  if (story.strike === null || !story.finish) return null;
  const scorerName = clipName(clip, clip.selected, scorer) ?? surname(scorer);
  const finish = format(h.moments.caption.finish[story.finish], { scorer: scorerName });
  const assister = story.assist ? clipName(clip, story.assist.actor) : null;
  let text: string;
  if (story.assist && assister) {
    const from = clip.frames[story.assist.frame - 1]?.ball ?? clip.frames[0]!.ball;
    text = format(h.moments.caption.joined, {
      assist: format(h.moments.caption.assist[story.assist.kind], {
        name: assister,
        flank: h.moments.caption.flank[flankOf(clip, from)],
      }),
      finish,
    });
  } else
    text = format(story.solo ? h.moments.caption.solo : h.moments.caption.alone, {
      scorer: scorerName,
      finish,
    });
  const echo = {
    switch: 'switch',
    'through-ball': 'through',
    'cut-back': 'cutback',
    'long-ball': 'long',
  };
  if (clip.pattern && echo[clip.pattern as keyof typeof echo] !== story.assist?.kind)
    text = format(h.moments.caption.pattern, {
      pattern: h.moments.caption.patterns[clip.pattern],
      caption: text,
    });
  return text;
}
