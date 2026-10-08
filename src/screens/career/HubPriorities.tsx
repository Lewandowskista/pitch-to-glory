import { Link, useSearchParams } from 'react-router-dom';
import type { World } from '../../model/domain';
import { format, t } from '../../i18n';
import { agendaText as a } from '../../i18n/agenda';
import { careerText as c } from '../../i18n/career';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { marketText as m } from '../../i18n/market';
import { Icon } from '../../ui/Icon';
import { useAppStore } from '../../store';
import {
  advanceDigest,
  type AdvancePreview,
  type Priority,
  parseSince,
  seasonAgenda,
  withSave,
} from './agenda';
import { ui } from './shared';

const count = (value: number, one: string, many: string, params = {}) =>
  format(value === 1 ? one : many, { ...params, count: value });

/** The action's label, in the player's words. */
export function priorityLabel(item: Priority): string {
  const p = item.params;
  switch (item.kind) {
    case 'attributes':
      return count(
        Number(p.count),
        a.priorities.kinds.attributes_one,
        a.priorities.kinds.attributes,
      );
    case 'skills':
      return count(Number(p.count), a.priorities.kinds.skills_one, a.priorities.kinds.skills);
    case 'sponsor':
      return format(a.priorities.kinds.sponsor, {
        category: (
          l.sponsors.categories[p.category as keyof typeof l.sponsors.categories] ?? p.category
        ).toLowerCase(),
      });
    default:
      return format(a.priorities.kinds[item.kind], p);
  }
}
function priorityDetail(item: Priority): string | null {
  const p = item.params;
  switch (item.kind) {
    case 'recovery':
      return count(
        Number(p.weeks),
        a.priorities.details.recovery_one,
        a.priorities.details.recovery,
        {
          injury: c.injuries[p.injury as keyof typeof c.injuries] ?? p.injury,
          weeks: p.weeks,
        },
      );
    case 'offer':
      return format(a.priorities.details.offer, {
        offer: m.kinds[p.offer as keyof typeof m.kinds] ?? p.offer,
      });
    case 'press':
      return a.priorities.details.press;
    case 'sponsor':
      return a.priorities.details.sponsor;
    default:
      return null;
  }
}

/**
 * Everything waiting for the player, most urgent first: a recovery choice, then the match,
 * then deadlines by date, then unspent points. The match itself is the hero's action, so it
 * appears here only when something outranks it.
 */
export function HubPriorities({ world, items }: { world: World; items: Priority[] }) {
  const [params] = useSearchParams();
  const save = params.get('save');
  const first = items[0];
  const shown = items.filter((item) => item.group !== 'match' || first?.group === 'recovery');
  return (
    <section
      id="priorities"
      data-tour="priorities"
      aria-labelledby="priorities-heading"
      className={`${ui.panel} flex flex-col lg:col-span-4`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="priorities-heading" className={ui.heading}>
          {a.priorities.title}
        </h2>
        {shown.length > 0 && (
          <span className="shrink-0 text-sm font-semibold text-muted">
            {format(a.priorities.count, { count: shown.length })}
          </span>
        )}
      </div>
      {shown.length ? (
        <ol className="-mx-2 mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
          {shown.map((item, index) => {
            const detail = priorityDetail(item);
            const urgent = item.group === 'recovery' || item.group === 'match';
            const deadline =
              item.deadline && item.group === 'deadline'
                ? item.deadline.week === world.date.week &&
                  item.deadline.season === world.date.season
                  ? a.priorities.thisWeek
                  : format(a.priorities.by, { week: item.deadline.week })
                : null;
            return (
              <li key={item.id}>
                <Link
                  to={withSave(item.to, save)}
                  className={`group flex min-h-12 items-center gap-3 rounded-control px-2 py-2 transition-colors hover:bg-surface-soft ${
                    index === 0 && urgent ? 'bg-art-gold' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      urgent ? 'bg-gold text-on-gold' : 'bg-surface-soft text-ink'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-snug">
                      {priorityLabel(item)}
                    </span>
                    {(detail || deadline) && (
                      <span className="block text-xs text-muted">
                        {[detail, deadline].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <Icon
                    name="arrow"
                    className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={`${ui.muted} mt-3`}>{a.priorities.empty}</p>
      )}
      <ComingUp world={world} />
      <div className="mt-auto pt-3">
        <Link
          className="text-button -ml-3 inline-flex items-center gap-1"
          to={withSave('/career/calendar', save)}
        >
          {a.priorities.calendar}
        </Link>
      </div>
    </section>
  );
}

/** What Continue will do, said plainly under the hero's button. */
export function AdvancePreviewText({ world, preview }: { world: World; preview: AdvancePreview }) {
  if (preview.kind === 'match' || preview.kind === 'complete') return null;
  if (preview.kind === 'recovery')
    return <p className="max-w-prose text-sm text-white/85">{a.preview.recovery}</p>;
  const clubId = world.players[world.career!.playerId]?.clubId;
  const fixture = preview.fixture;
  const opponentId = fixture && (fixture.homeId === clubId ? fixture.awayId : fixture.homeId);
  const range =
    preview.through <= preview.from
      ? format(a.preview.weekOne, { from: preview.from })
      : format(a.preview.weeks, { from: preview.from, through: preview.through });
  return (
    <div className="grid max-w-prose gap-2 text-sm text-white/85">
      <p>
        {preview.fitWeek !== null && `${format(a.preview.fit, { week: preview.fitWeek })} `}
        {fixture
          ? `${range}${format(a.preview.stop, {
              week: fixture.date.week,
              opponent: world.clubs[opponentId ?? '']?.name ?? '',
            })}`
          : format(a.preview.season, { through: preview.through })}
      </p>
      {preview.lapsing.length > 0 && (
        <div className="rounded-control bg-black/20 px-3 py-2">
          <p className="font-semibold text-gold">{a.preview.lapsing}</p>
          <ul className="mt-1 grid gap-0.5">
            {preview.lapsing.map((item) => (
              <li key={item.id}>
                {format(a.preview.lapsingItem, {
                  label: priorityLabel(item),
                  week: item.deadline!.week,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * What actually happened in the weeks Continue just played, from the world's dated records.
 * The starting week lives in the URL (`since`), so the summary survives a refresh.
 */
export function AdvanceDigest({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  // The summary waits for the whole run: weeks still being simulated are not yet history.
  const running = useAppStore((s) => Boolean(s.worldJob));
  const since = parseSince(params.get('since'));
  const digest = since && !running ? advanceDigest(world, since) : null;
  if (!digest) return null;
  const career = world.career!;
  const clubId = world.players[career.playerId]?.clubId;
  const dismiss = () => {
    const next = new URLSearchParams(params);
    next.delete('since');
    setParams(next, { replace: true });
  };
  const lines: { key: string; text: string; tone?: 'good' | 'bad' }[] = [];
  for (const { fixture, result } of digest.results.slice(-4)) {
    const home = world.clubs[fixture.homeId]?.name ?? fixture.homeId;
    const away = world.clubs[fixture.awayId]?.name ?? fixture.awayId;
    const ownGoals = fixture.homeId === clubId ? result.score[0] : result.score[1];
    const theirGoals = fixture.homeId === clubId ? result.score[1] : result.score[0];
    const won = result.winnerId ? result.winnerId === clubId : ownGoals > theirGoals;
    const lost = result.winnerId ? result.winnerId !== clubId : ownGoals < theirGoals;
    lines.push({
      key: fixture.id,
      text: `${format(c.common.week, { week: fixture.date.week })} · ${format(a.digest.result, {
        home,
        away,
        score: `${result.score[0]}–${result.score[1]}`,
      })}${career.matches.some((match) => match.fixtureId === fixture.id) ? '' : ` · ${a.digest.without}`}`,
      tone: won ? 'good' : lost ? 'bad' : undefined,
    });
  }
  if (digest.injury)
    lines.push({
      key: 'injury',
      text: count(digest.injury.weeksRemaining, a.digest.injury_one, a.digest.injury, {
        injury: c.injuries[digest.injury.kind as keyof typeof c.injuries] ?? digest.injury.kind,
        weeks: digest.injury.weeksRemaining,
      }),
      tone: 'bad',
    });
  if (digest.training)
    lines.push({
      key: 'training',
      text: digest.training.improved.length
        ? format(a.digest.training, {
            attributes: digest.training.improved
              .map((key) => t.world.attributes[key as keyof typeof t.world.attributes] ?? key)
              .join(', '),
          })
        : a.digest.trainingNone,
      tone: digest.training.improved.length ? 'good' : undefined,
    });
  for (const offer of digest.newOffers)
    lines.push({
      key: `new:${offer.id}`,
      text: format(a.digest.newOffer, {
        offer: (m.kinds[offer.kind] ?? offer.kind).toLowerCase(),
        club: world.clubs[offer.clubId]?.name ?? offer.clubId,
      }),
      tone: 'good',
    });
  for (const offer of digest.expiredOffers)
    lines.push({
      key: `expired:${offer.id}`,
      text: format(a.digest.expiredOffer, {
        club: world.clubs[offer.clubId]?.name ?? offer.clubId,
      }),
      tone: 'bad',
    });
  if (digest.lapsedPress)
    lines.push({
      key: 'press',
      text: count(digest.lapsedPress, a.digest.lapsedPress_one, a.digest.lapsedPress),
      tone: 'bad',
    });
  if (digest.chronicle.length)
    lines.push({
      key: 'chronicle',
      text: format(a.digest.chronicle, { count: digest.chronicle.length }),
    });
  const range =
    digest.from === digest.to
      ? format(a.digest.weekOne, { from: digest.from })
      : format(a.digest.weeks, { from: digest.from, to: digest.to });
  return (
    <section
      aria-labelledby="digest-heading"
      className={`${ui.panel} flex flex-col lg:col-span-12`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="digest-heading" className={ui.heading}>
          {a.digest.title}
        </h2>
        <span className="text-sm font-semibold text-muted">{range}</span>
      </div>
      {lines.length ? (
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {lines.map((line) => (
            <li key={line.key} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  line.tone === 'good' ? 'bg-accent' : line.tone === 'bad' ? 'bg-danger' : 'bg-line'
                }`}
              />
              <span className="min-w-0">{line.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-3`}>{a.digest.nothing}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {digest.messages > 0 && (
          <Link className="text-button -ml-3" to={withSave('/career/inbox', params.get('save'))}>
            {digest.messages === 1
              ? a.digest.messages_one
              : format(a.digest.messages, { count: digest.messages, unread: digest.unread })}
          </Link>
        )}
        <button
          type="button"
          className="text-button"
          onClick={dismiss}
          aria-label={format(a.digest.dismissLabel, { from: digest.from, to: digest.to })}
        >
          {a.digest.dismiss}
        </button>
      </div>
    </section>
  );
}

/**
 * The next few dated events after this week, on wide screens where the column has room: the
 * calendar holds the full list.
 */
function ComingUp({ world }: { world: World }) {
  if (world.phase === 'complete') return null;
  const clubId = world.players[world.career!.playerId]?.clubId;
  const lines: { key: string; week: number; text: string }[] = [];
  for (const week of seasonAgenda(world)) {
    if (week.week <= world.date.week) continue;
    for (const [index, entry] of week.entries.entries()) {
      let text: string | null = null;
      if (entry.kind === 'fixture') {
        const home = entry.fixture.homeId === clubId;
        const opponent = world.clubs[home ? entry.fixture.awayId : entry.fixture.homeId];
        text = `${opponent?.name ?? ''} · ${home ? a.calendar.home : a.calendar.away}`;
      } else if (entry.kind === 'window-opens') text = a.calendar.windowOpens;
      else if (entry.kind === 'window-closes') text = a.calendar.windowCloses;
      else if (entry.kind === 'international') text = a.calendar.international;
      else if (entry.kind === 'fit') text = a.calendar.fit;
      else if (entry.kind === 'season-end') text = a.calendar.seasonEnd;
      if (text) lines.push({ key: `${week.week}:${index}`, week: week.week, text });
    }
    if (lines.length >= 4) break;
  }
  if (!lines.length) return null;
  return (
    <div className="mt-5 hidden border-t border-line pt-4 lg:block">
      <h3 className="text-sm font-bold">{a.priorities.comingUp}</h3>
      <ul className="mt-2 grid gap-1.5 text-sm">
        {lines.slice(0, 4).map((line) => (
          <li key={line.key} className="flex gap-3">
            <span className="w-16 shrink-0 text-muted">
              {format(c.common.week, { week: line.week })}
            </span>
            <span className="min-w-0 break-words">{line.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
