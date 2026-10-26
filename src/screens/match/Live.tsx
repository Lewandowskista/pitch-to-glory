import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { MatchEvent } from '../../model/domain';
import type { MatchSession } from '../../engine/match';
import { attacksRightAt, fullTime } from '../../engine/match';
import { matchText as m, matchFormat } from '../../i18n/match';
import { celebrationCommentary } from '../../i18n/celebrations';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/kit';
import { ClubBadge } from './Shared';
import { edgeStyle, kitAppearance } from './pitchKit';
import { buildFeed, type FeedRow, type NarrationLine } from './feed';
import { selectedSide, surname } from './cam';
import type * as Lines from './lines';

const u = m.ui;
export type LiveStatus = 'preview' | 'live' | 'decision' | 'halftime' | 'finished';

/** The clock: "34′", or in added time (match-22) "90+3′". */
export function clockText(minute: number, added?: number): string {
  return added ? matchFormat(u.addedMinute, { minute, added }) : matchFormat(m.minute, { minute });
}
/** A club's three-letter mark for the phone scoreboard and a side too narrow for its name. */
const mark = (name: string) =>
  name
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .slice(0, 3)
    .toUpperCase();

export function statusLabel(status: LiveStatus, playing: boolean) {
  return status === 'preview'
    ? m.preview
    : status === 'finished'
      ? m.finished
      : status === 'halftime'
        ? m.halftime
        : status === 'decision'
          ? m.decision
          : playing
            ? m.live
            : m.paused;
}

/**
 * The always-dark scoreboard: both clubs with their crests, the Bebas score and the momentum
 * strip between them, the clock with the state of play, and the competition. On phones it
 * folds into one line: crest, mark, score, mark, crest, then the minute and the state.
 */
export function Scoreboard({
  session,
  status,
  playing,
  competition,
  stadium,
  controls,
  score,
}: {
  session: MatchSession;
  /** The score to show, when a goal on the pitch has not gone in yet (step 5.1). */
  score?: [number, number];
  status: LiveStatus;
  playing: boolean;
  competition: string;
  /** Before kick-off, the ground beside the competition. */
  stadium?: string;
  /** Playback controls, beside the clock on wide screens. */
  controls?: ReactNode;
}) {
  const { setup, state } = session;
  const [homeScore, awayScore] = score ?? state.match.score;
  const side = selectedSide(setup);
  const kits = kitAppearance(setup.home, setup.away);
  const momentum = state.match.momentum;
  const live = status === 'live' && playing;
  const state_ = statusLabel(status, playing);
  const added =
    status !== 'finished'
      ? state.stoppage?.find((board) => board.at === state.match.minute && board.minutes > 0)
      : undefined;
  // At full time each side lists its scorers ("Vale 34′, 88′") under its name.
  const scorers = (clubId: string) => {
    const goals = new Map<string, string[]>();
    for (const event of state.match.events)
      if (event.kind === 'goal' && event.teamId === clubId && event.playerId)
        goals.set(event.playerId, [
          ...(goals.get(event.playerId) ?? []),
          clockText(event.minute, event.addedTime),
        ]);
    return [...goals]
      .map(([id, minutes]) => `${surname(setup.players[id]?.name ?? '')} ${minutes.join(', ')}`)
      .join(' · ');
  };
  const team = (index: 0 | 1) => {
    const club = index === 0 ? setup.home : setup.away;
    const finalLine = status === 'finished' ? scorers(club.id) : '';
    // Players sent off (match-16): a red card for each beside the name.
    const reds = (index === 0 ? state.match.home : state.match.away).sentOffIds?.length ?? 0;
    // A name breaks only between words. One that still does not fit ends in an ellipsis, or
    // gives way to the mark on a narrow side; the tooltip and screen readers keep it whole.
    return (
      <div className={cx('match-team', index === 0 ? 'is-home' : 'is-away')} title={club.name}>
        <span className="match-team-text">
          <strong>
            {club.name}
            {reds > 0 && (
              <span
                className="match-red-cards"
                role="img"
                aria-label={matchFormat(u.redCards, { count: reds })}
              >
                {Array.from({ length: reds }, (_, card) => (
                  <span key={card} />
                ))}
              </span>
            )}
          </strong>
          <span className="match-team-mark" aria-hidden="true">
            {mark(club.name)}
          </span>
          <span className="match-team-meta">
            {finalLine || (setup.neutral ? u.neutral : index === 0 ? u.home : u.away)}
            {side === index && !finalLine && (
              <>
                {' · '}
                <span className="text-gold">{u.you}</span>
              </>
            )}
          </span>
        </span>
        <ClubBadge club={club} className="match-team-crest" />
      </div>
    );
  };
  return (
    <div className="match-bar">
      <section className="match-scoreboard" aria-label={m.score}>
        {team(0)}
        <div className="match-score">
          <span className="match-score-value" aria-hidden="true">
            {homeScore} <span>–</span> {awayScore}
          </span>
          <span className="sr-only">
            {matchFormat(u.scoreLabel, {
              home: setup.home.name,
              away: setup.away.name,
              homeScore,
              awayScore,
            })}
          </span>
          {status !== 'preview' && status !== 'finished' && (
            <span
              className="match-momentum-strip"
              role="meter"
              aria-label={m.momentum}
              aria-valuenow={momentum}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={matchFormat(u.momentumLabel, {
                home: setup.home.name,
                away: setup.away.name,
                homeValue: momentum,
                awayValue: 100 - momentum,
              })}
            >
              <span
                style={{
                  flexGrow: momentum,
                  background: kits.home,
                  ...edgeStyle(kits.edge.home, 'night'),
                }}
              />
              <span
                style={{
                  flexGrow: 100 - momentum,
                  background: kits.away,
                  ...edgeStyle(kits.edge.away, 'night'),
                }}
              />
            </span>
          )}
        </div>
        {team(1)}
        <div className="match-clock">
          <span
            className={cx(
              'match-clock-dot',
              live && 'is-live',
              status === 'decision' && 'is-moment',
            )}
            aria-hidden="true"
          />
          <span className="match-clock-minute">{clockText(state.match.minute, state.added)}</span>
          {/* The added-time board (match-22): +N beside the clock while it is up or played. */}
          {added && (
            <span className="match-clock-added">
              <span className="sr-only">{u.addedLabel} </span>+{added.minutes}
            </span>
          )}
        </div>
        {/* Its own grid area under the clock, so it never runs into the away side. */}
        <span className="match-clock-state">
          {state_}
          {status === 'decision' && <span className="match-clock-rest"> · {u.takeYourTime}</span>}
        </span>
        <span className="match-competition">
          {competition}
          {stadium && status === 'preview' && <span className="match-stadium">{stadium}</span>}
        </span>
      </section>
      {controls}
    </div>
  );
}

/** Play and pause, the speeds and the gold "Next key moment": one group, keyboard-friendly. */
export function MatchControls({
  playing,
  canPlay,
  speed,
  onToggle,
  onSpeed,
  onNext,
}: {
  playing: boolean;
  canPlay: boolean;
  speed: number;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="match-controls" data-tour="controls">
      <div className="match-speed-pill">
        <button type="button" className="match-play" disabled={!canPlay} onClick={onToggle}>
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={playing ? 'M6 4H10V20H6ZM14 4H18V20H14Z' : 'M7 4L19 12L7 20Z'}
              fill="currentColor"
            />
          </svg>
          {playing ? m.pause : m.play}
        </button>
        <div className="match-speeds" role="group" aria-label={m.speed}>
          {[1, 2, 4].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={speed === value}
              onClick={() => onSpeed(value)}
            >
              {matchFormat(m.speedValue, { speed: value })}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="button play match-next" disabled={!canPlay} onClick={onNext}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5L12 12L4 19ZM12 5L20 12L12 19Z" fill="currentColor" />
        </svg>
        {m.next}
      </button>
    </div>
  );
}

/** Chips above the live pitch: both formations, who attacks which way, and the weather. */
export function PitchOverlay({ session }: { session: MatchSession }) {
  const { setup, state } = session;
  const side = selectedSide(setup);
  const right = attacksRightAt(side, Math.max(1, state.match.minute));
  const club = side === 0 ? setup.home : setup.away;
  return (
    <div className="match-pitch-chips" aria-hidden="true">
      <span className="match-cam-chip">
        {matchFormat(u.formations, {
          home: setup.home.name,
          homeFormation: state.match.home.formation,
          away: setup.away.name,
          awayFormation: state.match.away.formation,
        })}
      </span>
      <span className="match-cam-chip is-quiet">
        {matchFormat(u.attacking, { club: club.name })} {right ? '→' : '←'} ·{' '}
        {state.match.weatherIntensity && state.match.pitchState
          ? matchFormat(m.conditionsLine, {
              weather: m.weatherNames[state.match.weatherIntensity][state.match.weather],
              pitch: m.pitchNames[state.match.pitchState],
            })
          : m[state.match.weather]}
      </span>
    </div>
  );
}

/** Whether a shot event of yours was on target: a goal, or a save from the other side. */
function onTarget(events: readonly MatchEvent[], index: number, playerId: string) {
  const shot = events[index]!;
  for (let i = index + 1; i < Math.min(events.length, index + 4); i++) {
    const next = events[i]!;
    if (next.minute !== shot.minute) break;
    if (next.kind === 'goal' && next.playerId === playerId) return true;
    if (next.kind === 'save' && next.teamId !== shot.teamId) return true;
  }
  return false;
}

/**
 * The 0–90′ line under the pitch: played time filled, a marker for every key moment, goals
 * in the scoring side's colour, half-time, and bookings when the engine records them. The
 * markers are drawn for sighted players; the list beside them reads the same events.
 */
export function Timeline({ session }: { session: MatchSession }) {
  const { setup, state } = session;
  const kits = kitAppearance(setup.home, setup.away);
  const minute = state.match.minute;
  type Mark = {
    key: string;
    minute: number;
    kind: 'moment' | 'goal' | 'half' | 'card';
    /** A dismissal (match-16): the card is red. */
    red?: boolean;
    colour?: string;
    edge?: CSSProperties;
    text: string;
  };
  const teamName = (teamId: string) =>
    teamId === setup.home.id ? setup.home.name : setup.away.name;
  const marks: Mark[] = [
    ...state.match.keyMoments.map((moment) => ({
      key: `moment-${moment.id}`,
      minute: moment.minute,
      kind: 'moment' as const,
      text: matchFormat(u.timelineMoment, { minute: moment.minute }),
    })),
    ...(minute >= 45
      ? [{ key: 'half', minute: 45, kind: 'half' as const, text: u.timelineHalf }]
      : []),
    ...state.match.events
      .filter((event) => event.kind === 'goal' || event.kind === 'card')
      .map((event) => ({
        key: event.id,
        minute: event.minute,
        kind: event.kind === 'goal' ? ('goal' as const) : ('card' as const),
        red: event.kind === 'card' && !!event.card && event.card !== 'yellow',
        colour: event.teamId === setup.home.id ? kits.home : kits.away,
        edge:
          event.kind === 'goal'
            ? edgeStyle(event.teamId === setup.home.id ? kits.edge.home : kits.edge.away, 'card')
            : undefined,
        text: matchFormat(
          event.kind === 'goal'
            ? u.timelineGoal
            : event.card && event.card !== 'yellow'
              ? u.timelineRed
              : u.timelineCard,
          {
            minute: event.minute,
            team: teamName(event.teamId),
            name: event.playerId ? surname(setup.players[event.playerId]?.name ?? '') : '',
          },
        ),
      })),
  ].sort((a, b) => a.minute - b.minute);
  // The track is 90 minutes, or 120 once extra time began (match-18).
  const end = fullTime(session);
  const at = (value: number) => `${(Math.min(end, Math.max(0, value)) / end) * 100}%`;
  return (
    <div className="match-timeline">
      <h3 className="sr-only">{u.timeline}</h3>
      <div className="match-timeline-track" aria-hidden="true">
        <span className="match-timeline-fill" style={{ width: at(minute) }} />
        {marks.map((entry) => (
          <span
            key={entry.key}
            className={cx('match-timeline-mark', `is-${entry.kind}`, entry.red && 'is-red')}
            style={{
              left: at(entry.minute),
              ...(entry.colour ? { background: entry.colour } : {}),
              ...entry.edge,
            }}
            title={entry.text}
          >
            {entry.kind === 'half' ? 'HT' : null}
          </span>
        ))}
        <span className="match-timeline-end is-start">0′</span>
        <span className="match-timeline-end is-end">90′</span>
      </div>
      <ol className="sr-only">
        {marks.map((entry) => (
          <li key={entry.key}>{entry.text}</li>
        ))}
        <li>{matchFormat(u.timelineNow, { minute })}</li>
      </ol>
    </div>
  );
}

/** Your live rating with its line since kick-off, the last change, and four numbers. */
export function RatingCard({ session }: { session: MatchSession }) {
  const { setup, state } = session;
  const player = setup.players[setup.selectedPlayerId]!;
  const id = useId();
  const line = state.ratingByMinute;
  const rating = state.stats.rating;
  // The last change: from the latest value that differs from the current one.
  let previous = rating;
  for (let i = line.length - 1; i >= 0; i--)
    if (Math.abs(line[i]! - rating) >= 0.005) {
      previous = line[i]!;
      break;
    }
  const delta = Math.round((rating - previous) * 10) / 10;
  const minute = Math.max(1, line.length);
  const points = line.length > 1 ? line : [rating, rating];
  const low = Math.min(5.5, ...points),
    high = Math.max(8, ...points);
  const path = points
    .map((value, index) => {
      const x = 2 + (index / Math.max(1, points.length - 1)) * 146;
      const y = 42 - ((value - low) / Math.max(0.1, high - low)) * 36;
      return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
  const endY = 42 - ((points[points.length - 1]! - low) / Math.max(0.1, high - low)) * 36;
  const events = state.match.events;
  const shotsOn = events.filter(
    (event, index) =>
      event.kind === 'shot' &&
      event.playerId === setup.selectedPlayerId &&
      onTarget(events, index, setup.selectedPlayerId),
  ).length;
  const accuracy = state.stats.passesAttempted
    ? `${Math.round((state.stats.passesCompleted / state.stats.passesAttempted) * 100)}%`
    : '–';
  const tiles = [
    [m.goals, state.stats.goals],
    [u.keyPasses, state.stats.keyPasses],
    [u.passAccuracy, accuracy],
    [u.shotsOnTarget, shotsOn],
  ] as const;
  return (
    <section className="match-panel match-rating-card" aria-labelledby={`${id}-rating`}>
      <h2 id={`${id}-rating`} className="match-card-title">
        {matchFormat(u.ratingTitle, { name: surname(player.name) })}
      </h2>
      <div className="match-rating-row">
        <p className="match-rating-value">
          <strong>{rating.toFixed(1)}</strong>
          <span className={cx('match-rating-delta', delta < 0 && 'is-down')}>
            <span aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'}</span>{' '}
            <span aria-hidden="true">{delta ? Math.abs(delta).toFixed(1) : ''}</span>
            <span className="sr-only">
              {delta > 0
                ? matchFormat(u.ratingUp, { value: Math.abs(delta).toFixed(1) })
                : delta < 0
                  ? matchFormat(u.ratingDown, { value: Math.abs(delta).toFixed(1) })
                  : u.ratingSteady}
            </span>
          </span>
        </p>
        <figure className="match-sparkline">
          <svg
            width="150"
            height="46"
            viewBox="0 0 150 46"
            role="img"
            aria-label={matchFormat(u.ratingLine, {
              minute,
              start: points[0]!.toFixed(1),
              end: rating.toFixed(1),
            })}
          >
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="148"
              cy={endY}
              r="4"
              fill="var(--color-gold)"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <figcaption>{matchFormat(u.ratingRange, { minute })}</figcaption>
        </figure>
      </div>
      <dl className="match-tiles">
        {tiles.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Team numbers side by side, each with a bar in its kit colour (the values are written). */
export function StatsCard({ session }: { session: MatchSession }) {
  const { setup, state } = session;
  const id = useId();
  const kits = kitAppearance(setup.home, setup.away);
  const s = state.stats;
  const rows: [string, string, string, number, number][] = [
    [m.shots, String(s.homeShots), String(s.awayShots), s.homeShots, s.awayShots],
    [
      u.shotsOnTarget,
      String(s.shotsOnTarget[0]),
      String(s.shotsOnTarget[1]),
      s.shotsOnTarget[0],
      s.shotsOnTarget[1],
    ],
    [
      m.possession,
      `${s.homePossession}%`,
      `${100 - s.homePossession}%`,
      s.homePossession,
      100 - s.homePossession,
    ],
    [m.expectedGoals, s.xg[0].toFixed(2), s.xg[1].toFixed(2), s.xg[0], s.xg[1]],
  ];
  return (
    <section className="match-panel match-stats-card" aria-labelledby={`${id}-stats`}>
      <div className="match-card-head">
        <h2 id={`${id}-stats`} className="match-card-title">
          {u.liveStats}
        </h2>
        <span className="match-legend" aria-hidden="true">
          <span>
            <span style={{ background: kits.home, ...edgeStyle(kits.edge.home, 'card') }} />
            {setup.home.name}
          </span>
          <span>
            <span style={{ background: kits.away, ...edgeStyle(kits.edge.away, 'card') }} />
            {setup.away.name}
          </span>
        </span>
      </div>
      <dl className="match-duels">
        {rows.map(([label, a, b, av, bv]) => {
          const share = av + bv > 0 ? (av / (av + bv)) * 100 : 50;
          return (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <span className="match-duel-a">
                  <span className="sr-only">{setup.home.name} </span>
                  {a}
                </span>
                <span className="match-duel-b">
                  <span className="sr-only">{setup.away.name} </span>
                  {b}
                </span>
                <span className="match-duel-bars" aria-hidden="true">
                  <span
                    style={{
                      flexGrow: share,
                      background: kits.home,
                      ...edgeStyle(kits.edge.home, 'card'),
                    }}
                  />
                  <span
                    style={{
                      flexGrow: 100 - share,
                      background: kits.away,
                      ...edgeStyle(kits.edge.away, 'card'),
                    }}
                  />
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const FEED_ICON: Record<FeedRow['kind'], string> = {
  moment: 'M12 3L14.6 9L21 9.5L16 13.6L17.6 20L12 16.6L6.4 20L8 13.6L3 9.5L9.4 9Z',
  goal: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3ZM12 8L15.5 10.5L14.2 14.5H9.8L8.5 10.5Z',
  whistle: 'M12 7V12L15 14M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3Z',
  save: 'M5 12L10 17L19 7',
  card: 'M8 4H16V20H8Z',
  substitution: 'M4 8H17M13 4L17 8L13 12M20 16H7M11 12L7 16L11 20',
  play: 'M5 12H19M13 6L19 12L13 18',
  line: 'M5 12H19',
};

/**
 * The commentary, newest first. Key moments and goals stand out; your signature celebration
 * follows your goals. Narration lines (optional) slot in through the feed adapter. On phones
 * it folds behind a toggle so the pitch keeps its room.
 */
export function CommentaryCard({
  session,
  narration,
  celebration,
  hidden,
  lines,
}: {
  session: MatchSession;
  narration?: readonly NarrationLine[];
  /** An event not shown yet: a goal whose build-up is still playing on the pitch. */
  hidden?: string;
  /** Your equipped celebration's name, shown under your goals. */
  celebration?: string;
  /** The commentary's words (lines.ts), loaded once the match is under way. */
  lines?: typeof Lines;
}) {
  const { setup, state } = session;
  const [open, setOpen] = useState(false);
  const id = useId();
  const rows = useMemo(() => {
    if (!lines) return [];
    const words = lines.feedLines({ setup, state });
    return buildFeed(
      hidden ? state.match.events.filter((event) => event.id !== hidden) : state.match.events,
      words.text,
      (event) =>
        event.playerId
          ? setup.players[event.playerId]?.name
          : event.teamId === setup.home.id
            ? setup.home.name
            : setup.away.name,
      hidden ? narration?.filter((line) => line.eventId !== hidden) : narration,
      { spell: words.spell },
    );
    // The lines read the lineups and the events; both change with `state`.
  }, [lines, state, setup, narration, hidden]);
  return (
    <section
      className={cx('match-panel match-commentary', open && 'is-open')}
      data-tour="live"
      aria-labelledby={`${id}-feed`}
    >
      <div className="match-card-head">
        <h2 id={`${id}-feed`} className="match-card-title">
          {m.commentary}
        </h2>
        <span className="match-card-note">{u.newestFirst}</span>
        <button
          type="button"
          className="match-feed-toggle"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onClick={() => setOpen(!open)}
        >
          {open ? u.commentaryHide : u.commentaryShow}
          <Icon name="chevron" className="h-4 w-4" />
        </button>
      </div>
      {!rows.length && (
        <p className="match-card-note">
          {lines || !state.match.events.length ? m.opening : u.commentaryLoading}
        </p>
      )}
      {/* Scrolls within its bounded height, so the keyboard can reach and scroll it too. */}
      <ol id={`${id}-list`} tabIndex={0} aria-labelledby={`${id}-feed`}>
        {rows.map((row) => (
          <li
            key={row.id}
            className={cx(
              `is-${row.kind}`,
              row.event?.card && row.event.card !== 'yellow' && 'is-red',
            )}
          >
            <time>{clockText(row.minute, row.addedTime)}</time>
            <span className="match-feed-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path
                  d={FEED_ICON[row.kind]}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div>
              <p>
                {row.kind === 'goal' && <span className="match-feed-tag">{u.goalTag}</span>}
                {row.kind === 'moment' && <span className="match-feed-tag">{u.momentTag}</span>}
                {row.text}
              </p>
              {celebration &&
                row.event?.kind === 'goal' &&
                row.event.playerId === setup.selectedPlayerId && (
                  <p className="match-celebration">
                    {matchFormat(celebrationCommentary, {
                      player: setup.players[row.event.playerId]?.name ?? '',
                      name: celebration,
                    })}
                  </p>
                )}
              {row.subject && <small>{row.subject}</small>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Simulation-only mode: the pitch gives way to a big rating card. */
export function SimulationCard({ session }: { session: MatchSession }) {
  const s = session.state;
  return (
    <div className="match-simulation">
      <div>
        <span className="match-simulation-title">{m.simulation}</span>
        <p>{m.simulationBody}</p>
        <p className="match-simulation-note">{u.simulationNote}</p>
      </div>
      <div className="match-simulation-ring">
        <strong>{s.stats.rating.toFixed(1)}</strong>
        <span>{m.rating}</span>
      </div>
    </div>
  );
}
