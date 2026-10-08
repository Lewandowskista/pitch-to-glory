import { kitAppearance, PitchMarkings } from './Maps';
import { pitchCopy as copy } from '../../i18n/pitch';
import type { PitchProps } from './Pitch';
import { ballAtFeet, kitNumberColor, pitchArt, pitchPoint } from './pitchArt';
import { useSvgAssetScale, useSvgPlayback } from './useSvgPlayback';

/**
 * The pitch drawn as SVG: the accessible fallback when WebGL is unavailable, and (cropped with
 * `viewBox`) the compact situation preview beside a key moment on phones.
 */
export function SvgPitch({
  frame,
  home,
  away,
  selectedPlayerId,
  celebration,
  motion,
  rate = 18,
  maxMs = 2100,
  reducedMotion = false,
  paused = false,
  viewBox = '0 0 116 80',
  label = copy.label,
}: Pick<PitchProps, 'frame' | 'home' | 'away' | 'selectedPlayerId' | 'celebration'> &
  Partial<Pick<PitchProps, 'motion' | 'rate' | 'maxMs' | 'reducedMotion' | 'paused'>> & {
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
  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      role="img"
      aria-label={label}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <rect width="116" height="80" fill={pitchArt.grass} />
      {Array.from({ length: 10 }, (_, index) => (
        <rect
          key={index}
          x={8 + index * 10}
          y="8"
          width="10"
          height="64"
          fill={pitchArt.stripes[index % 2]!}
        />
      ))}
      <PitchMarkings />
      {flight &&
        sample.progress > 0 &&
        sample.progress < 1 &&
        (() => {
          const from = pitchPoint(sample.from.ball, 5);
          const dx = ball.x - from.x,
            dy = ball.y - height * 3.8 - from.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          return (
            <line
              x1={ball.x - (dx / length) * Math.min(4, length)}
              y1={ball.y - height * 3.8 - (dy / length) * Math.min(4, length)}
              x2={ball.x}
              y2={ball.y - height * 3.8}
              stroke={sample.motion === 'shot' ? pitchArt.gold : '#dffbea'}
              strokeWidth=".55"
              strokeOpacity=".3"
              strokeLinecap="round"
            />
          );
        })()}
      {carrier && (
        <circle
          cx={x(carrier.point.x)}
          cy={y(carrier.point.y)}
          r={2.55 * assetScale}
          fill="none"
          stroke="#9ff5d5"
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
          return (
            <g key={player.id} transform={`translate(${x(player.point.x)} ${y(player.point.y)})`}>
              <g transform={`scale(${assetScale})`}>
                <g
                  key={player.id === selectedPlayerId ? (celebration?.key ?? 'still') : 'still'}
                  className={
                    player.id === selectedPlayerId && celebration && !reducedMotion
                      ? `celebrate celebrate-${celebration.motion}`
                      : undefined
                  }
                >
                  {player.id === selectedPlayerId && (
                    <>
                      <circle r="3.1" stroke={pitchArt.gold} strokeWidth=".3" fill="none" />
                      <circle r="2.75" stroke={pitchArt.gold} strokeWidth=".18" fill="none" />
                    </>
                  )}
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
                  <circle r={pitchArt.radius} fill={color} stroke="#102c26" strokeWidth=".3" />
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
                    {(index % 11) + 1}
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
  );
}
