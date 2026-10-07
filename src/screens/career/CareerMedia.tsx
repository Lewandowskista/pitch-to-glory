import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Career, MediaItem, World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { CareerPage, Meter, plural, ui } from './shared';
import { BlockNote, ActionError } from './marketUi';
import { EffectChips, mediaText, useSocialAction } from './socialUi';

type Filter = keyof typeof s.media.filters;
const FILTERS = Object.keys(s.media.filters) as Filter[];

export default function CareerMedia() {
  return (
    <CareerPage title={s.titles.media}>
      {({ world, career }) => <MediaContent world={world} career={career} />}
    </CareerPage>
  );
}

function MediaContent({ world, career }: { world: World; career: Career }) {
  // The answer given on this visit stays in view as confirmation; older ones fold away.
  const [justAnswered, setJustAnswered] = useState<string | null>(null);
  const pending = world.media.filter((item) => item.choices.length > 0 && item.answer === null);
  const latest = world.media.find((item) => item.id === justAnswered && item.answer !== null);
  const earlier = world.media
    .filter((item) => item.choices.length > 0 && item.answer !== null && item.id !== latest?.id)
    .slice(-8)
    .reverse();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
      <section aria-labelledby="questions-heading" className={`${ui.panel} lg:col-span-7`}>
        <h2 id="questions-heading" className={ui.heading}>
          {s.media.pending}
        </h2>
        {pending.length ? (
          <div className="mt-4 grid gap-4">
            {pending.map((item, index) => (
              <Question
                key={item.id}
                item={item}
                keys={index === 0}
                onAnswered={() => setJustAnswered(item.id)}
              />
            ))}
          </div>
        ) : (
          <p className={`${ui.muted} mt-4 max-w-prose`}>{s.media.none}</p>
        )}
        {latest && (
          <div
            role="status"
            className="mt-4 rounded-control border border-accent bg-accent-soft p-4"
          >
            <AnsweredItem item={latest} />
          </div>
        )}
        {earlier.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-base font-bold">{s.media.earlier}</h3>
            <details className="mt-1">
              <summary className="flex min-h-11 w-fit cursor-pointer items-center text-sm font-semibold text-accent">
                {plural(earlier.length, s.media.showEarlierOne, s.media.showEarlier)}
              </summary>
              <ul className="mt-2 grid gap-3">
                {earlier.map((item) => (
                  <li key={item.id}>
                    <AnsweredItem item={item} />
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>
      <section aria-labelledby="coverage-heading" className={`${ui.panel} lg:col-span-5`}>
        <h2 id="coverage-heading" className={ui.heading}>
          {s.media.coverage}
        </h2>
        <div className="mt-4">
          <Meter
            label={s.media.coverageLevel}
            ariaLabel={s.media.coverage}
            value={50 + career.social.coverage * 5}
            tone={career.social.coverage < 0 ? 'danger' : 'accent'}
          />
        </div>
        <p className={`${ui.muted} mt-3`}>{s.media.coverageBody}</p>
        <p className="mt-3 text-sm font-semibold">
          {plural(career.social.answered, s.media.answeredOne, s.media.answeredCount)}
        </p>
      </section>
      <Feed world={world} />
    </div>
  );
}

function AnsweredItem({ item }: { item: MediaItem }) {
  return (
    <div className="text-sm">
      <p className="font-semibold">{mediaText(item)}</p>
      <p className="text-muted">
        {item.answer === 'silence'
          ? s.media.silence
          : format(s.media.answered, {
              answer:
                s.answers[
                  item.choices.find((choice) => choice.id === item.answer)?.labelKey ?? ''
                ] ?? '',
            })}
      </p>
    </div>
  );
}

function Question({
  item,
  keys,
  onAnswered,
}: {
  item: MediaItem;
  keys: boolean;
  onAnswered: () => void;
}) {
  const { run, error, block } = useSocialAction();
  const answer = (choiceId: string) => {
    if (run({ type: 'answer', mediaId: item.id, choiceId })) onAnswered();
  };
  // Number keys answer the first open question, as they pick key-moment choices.
  useEffect(() => {
    if (!keys || block) return;
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const index = Number(event.key) - 1;
      const choice = item.choices[index];
      if (!choice) return;
      event.preventDefault();
      if (run({ type: 'answer', mediaId: item.id, choiceId: choice.id })) onAnswered();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [keys, block, item, run, onAnswered]);
  return (
    <article
      aria-labelledby={`question-${item.id}`}
      className="flex flex-col gap-3 rounded-control border border-line bg-surface-soft p-4"
    >
      <p className="text-sm font-semibold text-accent">
        {s.media.kinds[item.kind as 'press' | 'interview']} · {item.authorName}
      </p>
      <h3 id={`question-${item.id}`} className="font-display text-2xl leading-tight">
        {mediaText(item)}
      </h3>
      {item.expires && (
        <p className="text-xs text-muted">
          {format(s.media.deadline, { week: item.expires.week })}
        </p>
      )}
      <BlockNote block={block} />
      <ActionError error={error} />
      <fieldset disabled={Boolean(block)}>
        <legend className="mb-2 text-sm font-semibold">{s.media.choose}</legend>
        <ol className="grid gap-2">
          {item.choices.map((choice, index) => (
            <li key={choice.id}>
              <button
                className="flex min-h-14 w-full flex-col items-start gap-2 rounded-control border border-line bg-surface p-3 text-left transition hover:border-accent disabled:opacity-60"
                onClick={() => answer(choice.id)}
              >
                <span className="flex w-full items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent"
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">{s.answers[choice.labelKey]}</span>
                  <span className="ml-auto text-xs font-bold uppercase tracking-wider text-muted">
                    {s.tones[choice.tone]}
                  </span>
                </span>
                <EffectChips effects={choice.effects} />
              </button>
            </li>
          ))}
        </ol>
      </fieldset>
      {keys && <p className="text-xs text-muted">{s.media.keyHint}</p>}
    </article>
  );
}

const FEED_PAGE = 12;

function Feed({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  const [visible, setVisible] = useState(FEED_PAGE);
  const filter = (
    FILTERS.includes(params.get('feed') as Filter) ? params.get('feed') : 'all'
  ) as Filter;
  const posts = world.media
    .filter((item) => item.choices.length === 0)
    .filter((item) =>
      filter === 'all'
        ? true
        : filter === 'headline'
          ? item.kind === 'headline'
          : item.kind === 'social' && item.author === filter,
    )
    .slice(-60)
    .reverse();
  const shown = posts.slice(0, visible);
  return (
    <section aria-labelledby="feed-heading" className={`${ui.panel} lg:col-span-12`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="feed-heading" className={ui.heading}>
          {s.media.feed}
        </h2>
        {/* One row at every width: the pills share the space and shrink their padding on
            phones, and the row scrolls only if the text is scaled up. */}
        <div
          role="group"
          aria-label={s.media.feed}
          className="flex w-full gap-1 overflow-x-auto rounded-control bg-surface-soft p-1 sm:w-auto"
        >
          {FILTERS.map((key) => (
            <button
              key={key}
              aria-pressed={filter === key}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (key === 'all') next.delete('feed');
                else next.set('feed', key);
                setParams(next, { replace: true });
                setVisible(FEED_PAGE);
              }}
              className={`min-h-11 flex-auto rounded-[0.6rem] px-2 text-[0.8125rem] font-semibold whitespace-nowrap sm:flex-none sm:px-3 sm:text-sm ${
                filter === key ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {s.media.filters[key]}
            </button>
          ))}
        </div>
      </div>
      {posts.length ? (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {shown.map((item) => (
            <li
              key={item.id}
              className={`flex flex-col gap-2 rounded-control border p-4 ${
                item.kind === 'headline'
                  ? 'border-ink/20 bg-surface'
                  : 'border-line bg-surface-soft'
              }`}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <strong className="text-sm">{item.authorName}</strong>
                <span className="text-muted">
                  {item.kind === 'headline'
                    ? s.media.filters.headline
                    : s.media.authorKinds[item.author]}{' '}
                  ·{' '}
                  {format(c.common.seasonWeek, { season: item.date.season, week: item.date.week })}
                </span>
              </p>
              <p
                className={
                  item.kind === 'headline' ? 'font-display text-2xl leading-tight' : 'text-sm'
                }
              >
                {mediaText(item)}
              </p>
              <p
                className={`text-xs font-semibold ${item.sentiment > 0 ? 'text-accent' : item.sentiment < 0 ? 'text-danger' : 'text-muted'}`}
              >
                {format(s.media.likes, { count: item.likes })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4`}>{s.media.empty}</p>
      )}
      {posts.length > shown.length && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="button secondary"
            onClick={() => setVisible((count) => count + FEED_PAGE)}
          >
            {s.media.showMore}
          </button>
          <span className="text-sm text-muted">
            {format(s.media.showing, { shown: shown.length, total: posts.length })}
          </span>
        </div>
      )}
    </section>
  );
}
