import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Club, ReplayFrame } from '../../model/domain';
import { pitchCopy as copy } from '../../i18n/pitch';
import { SvgPitch } from './SvgPitch';
import { pitchArt } from './pitchArt';
import type { PitchScene, PitchView } from './pitchScene';

export interface PitchProps {
  frame: ReplayFrame;
  home: Club;
  away: Club;
  selectedPlayerId: string;
  /** Squad numbers by player id (`shirtNumbers`); a token without one shows its slot. */
  numbers?: Readonly<Record<string, number>>;
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
  /**
   * The pitch is out of view (a key moment's camera has the stage): passages jump to their
   * end instead of playing, and a goal celebration waits until the pitch is back.
   */
  still?: boolean;
  /** The accessible name of the drawing. */
  label?: string;
  /** Chips laid over the pitch (formations, attacking direction); decorative text only. */
  overlay?: ReactNode;
}

const viewOf = (props: PitchProps): PitchView => ({
  frame: props.frame,
  motion: props.motion ?? null,
  rate: props.rate ?? 18,
  maxMs: props.maxMs ?? 2100,
  reducedMotion: props.reducedMotion || Boolean(props.still),
  paused: props.paused ?? false,
});

export default function Pitch(props: PitchProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PitchScene | null>(null);
  const latest = useRef(props);
  const celebrated = useRef<string | null>(null);
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
          current.numbers,
          copy.you,
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
  }, [
    props.frame,
    props.motion,
    props.rate,
    props.maxMs,
    props.reducedMotion,
    props.paused,
    props.still,
  ]);
  const celebrationKey = props.celebration?.key;
  useEffect(() => {
    // A goal scored from a key moment is celebrated once the live pitch is back in view.
    const current = latest.current.celebration;
    if (!celebrationKey || !current || props.still || celebrated.current === celebrationKey) return;
    if (!scene.current && !fallback) return;
    celebrated.current = celebrationKey;
    scene.current?.celebrate(current.motion);
  }, [celebrationKey, ready, props.still, fallback]);
  return (
    <figure className="match-pitch-figure">
      <div className="match-pitch-stage" style={{ background: pitchArt.grass }}>
        {(!ready || fallback) && (
          <div className="absolute inset-0">
            <SvgPitch {...props} reducedMotion={props.reducedMotion || Boolean(props.still)} />
          </div>
        )}
        <div
          ref={host}
          role="img"
          aria-label={props.label ?? copy.label}
          aria-hidden={!ready || fallback}
          className="absolute inset-0"
          style={{ visibility: fallback ? 'hidden' : 'visible' }}
        />
        {props.overlay}
      </div>
      <figcaption className="match-pitch-legend">
        <span>
          {props.home.name} · {copy.home}
        </span>
        <span>
          {props.away.name} · {copy.away}
        </span>
        <span>{copy.selected}</span>
      </figcaption>
      {fallback && (
        <p className="match-pitch-fallback" role="status">
          {copy.fallback}
        </p>
      )}
    </figure>
  );
}
