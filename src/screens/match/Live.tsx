import { useId, useMemo, useState, type ReactNode } from 'react';
import type { DecisionOutcome, MatchEvent, World } from '../../model/domain';
import type { MatchSession } from '../../engine/match';
import { attacksRightAt } from '../../engine/match';
import { renderAvatar } from '../../engine/assets/avatar';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/kit';
import { ClubBadge, Factors, strongest, verdictOf } from './Shared';
import { kitAppearance } from './Maps';
import { buildFeed, type FeedRow, type NarrationLine } from './feed';
import { selectedSide, surname } from './cam';

const u = m.ui;
export type LiveStatus = 'preview' | 'live' | 'decision' | 'halftime' | 'finished';

/** The engine's commentary line for an event. */
export function commentaryText(event: MatchEvent): string {
  return matchFormat(matchLabel(event.commentaryKey), event.commentaryParams ?? {});
}
/** A club's three-letter mark for the phone scoreboard. */
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
}: {
  session: MatchSession;
  status: LiveStatus;
  playing: boolean;
  competition: string;
  /** Before kick-off, the ground beside the competition. */
  stadium?: string;
  /** Playback controls, beside the clock on wide screens. */
  controls?: ReactNode;
}) {
  const { setup, state } = session;
  const [homeScore, awayScore] = state.match.score;
  const side = selectedSide(setup);
  const kits = kitAppearance(setup.home, setup.away);
  const momentum = state.match.momentum;
  const live = status === 'live' && playing;
  const state_ = statusLabel(status, playing);
  // At full time each side lists its scorers ("Vale 34′, 88′") under its name.
  const scorers = (clubId: string) => {
    const goals = new Map<string, number[]>();
    for (const event of state.match.events)
      if (event.kind === 'goal' && event.teamId === clubId && event.playerId)
        goals.set(event.playerId, [...(goals.get(event.playerId) ?? []), event.minute]);
    return [...goals]
      .map(
        ([id, minutes]) =>
          `${surname(setup.players[id]?.name ?? '')} ${minutes.map((minute) => `${minute}′`).join(', ')}`,
      )
      .join(' · ');
  };
  const team = (index: 0 | 1) => {
    const club = index === 0 ? setup.home : setup.away;
    const finalLine = status === 'finished' ? scorers(club.id) : '';
    return (
      <div className={cx('match-team', index === 0 ? 'is-home' : 'is-away')}>
        <span className="match-team-text">
          <strong>{club.name}</strong>
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
              <span style={{ flexGrow: momentum, background: kits.home }} />
              <span style={{ flexGrow: 100 - momentum, background: kits.away }} />
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
          <span className="match-clock-minute">
            {matchFormat(m.minute, { minute: state.match.minute })}
          </span>
          <span className="match-clock-state">
            {state_}
            {status === 'decision' && <span className="match-clock-rest"> · {u.takeYourTime}</span>}
          </span>
        </div>
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

/** Chips over the live pitch: both formations, who attacks which way, and the weather. */
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
        {m[state.match.weather]}
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
    colour?: string;
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
        colour: event.teamId === setup.home.id ? kits.home : kits.away,
        text: matchFormat(event.kind === 'goal' ? u.timelineGoal : u.timelineCard, {
          minute: event.minute,
          team: teamName(event.teamId),
          name: event.playerId ? surname(setup.players[event.playerId]?.name ?? '') : '',
        }),
      })),
  ].sort((a, b) => a.minute - b.minute);
  const at = (value: number) => `${(Math.min(90, Math.max(0, value)) / 90) * 100}%`;
  return (
    <div className="match-timeline">
      <h3 className="sr-only">{u.timeline}</h3>
      <div className="match-timeline-track" aria-hidden="true">
        <span className="match-timeline-fill" style={{ width: at(minute) }} />
        {marks.map((entry) => (
          <span
            key={entry.key}
            className={cx('match-timeline-mark', `is-${entry.kind}`)}
            style={{
              left: at(entry.minute),
              ...(entry.colour ? { background: entry.colour } : {}),
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
            <span style={{ background: kits.home }} />
            {setup.home.name}
          </span>
          <span>
            <span style={{ background: kits.away }} />
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
                  <span style={{ flexGrow: share, background: kits.home }} />
                  <span style={{ flexGrow: 100 - share, background: kits.away }} />
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
}: {
  session: MatchSession;
  narration?: readonly NarrationLine[];
  /** Your equipped celebration's name, shown under your goals. */
  celebration?: string;
}) {
  const { setup, state } = session;
  const [open, setOpen] = useState(false);
  const id = useId();
  const rows = useMemo(
    () =>
      buildFeed(
        state.match.events,
        commentaryText,
        (event) =>
          event.playerId
            ? setup.players[event.playerId]?.name
            : event.teamId === setup.home.id
              ? setup.home.name
              : setup.away.name,
        narration,
      ),
    [state.match.events, setup, narration],
  );
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
      {!rows.length && <p className="match-card-note">{m.opening}</p>}
      {/* Scrolls within its bounded height, so the keyboard can reach and scroll it too. */}
      <ol id={`${id}-list`} tabIndex={0} aria-labelledby={`${id}-feed`}>
        {rows.map((row) => (
          <li key={row.id} className={`is-${row.kind}`}>
            <time>{matchFormat(m.minute, { minute: row.minute })}</time>
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
                    {matchFormat(l.celebrations.commentary, {
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

/** The manager's portrait, when the world knows the manager. */
function ManagerFace({ world, clubId }: { world: World | null; clubId: string }) {
  const manager = world ? world.managers[world.clubs[clubId]?.managerId ?? ''] : undefined;
  const svg = useMemo(
    () => (manager ? renderAvatar(manager.avatar, manager.age) : null),
    [manager],
  );
  if (!manager || !svg) return null;
  return <Artwork svg={svg} alt={manager.name} className="match-manager-face" />;
}

/** Half-time: three answers to the manager, each with what it does. */
export function HalfTimePanel({
  session,
  world,
  onTalk,
}: {
  session: MatchSession;
  world: World | null;
  onTalk: (response: 'motivate' | 'role' | 'complain') => void;
}) {
  const { setup, state } = session;
  const id = useId();
  const own = selectedSide(setup) === 0 ? setup.home : setup.away;
  const manager = world?.managers[world.clubs[own.id]?.managerId ?? ''];
  const icons = {
    motivate: 'M4 10V14H7L13 18V6L7 10ZM16 9Q18 12 16 15M18.5 7Q22 12 18.5 17',
    role: 'M4 8H17M13 4L17 8L13 12M20 16H7M11 12L7 16L11 20',
    complain: 'M5 21V4M5 4H17L14 8L17 12H5',
  } as const;
  return (
    <section className="match-panel match-interrupt" aria-labelledby={`${id}-ht`}>
      <div className="match-interrupt-head">
        <ManagerFace world={world} clubId={own.id} />
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            <span className="match-pill">{m.halftime}</span>
            {matchFormat(u.halftimeMeta, {
              home: setup.home.name,
              away: setup.away.name,
              homeScore: state.match.score[0],
              awayScore: state.match.score[1],
            })}
            {manager ? ` · ${manager.name}` : ''}
          </p>
          <h2 id={`${id}-ht`} className="match-interrupt-title">
            {m.managerTalk}
          </h2>
        </div>
      </div>
      <div className="match-talk">
        {(['motivate', 'role', 'complain'] as const).map((response) => (
          <button
            type="button"
            className={`match-talk-option is-${response}`}
            key={response}
            onClick={() => onTalk(response)}
          >
            <span className="match-talk-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  d={icons[response]}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <strong>
              {response === 'role'
                ? m.roleTalk
                : response === 'complain' && setup.occasions
                  ? m.demand
                  : m[response]}
            </strong>
            <span>
              {response === 'role'
                ? m.roleBody
                : response === 'motivate'
                  ? m.motivateBody
                  : setup.occasions
                    ? m.demandBody
                    : m.complainBody}
            </span>
          </button>
        ))}
      </div>
      <p className="match-card-note">{u.halftimeNote}</p>
    </section>
  );
}

/** The captain's call: two ways to set the tone, on the always-dark captain card. */
export function CaptainPanel({
  session,
  onCall,
}: {
  session: MatchSession;
  onCall: (instruction: 'push' | 'calm') => void;
}) {
  const { state } = session;
  const id = useId();
  return (
    <section className="match-captain" aria-labelledby={`${id}-captain`}>
      <div className="match-interrupt-head">
        <span className="match-armband" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24">
            <path d="M3 9H21V15H3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M9.5 10.6Q8 10.6 8 12Q8 13.4 9.5 13.4M12 10.6V13.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div>
          <p className="match-interrupt-meta is-dark">
            {matchFormat(u.captainMeta, {
              minute: state.match.minute,
              score: `${state.match.score[0]}–${state.match.score[1]}`,
            })}
          </p>
          <h2 id={`${id}-captain`} className="match-interrupt-title">
            {m.captainTalk}
          </h2>
        </div>
      </div>
      <div className="match-captain-options">
        {(['push', 'calm'] as const).map((instruction) => (
          <button type="button" key={instruction} onClick={() => onCall(instruction)}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d={instruction === 'push' ? 'M12 20V5M6 11L12 5L18 11' : 'M4 9H20M4 15H20'}
                fill="none"
                stroke={instruction === 'push' ? 'var(--color-gold)' : 'var(--color-mint)'}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {m[instruction]}
          </button>
        ))}
      </div>
      <p className="match-captain-note">{u.captainNote}</p>
    </section>
  );
}

/** Substituted: the board with your number, and your answer while it is still open. */
export function SubstitutionPanel({
  session,
  onResponse,
}: {
  session: MatchSession;
  onResponse: (response: 'accept' | 'encourage') => void;
}) {
  const { setup, state } = session;
  const id = useId();
  const player = setup.players[setup.selectedPlayerId]!;
  const off = state.match.events.findLast(
    (event) => event.kind === 'substitution' && event.playerId === player.id,
  );
  // The engine names who comes on (match-15).
  const incoming = off?.receiverId ? setup.players[off.receiverId] : undefined;
  return (
    <section className="match-panel match-interrupt" role="status" aria-labelledby={`${id}-sub`}>
      <div className="match-interrupt-head">
        <div className="match-sub-board">
          <span className="sr-only">
            {incoming
              ? matchFormat(u.substitutionBoardOn, {
                  number: player.squadNumber,
                  incoming: incoming.squadNumber,
                })
              : matchFormat(u.substitutionBoard, { number: player.squadNumber })}
          </span>
          <span aria-hidden="true">
            <small>{u.off}</small>
            {player.squadNumber}
          </span>
          {incoming && (
            <span aria-hidden="true" className="is-on">
              <small>{u.on}</small>
              {incoming.squadNumber}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            {incoming
              ? matchFormat(u.substitutionMetaOn, {
                  minute: off?.minute ?? state.match.minute,
                  name: surname(player.name),
                  incoming: surname(incoming.name),
                })
              : matchFormat(u.substitutionMeta, {
                  minute: off?.minute ?? state.match.minute,
                  name: surname(player.name),
                })}
          </p>
          <h2 id={`${id}-sub`} className="match-interrupt-title">
            {m.substitution}
          </h2>
        </div>
      </div>
      <p>{m.substitutionBody}</p>
      {state.substitutionDecisionPending && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="button secondary" onClick={() => onResponse('accept')}>
            {m.acceptSubstitution}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => onResponse('encourage')}
          >
            {m.encourageSubstitution}
          </button>
        </div>
      )}
      <p className="match-card-note">{u.substitutionNote}</p>
    </section>
  );
}

/**
 * After a decision: success or not, the roll against the chance, every signed factor summing
 * to that chance, the biggest help or drag, and "Continue play" (nothing counts down).
 */
export function OutcomePanel({
  outcome,
  minute,
  choice,
  onContinue,
}: {
  outcome: DecisionOutcome;
  minute: number;
  choice: string;
  onContinue: () => void;
}) {
  const id = useId();
  const chance = outcome.probability * 100;
  const roll = outcome.roll * 100;
  const verdict = verdictOf(outcome.probability, outcome.success);
  const key = outcome.success ? strongest(outcome.factors, 1) : strongest(outcome.factors, -1);
  return (
    <section
      className={cx('match-panel match-outcome', outcome.success ? 'is-success' : 'is-miss')}
      role="status"
      data-tour="outcome"
      aria-labelledby={`${id}-outcome`}
    >
      <div className="match-outcome-head">
        <span className="match-outcome-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path
              d={outcome.success ? 'M5 12L10 17L19 7' : 'M6 6L18 18M18 6L6 18'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="match-interrupt-meta">{matchFormat(u.outcomeChose, { minute, choice })}</p>
          <h2 id={`${id}-outcome`} className="match-outcome-title">
            {outcome.success ? m.succeeded : m.failed}
          </h2>
        </div>
      </div>
      <div className="match-roll">
        <div className="match-roll-track" aria-hidden="true">
          <span className="match-roll-zone" style={{ width: `${chance}%` }} />
          <span className="match-roll-label is-zone">
            {matchFormat(u.successZone, { chance: chance.toFixed(1) })}
          </span>
          <span className="match-roll-label is-miss">{u.miss}</span>
          <span
            className="match-roll-marker"
            style={{ left: `${Math.min(99, Math.max(1, roll))}%` }}
          >
            <span>{matchFormat(u.rollTag, { roll: roll.toFixed(1) })}</span>
          </span>
        </div>
        <p className="match-roll-line">
          {matchFormat(m.roll, { probability: chance.toFixed(1), roll: roll.toFixed(1) })}
        </p>
        <p className="sr-only">
          {matchFormat(outcome.success ? u.rollInside : u.rollOutside, {
            roll: roll.toFixed(1),
            chance: chance.toFixed(1),
          })}
        </p>
        <p className="match-card-note">{u.rollExplain}</p>
      </div>
      {verdict && <p className="match-verdict">{verdict}</p>}
      <div>
        <h3 className="match-factors-title">{m.factors}</h3>
        <Factors factors={outcome.factors} total={outcome.probability} />
      </div>
      {key && (
        <p className="match-key-factor">
          {matchFormat(outcome.success ? u.biggestHelp : u.biggestDrag, {
            factor: matchLabel(key.labelKey),
          })}
        </p>
      )}
      <div className="match-outcome-actions">
        <button type="button" className="button" onClick={onContinue}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4L19 12L7 20Z" fill="currentColor" />
          </svg>
          {u.continuePlay}
        </button>
        <span className="match-card-note">
          {m.returnToPlay} <kbd>Space</kbd>
        </span>
      </div>
    </section>
  );
}
