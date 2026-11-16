import { LOCALE, type Translations } from './locale';
const pitchCopyEn = {
  label:
    'Live football pitch. Home players have solid outlines; away players have dashed outer rings. Your player has a gold ring and a You label.',
  fallback: 'Using the accessible pitch view. Match decisions and controls remain available.',
  /** The pitch failed altogether (release 1.0 step 4.2): even the SVG view could not load. */
  missing:
    'The pitch could not be drawn. Follow the match in the commentary; decisions and controls still work.',
  home: 'Home · solid outline',
  away: 'Away · dashed ring',
  selected: 'You · gold ring',
  heatmap: 'Movement heatmap',
  passes: 'Pass map',
  shots: 'Shot map',
  density: 'Brighter cells show more recorded positions.',
  timeDensity: 'Brighter cells show where you spent more time. Your team attacks left to right.',
  passLegend: 'Solid blue: completed. Dashed coral: incomplete.',
  shotLegend: 'Gold star: goal. White circle: other shot.',
  noPasses: 'No passes recorded.',
  noShots: 'No shots recorded.',
  noMovement: 'No player positions recorded.',
  /** The maps' screen-reader labels. */
  heatmapSeconds: 'Movement heatmap: {seconds} seconds of play',
  heatmapSamples: 'Movement heatmap: {count} recorded positions',
  passesLabel: 'Pass map: {attempts} attempts, {completed} completed',
  shotsLabel: 'Shot map: {attempts} attempts, {scored} scored',
  /** A heat cell's tooltip, and the pass and shot tallies under the maps. */
  cellSeconds: '{count} seconds of play',
  cellSamples: '{count} recorded positions',
  passesTally: '{completed}/{attempts} completed.',
  shotsTally: '{scored}/{attempts} scored.',
  /** The redesigned pitch and maps (redesign phase 5b). */
  you: 'You',
  liveLabel:
    'Live pitch: {formations}. Your player has a gold ring and a You label; away players have dashed outer rings. A fading dashed line shows the last pass.',
  heatTime: 'Brighter cells show where you spent more time. {club} attack left to right.',
  shotSizes: 'Larger circles were bigger chances.',
  completedLegend: 'Completed',
  incompleteLegend: 'Incomplete',
  goalLegend: 'Goal',
  otherShotLegend: 'Other shot',
};
export const pitchCopy = ({ en: pitchCopyEn } satisfies Translations<typeof pitchCopyEn>)[LOCALE];
