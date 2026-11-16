import { useId } from 'react';
import type { MatchSession } from '../../engine/match/types';
import { matchFormat, matchLabel, matchText as m, situationText } from '../../i18n/match';
import { plural } from '../../i18n/locale';
import { reportCopy as r } from '../../i18n/matchReport';
import { Icon } from '../../ui/Icon';
import { Disclosure, cx } from '../../ui/kit';
import { Factors } from './Shared';
import type { MatchStory, MomentRecap, RecapChoice, StoryCard, StoryGoal } from './reportData';

const u = m.ui;
const percent = (probability: number) => Math.round(probability * 100);
const chanceText = (choice: RecapChoice) =>
  matchFormat(r.chance, {
    percent: percent(choice.probability),
    meaning: u.chanceMeans[choice.meaning],
  });

/** One side's goals and cards, in the order they came. */
function SideEvents({
  session,
  club,
  goals,
  cards,
  align,
}: {
  session: MatchSession;
  club: string;
  goals: StoryGoal[];
  cards: StoryCard[];
  align: 'start' | 'end';
}) {
  const name = (id: string | null) => (id ? (session.setup.players[id]?.name ?? '') : '');
  // In added time (match-22) the minute reads "90+2".
  const clock = (entry: { minute: number; addedTime?: number }) =>
    entry.addedTime ? `${entry.minute}+${entry.addedTime}` : entry.minute;
  const rows = [
    ...goals.map((goal) => ({
      id: goal.id,
      minute: goal.minute + (goal.addedTime ?? 0) / 100,
      kind: 'goal' as const,
      text: goal.playerId
        ? matchFormat(goal.assistId ? r.goalAssist : r.goal, {
            minute: clock(goal),
            player: name(goal.playerId),
            assist: name(goal.assistId),
          })
        : matchFormat(r.goal, { minute: clock(goal), player: r.unknownScorer }),
    })),
    ...cards.map((card) => ({
      id: card.id,
      minute: card.minute + (card.addedTime ?? 0) / 100,
      kind: card.card,
      text: matchFormat(r.card, {
        minute: clock(card),
        player: name(card.playerId),
        card: r.cardKinds[card.card],
      }),
    })),
  ].sort((a, b) => a.minute - b.minute);
  return (
    <div className={cx('grid min-w-0 content-start gap-1.5', align === 'end' && 'sm:text-right')}>
      <h4 className="text-sm font-extrabold">{club}</h4>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-muted">{r.noGoals}</p>
      ) : (
        <ul
          className="m-0 grid list-none gap-1 p-0 text-sm"
          aria-label={matchFormat(r.scorersOf, { club })}
        >
          {rows.map((row) => (
            <li
              key={row.id}
              className={cx(
                'flex items-start gap-2',
                align === 'end' && 'sm:flex-row-reverse sm:text-right',
              )}
            >
              {row.kind === 'goal' ? (
                <Icon name="ball" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-0.5 inline-block h-4 w-3 shrink-0 rounded-[3px]',
                    row.kind === 'yellow' ? 'bg-card-yellow' : 'bg-card-red',
                  )}
                />
              )}
              <span className="min-w-0">{row.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The match story: who scored and was booked on each side, and the team statistics. */
export function StorySection({ session, story }: { session: MatchSession; story: MatchStory }) {
  const id = useId();
  const { home, away } = session.setup;
  return (
    <section className="match-panel grid gap-5" aria-labelledby={`${id}-story`}>
      <h3 id={`${id}-story`} className="match-card-title is-display">
        {r.story}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <SideEvents
          session={session}
          club={home.name}
          goals={story.goals[0]}
          cards={story.cards[0]}
          align="start"
        />
        <SideEvents
          session={session}
          club={away.name}
          goals={story.goals[1]}
          cards={story.cards[1]}
          align="end"
        />
      </div>
      <div className="grid gap-2">
        <h4 className="text-sm font-extrabold">{r.teamStats}</h4>
        <ul className="m-0 grid list-none gap-2.5 p-0" data-testid="team-stats">
          {story.stats.map((stat) => {
            const label = r.stats[stat.key];
            const shown = (value: number) =>
              stat.key === 'possession'
                ? `${value}%`
                : stat.key === 'xg'
                  ? value.toFixed(2)
                  : String(value);
            const total = stat.home + stat.away;
            const share = total > 0 ? (stat.home / total) * 100 : 50;
            return (
              <li key={stat.key} className="grid gap-1">
                <span className="sr-only">
                  {matchFormat(r.statLine, {
                    label,
                    home: home.name,
                    homeValue: shown(stat.home),
                    away: away.name,
                    awayValue: shown(stat.away),
                  })}
                </span>
                <span
                  aria-hidden="true"
                  className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-baseline gap-2 text-sm"
                >
                  <strong className="font-extrabold tabular-nums">{shown(stat.home)}</strong>
                  <span className="text-center text-muted">{label}</span>
                  <strong className="text-right font-extrabold tabular-nums">
                    {shown(stat.away)}
                  </strong>
                </span>
                <span
                  className="flex h-1.5 overflow-hidden rounded-full bg-track"
                  aria-hidden="true"
                >
                  <span className="bg-accent" style={{ width: `${share}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * "Your moments": each key moment in order with the choice made, its stated chance and what
 * came of it, and the best-value alternative when it was worth more. The factors behind each
 * chance sit behind a disclosure, as the live decision showed them.
 */
export function MomentsSection({ recap }: { recap: MomentRecap }) {
  const id = useId();
  const total = recap.entries.length;
  return (
    <section
      className="match-panel grid gap-4"
      aria-labelledby={`${id}-moments`}
      data-testid="moments-recap"
    >
      <div className="grid gap-1.5">
        <h3 id={`${id}-moments`} className="match-card-title is-display">
          {r.moments}
        </h3>
        <p className="m-0 font-bold" data-testid="moments-summary">
          {total ? plural(total, r.momentsSummary, { best: recap.bestValue }) : r.momentsNone}
        </p>
        {total > 0 && <p className="m-0 text-sm text-muted">{r.momentsHint}</p>}
      </div>
      {total > 0 && (
        <ol className="m-0 grid list-none gap-3 p-0">
          {recap.entries.map((entry) => (
            <li
              key={entry.momentId}
              className="grid gap-2 rounded-control border border-line p-3.5"
              data-testid="moment-recap"
            >
              <div className="flex items-start gap-3">
                <span className="match-recap-minute">
                  {matchFormat(r.momentMinute, { minute: entry.minute })}
                </span>
                <div className="grid min-w-0 gap-1">
                  <p className="m-0 text-sm text-muted">{situationText(entry.moment)}</p>
                  <p className="m-0 font-bold">
                    {matchFormat(r.chose, { choice: matchLabel(entry.chosen.labelKey) })}
                    <span className="font-semibold text-muted"> · {chanceText(entry.chosen)}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cx(
                        'inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-xs font-extrabold',
                        entry.success ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger',
                      )}
                    >
                      <Icon name={entry.success ? 'check' : 'close'} className="h-3.5 w-3.5" />
                      {entry.success ? r.cameOff : r.didNotComeOff}
                    </span>
                    {!entry.better && (
                      <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-art-gold px-2.5 text-xs font-extrabold text-gold-ink">
                        <Icon name="life" className="h-3.5 w-3.5" />
                        {r.bestValue}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {entry.better && (
                <p className="m-0 rounded-chip bg-art-blue px-3 py-2 text-sm" data-testid="better">
                  {matchFormat(r.better, {
                    choice: matchLabel(entry.better.labelKey),
                    percent: percent(entry.better.probability),
                    meaning: u.chanceMeans[entry.better.meaning],
                    gap: entry.gap.toFixed(2),
                  })}
                </p>
              )}
              <Disclosure summary={r.why} className="bg-surface">
                <Factors factors={entry.factors} total={entry.chosen.probability} />
              </Disclosure>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
