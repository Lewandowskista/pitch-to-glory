import { cx } from './cx';

/**
 * Keyboard keys as keycaps: `<KeyHint keys="Enter" />`, `<KeyHint keys={['1', '2', '3', '4']} />`.
 * Keyboard hints are desktop help: hide them on touch layouts with `max-sm:hidden` where they
 * add nothing. `onHero` draws translucent caps for green hero panels.
 */
export function KeyHint({
  keys,
  onHero = false,
  className,
}: {
  keys: string | readonly string[];
  onHero?: boolean;
  className?: string;
}) {
  const list = typeof keys === 'string' ? [keys] : keys;
  return (
    <span className={cx('inline-flex flex-wrap gap-1 align-middle', className)}>
      {list.map((key) => (
        <kbd
          key={key}
          className={cx(
            'inline-grid h-7 min-w-7 place-items-center rounded-chip border border-b-[3px] px-2 font-sans text-xs leading-none font-extrabold',
            onHero
              ? 'border-[rgb(255_247_228/0.4)] bg-transparent text-hero-ink'
              : 'border-line bg-surface-soft text-ink',
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
