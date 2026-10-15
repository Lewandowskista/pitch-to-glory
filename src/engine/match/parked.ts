import type { Point } from '../../model/domain';

/**
 * Where a player sent off stands in the keyframes (engine match-16): off the pitch by the
 * corner flag, at the edge of what a v2 clip can encode (−5), so keyframes and clips keep all
 * 22 players in slot order. Renderers hide a keyframe player whose animation is `off`, and a
 * clip point at this spot.
 */
export const PARKED: Readonly<Point> = { x: -5, y: -5 };
/** The keyframe animation of a player sent off. */
export const OFF_ANIMATION = 'off';
/** A clip or keyframe point where a player sent off is parked. */
export const isParked = (point: Point): boolean => point.x <= -4.9 && point.y <= -4.9;
