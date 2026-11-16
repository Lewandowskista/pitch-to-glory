import { useId } from 'react';
import type { MatchEvent } from '../../model/domain';
import type { MatchSession } from '../../engine/match';
import { matchText as m, matchFormat } from '../../i18n/match';
import { reelText as r } from '../../i18n/reel';
import { cx } from '../../ui/kit';
import { ClubBadge } from './Shared';
import { edgeStyle, kitAppearance } from './pitchKit';
import { selectedSide, surname } from './cam';
import { clockText } from './reel/clock';

const u = m.ui;
export type LiveStatus = 'preview' | 'live' | 'decision' | 'halftime' | 'finished';

/** A club's three-letter mark for the phone scoreboard and a side too narrow for its name. */
const mark = (name: string) =>
  name
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .slice(0, 3)
    .toUpperCase();

function statusLabel(status: LiveStatus) {
  return status === 'preview'
    ? m.preview
    : status === 'finished'
      ? m.finished
      : status === 'halftime'
        ? m.halftime
        : status === 'decision'
          ? m.decision
          : m.live;
}

/**
 * The always-dark scoreboard of the reel (release 1.0, X1b): both clubs with their crests (the
 * three-letter marks on phones), the Bebas score, the clock with the added-time board, the
 * state of play and the player's live rating. It stays in view, sticky, through the match.
 */
export function Scoreboard({
  session,
  status,
  competition,
  score,
}: {
  session: MatchSession;
  /** The score to show, when a goal on the pitch has not gone in yet. */
  score?: [number, number];
  status: LiveStatus;
  competition: string;
}) {
  const { setup, state } = session;
  const [homeScore, awayScore] = score ?? state.match.score;
  const side = selectedSide(setup);
  const added =
    status !== 'finished'
      ? state.stoppage?.find((board) => board.at === state.match.minute && board.minutes > 0)
      : undefined;
  const team = (index: 0 | 1) => {
    const club = index === 0 ? setup.home : setup.away;
    const reds = (index === 0 ? state.match.home : state.match.away).sentOffIds?.length ?? 0;
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
            {setup.neutral ? u.neutral : index === 0 ? u.home : u.away}
            {side === index && (
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
  const live = status === 'live' || status === 'decision';
  return (
    <div className="match-bar reel-bar">
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
          {added && (
            <span className="match-clock-added">
              <span className="sr-only">{u.addedLabel} </span>+{added.minutes}
            </span>
          )}
        </div>
        <span className="match-clock-state">{statusLabel(status)}</span>
        <span className="match-competition">{competition}</span>
      </section>
      {status !== 'preview' && status !== 'finished' && (
        <p className="reel-rating" data-testid="live-rating">
          <span className="sr-only">
            {matchFormat(r.ratingLabel, { rating: state.stats.rating.toFixed(1) })}
          </span>
          <span aria-hidden="true">{r.rating}</span>
          <strong aria-hidden="true">{state.stats.rating.toFixed(1)}</strong>
        </p>
      )}
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

/** Your live rating with its line since kick-off, the last change, and four numbers. */
export function RatingCard({ session }: { session: MatchSession }) {
  const { setup, state } = session;
  const player = setup.players[setup.selectedPlayerId]!;
  const id = useId();
  const line = state.ratingByMinute;
  const rating = state.stats.rating;
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
