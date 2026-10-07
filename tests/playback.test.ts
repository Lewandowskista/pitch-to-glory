import { describe, expect, it } from 'vitest';
import { preparePlayback, samplePlayback } from '../src/screens/match/playback';
import type { ReplayFrame } from '../src/model/domain';

const frame = (
  timeMs: number,
  ball: { x: number; y: number },
  a: { x: number; y: number },
  extra: Partial<ReplayFrame> = {},
): ReplayFrame => ({
  timeMs,
  ball,
  players: [
    { id: 'a', point: a, animation: 'run' },
    { id: 'b', point: { x: 60, y: 50 }, animation: 'run' },
  ],
  ...extra,
});

describe('match playback', () => {
  const frames = [
    frame(0, { x: 40, y: 50 }, { x: 40, y: 50 }, { carrierId: 'a' }),
    frame(2000, { x: 50, y: 50 }, { x: 50, y: 50 }, { carrierId: 'a', ballMotion: 'carry' }),
    frame(4000, { x: 90, y: 20 }, { x: 52, y: 50 }, { ballMotion: 'air' }),
    frame(4000, { x: 50, y: 50 }, { x: 45, y: 50 }, { ballMotion: 'reset' }),
  ];

  it('plays sporting time at a steady rate, capped to fit before the next passage', () => {
    expect(preparePlayback(frames, 10, 5000).duration).toBe(400);
    const capped = preparePlayback(frames, 1, 800);
    expect(capped.duration).toBe(800);
    expect(capped.times).toEqual([0, 400, 800, 800]);
  });

  it('starts and ends exactly on the keyframes', () => {
    const playback = preparePlayback(frames, 10, 5000);
    const start = samplePlayback(playback, 0);
    expect(start.ball).toEqual({ x: 40, y: 50 });
    expect(start.players.get('a')).toEqual({ x: 40, y: 50 });
    const end = samplePlayback(playback, 400);
    expect(end.ball).toEqual({ x: 50, y: 50 });
    expect(end.players.get('a')).toEqual({ x: 45, y: 50 });
  });

  it('keeps a dribbled ball at the runner and lifts a lofted ball', () => {
    const playback = preparePlayback(frames, 10, 5000);
    const dribble = samplePlayback(playback, 100);
    expect(dribble.ball).toEqual(dribble.players.get('a'));
    const cross = samplePlayback(playback, 300);
    expect(cross.height).toBeGreaterThan(0.9);
    expect(cross.ball.x).toBeCloseTo(70, 5);
  });
});
