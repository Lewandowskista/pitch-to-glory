import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { World } from '../../model/domain';
import { format } from '../../i18n';
import { agendaText as a } from '../../i18n/agenda';
import { careerText as c } from '../../i18n/career';
import { CareerPage, CrestImage, ui } from './shared';
import { competitionName } from './selectors';
import { seasonAgenda, withSave, type AgendaEntry, type AgendaWeek } from './agenda';
import { priorityLabel } from './HubPriorities';
import { focusLabel } from './trainingLabels';

type View = 'ahead' | 'all';
const VIEWS: View[] = ['ahead', 'all'];

/** Weeks shown from this week before the rest of the season is asked for. */
const AHEAD_WEEKS = 8;

export default function CareerCalendar() {
  return (
    <CareerPage title={a.calendar.title} description={a.calendar.description}>
      {({ world }) => <CalendarContent world={world} />}
    </CareerPage>
  );
}

function CalendarContent({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('weeks') === 'all' ? 'all' : 'ahead';
  const select = (next: View) => {
    const search = new URLSearchParams(params);
    if (next === 'all') search.set('weeks', 'all');
    else search.delete('weeks');
    setParams(search, { replace: true });
  };
  const agenda = seasonAgenda(world);
  const complete = world.phase === 'complete';
  const upcoming = view === 'all' || complete ? agenda : agenda.filter((week) => !week.past);
  // From this week: the next few weeks first, the rest of the season one press away.
  const bounded = view === 'ahead' && !complete && upcoming.length > AHEAD_WEEKS;
  const expanded = params.get('rest') === '1';
  const shown = bounded && !expanded ? upcoming.slice(0, AHEAD_WEEKS) : upcoming;
  const toggleRest = () => {
    const search = new URLSearchParams(params);
    if (expanded) search.delete('rest');
    else search.set('rest', '1');
    setParams(search, { replace: true });
  };
  return (
    <div className="grid gap-5">
      <div className="segmented-tabs" role="tablist" aria-label={a.calendar.views}>
        {VIEWS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            id={`weeks-${entry}`}
            aria-controls="calendar-weeks"
            aria-selected={view === entry}
            tabIndex={view === entry ? 0 : -1}
            onClick={() => select(entry)}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = entry === 'ahead' ? 'all' : 'ahead';
              select(next);
              document.getElementById(`weeks-${next}`)?.focus();
            }}
          >
            {a.calendar[entry]}
          </button>
        ))}
      </div>
      {complete && <p className={ui.muted}>{a.calendar.seasonOver}</p>}
      <div id="calendar-weeks" role="tabpanel" aria-labelledby={`weeks-${view}`}>
        {/* Two balanced columns on wide screens, read down then across: a busy week never
            stretches its quiet neighbour. */}
        <ol className="grid gap-3 xl:block xl:columns-2 xl:gap-3 xl:[&>li]:mb-3 xl:[&>li]:break-inside-avoid">
          {groupQuiet(shown).map((week) =>
            'until' in week ? (
              <QuietWeeks key={week.week} from={week.week} to={week.until} />
            ) : (
              <WeekRow key={week.week} world={world} week={week} />
            ),
          )}
        </ol>
        {bounded && (
          <button className="text-button -ml-3 mt-1" onClick={toggleRest}>
            {expanded
              ? format(a.calendar.fewer, { count: AHEAD_WEEKS })
              : format(a.calendar.more, { count: upcoming.length - AHEAD_WEEKS })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Runs of two or more weeks with nothing in them collapse into one row. */
function groupQuiet(weeks: AgendaWeek[]): (AgendaWeek | { week: number; until: number })[] {
  const rows: (AgendaWeek | { week: number; until: number })[] = [];
  for (let index = 0; index < weeks.length; index++) {
    const week = weeks[index]!;
    let end = index;
    while (
      !week.current &&
      !week.entries.length &&
      weeks[end + 1] &&
      !weeks[end + 1]!.current &&
      !weeks[end + 1]!.entries.length
    )
      end++;
    if (end > index) {
      rows.push({ week: week.week, until: weeks[end]!.week });
      index = end;
    } else rows.push(week);
  }
  return rows;
}

function QuietWeeks({ from, to }: { from: number; to: number }) {
  return (
    <li className="grid gap-3 rounded-panel border border-line bg-surface p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 sm:p-5">
      <h2 className="font-display text-2xl leading-none">
        {format(a.calendar.weeks, { from, to })}
      </h2>
      <p className="self-center text-sm text-muted">{a.calendar.empty}</p>
    </li>
  );
}

function WeekRow({ world, week }: { world: World; week: AgendaWeek }) {
  const fixtures = week.entries.filter((entry) => entry.kind === 'fixture').length;
  return (
    <li
      aria-current={week.current ? 'date' : undefined}
      className={`grid content-start gap-3 rounded-panel border p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 sm:p-5 ${
        week.current
          ? 'border-accent bg-surface shadow-surface ring-2 ring-accent/30'
          : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-baseline gap-3 sm:block">
        <h2 className="font-display text-2xl leading-none">
          {format(a.calendar.week, { week: week.week })}
        </h2>
        {week.current && (
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent sm:mt-2 sm:inline-block">
            {a.calendar.thisWeek}
          </span>
        )}
      </div>
      {week.entries.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
          {week.entries.map((entry, index) => (
            <Entry key={index} world={world} entry={entry} showDay={fixtures > 1} />
          ))}
        </ul>
      ) : (
        <p className="self-center text-sm text-muted">{a.calendar.empty}</p>
      )}
    </li>
  );
}

const marker = {
  accent: 'bg-accent',
  gold: 'bg-gold',
  danger: 'bg-danger',
  muted: 'bg-line',
};
function Line({
  tone,
  children,
  detail,
  to,
  action,
}: {
  tone: keyof typeof marker;
  children: ReactNode;
  detail?: string;
  to?: string;
  action?: string;
}) {
  const [params] = useSearchParams();
  return (
    <li className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${marker[tone]}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{children}</p>
        {detail && <p className="text-xs text-muted">{detail}</p>}
      </div>
      {to && action && (
        <Link to={withSave(to, params.get('save'))} className="text-button -my-2 shrink-0 text-sm">
          {action}
        </Link>
      )}
    </li>
  );
}

function Entry({ world, entry, showDay }: { world: World; entry: AgendaEntry; showDay: boolean }) {
  const career = world.career!;
  const clubId = world.players[career.playerId]?.clubId;
  switch (entry.kind) {
    case 'fixture': {
      const { fixture, result } = entry;
      const home = fixture.homeId === clubId;
      const opponent = world.clubs[home ? fixture.awayId : fixture.homeId];
      const venue = fixture.neutral ? a.calendar.neutral : home ? a.calendar.home : a.calendar.away;
      let outcome: string | null = null;
      let tone: keyof typeof marker = 'accent';
      if (result) {
        const own = home ? result.score[0] : result.score[1];
        const their = home ? result.score[1] : result.score[0];
        const kind = result.winnerId
          ? result.winnerId === clubId
            ? 'win'
            : 'loss'
          : own > their
            ? 'win'
            : own < their
              ? 'loss'
              : 'draw';
        tone = kind === 'win' ? 'accent' : kind === 'loss' ? 'danger' : 'muted';
        outcome = format(a.calendar.played, {
          result: a.calendar.resultNames[kind],
          score: `${own}–${their}`,
        });
        if (result.penalties) {
          const [homePens, awayPens] = result.penalties;
          outcome += ` · ${format(a.calendar.penalties, {
            score: home ? `${homePens}–${awayPens}` : `${awayPens}–${homePens}`,
          })}`;
        }
      }
      return (
        <li className="flex min-w-0 items-center gap-3">
          {opponent ? (
            <CrestImage crest={opponent.crest} alt="" className="h-8 w-8 shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${marker[tone]}`}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug break-words">
              {opponent?.name ?? (home ? fixture.awayId : fixture.homeId)}
            </p>
            <p className="text-xs text-muted">
              {[
                venue,
                competitionName(world, fixture.competitionId),
                showDay ? format(a.calendar.day, { day: fixture.date.day }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {outcome && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                tone === 'accent'
                  ? 'bg-accent text-on-accent'
                  : tone === 'danger'
                    ? 'bg-danger-soft text-danger'
                    : 'bg-surface-soft text-ink'
              }`}
            >
              {outcome}
            </span>
          )}
        </li>
      );
    }
    case 'international':
      return (
        <Line tone="muted" detail={a.calendar.internationalBody}>
          {a.calendar.international}
        </Line>
      );
    case 'window-opens':
      return <Line tone="accent">{a.calendar.windowOpens}</Line>;
    case 'window-closes':
      return <Line tone="accent">{a.calendar.windowCloses}</Line>;
    case 'deadline':
      return (
        <Line tone="gold" detail={a.calendar.deadline} to={entry.item.to} action={a.calendar.open}>
          {priorityLabel(entry.item)}
        </Line>
      );
    case 'recovery':
      return (
        <Line
          tone="danger"
          detail={
            entry.injury.recovery
              ? a.calendar.recoveryPlan[entry.injury.recovery]
              : a.calendar.recoveryChoose
          }
          to={entry.injury.recovery ? undefined : '/career#recovery'}
          action={entry.injury.recovery ? undefined : a.priorities.kinds.recovery}
        >
          {format(a.calendar.recovery, {
            injury: c.injuries[entry.injury.kind as keyof typeof c.injuries] ?? entry.injury.kind,
          })}
        </Line>
      );
    case 'fit':
      return <Line tone="accent">{a.calendar.fit}</Line>;
    case 'training': {
      const plan = career.training;
      return (
        <Line tone="muted" to="/career/training" action={a.calendar.trainingEdit}>
          {format(a.calendar.training, {
            sessions: plan.sessions.map((session) => focusLabel(session.focus)).join(', '),
          })}
          {plan.extra ? a.calendar.trainingExtra : ''}
        </Line>
      );
    }
    case 'season-end':
      return <Line tone="muted">{a.calendar.seasonEnd}</Line>;
  }
}
