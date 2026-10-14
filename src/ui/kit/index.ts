/**
 * The shared UI kit (docs/UI-KIT.md is the contract). Screens may import from here; the app
 * shell and other always-loaded code import the individual files instead, so the shell never
 * pulls in kit parts that need engine code (Rating.tsx imports the rating model).
 */
export { cx } from './cx';
export {
  Button,
  ButtonLink,
  IconButton,
  IconButtonLink,
  Spinner,
  buttonClass,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonSize,
  type ButtonVariant,
} from './Button';
export {
  Panel,
  HeroPanel,
  PitchMarkings,
  PageHeader,
  CardTitle,
  panelClass,
  cardTitleClass,
  type PanelProps,
  type PanelTone,
  type PanelPadding,
  type HeroPanelProps,
  type CardTitleSize,
} from './Panel';
export { Chip, EffectChip, CountBadge, chipClass, type ChipTone } from './Chip';
export { ResultChip, FormGuide, type MatchResult } from './Results';
export { Meter, XpBar, AttributeBar, DivergingBar, type MeterTone } from './Meter';
export { StatTile } from './StatTile';
export { OverallBadge, RadarChart } from './Rating';
export { Disclosure } from './Disclosure';
export { EmptyState } from './EmptyState';
export { StatusLine, type StatusTone } from './StatusLine';
export { KeyHint } from './KeyHint';
