import { useMemo } from 'react';
import { attributeSummary, overallRating, type AxisRating } from '../../engine/strength';
import type { Player } from '../../model/domain';
import { format } from '../../i18n';
import { kitText as k } from '../../i18n/kit';
import { careerText as c } from '../../i18n/career';
import { cx } from './cx';

type RatedPlayer = Pick<Player, 'primaryPosition' | 'attributes' | 'keeperAttributes'>;

const BADGE_SIZE = {
  sm: 'h-[2.625rem] w-10 text-[1.375rem]',
  md: 'h-[4.375rem] w-16 text-[2.125rem]',
  lg: 'h-[5.5rem] w-20 text-[2.75rem]',
} as const;

/**
 * The overall rating hexagon: pitch green with a gold Bebas number, in both themes. Pass the
 * player (it uses `overallRating`, the one rating shown everywhere) or a precomputed `value`.
 */
export function OverallBadge({
  player,
  value,
  size = 'md',
  className,
}: {
  player?: RatedPlayer;
  value?: number;
  size?: keyof typeof BADGE_SIZE;
  className?: string;
}) {
  const rating = value ?? (player ? overallRating(player) : 0);
  return (
    <span
      role="img"
      aria-label={format(k.overall, { value: rating })}
      className={cx(
        'inline-grid shrink-0 place-items-center bg-field font-display leading-none text-gold',
        '[clip-path:polygon(50%_0,100%_22%,100%_78%,50%_100%,0_78%,0_22%)]',
        BADGE_SIZE[size],
        className,
      )}
    >
      <span aria-hidden="true">{rating}</span>
    </span>
  );
}

const SHORT = c.profile.axesShort as Record<string, string>;
const FULL = c.profile.axes as Record<string, string>;

/**
 * The six-axis attribute radar (PAC SHO PAS DRI DEF PHY, or the keeper's six) from
 * `attributeSummary`. The values are written beside each label, and the whole chart is one
 * image whose name lists every axis ("Pace 71, Shooting 58, …").
 */
export function RadarChart({
  player,
  axes: given,
  label,
  size = 220,
  className,
}: {
  player?: RatedPlayer;
  /** Precomputed axes, when there is no player object at hand. */
  axes?: readonly AxisRating[];
  /** What the chart describes ("Robin Vale's attributes"); defaults to "Attribute summary". */
  label?: string;
  size?: number;
  className?: string;
}) {
  const axes = useMemo(() => given ?? (player ? attributeSummary(player) : []), [given, player]);
  const centre = 110;
  const radius = 72;
  const point = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, axes.length);
    return [
      centre + Math.cos(angle) * radius * scale,
      centre + Math.sin(angle) * radius * scale,
    ] as const;
  };
  const ring = (scale: number) =>
    axes
      .map((_, index) =>
        point(index, scale)
          .map((n) => n.toFixed(1))
          .join(','),
      )
      .join(' ');
  const shape = axes
    .map((axis, index) =>
      point(index, Math.max(0.04, Math.min(99, axis.value) / 99))
        .map((n) => n.toFixed(1))
        .join(','),
    )
    .join(' ');
  const spoken = axes
    .map((axis) => format(k.axisValue, { axis: FULL[axis.axis] ?? axis.axis, value: axis.value }))
    .join(', ');
  return (
    <svg
      viewBox="0 0 220 220"
      width={size}
      height={size}
      role="img"
      aria-label={format(k.radar, { label: label ?? k.radarDefault, values: spoken })}
      className={cx('max-w-full', className)}
    >
      {[1, 0.66, 0.33].map((scale) => (
        <polygon
          key={scale}
          points={ring(scale)}
          fill={scale === 1 ? 'var(--surface-soft)' : 'none'}
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      {axes.map((_, index) => {
        const [x, y] = point(index, 1);
        return (
          <line
            key={index}
            x1={centre}
            y1={centre}
            x2={x}
            y2={y}
            stroke="var(--line)"
            strokeWidth="1"
          />
        );
      })}
      <polygon
        points={shape}
        fill="var(--accent)"
        fillOpacity="0.22"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {axes.map((axis, index) => {
        const [x, y] = point(index, 1.3);
        return (
          <text
            key={axis.axis}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            aria-hidden="true"
            className="fill-ink"
          >
            <tspan
              x={x}
              dy="-0.45em"
              fontSize="11"
              fontWeight="700"
              fill="var(--muted)"
              letterSpacing="0.06em"
            >
              {SHORT[axis.axis] ?? axis.axis}
            </tspan>
            <tspan x={x} dy="1.15em" fontSize="17" fontFamily="var(--font-display)">
              {axis.value}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
