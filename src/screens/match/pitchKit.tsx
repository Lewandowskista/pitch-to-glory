import type { Club } from '../../model/domain';
import { chooseMatchKits } from '../../engine/assets/clash';
import { pitchArt } from './pitchArt';

/**
 * Token colours for a match, shared by the SVG fallback and GPU scene (importing this does
 * not load Pixi). The away kit is chosen to be distinct for colour-blind viewers too; when no
 * kit is, `clash` adds a second marker to away tokens.
 */
export function kitAppearance(home: Club, away: Club) {
  const kits = chooseMatchKits(home, away);
  return { home: kits.home.colors[0], away: kits.away.colors[0], clash: kits.clash };
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
