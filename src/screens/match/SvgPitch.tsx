import { kitAppearance, PitchMarkings } from './Maps';
import { pitchCopy as copy } from '../../i18n/pitch';
import type { PitchProps } from './Pitch';

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
  viewBox = '0 0 116 80',
  label = copy.label,
}: Pick<PitchProps, 'frame' | 'home' | 'away' | 'selectedPlayerId' | 'celebration'> & {
  /** The part of the 116 × 80 drawing to show. */
  viewBox?: string;
  label?: string;
}) {
  const kits = kitAppearance(home, away);
  const x = (value: number) => 8 + Math.max(0, Math.min(100, value));
  const y = (value: number) => 8 + Math.max(0, Math.min(100, value)) * 0.64;
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={label}
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
