import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Career, CliqueKind, MediaItem, MediaTone, World } from '../../model/domain';
import { rivalOf } from '../../engine/career/social';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { Button, CardTitle, Chip, KeyHint, Panel, cx } from '../../ui/kit';
import { CareerPage, plural, ui, useSaveLink } from './shared';
import { BlockNote, ActionError } from './marketUi';
import { EffectChips, mediaText, Portrait, useSocialAction } from './socialUi';
import { LifeIcon } from './lifeIcons';
import { track } from '../../analytics';

type Filter = keyof typeof s.media.filters;
const FILTERS = Object.keys(s.media.filters) as Filter[];
const CLIQUES: readonly CliqueKind[] = ['seniors', 'young', 'core', 'internationals'];
const integer = new Intl.NumberFormat('en-GB');

export default function CareerMedia() {
  return (
    <CareerPage title={s.titles.media} description={s.media.intro}>
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <RoutinePress tone={world.career!.social.pressTone ?? null} />
      {/* The questions lead; coverage and the squad's groups are a short column beside them. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
        {!pending.length && !latest && !earlier.length ? (
          <NoQuestions />
        ) : (
          <Panel aria-labelledby="questions-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <CardTitle id="questions-heading" size="lg">
                {s.media.pending}
              </CardTitle>
              {pending.length > 0 && (
                <Chip tone="gold-soft">{format(s.media.waiting, { count: pending.length })}</Chip>
              )}
            </div>
            {pending.length ? (
              pending.map((item, index) => (
                <Question
                  key={item.id}
                  item={item}
                  keys={index === 0}
                  onAnswered={() => setJustAnswered(item.id)}
                />
              ))
            ) : (
              <p className={`${ui.muted} max-w-prose`}>{s.media.none}</p>
            )}
            {latest && <Confirmation item={latest} />}
            {earlier.length > 0 && (
              <div className="border-t border-line pt-3.5">
                <h3 className="text-[0.9375rem] font-bold">{s.media.earlier}</h3>
                <details className="group mt-0.5">
                  <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-sm font-bold text-accent [&::-webkit-details-marker]:hidden">
                    {plural(earlier.length, s.media.showEarlierOne, s.media.showEarlier)}
                    <LifeIcon
                      name="chevronDown"
                      className="h-4 w-4 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <ul className="mt-2 grid gap-2.5">
                    {earlier.map((item) => (
                      <li key={item.id}>
                        <AnsweredItem item={item} />
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </Panel>
        )}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
          <Coverage career={career} />
          <Groups />
        </div>
      </div>
      <Feed world={world} />
    </div>
  );
}

/** No question at all yet: one illustrated card that says when journalists come. */
function NoQuestions() {
  return (
    <section
      aria-labelledby="questions-heading"
      className="ui-card flex min-w-0 flex-wrap items-center gap-5 rounded-panel border border-line bg-surface p-panel shadow-surface sm:p-panel-lg"
    >
      <svg viewBox="0 0 84 84" aria-hidden="true" focusable="false" className="h-20 w-20 shrink-0">
        <circle cx="42" cy="42" r="40" className="fill-accent-soft" />
        <rect x="33" y="16" width="18" height="30" rx="9" className="fill-accent" />
        <path
          d="M26 38Q26 54 42 54Q58 54 58 38M42 54V64M32 66H52"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="stroke-accent"
        />
        <path
          d="M37 24H47M37 30H47"
          strokeWidth="2"
          strokeLinecap="round"
          className="stroke-surface"
        />
      </svg>
      <div className="min-w-0 flex-1 basis-56">
        <h2 id="questions-heading" className="font-display text-[1.75rem] leading-none">
          {s.media.pending}
        </h2>
        <p className="mt-1.5 max-w-prose text-muted">{s.media.none}</p>
      </div>
    </section>
  );
}

function chosenChoice(item: MediaItem) {
  return item.choices.find((choice) => choice.id === item.answer);
}

function answerLine(item: MediaItem): string {
  return item.answer === 'silence'
    ? s.media.silence
    : format(s.media.answered, { answer: s.answers[chosenChoice(item)?.labelKey ?? ''] ?? '' });
}

function AnsweredItem({ item }: { item: MediaItem }) {
  return (
    <div className="text-sm">
      <p className="font-semibold">{mediaText(item)}</p>
      <p className="text-muted">{answerLine(item)}</p>
    </div>
  );
}

/** The answer just given, with who it pleased and who it upset. */
function Confirmation({ item }: { item: MediaItem }) {
  const choice = chosenChoice(item);
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-control border border-accent bg-accent-soft px-4 py-3.5"
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
      >
        <LifeIcon name="check" className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-bold">{mediaText(item)}</p>
        <p className="mt-0.5 text-muted">{answerLine(item)}</p>
        {choice && <EffectChips effects={choice.effects} onTint className="mt-2" />}
      </div>
    </div>
  );
}

/** Two letters for an outlet's masthead mark ("Elmfield Echo" → "EE"). */
function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 1) return (words[0]![0]! + words.at(-1)![0]!).toUpperCase();
  // A handle such as "@ThornfieldFaithful48": its capitals, or its first two letters.
  const word = words[0] ?? name;
  const capitals = word.match(/\p{Lu}/gu) ?? [];
  return (capitals.length > 1 ? capitals.slice(0, 2).join('') : word.slice(0, 2)).toUpperCase();
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
    if (!run({ type: 'answer', mediaId: item.id, choiceId })) return;
    const tone = item.choices.find((choice) => choice.id === choiceId)?.tone;
    track('press_answered', { kind: item.kind, ...(tone ? { answer: tone } : {}) });
    onAnswered();
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
  const press = item.kind === 'press';
  return (
    <article
      aria-labelledby={`question-${item.id}`}
      className="flex flex-col gap-3 rounded-control border border-line bg-surface-soft p-4 sm:p-[1.125rem]"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          aria-hidden="true"
          className={cx(
            'grid h-8 w-8 shrink-0 place-items-center rounded-chip font-display text-[1.0625rem] leading-none',
            press ? 'bg-field text-gold' : 'bg-art-blue text-info',
          )}
        >
          {initials(item.authorName)}
        </span>
        <span className="min-w-0 text-[0.8125rem] font-bold text-accent">
          {s.media.kinds[item.kind as 'press' | 'interview']} · {item.authorName}
        </span>
        {item.expires && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
            <LifeIcon name="clock" className="h-3.5 w-3.5" />
            {format(c.common.week, { week: item.expires.week })}
          </span>
        )}
      </div>
      <h3
        id={`question-${item.id}`}
        className="font-display text-[1.75rem] leading-[1.02] sm:text-[2rem]"
      >
        {mediaText(item)}
      </h3>
      {item.expires && (
        <p className="text-xs text-muted">
          {format(s.media.deadline, { week: item.expires.week })}
        </p>
      )}
      <BlockNote block={block} />
      <ActionError error={error} />
      <fieldset disabled={Boolean(block)} className="min-w-0">
        <legend className="mb-2 text-[0.8125rem] font-bold">{s.media.choose}</legend>
        <ol className="grid gap-2">
          {item.choices.map((choice, index) => (
            <li key={choice.id}>
              <button
                className="flex min-h-14 w-full flex-col items-start gap-2 rounded-control border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => answer(choice.id)}
              >
                <span className="flex w-full items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[0.8125rem] font-extrabold text-on-accent"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{s.answers[choice.labelKey]}</span>
                  <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs font-bold text-muted">
                    {s.tones[choice.tone]}
                  </span>
                </span>
                <EffectChips effects={choice.effects} className="sm:pl-[2.375rem]" />
              </button>
            </li>
          ))}
        </ol>
      </fieldset>
      {keys && item.choices.length > 1 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted max-sm:hidden">
          {s.media.keyHintBefore} <KeyHint keys="1" />–
          <KeyHint keys={String(item.choices.length)} /> {s.media.keyHintAfter}
        </p>
      )}
    </article>
  );
}

/** Coverage from −10 to 10 on a bar from critical to glowing, with neutral in the middle. */
function Coverage({ career }: { career: Career }) {
  const value = Math.max(0, Math.min(100, Math.round(50 + career.social.coverage * 5)));
  const negative = career.social.coverage < 0;
  return (
    <Panel aria-labelledby="coverage-heading" className="flex flex-col gap-3.5">
      <CardTitle id="coverage-heading">{s.media.coverage}</CardTitle>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="font-bold">{s.media.coverageLevel}</span>
          <span
            className={cx(
              'font-display text-[2.125rem] leading-[0.9] tabular-nums',
              negative ? 'text-danger' : 'text-accent',
            )}
          >
            {value}
          </span>
        </div>
        <div
          role="meter"
          aria-label={s.media.coverage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={`${value}, ${
            value < 40
              ? s.media.coverageScale.critical
              : value > 60
                ? s.media.coverageScale.glowing
                : s.media.coverageScale.neutral
          }`}
          className="relative h-3 overflow-hidden rounded-full bg-track"
        >
          <span
            className={cx('block h-full rounded-full', negative ? 'bg-danger' : 'bg-accent')}
            style={{ width: `${value}%` }}
          />
          <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 bg-surface" />
        </div>
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between text-[0.6875rem] font-semibold text-muted"
        >
          <span>{s.media.coverageScale.critical}</span>
          <span>{s.media.coverageScale.neutral}</span>
          <span>{s.media.coverageScale.glowing}</span>
        </div>
      </div>
      <p className="text-sm text-muted">{s.media.coverageBody}</p>
      <p className="flex items-center gap-3 rounded-control bg-surface-soft px-3.5 py-3">
        <span className="font-display text-[2.5rem] leading-[0.9] tabular-nums">
          {career.social.answered}
        </span>
        <span className="font-semibold">
          {career.social.answered === 1 ? s.media.answeredLabelOne : s.media.answeredLabel}
        </span>
      </p>
    </Panel>
  );
}

const CLIQUE_DISC: Record<CliqueKind, string> = {
  seniors: 'bg-accent-soft text-accent',
  young: 'bg-art-gold text-gold-ink',
  core: 'bg-art-blue text-info',
  internationals: 'bg-surface-soft text-ink',
};

/** Who the press answers speak to: the four groups of the dressing room. */
function Groups() {
  const link = useSaveLink();
  return (
    <Panel aria-labelledby="groups-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <CardTitle id="groups-heading" size="sm">
          {s.room.cliques}
        </CardTitle>
        <Link
          to={link('/career/club')}
          className="inline-flex min-h-11 items-center text-[0.8125rem] font-semibold text-accent underline underline-offset-4"
        >
          {s.titles.club}
        </Link>
      </div>
      <p className="text-[0.8125rem] text-muted">{s.media.groupsBody}</p>
      <ul className="grid">
        {CLIQUES.map((kind) => (
          <li key={kind} className="flex items-start gap-3 border-t border-line py-2">
            <span
              aria-hidden="true"
              className={cx(
                'grid h-[1.875rem] w-[1.875rem] shrink-0 place-items-center rounded-full text-xs font-extrabold',
                CLIQUE_DISC[kind],
              )}
            >
              {s.room.cliqueNames[kind].replace(/^The /, '').charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-bold">{s.room.cliqueNames[kind]}</span>
              <span className="block text-xs text-muted">{s.room.cliqueBodies[kind]}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const FEED_PAGE = 12;
const FAN_TINTS = [
  'bg-art-gold text-gold-ink',
  'bg-accent-soft text-accent',
  'bg-art-blue text-info',
  'bg-danger-soft text-danger',
] as const;
const tintOf = (name: string) =>
  FAN_TINTS[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % FAN_TINTS.length]!;

/** Who wrote a post: the rival's portrait, a masthead, a pen for the press, or initials. */
function AuthorMark({ item, world }: { item: MediaItem; world: World }) {
  const rival = item.author === 'rival' ? rivalOf(world) : null;
  if (rival)
    return (
      <Portrait
        player={rival}
        age={world.date.season - rival.birthSeason}
        club={rival.clubId ? world.clubs[rival.clubId] : undefined}
        alt=""
        className="h-10 w-10 shrink-0"
      />
    );
  if (item.kind === 'headline')
    return (
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-chip bg-ink text-surface"
      >
        <LifeIcon name="news" className="h-[1.125rem] w-[1.125rem]" />
      </span>
    );
  if (item.author === 'journalist')
    return (
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-art-blue text-info"
      >
        <LifeIcon name="pen" className="h-[1.125rem] w-[1.125rem]" />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold',
        tintOf(item.authorName),
      )}
    >
      {initials(item.authorName)}
    </span>
  );
}

function Post({ item, world }: { item: MediaItem; world: World }) {
  const headline = item.kind === 'headline';
  const tone =
    item.sentiment > 0 ? 'text-accent' : item.sentiment < 0 ? 'text-danger' : 'text-muted';
  return (
    <li
      className={cx(
        'flex flex-col gap-2.5 rounded-control border p-4',
        headline
          ? 'border-ink bg-surface shadow-[inset_0_4px_0_var(--color-ink)]'
          : 'border-line bg-surface-soft',
      )}
    >
      <div className="flex items-center gap-2.5">
        <AuthorMark item={item} world={world} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-1.5">
            <strong className="text-sm">{item.authorName}</strong>
            {item.author === 'rival' && !headline && (
              <span className="rounded-full bg-danger-soft px-2 text-[0.6875rem] font-extrabold text-danger">
                {s.media.authorKinds.rival}
              </span>
            )}
          </p>
          <p className="text-xs text-muted">
            {headline ? s.media.filters.headline : s.media.authorKinds[item.author]} ·{' '}
            {format(c.common.seasonWeek, { season: item.date.season, week: item.date.week })}
          </p>
        </div>
      </div>
      <p
        className={
          headline ? 'font-display text-[1.625rem] leading-[1.02] sm:text-[1.875rem]' : 'text-sm'
        }
      >
        {mediaText(item)}
      </p>
      <p className={cx('mt-auto inline-flex items-center gap-1.5 text-xs font-bold', tone)}>
        <LifeIcon
          name={item.sentiment < 0 ? 'heartBroken' : 'heart'}
          filled={item.sentiment > 0}
          className="h-3.5 w-3.5"
        />
        {format(s.media.likes, { count: integer.format(item.likes) })}
      </p>
    </li>
  );
}

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
    <Panel aria-labelledby="feed-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle id="feed-heading" size="lg">
          {s.media.feed}
        </CardTitle>
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
              className={cx(
                'min-h-11 flex-auto rounded-chip px-2 text-[0.8125rem] whitespace-nowrap transition-colors sm:flex-none sm:px-4 sm:text-sm',
                filter === key
                  ? 'bg-accent font-bold text-on-accent'
                  : 'font-semibold text-muted hover:text-ink',
              )}
            >
              {s.media.filters[key]}
            </button>
          ))}
        </div>
      </div>
      {posts.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3">
          {shown.map((item) => (
            <Post key={item.id} item={item} world={world} />
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-3 rounded-control border border-dashed border-line p-4 text-muted">
          <LifeIcon name="chat" className="h-7 w-7" />
          {s.media.empty}
        </p>
      )}
      {posts.length > shown.length && (
        <div className="flex flex-wrap items-center gap-3.5">
          <Button variant="secondary" onClick={() => setVisible((count) => count + FEED_PAGE)}>
            {s.media.showMore}
          </Button>
          <span className="text-[0.8125rem] text-muted">
            {format(s.media.showing, { shown: shown.length, total: posts.length })}
          </span>
        </div>
      )}
    </Panel>
  );
}

const TONES: MediaTone[] = ['team', 'humble', 'confident', 'deflect', 'provocative'];
/**
 * Routine press answered for the player in a chosen tone as it arrives (review phase 5), so a
 * quiet week needs no stop for a post-match question.
 */
function RoutinePress({ tone }: { tone: MediaTone | null }) {
  const { run, error, block } = useSocialAction();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-[1_1_18rem]">
        <label htmlFor="routine-press" className="font-bold">
          {s.media.routine}
        </label>
        <p className="text-[0.8125rem] text-muted">{s.media.routineBody}</p>
      </div>
      <select
        id="routine-press"
        value={tone ?? ''}
        disabled={Boolean(block)}
        onChange={(event) =>
          run({ type: 'press-tone', tone: (event.target.value || null) as MediaTone | null })
        }
        className="min-h-11 rounded-control border border-line bg-surface px-3 text-sm font-bold"
      >
        <option value="">{s.media.routineSelf}</option>
        {TONES.map((entry) => (
          <option key={entry} value={entry}>
            {format(s.media.routineTone, { tone: s.tones[entry] })}
          </option>
        ))}
      </select>
      {error && <p className="basis-full text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
