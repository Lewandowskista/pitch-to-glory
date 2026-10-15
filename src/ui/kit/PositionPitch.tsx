import type { Position } from '../../model/domain';
import { familiarityLevel } from '../../engine/strength';
import { cx } from './cx';

/** Where each position sits on a vertical pitch (attacking upwards), in a 92 × 128 box. */
const SPOT: Record<Position, readonly [number, number]> = {
  GK: [46, 114],
  CB: [46, 97],
  LB: [16, 90],
  RB: [76, 90],
  DM: [46, 80],
  CM: [46, 64],
  AM: [46, 48],
  LW: [18, 37],
  RW: [74, 37],
  ST: [46, 25],
};

export interface PitchPosition {
  position: Position;
  /** 0–100; 100 for the primary position. */
  familiarity: number;
  primary?: boolean;
}

/**
 * A small vertical pitch with the player's positions marked: the primary one as a gold disc,
 * secondary ones the player is comfortable in as mint discs, and positions still being learned
 * as dashed rings. Made for field-green heroes (the marks are fixed hero colours in both
 * themes). The whole drawing is one image; `label` names every position in words, so the
 * marks never rely on colour alone.
 */
export function PositionPitch({
  positions,
  label,
  width = 92,
  className,
}: {
  positions: readonly PitchPosition[];
  /** The spoken summary ("Positions: striker primary, left winger accomplished"). */
  label: string;
  width?: number;
  className?: string;
}) {
  // Primary drawn last, so it is never hidden under a secondary mark.
  const ordered = [...positions].sort(
    (a, b) => Number(Boolean(a.primary)) - Number(Boolean(b.primary)),
  );
  return (
    <svg
      viewBox="0 0 92 128"
      width={width}
      height={(width * 128) / 92}
      role="img"
      aria-label={label}
      className={cx('shrink-0', className)}
    >
      <rect
        x="2"
        y="2"
        width="88"
        height="124"
        rx="8"
        className="fill-night/45 stroke-hero-ink/40"
        strokeWidth="2"
      />
      <g fill="none" className="stroke-hero-ink/40" strokeWidth="2">
        <path d="M2 64H90M30 2V18H62V2M30 126V110H62V126" />
        <circle cx="46" cy="64" r="10" />
      </g>
      {ordered.map(({ position, familiarity, primary }) => {
        const [x, y] = SPOT[position];
        const learning = !primary && familiarityLevel(familiarity) === 'learning';
        return (
          <g key={position} aria-hidden="true">
            <circle
              cx={x}
              cy={y}
              r={primary ? 11 : learning ? 9 : 10}
              className={primary ? 'fill-gold' : learning ? 'fill-none stroke-mint' : 'fill-mint'}
              strokeWidth={learning ? 2 : undefined}
              strokeDasharray={learning ? '3 2' : undefined}
            />
            <text
              x={x}
              y={y + (primary ? 3.5 : 3)}
              textAnchor="middle"
              fontSize={primary ? 10 : learning ? 8 : 9}
              fontWeight="800"
              className={primary ? 'fill-on-gold' : learning ? 'fill-hero-ink' : 'fill-night'}
            >
              {position}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
