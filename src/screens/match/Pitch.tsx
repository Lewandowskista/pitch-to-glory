import { useEffect, useRef, useState } from 'react';
import type { Club, ReplayFrame } from '../../model/domain';
import { pitchCopy as copy } from '../../i18n/pitch';
import { SvgPitch } from './SvgPitch';
import type { PitchScene, PitchView } from './pitchScene';

export interface PitchProps {
  frame: ReplayFrame;
  home: Club;
  away: Club;
  selectedPlayerId: string;
  /** The passage of play ending at `frame`, animated whenever a new one arrives. */
  motion?: ReplayFrame[] | null;
  /** Sporting milliseconds shown per real millisecond, and the longest a passage may take. */
  rate?: number;
  maxMs?: number;
  reducedMotion: boolean;
  /** Freeze a live passage when the player pauses or switches away from the tab. */
  paused?: boolean;
  onUnavailable?: () => void;
  /** The selected player's latest goal celebration: replayed when its key changes. */
  celebration?: { key: string; motion: string } | null;
}

const viewOf = (props: PitchProps): PitchView => ({
  frame: props.frame,
  motion: props.motion ?? null,
  rate: props.rate ?? 18,
  maxMs: props.maxMs ?? 2100,
  reducedMotion: props.reducedMotion,
  paused: props.paused ?? false,
});

export default function Pitch(props: PitchProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PitchScene | null>(null);
  const latest = useRef(props);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  latest.current = props;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let failed = false;
    let ownedScene: PitchScene | null = null;
    const unavailable = () => {
      if (cancelled || failed) return;
      failed = true;
      scene.current?.destroy();
      scene.current = null;
      setFallback(true);
      latest.current.onUnavailable?.();
    };
    setReady(false);
    setFallback(false);
    void (async () => {
      try {
        // Avoid asking Pixi to initialize a renderer on browsers without WebGL.
        const probe = document.createElement('canvas');
        const context = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!context) {
          unavailable();
          return;
        }
        context.getExtension('WEBGL_lose_context')?.loseContext();
        const { createPitchScene } = await import('./pitchScene');
        if (cancelled) return;
        const current = latest.current;
        const created = await createPitchScene(
          element,
          current.home,
          current.away,
          current.selectedPlayerId,
          current.frame,
          unavailable,
        );
        ownedScene = created;
        if (cancelled || failed) {
          created.destroy();
          return;
        }
        scene.current = created;
        created.update(viewOf(latest.current));
        setReady(true);
      } catch {
        unavailable();
      }
    })();
    return () => {
      cancelled = true;
      ownedScene?.destroy();
      if (scene.current === ownedScene) scene.current = null;
    };
  }, [props.home.id, props.away.id, props.selectedPlayerId]);
  useEffect(() => {
    scene.current?.update(viewOf(latest.current));
  }, [props.frame, props.motion, props.rate, props.maxMs, props.reducedMotion, props.paused]);
  const celebrationKey = props.celebration?.key;
  useEffect(() => {
    if (celebrationKey && latest.current.celebration)
      scene.current?.celebrate(latest.current.celebration.motion);
  }, [celebrationKey, ready]);
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '116 / 80',
          overflow: 'hidden',
          borderRadius: 'var(--radius, 16px)',
          background: '#143d2d',
        }}
      >
        {(!ready || fallback) && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <SvgPitch {...props} />
          </div>
        )}
        <div
          ref={host}
          role="img"
          aria-label={copy.label}
          aria-hidden={!ready || fallback}
          style={{ position: 'absolute', inset: 0, visibility: fallback ? 'hidden' : 'visible' }}
        />
      </div>
      <figcaption
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '0.5rem',
          paddingTop: '0.75rem',
          fontSize: '0.75rem',
        }}
      >
        <span>
          {props.home.name} · {copy.home}
        </span>
        <span>
          {props.away.name} · {copy.away}
        </span>
        <span>{copy.selected}</span>
      </figcaption>
      {fallback && (
        <p className="muted" role="status" style={{ fontSize: '0.8rem' }}>
          {copy.fallback}
        </p>
      )}
    </figure>
  );
}
