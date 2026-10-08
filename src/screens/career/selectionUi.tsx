import type { Selection } from '../../engine/career/market';
import type { World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as m } from '../../i18n/market';
import { selectionText as t } from '../../i18n/selection';

const points = (value: number) => {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)}`;
};

/** Where the career player stands for a place, in one sentence. */
export function competitionLine(world: World, selection: Selection): string {
  const competition = selection.competition;
  const position = c.positions[competition.position] ?? competition.position;
  if (competition.inTeam)
    return competition.fit < 100
      ? format(t.inTeamFamiliar, { position, fit: competition.fit })
      : format(t.inTeam, { position });
  if (!competition.formation) return format(t.outsideLine, { places: competition.placesOutside });
  const names = competition.aheadIds.map((id) => world.players[id]?.name ?? id).join(t.and);
  return competition.placesOutside === 1
    ? format(t.outside, { position, names })
    : format(t.outsideMany, { places: competition.placesOutside, position, names });
}

/**
 * The selection chance and its parts, in the order they are added: the same numbers
 * `careerSelection` uses, so the explanation always matches the calculation.
 */
export function SelectionReasons({
  world,
  selection,
  className = '',
  chanceLabel = t.chance,
}: {
  world: World;
  selection: Selection;
  className?: string;
  chanceLabel?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-semibold">{competitionLine(world, selection)}</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
        {selection.reasons.map((reason) => (
          <div key={reason.kind} className="contents">
            <dt className="min-w-0 text-muted">
              {format(t.reasons[reason.kind], {
                role:
                  reason.kind === 'role'
                    ? (m.roles[reason.detail as keyof typeof m.roles] ?? String(reason.detail))
                    : '',
                value: typeof reason.detail === 'number' ? Math.round(reason.detail) : '',
              })}
            </dt>
            <dd
              className={`text-right font-bold tabular-nums ${
                (reason.contribution ?? 0) > 0
                  ? 'text-accent'
                  : (reason.contribution ?? 0) < 0
                    ? 'text-danger'
                    : 'text-muted'
              }`}
            >
              {reason.contribution === null ? '' : points(reason.contribution)}
            </dd>
          </div>
        ))}
        <dt className="border-t border-line pt-1.5 font-bold">{chanceLabel}</dt>
        <dd className="border-t border-line pt-1.5 text-right font-display text-xl leading-none tabular-nums">
          {Math.round(selection.probability * 100)}%
        </dd>
      </dl>
      <p className="mt-2 text-xs text-muted">{t.explain}</p>
    </div>
  );
}
