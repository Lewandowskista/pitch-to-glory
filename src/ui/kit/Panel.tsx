import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * Card surfaces. `default` is the white (dark: deep green) card with a 1px line and the soft
 * surface shadow. The art tones tint a card by meaning: `gold` for rewards and things that
 * need the player, `green` for the career and good news, `blue` for neutral information.
 * `soft` is a quiet inset surface without a shadow; `dark` is the always-dark match chrome.
 */
export type PanelTone = 'default' | 'soft' | 'gold' | 'green' | 'blue' | 'dark';
/** `compact` for dense or supporting cards, `normal` for most cards, `none` to pad yourself. */
export type PanelPadding = 'none' | 'compact' | 'normal';

const TONE: Record<PanelTone, string> = {
  default: 'border border-line bg-surface shadow-surface',
  soft: 'border border-transparent bg-surface-soft',
  gold: 'border border-line bg-art-gold',
  green: 'border border-line bg-art-green',
  blue: 'border border-line bg-art-blue',
  dark: 'border border-night-line bg-night-soft text-night-ink',
};
const PADDING: Record<PanelPadding, string> = {
  none: '',
  compact: 'p-panel-compact sm:p-panel',
  normal: 'p-panel sm:p-panel-lg',
};

/** The class string of a card, for elements the kit does not render (`ui.panel` uses it). */
export function panelClass(tone: PanelTone = 'default', padding: PanelPadding = 'normal'): string {
  return cx('ui-card min-w-0 rounded-panel', TONE[tone], PADDING[padding]);
}

type PanelElement = 'section' | 'div' | 'article' | 'aside' | 'li' | 'header' | 'form';
export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: PanelElement;
  tone?: PanelTone;
  padding?: PanelPadding;
}

/** A card. Give a `section` an `aria-labelledby` pointing at its `CardTitle`. */
export function Panel({
  as: Element = 'section',
  tone = 'default',
  padding = 'normal',
  className,
  ...rest
}: PanelProps) {
  return <Element className={cx(panelClass(tone, padding), className)} {...rest} />;
}

/** Faint pitch markings for a hero panel: halfway line, centre circle and both boxes. */
export function PitchMarkings({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={cx('pointer-events-none absolute inset-0 h-full w-full', className)}
    >
      <g fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="3">
        <path d="M400 -10V430" />
        <circle cx="400" cy="210" r="86" />
        <path d="M-10 90H120V330H-10" />
        <path d="M810 90H680V330H810" />
      </g>
    </svg>
  );
}

export interface HeroPanelProps extends HTMLAttributes<HTMLElement> {
  as?: PanelElement;
  /** Draw the faint pitch markings behind the content. */
  markings?: boolean;
  padding?: 'normal' | 'compact';
}

/**
 * The field-green hero with mowing stripes and light text: the one card per screen that shows
 * the football (next match, fixture, wizard summary). Pair it with a `play` button. Text
 * colours inside: `text-hero-ink` (default), `text-hero-muted` for secondary lines and
 * `text-gold` for the eyebrow. Same in both themes.
 */
export function HeroPanel({
  as: Element = 'section',
  markings = false,
  padding = 'normal',
  className,
  children,
  ...rest
}: HeroPanelProps) {
  return (
    <Element
      className={cx(
        'relative min-w-0 overflow-hidden rounded-panel bg-field-stripes text-hero-ink',
        padding === 'compact' ? 'p-panel' : 'p-panel sm:px-8 sm:py-7',
        className,
      )}
      {...rest}
    >
      {markings && <PitchMarkings />}
      <div className="relative">{children}</div>
    </Element>
  );
}

export type CardTitleSize = 'sm' | 'md' | 'lg';
const TITLE_SIZE: Record<CardTitleSize, string> = {
  sm: 'text-[1.5rem]',
  md: 'text-[1.75rem] sm:text-[2rem]',
  lg: 'text-[2rem] sm:text-[2.375rem]',
};
/** The class string of a card title (`ui.heading` uses it). */
export function cardTitleClass(size: CardTitleSize = 'md'): string {
  return cx('font-display font-normal leading-none tracking-[0.01em] text-ink', TITLE_SIZE[size]);
}

/** A Bebas card title. Defaults to an `h2`; pass `as="h3"` inside a titled section. */
export function CardTitle({
  as: Element = 'h2',
  size = 'md',
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4'; size?: CardTitleSize }) {
  return <Element className={cx(cardTitleClass(size), className)} {...rest} />;
}

/**
 * A page's title block: an optional eyebrow (context such as "Season 2026 · Week 15 of 34"),
 * the Bebas `h1` and one line that says what to do here. Optional actions sit to the right on
 * wide screens and wrap below on phones. Uses the shared `.page-heading` styles.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx('page-heading', actions ? 'page-heading-actions' : '', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-action">{actions}</div>}
    </header>
  );
}
