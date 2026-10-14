import { useMemo } from 'react';
import type { Hex } from '../../model/domain';
import { celebrationToken, renderCelebration } from '../../engine/assets/celebrations';
import { TONE } from '../../engine/assets/illustration';

/**
 * A token performing a celebration, for previews. While it holds still it shows the
 * celebration's key frame (always, under reduced motion); playing, the token animates. With
 * `onHover`, it holds still until the surrounding `group` is hovered or focused, so a grid of
 * previews does not loop all at once.
 */
export function CelebrationPreview({
  id,
  motion,
  label,
  kit,
  onHover = false,
  className = 'h-16 w-24',
}: {
  id: string;
  motion: string;
  label: string;
  /** Shirt and trim colours of the token. */
  kit?: readonly [Hex, Hex];
  onHover?: boolean;
  /** Size of the preview (3:2). */
  className?: string;
}) {
  const pose = useMemo(
    () => `data:image/svg+xml,${encodeURIComponent(renderCelebration(id, kit))}`,
    [id, kit],
  );
  const { shirt, trim } = celebrationToken(kit);
  return (
    <svg
      viewBox="0 0 60 40"
      data-still={onHover ? '' : undefined}
      className={`celebration-preview shrink-0 rounded-chip ${className} ${
        onHover
          ? '[&_.celebrate]:[animation-play-state:paused] group-hover:[&_.celebrate]:[animation-play-state:running]! group-focus-visible:[&_.celebrate]:[animation-play-state:running]!'
          : ''
      }`}
      role="img"
      aria-label={label}
    >
      <rect width="60" height="40" rx="6" className="fill-field" />
      <path
        d="M6 0H12V40H6Q0 40 0 34V6Q0 0 6 0ZM24 0H36V40H24ZM48 0H54Q60 0 60 6V34Q60 40 54 40H48Z"
        className="fill-field-stripe"
      />
      <path d="M30 0V40M0 20H60" stroke={TONE.mint} strokeOpacity=".35" strokeWidth=".6" />
      <image href={pose} width="60" height="40" className="celebration-pose" />
      <g transform="translate(30 20)" className="celebration-token">
        <g className={`celebrate celebrate-${motion}`}>
          <circle r="6.5" fill="none" stroke={TONE.gold} strokeWidth="1.2" />
          <circle r="5" fill={shirt} stroke={trim} strokeWidth="1" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={trim}
            fontSize="5"
            fontWeight="800"
          >
            9
          </text>
        </g>
      </g>
    </svg>
  );
}
