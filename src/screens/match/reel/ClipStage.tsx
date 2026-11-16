import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MatchSetup } from '../../../engine/match';
import { reelText as r } from '../../../i18n/reel';
import { recordFailure } from '../../../diagnostics';
import { pitchArt } from '../pitchArt';
import type { ClipScene, ClipSpec } from './clipScene';
import { lazyPage } from '../../../ui/lazyPage';

/** The SVG stills (no WebGL, reduced motion, or Pixi still loading): fetched with the reel. */
const ClipStills = lazyPage(() =>
  import('./ClipStills').then((module) => ({ default: module.ClipStills })),
);

/** The clip renderer's code: fetched while the hub is idle, or when the match screen opens. */
const loadClipScene = () => import('./clipScene');

/** Whether this browser can draw the clips with WebGL. */
function webgl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2') || probe.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

/**
 * The stage a clip plays on: the Pixi renderer, created once while the match screen is up (its
 * ticker stopped whenever nothing moves), or the SVG stills without WebGL and with reduced
 * motion. `spec` null leaves the renderer idle. Overlays (the outcome beat, the GOAL banner)
 * sit on top.
 */
export function ClipStage({
  spec,
  setup,
  vertical,
  reduced,
  skipKey,
  label,
  children,
}: {
  spec: ClipSpec | null;
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>;
  vertical: boolean;
  reduced: boolean;
  /** Increments to jump the clip to its end. */
  skipKey: number;
  /** The clip's accessible description. */
  label: string;
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ClipScene | null>(null);
  const latest = useRef({ spec, vertical, reduced });
  latest.current = { spec, vertical, reduced };
  const [fallback, setFallback] = useState(() => typeof document !== 'undefined' && !webgl());
  const [ready, setReady] = useState(false);
  // One renderer per match screen, created after the first paint so kick-off stays light.
  useEffect(() => {
    const element = host.current;
    if (!element || fallback) return;
    let cancelled = false;
    let owned: ClipScene | null = null;
    const unavailable = () => {
      owned?.destroy();
      if (scene.current === owned) scene.current = null;
      if (!cancelled) setFallback(true);
    };
    const create = () =>
      void loadClipScene()
        .then(({ createClipScene }) =>
          cancelled
            ? null
            : createClipScene(element, {
                home: setup.home,
                away: setup.away,
                selectedPlayerId: setup.selectedPlayerId,
                vertical: latest.current.vertical,
                reduced: latest.current.reduced,
                youLabel: r.you,
                unavailable,
              }),
        )
        .then((created) => {
          if (!created) return;
          owned = created;
          if (cancelled) return created.destroy();
          scene.current = created;
          setReady(true);
        })
        .catch((error: unknown) => {
          recordFailure('boundary', error, 'pitch');
          unavailable();
        });
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(create, { timeout: 600 })
      : window.setTimeout(create, 50);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      owned?.destroy();
      if (scene.current === owned) scene.current = null;
      setReady(false);
    };
  }, [setup.home, setup.away, setup.selectedPlayerId, fallback]);
  useEffect(() => {
    const current = scene.current;
    if (!current) return;
    if (spec) current.play(spec);
    else current.idle();
  }, [spec, ready]);
  useEffect(() => {
    if (skipKey) scene.current?.skip();
  }, [skipKey]);
  useEffect(() => scene.current?.setVertical(vertical), [vertical, ready]);
  useEffect(() => scene.current?.setReduced(reduced), [reduced, ready]);
  const stills = fallback || reduced || !ready;
  return (
    <div className="reel-stage-canvas" style={{ background: pitchArt.grass }}>
      <div className="absolute inset-0" role="img" aria-label={label}>
        <div
          ref={host}
          className="absolute inset-0"
          aria-hidden="true"
          style={{ visibility: stills ? 'hidden' : 'visible' }}
        />
        {stills && spec && (
          <Suspense fallback={null}>
            <ClipStills spec={spec} setup={setup} vertical={vertical} skipKey={skipKey} />
          </Suspense>
        )}
      </div>
      {children}
    </div>
  );
}
