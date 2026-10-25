import type { CSSProperties } from 'react';
import type { Club } from '../../model/domain';
import { matchColours, type MatchSurface } from '../../engine/assets/clash';
import { pitchArt } from './pitchArt';

/**
 * The surfaces team colours are drawn on: the grass, the card in each theme (`--surface` in
 * tokens.css) and the always-dark scoreboard (`--color-night`).
 */
export const MATCH_SURFACES: Record<MatchSurface, `#${string}`> = {
  pitch: pitchArt.grass,
  light: '#ffffff',
  dark: '#192c23',
  night: '#14251e',
};

/**
 * Token colours for a match, shared by the SVG fallback and GPU scene (importing this does
 * not load Pixi). The away kit is chosen to be distinct for colour-blind viewers too; when no
 * kit is, `clash` adds a second marker to away tokens. `edge` says where a side's colour would
 * vanish into the grass, a card or the scoreboard, so it is outlined there (review U19).
 */
export function kitAppearance(home: Club, away: Club) {
  const colours = matchColours(home, away, MATCH_SURFACES);
  return {
    home: colours.home.colour,
    away: colours.away.colour,
    clash: colours.clash,
    edge: { home: colours.home.edge, away: colours.away.edge },
  };
}
export type TeamEdge = ReturnType<typeof kitAppearance>['edge']['home'];

/**
 * An outline for a swatch or bar in a team's colour where that colour would vanish: on a card
 * (in the theme whose card it matches) or on the always-dark scoreboard.
 */
export function edgeStyle(edge: TeamEdge, surface: 'card' | 'night'): CSSProperties | undefined {
  const rings =
    surface === 'night'
      ? [edge.night && 'inset 0 0 0 1.5px var(--color-night-ink)']
      : [
          edge.light && 'inset 0 0 0 1.5px var(--edge-if-light)',
          edge.dark && 'inset 0 0 0 1.5px var(--edge-if-dark)',
        ];
  const shadow = rings.filter(Boolean).join(', ');
  return shadow ? { boxShadow: shadow } : undefined;
}

export function PitchMarkings() {
  return (
    <g fill="none" stroke={pitchArt.line} strokeWidth="0.32" opacity={pitchArt.lineAlpha}>
      <rect x="8" y="8" width="100" height="64" />
      <path d="M58 8V72" />
      <circle cx="58" cy="40" r="9.15" />
      <rect x="8" y="20" width="16.5" height="40" />
      <rect x="91.5" y="20" width="16.5" height="40" />
      <rect x="8" y="30.5" width="5.5" height="19" />
      <rect x="102.5" y="30.5" width="5.5" height="19" />
      <rect x="5" y="35.8" width="3" height="8.4" fill="#ffffff" fillOpacity=".16" />
      <rect x="108" y="35.8" width="3" height="8.4" fill="#ffffff" fillOpacity=".16" />
      <path d="M9 8A1 1 0 0 1 8 9M108 9A1 1 0 0 1 107 8M107 72A1 1 0 0 1 108 71M8 71A1 1 0 0 1 9 72" />
      <circle cx="19" cy="40" r="0.5" />
      <circle cx="97" cy="40" r="0.5" />
      <circle cx="58" cy="40" r="0.5" />
      <path d="M24.5 32.69A9.15 9.15 0 0 1 24.5 47.31M91.5 32.69A9.15 9.15 0 0 0 91.5 47.31" />
    </g>
  );
}
