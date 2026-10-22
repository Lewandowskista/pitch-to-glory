import type { LiveTournament, Nation, World } from '../../model/domain';
import {
  groupStandings,
  nationOf,
  pendingTournamentFixture,
  tournamentStep,
} from '../../engine/career/honours/international';
import { careerText as c } from '../../i18n/career';
import { format } from '../../i18n';
import { cx } from '../../ui/kit';

const t = c.hub.tournament;

/** A nation's colours as a small two-band flag. */
export function NationFlag({ nation, className }: { nation: Nation; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-grid shrink-0 grid-cols-2 overflow-hidden rounded-[0.2rem] ring-1 ring-white/30',
        className,
      )}
    >
      <span style={{ background: nation.colors[0] }} />
      <span style={{ background: nation.colors[1] }} />
    </span>
  );
}

/** The tournament's name and the round now being played, e.g. "Semi-final". */
export function tournamentHeading(live: LiveTournament): { title: string; round: string } {
  return {
    title: format(t.title, { name: live.name, year: live.year }),
    round: t.rounds[live.round as keyof typeof t.rounds],
  };
}

/**
 * The hub's match card between seasons while the career player's nation is in a tournament
 * (review phase 3): the match waiting for them, or the round under way, and their group.
 */
export function TournamentBody({ world }: { world: World }) {
  const live = world.international?.live;
  const step = tournamentStep(world);
  if (!live || !step || !live.careerNationId) return null;
  const pending = pendingTournamentFixture(world);
  const own = nationOf(world, live.careerNationId);
  const fixture =
    pending ??
    live.fixtures.find(
      (entry) => entry.round === live.round && (entry.homeId === own.id || entry.awayId === own.id),
    );
  const group = live.groups.find((entry) => entry.includes(own.id));
  const groupIndex = group ? live.groups.indexOf(group) : -1;
  const rows = group && live.round <= 4 ? groupStandings(live, group) : [];
  const side = (id: string) => {
    const nation = nationOf(world, id);
    return (
      <div className="flex min-w-0 flex-col items-center gap-2 text-center">
        <NationFlag nation={nation} className="h-10 w-14 sm:h-14 sm:w-20" />
        <p className="font-display text-[1.375rem] leading-none break-words sm:text-4xl">
          {nation.name}
        </p>
        {id === own.id && (
          <p className="text-[0.6875rem] font-extrabold tracking-[0.08em] text-gold uppercase">
            {t.yourNation}
          </p>
        )}
      </div>
    );
  };
  return (
    <div className="grid gap-4" data-testid="tournament-card">
      {fixture && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-7">
          {side(fixture.homeId)}
          {fixture.score ? (
            <span className="self-center pb-6 font-display text-[2.75rem] leading-[0.8] tabular-nums sm:text-[4rem]">
              {fixture.score[0]}–{fixture.score[1]}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="self-center pb-6 font-display text-[2.75rem] leading-[0.8] text-gold sm:text-[4rem]"
            >
              {c.common.vs.toUpperCase()}
            </span>
          )}
          {side(fixture.awayId)}
        </div>
      )}
      <p className="max-w-prose text-sm text-hero-muted">
        {step === 'play' ? format(t.playBody, { nation: own.name }) : t.continueBody}
      </p>
      {rows.length > 0 && (
        <table className="w-full max-w-md text-sm">
          <caption className="mb-1.5 text-left text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
            {format(t.group, { group: String.fromCharCode(65 + groupIndex) })}
          </caption>
          <thead className="text-xs text-hero-muted">
            <tr>
              <th scope="col" className="text-left font-semibold">
                {t.nation}
              </th>
              <th scope="col" className="w-10 text-right font-semibold">
                <abbr title={t.playedLong}>{t.played}</abbr>
              </th>
              <th scope="col" className="w-12 text-right font-semibold">
                <abbr title={t.differenceLong}>{t.difference}</abbr>
              </th>
              <th scope="col" className="w-12 text-right font-semibold">
                <abbr title={t.pointsLong}>{t.points}</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const nation = nationOf(world, row.nationId);
              return (
                <tr
                  key={row.nationId}
                  className={cx(
                    'border-t border-white/10',
                    row.nationId === own.id && 'font-bold text-gold',
                  )}
                >
                  <th scope="row" className="py-1 text-left font-[inherit]">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 text-hero-muted tabular-nums">{index + 1}</span>
                      <NationFlag nation={nation} className="h-3 w-4" />
                      {nation.name}
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
      )}
    </div>
  );
}
