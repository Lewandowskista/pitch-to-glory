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

  it('preserves sporting time with readable flights, capped to fit before the next passage', () => {
    expect(preparePlayback(frames, 10, 5000).duration).toBe(500);
    const capped = preparePlayback(frames, 1, 800);
    expect(capped.duration).toBe(800);
    expect(capped.times).toEqual([0, 400, 800, 800]);
  });

  it('starts and ends exactly on the keyframes', () => {
    const playback = preparePlayback(frames, 10, 5000);
    const start = samplePlayback(playback, 0);
    expect(start.ball).toEqual({ x: 40, y: 50 });
    expect(start.players.get('a')).toEqual({ x: 40, y: 50 });
    const end = samplePlayback(playback, playback.duration);
    expect(end.ball).toEqual({ x: 50, y: 50 });
    expect(end.players.get('a')).toEqual({ x: 45, y: 50 });
  });

  it('keeps a dribbled ball at the runner and lifts a lofted ball', () => {
    const playback = preparePlayback(frames, 10, 5000);
    const dribble = samplePlayback(playback, 100);
    expect(dribble.ball).toEqual(dribble.players.get('a'));
    const cross = samplePlayback(playback, 350);
    expect(cross.height).toBeGreaterThan(0.9);
    expect(cross.ball.x).toBeCloseTo(70, 5);
  });

  it('does not anticipate a restart or overshoot a stopped runner', () => {
    const run = [
      frame(0, { x: 0, y: 50 }, { x: 0, y: 50 }),
      frame(1000, { x: 10, y: 50 }, { x: 10, y: 50 }),
      frame(2000, { x: 10, y: 50 }, { x: 10, y: 50 }),
      frame(3000, { x: 50, y: 50 }, { x: 50, y: 50 }, { ballMotion: 'reset' }),
    ];
    const playback = preparePlayback(run, 1, 5000);
    for (let ms = 1000; ms < 2000; ms += 20)
      expect(samplePlayback(playback, ms).players.get('a')!.x).toBeCloseTo(10, 6);
  });

  it('allocates readable time to a quick shot between longer runs', () => {
    const shot = [
      frame(0, { x: 40, y: 50 }, { x: 40, y: 50 }, { carrierId: 'a' }),
      frame(10000, { x: 80, y: 50 }, { x: 80, y: 50 }, { carrierId: 'a', ballMotion: 'carry' }),
      frame(10400, { x: 102, y: 50 }, { x: 81, y: 50 }, { ballMotion: 'shot' }),
    ];
    const playback = preparePlayback(shot, 18, 2200);
    expect(playback.times[2]! - playback.times[1]!).toBeGreaterThanOrEqual(240);
    expect(playback.duration).toBeLessThanOrEqual(2200);
  });

  it('keeps running velocity continuous across unequally spaced keyframes', () => {
    const run = [0, 1000, 4000, 5000].map((time) =>
      frame(
        time,
        { x: time / 100, y: 50 },
        { x: time / 100, y: 50 },
        { ballMotion: 'carry', carrierId: 'a' },
      ),
    );
    const playback = preparePlayback(run, 1, 6000);
    const x = (t: number) => samplePlayback(playback, t).players.get('a')!.x;
    expect(x(1000) - x(990)).toBeCloseTo(x(1010) - x(1000), 3);
  });

  it('connects a skipped passage without teleporting the ball to a different carrier', () => {
    const playback = preparePlayback(
      [
        frame(0, { x: 10, y: 20 }, { x: 10, y: 20 }, { carrierId: 'a' }),
        frame(1000, { x: 60, y: 50 }, { x: 15, y: 20 }, { carrierId: 'b', ballMotion: 'carry' }),
      ],
      1,
      2000,
    );
    expect(samplePlayback(playback, 0).ball).toEqual({ x: 10, y: 20 });
    expect(samplePlayback(playback, 500).ball).toEqual({ x: 35, y: 35 });
    expect(samplePlayback(playback, 500).carrierId).toBeNull();
    expect(samplePlayback(playback, 1000).carrierId).toBe('b');
  });
});
