import type { ReactNode } from 'react';

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
  }[];
  versus: string;
  inward?: boolean;
  versusClass?: string;
}) {
  const details = sides.some((side) => side.detail);
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 gap-y-2 sm:gap-x-6 ${details ? 'grid-rows-[auto_auto_auto_auto]' : 'grid-rows-[auto_auto_auto]'}`}
    >
      {sides.map((side, index) => (
        <div
          key={side.id}
          className={`grid min-w-0 grid-rows-subgrid justify-items-center text-center ${index === 0 ? 'col-start-1' : 'col-start-3'} row-start-1 ${details ? 'row-span-4' : 'row-span-3'} ${inward ? (index === 0 ? 'sm:justify-items-end sm:text-right' : 'sm:justify-items-start sm:text-left') : ''}`}
        >
          {side.artwork}
          <strong className="self-start font-display text-xl leading-tight break-words text-balance sm:text-3xl">
            {side.name}
          </strong>
          {details && <div className="min-w-0 max-w-full">{side.detail}</div>}
          <div className="min-h-4">{side.label}</div>
        </div>
      ))}
      <span className={`col-start-2 row-start-1 self-center font-display text-3xl ${versusClass}`}>
        {versus}
      </span>
    </div>
  );
}
