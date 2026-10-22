import type { World } from '../../model/domain';
import {
  nationOf,
  qualifyingStandings,
  tournamentName,
} from '../../engine/career/honours/international';
import { CONFIG } from '../../engine/config';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { CardTitle, Panel, cx } from '../../ui/kit';
import { NationFlag } from './TournamentHub';

const q = h.national.qualifying;
const Q = CONFIG.career.honours.international.qualifying;

/**
 * The player's nation's qualifying campaign (review phase 3, step 3.3): its group table, what
 * each place means, and its six matches with their windows.
 */
export function QualifyingPanel({ world, nationId }: { world: World; nationId: string }) {
  const qualifying = world.international?.qualifying;
  const group = qualifying?.groups.find((entry) => entry.includes(nationId));
  if (!qualifying || !group) return null;
  const table = qualifyingStandings(qualifying, group);
  const letter = String.fromCharCode(65 + qualifying.groups.indexOf(group));
  const own = nationOf(world, nationId);
  const done = qualifying.qualified;
  const name = format(q.name, {
    name: tournamentName(world, qualifying.kind),
    year: qualifying.year,
  });
  const status = done
    ? done.includes(nationId)
      ? format(q.qualified, { nation: own.name })
      : format(q.missed, { nation: own.name })
    : format(q.progress, { played: qualifying.played, total: 6 });
  const fixtures = qualifying.fixtures
    .filter((fixture) => fixture.homeId === nationId || fixture.awayId === nationId)
    .sort((a, b) => a.matchday - b.matchday);
  return (
    <Panel aria-labelledby="qualifying-heading" data-testid="qualifying">
      <CardTitle id="qualifying-heading">{name}</CardTitle>
      <p className={cx('mt-1 text-sm font-bold', done?.includes(nationId) && 'text-accent')}>
        {status}
      </p>
      <table className="mt-3.5 w-full text-sm">
        <caption className="mb-1.5 text-left text-xs font-extrabold tracking-[0.12em] text-muted uppercase">
          {format(q.group, { group: letter })}
        </caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="text-left font-semibold">
              {q.nation}
            </th>
            <th scope="col" className="w-9 text-right font-semibold">
              <abbr title={q.playedLong}>{q.played}</abbr>
            </th>
            <th scope="col" className="w-11 text-right font-semibold">
              <abbr title={q.differenceLong}>{q.difference}</abbr>
            </th>
            <th scope="col" className="w-11 text-right font-semibold">
              <abbr title={q.pointsLong}>{q.points}</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, index) => {
            const nation = nationOf(world, row.nationId);
            const through = done
              ? done.includes(row.nationId)
              : index < 2
                ? true
                : index === 2
                  ? null
                  : false;
            return (
              <tr
                key={row.nationId}
                className={cx(
                  'border-t border-line',
                  row.nationId === nationId && 'font-extrabold',
                )}
              >
                <th scope="row" className="py-1.5 text-left font-[inherit]">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cx(
                        'h-4 w-1 rounded-full',
                        through === true
                          ? 'bg-accent'
                          : through === null
                            ? 'bg-gold'
                            : 'bg-transparent',
                      )}
                      aria-hidden="true"
                    />
                    <span className="w-3 text-muted tabular-nums">{index + 1}</span>
                    <NationFlag nation={nation} className="h-3 w-4" />
                    {nation.name}
                    {through === true && <span className="sr-only">{q.throughLabel}</span>}
                  </span>
                </th>
                <td className="text-right tabular-nums">{row.played}</td>
                <td className="text-right tabular-nums">
                  {row.difference > 0 ? `+${row.difference}` : row.difference}
                </td>
                <td className="text-right tabular-nums">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">{format(q.rule, { thirds: Q.bestThirds })}</p>
      <ul className="mt-3 grid gap-1.5" aria-label={q.matches}>
        {fixtures.map((fixture) => {
          const home = fixture.homeId === nationId;
          const opponent = nationOf(world, home ? fixture.awayId : fixture.homeId);
          return (
            <li
              key={fixture.id}
              className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 text-sm first:border-t-0"
            >
              <span className="min-w-0">
                <span className="text-xs text-muted">
                  {format(q.window, { window: Math.ceil(fixture.matchday / 2) })} ·{' '}
                  {home ? q.home : q.away}
                </span>{' '}
                <span className="font-bold">{format(q.versus, { nation: opponent.name })}</span>
              </span>
              <span className="shrink-0 font-extrabold tabular-nums">
                {fixture.score
                  ? `${fixture.score[home ? 0 : 1]}–${fixture.score[home ? 1 : 0]}`
                  : q.toPlay}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
