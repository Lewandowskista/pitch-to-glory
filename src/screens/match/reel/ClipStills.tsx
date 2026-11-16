import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point, ReplayFrame } from '../../../model/domain';
import type { MatchSetup } from '../../../engine/match';
import { reelText as r } from '../../../i18n/reel';
import { kitAppearance } from '../pitchKit';
import { kitNumberColor, pitchArt } from '../pitchArt';
import type { ClipSpec } from './clipScene';
import {
  ARROW_COLOURS,
  badgePoint,
  BALL_PX,
  GHOST_ALPHA,
  GHOST_PX,
  PITCH_LENGTH_M,
  PITCH_WIDTH_M,
  TOKEN_PX,
  frameCamera,
  toClip,
  toStage,
  viewSize,
} from './geometry';

/*
 * The clip without WebGL, and with reduced motion (docs/EXPERIENCE-REDESIGN-1.0.md §5): three
 * key stills — where it starts, the decisive touch, how it ends — with the choice arrows while
 * deciding, joined by short crossfades (opacity only, 150 ms). Drawn three times a clip, never
 * per frame.
 */
type Setup = Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>;

/** The keyframes a clip's stills show: start, the touch before the strike (or middle), end. */
export function stillFrames(spec: Pick<ClipSpec, 'timeline' | 'deciding' | 'atEnd'>): number[] {
  const count = spec.timeline.frames.length;
  if (count <= 1 || spec.deciding || spec.atEnd) return [count - 1];
  const middle =
    spec.timeline.strike !== null ? spec.timeline.strike - 1 : Math.floor((count - 1) / 2);
  return [...new Set([0, Math.max(0, middle), count - 1])];
}

function Still({
  frame,
  spec,
  setup,
  size,
  vertical,
  showArrows,
  showShot,
}: {
  frame: ReplayFrame;
  spec: ClipSpec;
  setup: Setup;
  size: { width: number; height: number };
  vertical: boolean;
  showArrows: boolean;
  showShot: boolean;
}) {
  const kits = kitAppearance(setup.home, setup.away);
  const view = viewSize(size.width, size.height, vertical);
  const camera = frameCamera(frame, setup.selectedPlayerId, spec.attacksRight, view, spec.lean);
  const stage = { ...size, ppm: view.ppm };
  const at = (point: Point) => toStage(point, camera, stage, vertical);
  const position = (id: string) => {
    const point = frame.players.find((player) => player.id === id)?.point;
    return point ? at(toClip(point, spec.attacksRight)) : null;
  };
  const home = new Set<string>(setup.home.playerIds);
  const lines = `translate(${size.width / 2} ${size.height / 2}) rotate(${vertical ? 0 : 90}) scale(${view.ppm}) translate(${-camera.x} ${-camera.y})`;
  const w = PITCH_WIDTH_M,
    l = PITCH_LENGTH_M;
  const ball = at(toClip(frame.ball, spec.attacksRight));
  const strike = spec.timeline.strike;
  return (
    <g>
      <rect width={size.width} height={size.height} fill={pitchArt.grass} />
      <g transform={lines}>
        {Array.from({ length: 6 }, (_, band) => (
          <rect
            key={band}
            x={-12}
            y={band * 21 - 6}
            width={w + 24}
            height={10.5}
            fill={pitchArt.stripes[1]}
          />
        ))}
        <g fill="none" stroke="#ffffff" strokeOpacity={pitchArt.lineAlpha} strokeWidth={0.14}>
          <rect x={0} y={0} width={w} height={l} />
          <path d={`M0 ${l / 2}H${w}`} />
          <circle cx={w / 2} cy={l / 2} r={9.15} />
          <path
            d={`M${w / 2 - 20.16} 0V16.5H${w / 2 + 20.16}V0M${w / 2 - 9.16} 0V5.5H${w / 2 + 9.16}V0`}
          />
          <path
            d={`M${w / 2 - 20.16} ${l}V${l - 16.5}H${w / 2 + 20.16}V${l}M${w / 2 - 9.16} ${l}V${l - 5.5}H${w / 2 + 9.16}V${l}`}
          />
          <rect x={w / 2 - 3.66} y={-2} width={7.32} height={2} fill="#ffffff" fillOpacity={0.18} />
          <rect x={w / 2 - 3.66} y={l} width={7.32} height={2} fill="#ffffff" fillOpacity={0.18} />
        </g>
      </g>
      {showShot && strike !== null && (
        <path
          d={`M${at(toClip(spec.timeline.frames[strike - 1]!.ball, spec.attacksRight)).x} ${at(toClip(spec.timeline.frames[strike - 1]!.ball, spec.attacksRight)).y}L${at(toClip(spec.timeline.frames[strike]!.ball, spec.attacksRight)).x} ${at(toClip(spec.timeline.frames[strike]!.ball, spec.attacksRight)).y}`}
          stroke={pitchArt.gold}
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
        />
      )}
      {showArrows &&
        spec.arrows.map((arrow) => {
          const a = at(arrow.from),
            b = at(arrow.to);
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const length = Math.hypot(dx, dy) || 1;
          const bend = (arrow.number % 2 ? -1 : 1) * Math.min(28, length * 0.14);
          const c = {
            x: (a.x + b.x) / 2 + (-dy / length) * bend,
            y: (a.y + b.y) / 2 + (dx / length) * bend,
          };
          const colour = ARROW_COLOURS[(arrow.number - 1) % ARROW_COLOURS.length]!;
          const ex = b.x - c.x,
            ey = b.y - c.y;
          const el = Math.hypot(ex, ey) || 1;
          const [ux, uy] = [ex / el, ey / el];
          const badge = badgePoint(a, c, b);
          return (
            <g key={arrow.number}>
              <path
                d={`M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`}
                stroke={colour}
                strokeWidth={3.5}
                strokeLinecap="round"
                fill="none"
              />
              <path
                d={`M${b.x} ${b.y}L${b.x - ux * 11 - uy * 6} ${b.y - uy * 11 + ux * 6}L${b.x - ux * 11 + uy * 6} ${b.y - uy * 11 - ux * 6}Z`}
                fill={colour}
              />
              <circle
                cx={badge.x}
                cy={badge.y}
                r={11}
                fill={colour}
                stroke="#14251e"
                strokeWidth={2}
              />
              <text
                x={badge.x}
                y={badge.y}
                dy={4.5}
                textAnchor="middle"
                fontSize={13}
                fontWeight={800}
                fill="#153c2d"
              >
                {arrow.number}
              </text>
            </g>
          );
        })}
      {spec.cast.ghosts.map((id) => {
        const p = position(id);
        if (!p) return null;
        return (
          <circle
            key={id}
            cx={p.x}
            cy={p.y}
            r={GHOST_PX / 2}
            fill={home.has(id) ? kits.home : kits.away}
            opacity={GHOST_ALPHA}
          />
        );
      })}
      {[...spec.cast.members].reverse().map((member) => {
        const p = position(member.id);
        if (!p) return null;
        const colour = home.has(member.id) ? kits.home : kits.away;
        const you = member.role === 'you';
        const r0 = TOKEN_PX / 2;
        const text = member.label === 'you' ? r.you : member.label === 'name' ? member.name : null;
        const pill = text ? text.length * 6.8 + 12 : 0;
        return (
          <g key={member.id}>
            {you && <circle cx={p.x} cy={p.y} r={r0 + 7} fill={pitchArt.gold} fillOpacity={0.3} />}
            <circle
              cx={p.x}
              cy={p.y}
              r={r0}
              fill={colour}
              stroke={you ? pitchArt.gold : '#102c26'}
              strokeWidth={you ? 3 : 2}
            />
            <text
              x={p.x}
              y={p.y}
              dy={4.2}
              textAnchor="middle"
              fontSize={12}
              fontWeight={800}
              fill={kitNumberColor(colour)}
            >
              {member.number}
            </text>
            {text && (
              <g>
                <rect
                  x={p.x - pill / 2}
                  y={you ? p.y + r0 + 3 : p.y - r0 - 20}
                  width={pill}
                  height={17}
                  rx={8.5}
                  fill={you ? pitchArt.gold : 'rgba(20,37,30,0.9)'}
                />
                <text
                  x={p.x}
                  y={you ? p.y + r0 + 15.5 : p.y - r0 - 7.5}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={800}
                  fill={you ? pitchArt.night : '#ffffff'}
                >
                  {text}
                </text>
              </g>
            )}
          </g>
        );
      })}
      <circle
        cx={ball.x}
        cy={ball.y}
        r={BALL_PX / 2}
        fill="#ffffff"
        stroke="#14251e"
        strokeWidth={1.5}
      />
    </g>
  );
}

/** The stills of a clip, shown in turn over the clip's duration. */
export function ClipStills({
  spec,
  setup,
  vertical,
  skipKey,
}: {
  spec: ClipSpec;
  setup: Setup;
  vertical: boolean;
  skipKey: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 360, height: 300 });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = () =>
      setSize({
        width: Math.max(1, Math.round(element.clientWidth)),
        height: Math.max(1, Math.round(element.clientHeight)),
      });
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, []);
  const stills = useMemo(() => stillFrames(spec), [spec]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (stills.length <= 1) return;
    const step = spec.timeline.duration / stills.length;
    const timers = stills
      .slice(1)
      .map((_, index) => window.setTimeout(() => setShown(index + 1), step * (index + 1)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [stills, spec.timeline.duration]);
  useEffect(() => {
    if (skipKey) setShown(stills.length - 1);
  }, [skipKey, stills.length]);
  return (
    <div ref={host} className="absolute inset-0" aria-hidden="true">
      {stills.map((index, order) => (
        <svg
          key={`${spec.key}:${index}`}
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="reel-still absolute inset-0 h-full w-full"
          data-shown={order === shown ? '' : undefined}
        >
          <Still
            frame={spec.timeline.frames[index]!}
            spec={spec}
            setup={setup}
            size={size}
            vertical={vertical}
            showArrows={spec.deciding && order === stills.length - 1}
            showShot={spec.shotPath && order === stills.length - 1}
          />
        </svg>
      ))}
    </div>
  );
}
