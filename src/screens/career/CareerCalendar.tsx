import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { World } from '../../model/domain';
import { format } from '../../i18n';
import { agendaText as a } from '../../i18n/agenda';
import { careerText as c } from '../../i18n/career';
import { calendarDate } from '../../engine/world/calendar';
import { formatGameDate } from '../../i18n/calendar';
import { CareerPage, CrestImage } from './shared';
import { ButtonLink, cx } from '../../ui/kit';
import { Glyph } from './honoursUi';
import { competitionName } from './selectors';
import { seasonAgenda, withSave, type AgendaEntry, type AgendaWeek } from './agenda';
import { priorityLabel } from './HubPriorities';
import { focusLabel } from './trainingLabels';
import { SuspendedBadge } from './disciplineUi';
import { bannedFixtures } from '../../engine/world/discipline';

type View = 'ahead' | 'all';
const VIEWS: View[] = ['ahead', 'all'];

/** Weeks shown from this week before the rest of the season is asked for. */
const AHEAD_WEEKS = 8;

export default function CareerCalendar() {
  return (
    <CareerPage
      title={a.calendar.title}
      description={a.calendar.description}
      actions={() => <CalendarViews />}
    >
      {({ world }) => <CalendarContent world={world} />}
    </CareerPage>
  );
}

/** The From this week / Whole season switch, in the page header beside the title. */
function CalendarViews() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('weeks') === 'all' ? 'all' : 'ahead';
  const select = (next: View) => {
    const search = new URLSearchParams(params);
    if (next === 'all') search.set('weeks', 'all');
    else search.delete('weeks');
    setParams(search, { replace: true });
  };
  return (
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
  );
}

function CalendarContent({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('weeks') === 'all' ? 'all' : 'ahead';
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
      <Legend />
      {complete && <SeasonOver />}
      <div id="calendar-weeks" role="tabpanel" aria-labelledby={`weeks-${view}`}>
        {/* Two cards a row on wide screens, in week order, one under another on phones. */}
        <ol className="flex flex-wrap gap-3">
          {groupQuiet(shown).map((week) =>
            'until' in week ? (
              <QuietWeeks key={week.week} from={week.week} to={week.until} />
            ) : (
              <WeekRow key={week.week} world={world} week={week} />
            ),
          )}
        </ol>
        {bounded && (
          <button className="text-button -ml-3 mt-2" onClick={toggleRest}>
            {expanded
              ? format(a.calendar.fewer, { count: AHEAD_WEEKS })
              : format(a.calendar.more, { count: upcoming.length - AHEAD_WEEKS })}
          </button>
        )}
      </div>
    </div>
  );
}

/** What each marker colour means; every entry also says it in words. */
function Legend() {
  const items: [keyof typeof marker, string][] = [
    ['accent', a.calendar.legend.fixture],
    ['gold', a.calendar.legend.deadline],
    ['danger', a.calendar.legend.injury],
    ['muted', a.calendar.legend.routine],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
      <span className="font-bold text-ink">{a.calendar.legend.title}</span>
      {items.map(([tone, label]) => (
        <span key={tone} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cx('h-2.5 w-2.5 rounded-full', marker[tone])} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Once the season is over, the way back to the hub where the next one starts. */
function SeasonOver() {
  const [params] = useSearchParams();
  return (
    <div className="ui-card flex flex-wrap items-center gap-x-5 gap-y-3 rounded-panel border border-line bg-surface px-5 py-4 shadow-surface sm:px-6 sm:py-5">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-art-gold text-gold-ink"
      >
        <Glyph name="trophy" />
      </span>
      <div className="min-w-0 flex-[1_1_18rem]">
        <p className="text-sm">{a.calendar.seasonOver}</p>
        <p className="text-xs text-muted">{a.calendar.seasonOverNote}</p>
      </div>
      <ButtonLink variant="secondary" to={withSave('/career', params.get('save'))}>
        {a.calendar.goHub}
      </ButtonLink>
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

/** A week card: two to a row on wide screens, its label beside the entries. */
const card =
  'flex min-w-0 flex-[1_1_28.75rem] flex-wrap items-start gap-x-5 gap-y-3 rounded-panel px-5 py-4.5';

function QuietWeeks({ from, to }: { from: number; to: number }) {
  return (
    <li className={cx(card, 'items-center border border-line bg-surface-soft')}>
      <h2 className="w-28 shrink-0 font-display text-[1.625rem] leading-none">
        {format(a.calendar.weeks, { from, to })}
      </h2>
      <p className="text-[0.8125rem] text-muted">{a.calendar.empty}</p>
    </li>
  );
}

function WeekRow({ world, week }: { world: World; week: AgendaWeek }) {
  const fixtures = week.entries.filter((entry) => entry.kind === 'fixture').length;
  return (
    <li
      aria-current={week.current ? 'date' : undefined}
      className={cx(
        card,
        'bg-surface',
        week.current
          ? 'border-2 border-accent shadow-surface ring-4 ring-accent/20'
          : 'border border-line',
      )}
    >
      <div className="flex w-28 shrink-0 flex-col items-start gap-1.5">
        <h2 className="font-display text-[1.625rem] leading-none">
          {format(a.calendar.week, { week: week.week })}
        </h2>
        <p className="text-xs font-semibold text-muted">
          {formatGameDate(calendarDate(world.date.season, week.week, 1))}
        </p>
        {week.current && (
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-extrabold text-on-accent">
            {a.calendar.thisWeek}
          </span>
        )}
      </div>
      {week.entries.length ? (
        <ul className="flex min-w-0 flex-[1_1_16.25rem] flex-col gap-2.5">
          {week.entries.map((entry, index) => (
            <Entry key={index} world={world} entry={entry} showDay={fixtures > 1} />
          ))}
        </ul>
      ) : (
        <p className="self-center text-[0.8125rem] text-muted">{a.calendar.empty}</p>
      )}
    </li>
  );
}

const marker = {
  accent: 'bg-accent',
  gold: 'bg-gold',
  danger: 'bg-danger',
  muted: 'bg-line shadow-[inset_0_0_0_1px_var(--muted)]',
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
        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${marker[tone]}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-bold">{children}</p>
        {detail && <p className="text-xs text-muted">{detail}</p>}
      </div>
      {to && action && (
        <Link
          to={withSave(to, params.get('save'))}
          className="text-button -my-2.5 shrink-0 px-2 text-[0.8125rem] font-bold"
        >
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
      const ban = result ? undefined : bannedFixtures(world, career.playerId).get(fixture.id);
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
            <p className="text-sm leading-tight font-extrabold break-words">
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
          {!outcome && ban && (
            // A ban rules the player out of this match (the discipline phase).
            <SuspendedBadge matches={ban.of} match={ban.match} />
          )}
          {outcome && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${
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
