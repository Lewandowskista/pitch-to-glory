import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Career, MediaItem, World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { CareerPage, Meter, ui } from './shared';
import { BlockNote, ActionError } from './marketUi';
import { EffectChips, mediaText, useSocialAction } from './socialUi';

type Filter = keyof typeof s.media.filters;
const FILTERS = Object.keys(s.media.filters) as Filter[];

export default function CareerMedia() {
  return (
    <CareerPage eyebrow={s.eyebrow} title={s.titles.media}>
      {({ world, career }) => <MediaContent world={world} career={career} />}
    </CareerPage>
  );
}

function MediaContent({ world, career }: { world: World; career: Career }) {
  const pending = world.media.filter((item) => item.choices.length > 0 && item.answer === null);
  const answered = world.media
    .filter((item) => item.choices.length > 0 && item.answer !== null)
    .slice(-3)
    .reverse();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <section aria-labelledby="questions-heading" className={`${ui.panel} lg:col-span-7`}>
        <h2 id="questions-heading" className={ui.heading}>
          {s.media.pending}
        </h2>
        {pending.length ? (
          <div className="mt-4 grid gap-4">
            {pending.map((item, index) => (
              <Question key={item.id} item={item} keys={index === 0} />
            ))}
          </div>
        ) : (
          <p className={`${ui.muted} mt-4 max-w-prose`}>{s.media.none}</p>
        )}
        {answered.length > 0 && (
          <ul className="mt-5 grid gap-2 border-t border-line pt-4">
            {answered.map((item) => (
              <li key={item.id} className="text-sm">
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
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="coverage-heading" className={`${ui.panel} lg:col-span-5`}>
        <h2 id="coverage-heading" className={ui.heading}>
          {s.media.coverage}
        </h2>
        <div className="mt-4">
          <Meter
            label={s.media.coverage}
            value={50 + career.social.coverage * 5}
            tone={career.social.coverage < 0 ? 'danger' : 'accent'}
          />
        </div>
        <p className={`${ui.muted} mt-3`}>{s.media.coverageBody}</p>
        <p className="mt-3 text-sm font-semibold">
          {format(s.media.answeredCount, { count: career.social.answered })}
        </p>
      </section>
      <Feed world={world} />
    </div>
  );
}

function Question({ item, keys }: { item: MediaItem; keys: boolean }) {
  const { run, error, block } = useSocialAction();
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
      run({ type: 'answer', mediaId: item.id, choiceId: choice.id });
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [keys, block, item, run]);
  return (
    <article
      aria-labelledby={`question-${item.id}`}
      className="flex flex-col gap-3 rounded-control border border-line bg-surface-soft p-4"
    >
      <p className={ui.eyebrow}>
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
                onClick={() => run({ type: 'answer', mediaId: item.id, choiceId: choice.id })}
              >
                <span className="flex w-full items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent"
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">{s.answers[choice.labelKey]}</span>
                  <span className="ml-auto text-[0.68rem] font-bold uppercase tracking-wider text-muted">
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

function Feed({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
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
  return (
    <section aria-labelledby="feed-heading" className={`${ui.panel} lg:col-span-12`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="feed-heading" className={ui.heading}>
          {s.media.feed}
        </h2>
        <div
          role="group"
          aria-label={s.media.feed}
          className="flex flex-wrap gap-1 rounded-control bg-surface-soft p-1"
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
              }}
              className={`min-h-11 rounded-[0.6rem] px-3 text-sm font-semibold ${
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
          {posts.map((item) => (
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
    </section>
  );
}
