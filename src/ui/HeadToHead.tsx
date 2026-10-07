import type { ReactNode } from 'react';

// Full class names, so Tailwind sees them: two to four rows (artwork, name, detail, label).
const GRID_ROWS: Record<number, string> = {
  2: 'grid-rows-[auto_auto]',
  3: 'grid-rows-[auto_auto_auto]',
  4: 'grid-rows-[auto_auto_auto_auto]',
};
const ROW_SPANS: Record<number, string> = { 2: 'row-span-2', 3: 'row-span-3', 4: 'row-span-4' };

/** Shared rows keep artwork and names aligned even when only one side has a label. */
export function HeadToHead({
  sides,
  versus,
  inward = false,
  versusClass = 'text-muted',
}: {
  sides: readonly {
    id: string;
    artwork: ReactNode;
    name: string;
    detail?: ReactNode;
    label?: ReactNode;
    /** A small marker pinned to the bottom of the artwork, such as "You". */
    badge?: ReactNode;
  }[];
  versus: string;
  inward?: boolean;
  versusClass?: string;
}) {
  const details = sides.some((side) => side.detail);
  const labels = sides.some((side) => side.label);
  const rows = 2 + Number(details) + Number(labels);
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 gap-y-2 sm:gap-x-6 ${GRID_ROWS[rows]}`}
    >
      {sides.map((side, index) => (
        <div
          key={side.id}
          className={`grid min-w-0 grid-rows-subgrid justify-items-center text-center ${index === 0 ? 'col-start-1' : 'col-start-3'} row-start-1 ${ROW_SPANS[rows]} ${inward ? (index === 0 ? 'sm:justify-items-end sm:text-right' : 'sm:justify-items-start sm:text-left') : ''}`}
        >
          {side.badge ? (
            <div className="relative pb-2">
              {side.artwork}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full ring-2 ring-surface">
                {side.badge}
              </div>
            </div>
          ) : (
            side.artwork
          )}
          <strong className="self-start font-display text-xl leading-tight break-words text-balance sm:text-3xl">
            {side.name}
          </strong>
          {details && <div className="min-w-0 max-w-full">{side.detail}</div>}
          {labels && <div className="min-h-4">{side.label}</div>}
        </div>
      ))}
      <span className={`col-start-2 row-start-1 self-center font-display text-3xl ${versusClass}`}>
        {versus}
      </span>
    </div>
  );
}
