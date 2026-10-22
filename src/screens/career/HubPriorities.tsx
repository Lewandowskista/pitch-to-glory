import { storyTitle } from './storyText';
import { Link, useSearchParams } from 'react-router-dom';
import type { World } from '../../model/domain';
import { format, t } from '../../i18n';
import { agendaText as a } from '../../i18n/agenda';
import { careerText as c } from '../../i18n/career';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { marketText as m } from '../../i18n/market';
import { Icon } from '../../ui/Icon';
import { CardTitle, Panel, cx } from '../../ui/kit';
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

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Small tags in the coming-up list: a word always says what the colour means. */
const TAG_TONE = {
  accent: 'bg-accent-soft text-accent',
  info: 'bg-art-blue text-info',
  gold: 'bg-gold text-on-gold',
  'gold-soft': 'bg-art-gold text-gold-ink',
  neutral: 'bg-surface-soft text-muted',
} as const;

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
    case 'story':
      return format(a.priorities.kinds.story, { title: storyTitle(String(p.story)) });
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
    case 'contract':
      return a.priorities.details.contract;
    case 'press':
      return a.priorities.details.press;
    case 'promise':
      return a.priorities.details.promise;
    case 'story':
      return a.priorities.details.story;
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
export function HubPriorities({
  world,
  items,
  className,
}: {
  world: World;
  items: Priority[];
  className?: string;
}) {
  const [params] = useSearchParams();
  const save = params.get('save');
  const first = items[0];
  const shown = items.filter((item) => item.group !== 'match' || first?.group === 'recovery');
  return (
    <Panel
      id="priorities"
      data-tour="priorities"
      aria-labelledby="priorities-heading"
      className={cx('flex flex-col gap-3', className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle id="priorities-heading">{a.priorities.title}</CardTitle>
        {shown.length > 0 && (
          <span className="shrink-0 text-sm font-semibold text-muted">
            {format(a.priorities.count, { count: shown.length })}
          </span>
        )}
      </div>
      {shown.length ? (
        <ol className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-1">
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
                  className={cx(
                    'group flex min-h-12 items-center gap-3 rounded-control px-2 py-2 transition-colors',
                    index === 0 && urgent
                      ? 'bg-art-gold hover:bg-art-gold'
                      : 'hover:bg-surface-soft',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.8125rem] font-extrabold',
                      urgent ? 'bg-gold text-on-gold' : 'bg-surface-soft text-ink',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-bold">
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
                    className="h-4 w-4 shrink-0 text-muted transition-transform motion-safe:group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="flex items-center gap-3 rounded-control bg-accent-soft px-3.5 py-3 text-sm text-ink">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
          >
            <Icon name="check" className="h-4 w-4" />
          </span>
          <span className="min-w-0">{a.priorities.empty}</span>
        </p>
      )}
      <ComingUp world={world} />
      <div className="mt-auto">
        <Link
          className="text-button -ml-3 inline-flex items-center gap-1"
          to={withSave('/career/calendar', save)}
        >
          {a.priorities.calendar}
        </Link>
      </div>
    </Panel>
  );
}

/** What Continue will do, said plainly under the hero's button. */
export function AdvancePreviewText({ world, preview }: { world: World; preview: AdvancePreview }) {
  if (preview.kind === 'match' || preview.kind === 'complete' || preview.kind === 'recovery')
    return null;
  const clubId = world.players[world.career!.playerId]?.clubId;
  const fixture = preview.fixture;
  const opponentId = fixture && (fixture.homeId === clubId ? fixture.awayId : fixture.homeId);
  const range =
    preview.through <= preview.from
      ? format(a.preview.weekOne, { from: preview.from })
      : format(a.preview.weeks, { from: preview.from, through: preview.through });
  return (
    <div className="grid max-w-prose gap-3 text-sm text-hero-muted">
      <p>
        {preview.fitWeek !== null && `${format(a.preview.fit, { week: preview.fitWeek })} `}
        {preview.deadline
          ? `${range}${format(a.preview.deadline, {
              week: preview.deadline.week,
              action: lowerFirst(priorityLabel(preview.deadline.item)),
            })}`
          : fixture
            ? `${range}${format(a.preview.stop, {
                week: fixture.date.week,
                opponent: world.clubs[opponentId ?? '']?.name ?? '',
              })}`
            : format(a.preview.season, { through: preview.through })}
      </p>
      {preview.lapsing.length > 0 && (
        <div className="rounded-control bg-black/25 px-3.5 py-2.5">
          <p className="font-bold text-gold">{a.preview.lapsing}</p>
          <ul className="mt-1.5 grid list-disc gap-0.5 pl-[1.125rem] text-hero-ink">
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
  const lines: { key: string; text: string; tone?: 'good' | 'bad'; tag?: string }[] = [];
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
      })}`,
      tone: won ? 'good' : lost ? 'bad' : undefined,
      tag: career.matches.some((match) => match.fixtureId === fixture.id)
        ? undefined
        : a.digest.without,
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
    <Panel aria-labelledby="digest-heading" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle id="digest-heading">{a.digest.title}</CardTitle>
        <span className="text-sm font-semibold text-muted">{range}</span>
      </div>
      {lines.length ? (
        <>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18.75rem),1fr))] gap-x-7 gap-y-2 text-sm">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                    line.tone === 'good'
                      ? 'bg-accent'
                      : line.tone === 'bad'
                        ? 'bg-danger'
                        : 'bg-line',
                  )}
                />
                <span className="min-w-0">
                  {line.text}
                  {line.tag && (
                    <span className="ml-2 inline-block rounded-full bg-surface-soft px-2 text-[0.6875rem] font-bold text-muted">
                      {line.tag}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{c.hub.digestLegend}</p>
        </>
      ) : (
        <p className={ui.muted}>{a.digest.nothing}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {digest.messages > 0 && (
          <Link className="text-button -ml-3" to={withSave('/career/inbox', params.get('save'))}>
            {digest.messages === 1
              ? a.digest.messages_one
              : format(a.digest.messages, { count: digest.messages, unread: digest.unread })}
          </Link>
        )}
        <button
          type="button"
          className={cx('text-button', digest.messages > 0 ? '' : '-ml-3')}
          onClick={dismiss}
          aria-label={format(a.digest.dismissLabel, { from: digest.from, to: digest.to })}
        >
          {a.digest.dismiss}
        </button>
      </div>
    </Panel>
  );
}

/**
 * The next few dated events after this week, on wide screens where the column has room: the
 * calendar holds the full list.
 */
function ComingUp({ world }: { world: World }) {
  if (world.phase === 'complete') return null;
  const clubId = world.players[world.career!.playerId]?.clubId;
  const lines: {
    key: string;
    week: number;
    text: string;
    tag?: string;
    tone?: keyof typeof TAG_TONE;
  }[] = [];
  for (const week of seasonAgenda(world)) {
    if (week.week <= world.date.week) continue;
    for (const [index, entry] of week.entries.entries()) {
      const key = `${week.week}:${index}`;
      if (entry.kind === 'fixture') {
        const home = entry.fixture.homeId === clubId;
        const opponent = world.clubs[home ? entry.fixture.awayId : entry.fixture.homeId];
        const league = Boolean(world.leagues[entry.fixture.competitionId]);
        lines.push({
          key,
          week: week.week,
          text: opponent?.name ?? '',
          tag: !league
            ? a.priorities.tags.cup
            : entry.fixture.neutral
              ? a.priorities.tags.neutral
              : home
                ? a.priorities.tags.home
                : a.priorities.tags.away,
          tone: !league ? 'gold' : home ? 'accent' : 'info',
        });
      } else if (entry.kind === 'window-opens' || entry.kind === 'window-closes')
        lines.push({
          key,
          week: week.week,
          text: entry.kind === 'window-opens' ? a.calendar.windowOpens : a.calendar.windowCloses,
          tag: a.priorities.tags.window,
          tone: 'gold-soft',
        });
      else if (entry.kind === 'international')
        lines.push({ key, week: week.week, text: a.calendar.international, tone: 'neutral' });
      else if (entry.kind === 'fit')
        lines.push({
          key,
          week: week.week,
          text: a.calendar.fit,
          tag: a.priorities.tags.fit,
          tone: 'accent',
        });
      else if (entry.kind === 'season-end')
        lines.push({ key, week: week.week, text: a.calendar.seasonEnd });
    }
    if (lines.length >= 4) break;
  }
  if (!lines.length) return null;
  return (
    <div className="mt-2 hidden border-t border-line pt-3.5 lg:block">
      <h3 className="text-[0.8125rem] font-bold">{a.priorities.comingUp}</h3>
      <ul className="mt-1">
        {lines.slice(0, 4).map((line) => (
          <li
            key={line.key}
            className="flex items-center gap-3 border-b border-line/60 py-2 text-sm last:border-b-0"
          >
            <span className="w-16 shrink-0 text-xs font-semibold text-muted">
              {format(c.common.week, { week: line.week })}
            </span>
            <span className="min-w-0 flex-1 break-words">{line.text}</span>
            {line.tag && (
              <span
                className={cx(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold',
                  TAG_TONE[line.tone ?? 'neutral'],
                )}
              >
                {line.tag}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
