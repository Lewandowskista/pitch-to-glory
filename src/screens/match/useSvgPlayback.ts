import { useEffect, useRef, useState } from 'react';
import type { ReplayFrame } from '../../model/domain';
import { preparePlayback, samplePlayback, type PlaybackSample, type Playback } from './playback';
import { pitchAssetScale } from './pitchArt';

export function useSvgAssetScale(viewBox: string) {
  const ref = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const [, , width, height] = viewBox.split(' ').map(Number);
    const resize = () =>
      setScale(
        pitchAssetScale(Math.min(element.clientWidth / width!, element.clientHeight / height!)),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [viewBox]);
  return { ref, scale };
}

/** The fallback uses the same deterministic sampler, including pause and reduced motion. */
export function useSvgPlayback(
  frame: ReplayFrame,
  motion: ReplayFrame[] | null | undefined,
  rate: number,
  maxMs: number,
  reduced: boolean,
  paused: boolean,
) {
  const [sample, setSample] = useState<PlaybackSample | null>(null);
  const source = useRef(motion);
  const shown = useRef(frame);
  const playing = useRef<{ playback: Playback; elapsed: number } | null>(null);
  useEffect(() => {
    if (source.current !== motion) {
      source.current = motion;
      if (!reduced && motion && motion.length > 1) {
        const first = {
          ...motion[0]!,
          ball: shown.current.ball,
          carrierId: shown.current.carrierId,
          players: motion[0]!.players.map((player) => ({
            ...player,
            point: shown.current.players.find((p) => p.id === player.id)?.point ?? player.point,
          })),
        };
        playing.current = {
          playback: preparePlayback([first, ...motion.slice(1)], rate, maxMs),
          elapsed: 0,
        };
      } else playing.current = null;
    } else if (playing.current) {
      const { playback, elapsed } = playing.current;
      const next = preparePlayback(playback.frames, rate, maxMs);
      playing.current = {
        playback: next,
        elapsed: playback.duration > 0 ? (elapsed * next.duration) / playback.duration : 0,
      };
    }
    if (reduced || !playing.current || playing.current.playback.duration === 0) {
      playing.current = null;
      shown.current = frame;
      setSample(null);
      return;
    }
    let raf = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const current = playing.current;
      if (!current) return;
      // Hidden tabs freeze instead of jumping ahead when animation frames resume.
      if (!document.hidden) current.elapsed += Math.min(50, now - previous);
      previous = now;
      const next = samplePlayback(current.playback, current.elapsed);
      shown.current = {
        ...next.to,
        ball: next.ball,
        carrierId: next.carrierId,
        players: next.to.players.map((player) => ({
          ...player,
          point: next.players.get(player.id) ?? player.point,
        })),
      };
      setSample(next);
      if (current.elapsed < current.playback.duration) raf = requestAnimationFrame(tick);
      else playing.current = null;
    };
    if (!paused) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frame, motion, rate, maxMs, reduced, paused]);
  return sample;
}
