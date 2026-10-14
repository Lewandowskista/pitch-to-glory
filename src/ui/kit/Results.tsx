import { format } from '../../i18n';
import { kitText as k } from '../../i18n/kit';
import { cx } from './cx';

export type MatchResult = 'W' | 'D' | 'L';

/**
 * Result pill colours. On cards: win green, draw neutral, loss outlined red. On a hero
 * (`onHero`): win gold, draw translucent, loss red, as on the hub's next-match card. The letter
 * is always written, so the result never depends on colour.
 */
const ON_CARD: Record<MatchResult, string> = {
  W: 'bg-accent text-on-accent',
  D: 'bg-surface-soft text-ink',
  L: 'bg-danger-soft text-danger shadow-[inset_0_0_0_1px_var(--danger)]',
};
const ON_HERO: Record<MatchResult, string> = {
  W: 'bg-gold text-on-gold',
  D: 'bg-[rgb(255_247_228/0.22)] text-hero-ink',
  L: 'bg-[#a72d30] text-hero-ink',
};

function pillClass(result: MatchResult, onHero: boolean, size: 'sm' | 'md') {
  return cx(
    'inline-grid shrink-0 place-items-center rounded-chip text-xs font-extrabold',
    size === 'sm' ? 'h-6 w-6' : 'h-[1.625rem] w-[1.625rem]',
    (onHero ? ON_HERO : ON_CARD)[result],
  );
}

/** One W/D/L pill, announced as "Won", "Drew" or "Lost". */
export function ResultChip({
  result,
  onHero = false,
  size = 'md',
  className,
}: {
  result: MatchResult;
  onHero?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={k.results[result]}
      className={cx(pillClass(result, onHero, size), className)}
    >
      {result}
    </span>
  );
}

/**
 * The last results as pills, oldest first, read as one phrase ("Birchfield form: won, drew,
 * lost"). Pass `label` with the subject, or the default "Form" is used.
 */
export function FormGuide({
  results,
  label,
  onHero = false,
  size = 'sm',
  className,
}: {
  results: readonly MatchResult[];
  label?: string;
  onHero?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const spoken = results.map((result) => k.results[result].toLowerCase()).join(', ');
  return (
    <span
      role="img"
      aria-label={label ? `${label}: ${spoken}` : format(k.form, { results: spoken })}
      className={cx('inline-flex gap-1', className)}
    >
      {results.map((result, index) => (
        <span key={index} aria-hidden="true" className={pillClass(result, onHero, size)}>
          {result}
        </span>
      ))}
    </span>
  );
}
