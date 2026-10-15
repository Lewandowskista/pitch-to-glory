import { useRef } from 'react';
import type { Point, ReplayFrame } from '../../model/domain';
import { kitAppearance, PitchMarkings } from './Maps';
import { pitchCopy as copy } from '../../i18n/pitch';
import type { PitchProps } from './Pitch';
import {
  ballAtFeet,
  kitNumberColor,
  pitchArt,
  pitchBands,
  pitchPoint,
  shirtNumber,
} from './pitchArt';
import { useSvgAssetScale, useSvgPlayback } from './useSvgPlayback';
import { isPassBeat } from './cam';

/**
 * The pitch drawn as SVG: the accessible fallback when WebGL is unavailable. It uses the same
 * deterministic sampler as the GPU scene, the same flat look, and the same fading line for
 * the last pass.
 */
export function SvgPitch({
  frame,
  home,
  away,
  selectedPlayerId,
  numbers,
  celebration,
  motion,
  rate = 18,
  maxMs = 2100,
  reducedMotion = false,
  paused = false,
  viewBox = '0 0 116 80',
  label = copy.label,
}: Pick<PitchProps, 'frame' | 'home' | 'away' | 'selectedPlayerId' | 'celebration'> &
  Partial<
    Pick<PitchProps, 'numbers' | 'motion' | 'rate' | 'maxMs' | 'reducedMotion' | 'paused'>
  > & {
    /** The part of the 116 × 80 drawing to show. */
    viewBox?: string;
    label?: string;
  }) {
  const kits = kitAppearance(home, away);
  const { ref, scale: assetScale } = useSvgAssetScale(viewBox);
  const sample = useSvgPlayback(frame, motion, rate, maxMs, reducedMotion, paused);
  const shown = sample
    ? {
        ...sample.to,
        ball: sample.ball,
        carrierId: sample.carrierId,
        players: sample.to.players.map((player) => ({
          ...player,
          point: sample.players.get(player.id) ?? player.point,
        })),
      }
    : frame;
  const x = (value: number) => 8 + Math.max(-5, Math.min(105, value));
  const y = (value: number) => 8 + Math.max(0, Math.min(100, value)) * 0.64;
  const homeKeeper = shown.players.find((player) => home.playerIds.includes(player.id));
  const homeRight = (homeKeeper?.point.x ?? 0) < 50;
  const headingOf = (id: string) => {
    const from = sample?.from.players.find((player) => player.id === id)?.point;
    const to = sample?.to.players.find((player) => player.id === id)?.point;
    return from && to && Math.hypot(to.x - from.x, to.y - from.y) > 0.1
      ? Math.atan2((to.y - from.y) * 0.64, to.x - from.x)
      : home.playerIds.includes(id) === homeRight
        ? 0
        : Math.PI;
  };
  const carrier = shown.players.find((player) => player.id === shown.carrierId);
  const ballGround = pitchPoint(shown.ball, 5);
  const flight = sample && !['carry', 'dead', 'reset'].includes(sample.motion ?? 'dead');
  const foot = (id: string | null | undefined, weight: number) =>
    id
      ? {
          x: Math.cos(headingOf(id)) * 2.95 * weight * assetScale,
          y: Math.sin(headingOf(id)) * 2.95 * weight * assetScale,
        }
      : { x: 0, y: 0 };
  const sender = flight ? foot(sample.from.carrierId, 1 - sample.progress) : { x: 0, y: 0 };
  const receiver = flight ? foot(sample.to.carrierId, sample.progress) : { x: 0, y: 0 };
  const ball = carrier
    ? ballAtFeet(ballGround, headingOf(carrier.id), assetScale)
    : { x: ballGround.x + sender.x + receiver.x, y: ballGround.y + sender.y + receiver.y };
  const height = sample?.height ?? 0;
  // The last pass: solid while it travels, fainter once it has arrived, gone on a jump.
  const pass = useRef<{ key: ReplayFrame; from: Point; to: Point } | null>(null);
  if (!sample) pass.current = null;
  else if (isPassBeat(sample.to.beat?.kind) && flight && pass.current?.key !== sample.to)
    pass.current = {
      key: sample.to,
      from: pitchPoint(sample.from.ball, 5),
      to: pitchPoint(sample.to.ball, 5),
    };
  const passing = pass.current && sample?.to === pass.current.key && flight;
  const trailEnd = passing ? ballGround : pass.current?.to;
  const selected = shown.players.find((player) => player.id === selectedPlayerId);
  const [vx, vy, vw, vh] = viewBox.split(' ').map(Number) as [number, number, number, number];
  return (
    <div className="relative h-full w-full">
      <svg
        ref={ref}
        viewBox={viewBox}
        role="img"
        aria-label={label}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <rect x="-10" y="-10" width="136" height="100" fill={pitchArt.grass} />
        {pitchBands.map((band) => (
          <rect key={band} x={band} y="-10" width="10" height="100" fill={pitchArt.stripes[1]} />
        ))}
        <PitchMarkings />
        {pass.current && trailEnd && (
          <line
            x1={pass.current.from.x}
            y1={pass.current.from.y}
            x2={trailEnd.x}
            y2={trailEnd.y}
            stroke={pitchArt.trail}
            strokeWidth=".35"
            strokeDasharray="1.2 .9"
            strokeLinecap="round"
            strokeOpacity={passing ? 0.7 : 0.35}
          />
        )}
        {carrier && (
          <circle
            cx={x(carrier.point.x)}
            cy={y(carrier.point.y)}
            r={2.55 * assetScale}
            fill="none"
            stroke={pitchArt.trail}
            strokeWidth=".3"
          />
        )}
        {shown.players
          .map((player, index) => ({ player, index }))
          .sort(
            (a, b) =>
              Number(a.player.id === selectedPlayerId) - Number(b.player.id === selectedPlayerId),
          )
          .map(({ player, index }) => {
            const isHome = home.playerIds.includes(player.id);
            const color = isHome ? kits.home : kits.away;
            const ink = kitNumberColor(color);
            const you = player.id === selectedPlayerId;
            return (
              <g key={player.id} transform={`translate(${x(player.point.x)} ${y(player.point.y)})`}>
                <g transform={`scale(${assetScale})`}>
                  <g
                    key={you ? (celebration?.key ?? 'still') : 'still'}
                    className={
                      you && celebration && !reducedMotion
                        ? `celebrate celebrate-${celebration.motion}`
                        : undefined
                    }
                  >
                    {you && <circle r="3.4" fill={pitchArt.gold} fillOpacity=".32" />}
                    {!isHome && (
                      <circle
                        r="2.3"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth=".22"
                        strokeDasharray=".9 .9"
                      />
                    )}
                    <ellipse cx=".15" cy=".5" rx="2.05" ry="1.9" fill="#06281b" opacity=".4" />
                    <path
                      d="M1.65 -.65L2.6 0L1.65 .65Z"
                      fill={ink}
                      transform={`rotate(${(headingOf(player.id) * 180) / Math.PI})`}
                    />
                    {index % 11 === 0 &&
                      [-2.2, 1.55].map((x) => (
                        <rect
                          key={x}
                          x={x}
                          y="-.55"
                          width=".65"
                          height="1.1"
                          rx=".18"
                          fill="#f7edcf"
                          stroke="#102c26"
                          strokeWidth=".15"
                        />
                      ))}
                    <circle
                      r={pitchArt.radius}
                      fill={color}
                      stroke={you ? pitchArt.gold : '#102c26'}
                      strokeWidth={you ? '.45' : '.3'}
                    />
                    <circle
                      r={pitchArt.radius - 0.25}
                      fill="none"
                      stroke={ink}
                      strokeWidth=".12"
                      opacity=".3"
                    />
                    {!isHome && kits.clash && (
                      <circle r="1.35" fill="none" stroke={ink} strokeWidth=".2" />
                    )}
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      y=".12"
                      fill={ink}
                      fontFamily="Arial, sans-serif"
                      fontSize={pitchArt.numberSize}
                      fontWeight="700"
                    >
                      {shirtNumber(numbers, player.id, index)}
                    </text>
                  </g>
                </g>
              </g>
            );
          })}
        <ellipse
          cx={ball.x + 0.1 + height * 0.6}
          cy={ball.y + 0.25 + height * 0.4}
          rx={(0.85 + height * 0.3) * assetScale}
          ry={0.5 * assetScale}
          fill="#09281d"
          opacity={0.5 - height * 0.2}
        />
        <g
          transform={`translate(${ball.x} ${ball.y - height * 3.8}) scale(${assetScale * (1 + height * 0.3)})`}
        >
          <circle r={pitchArt.ballRadius} fill="white" stroke="#17221c" strokeWidth=".18" />
          <path d="M0 -.3L.29 -.09L.18 .25H-.18L-.29 -.09Z" fill="#17221c" />
          <circle cx="-.6" cy="-.2" r=".13" fill="#17221c" />
          <circle cx=".5" cy=".4" r=".13" fill="#17221c" />
        </g>
      </svg>
      {selected && (
        // Your "You" label follows your token; the drawing's name already says who is who.
        <span
          aria-hidden="true"
          className="match-you-label"
          style={{
            left: `${((x(selected.point.x) - vx) / vw) * 100}%`,
            top: `${((y(selected.point.y) + 3.9 * assetScale - vy) / vh) * 100}%`,
          }}
        >
          {copy.you}
        </span>
      )}
    </div>
  );
}
