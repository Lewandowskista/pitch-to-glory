import { useEffect, useRef, useState } from 'react';
import type { Club, ReplayFrame } from '../../model/domain';
import { pitchCopy as copy } from '../../i18n/pitch';
import { kitAppearance, PitchMarkings } from './Maps';
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
  onUnavailable?: () => void;
  /** The selected player's latest goal celebration: replayed when its key changes. */
  celebration?: { key: string; motion: string } | null;
}

function SvgPitch({ frame, home, away, selectedPlayerId, celebration }: PitchProps) {
  const kits = kitAppearance(home, away);
  const x = (value: number) => 8 + Math.max(0, Math.min(100, value));
  const y = (value: number) => 8 + Math.max(0, Math.min(100, value)) * 0.64;
  return (
    <svg
      viewBox="0 0 116 80"
      role="img"
      aria-label={copy.label}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <rect width="116" height="80" fill="#143d2d" />
      {Array.from({ length: 10 }, (_, index) => (
        <rect
          key={index}
          x={8 + index * 10}
          y="8"
          width="10"
          height="64"
          fill={index % 2 ? '#286345' : '#2e704e'}
        />
      ))}
      <PitchMarkings />
      {frame.players.map((player, index) => {
        const isHome = home.playerIds.includes(player.id);
        return (
          <g key={player.id} transform={`translate(${x(player.point.x)} ${y(player.point.y)})`}>
            <g
              key={player.id === selectedPlayerId ? (celebration?.key ?? 'still') : 'still'}
              className={
                player.id === selectedPlayerId && celebration
                  ? `celebrate celebrate-${celebration.motion}`
                  : undefined
              }
            >
              {player.id === selectedPlayerId && (
                <>
                  <circle r="2.7" stroke="#ffda70" strokeWidth=".35" fill="none" />
                  <circle r="2.3" stroke="#ffda70" strokeWidth=".2" fill="none" />
                </>
              )}
              {!isHome && (
                <circle
                  r="2.05"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth=".2"
                  strokeDasharray=".7 .7"
                />
              )}
              <circle
                r="1.7"
                fill={isHome ? kits.home : kits.away}
                stroke={isHome ? '#111e2c' : '#ffffff'}
                strokeWidth=".3"
              />
              {!isHome && kits.clash && (
                <circle r="1.05" fill="none" stroke="#ffffff" strokeWidth=".3" />
              )}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                stroke="#17221c"
                strokeWidth=".2"
                paintOrder="stroke"
                fontSize="1.5"
                fontWeight="700"
              >
                {(index % 11) + 1}
              </text>
            </g>
          </g>
        );
      })}
      <circle
        cx={x(frame.ball.x)}
        cy={y(frame.ball.y)}
        r=".65"
        fill="white"
        stroke="#17221c"
        strokeWidth=".18"
      />
    </svg>
  );
}

const viewOf = (props: PitchProps): PitchView => ({
  frame: props.frame,
  motion: props.motion ?? null,
  rate: props.rate ?? 18,
  maxMs: props.maxMs ?? 800,
  reducedMotion: props.reducedMotion,
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
  }, [props.frame, props.motion, props.rate, props.maxMs, props.reducedMotion]);
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
