import { Suspense, lazy, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { sessionPenalties, type MatchSession } from '../../engine/match';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import { levelProgress } from '../../engine/career/progression';
import { renderAvatar } from '../../engine/assets/avatar';
import { assetEffects } from '../../engine/career/lifestyle/catalogue';
import { calendarDate } from '../../engine/world/calendar';
import { formatGameDate } from '../../i18n/calendar';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { reactionVariants, reportCopy as r, reportLabel } from '../../i18n/matchReport';
import { careerText as c } from '../../i18n/career';
import { lifestyleText } from '../../i18n/lifestyle';
import { format, plural } from '../../i18n/locale';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { Disclosure, Spinner, cx } from '../../ui/kit';
import { ClubBadge, FootballerAvatar } from './Shared';
import { useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';
import { CoachAdvice } from '../career/CoachAdvice';
import { competitionName } from '../career/selectors';
import { selectedSide } from './cam';
import { LevelUpMoment } from './LevelUpMoment';
import { MomentsSection, StorySection } from './ReportStory';
import { matchStory, momentRecap, pickVariant, reactionKey, xpBreakdown } from './reportData';
// The occasions' engine lines (match-22: a shootout kick's moment in the recap).
import '../../i18n/occasions';
/** The shootout kick by kick (match-22), with the occasions' copy. */
const ReportShootout = lazy(() =>
  import('./Occasions').then((module) => ({ default: module.ShootoutBoard })),
);

const u = m.ui;
/** The maps draw only when the player opens them. */
const MatchMaps = lazy(() => import('./Maps'));

/** Career fixtures: the granted XP once recorded, or the action that records it. */
export interface CareerReport {
  outcome: CareerMatchOutcome | null;
  recording: boolean;
  onRecord: () => void;
  actions: ReactNode;
}

/** A signed rating step with two decimals and a true minus sign. */
const signed2 = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
/** A signed whole number with a true minus sign ("+3", "−2", "0"). */
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
/** A club's three-letter mark, for a side too narrow for its name. */
const mark = (name: string) =>
  name
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .slice(0, 3)
    .toUpperCase();

/** One side of the final score: crest over the name (or its mark when narrow). */
function Side({ club, own }: { club: MatchSession['setup']['home']; own: boolean }) {
  return (
    <div className="match-report-side-team" title={club.name}>
      <ClubBadge club={club} className="match-report-crest" />
      <span className="match-report-team-name">{club.name}</span>
      <span className="match-report-team-mark" aria-hidden="true">
        {mark(club.name)}
      </span>
      {own && <span className="match-report-you">{u.you}</span>}
    </div>
  );
}

/**
 * The match report (release 1.0, step 5.1). One layout computed from the finished session,
 * which never reflows when the result is recorded: the first screen holds the final score,
 * the rating, the XP (confirmed once recorded) with the level, and the fame; then the match
 * story, "Your moments", the performance, the objectives and the touchline, and the maps
 * behind a disclosure. The next action sits in a sticky bar, always in view.
 */
export function Report({
  session,
  onAgain,
  onNew,
  career,
}: {
  session: MatchSession;
  onAgain?: () => void;
  onNew?: () => void;
  career?: CareerReport;
}) {
  const { setup, state } = session;
  const report = state.report!;
  const id = useId();
  const systemReduced = useReducedMotion();
  const reduced = useAppStore((store) => store.settings.reducedMotion) || Boolean(systemReduced);
  const world = useAppStore((store) => store.world);
  const outcome = career?.outcome ?? null;
  const recording = Boolean(career && !outcome && career.recording);
  // A recorded career match reports its finalized values (the same as the session's for a
  // current engine, extra time included); XP waits for the record.
  const final = outcome?.final;
  const rating = final?.rating ?? report.rating;
  const fame = final?.fame ?? report.fameDelta;
  const objectives = final?.objectives ?? report.objectives;
  const extraTimeRating = Math.round((rating - report.rating) * 100) / 100;
  const player = setup.players[setup.selectedPlayerId]!;
  const side = selectedSide(setup);
  const ownClub = side === 0 ? setup.home : setup.away;
  const manager = world?.managers[world.clubs[ownClub.id]?.managerId ?? ''];
  const managerSvg = useMemo(
    () => (manager ? renderAvatar(manager.avatar, manager.age) : null),
    [manager],
  );
  const recap = useMemo(() => momentRecap(session), [session]);
  const story = useMemo(() => matchStory(session), [session]);
  const fixture = setup.fixture && world ? world.fixtures[setup.fixture.id] : undefined;
  const date = fixture
    ? formatGameDate(calendarDate(fixture.date.season, fixture.date.week, fixture.date.day), true)
    : null;
  const competition =
    setup.fixture && world ? competitionName(world, setup.fixture.competitionId) : m.friendly;
  const [homeScore, awayScore] = state.match.score;
  const own = side === 0 ? homeScore : awayScore;
  const theirs = side === 0 ? awayScore : homeScore;
  // The shootout as the record settles it, also when the player was off the pitch for it.
  const penalties = sessionPenalties(session);
  const won = penalties ? penalties[side] > penalties[1 - side]! : own > theirs;
  const drew = !penalties && own === theirs;
  const result = won ? 'win' : drew ? 'draw' : 'loss';
  // The career's level: the one the record reached, with progress once the career is at it.
  const careerState = world?.career?.playerId === setup.selectedPlayerId ? world.career : null;
  const level = outcome ? outcome.previousLevel + outcome.levelsGained : careerState?.level;
  const progress = careerState && careerState.level === level ? levelProgress(careerState) : null;
  const xp =
    career && outcome && final
      ? xpBreakdown(
          session,
          recap,
          final.xp,
          outcome.record.xp,
          assetEffects(careerState?.style?.assets ?? []).decisionXp,
        )
      : null;
  const stats = [
    [m.minutes, outcome ? outcome.record.minutes : state.selectedPlayerMinutes],
    [m.goals, outcome ? outcome.record.goals : state.stats.goals],
    [m.assists, outcome ? outcome.record.assists : state.stats.assists],
    [m.passes, `${state.stats.passesCompleted}/${state.stats.passesAttempted}`],
    [m.tackles, state.stats.tackles],
    [m.saves, state.stats.saves],
    [m.errors, state.stats.errors],
  ] as const;
  const ratingRows = [
    ...report.ratingFactors.map((factor) => ({
      key: factor.labelKey,
      label: matchLabel(factor.labelKey),
      value: factor.contribution,
    })),
    ...(extraTimeRating !== 0
      ? [{ key: 'extra-time', label: c.report.extraTimeRating, value: extraTimeRating }]
      : []),
  ];
  const quote = (key: string) => pickVariant(setup.seed, key, reactionVariants(key));
  // An unused substitute (match-22) has no rating, XP or fame from the match.
  const unused = report.bench?.cameOn === null;
  const points = careerState?.attributePoints ?? 0;
  const skillPoints = careerState?.skillPoints ?? 0;
  const [mapsOpen, setMapsOpen] = useState(false);
  // Full time opens the report at its first screen, wherever the live match was scrolled.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [setup.seed]);

  return (
    <div className="match-report" data-testid="match-report">
      <section className="match-report-top" aria-labelledby={`${id}-title`}>
        <div className="match-report-top-head">
          <h2 id={`${id}-title`} className="match-report-title">
            {m.report}
          </h2>
          <p className="match-report-meta">
            {date ? matchFormat(r.meta, { competition, date }) : competition}
          </p>
        </div>
        <div className="match-report-score" data-testid="final-result">
          <Side club={setup.home} own={side === 0} />
          <div className="match-report-score-middle">
            <span className="match-report-score-label">{c.report.finalTitle}</span>
            <span className="match-report-score-value" aria-hidden="true">
              {homeScore}
              <span>–</span>
              {awayScore}
            </span>
            <span className="sr-only">
              {matchFormat(u.scoreLabel, {
                home: setup.home.name,
                away: setup.away.name,
                homeScore,
                awayScore,
              })}
            </span>
            <span className={cx('match-report-outcome', `is-${result}`)}>{r.result[result]}</span>
          </div>
          <Side club={setup.away} own={side === 1} />
          {(state.regulation || penalties) && (
            <p className="match-report-score-note">
              {[
                state.regulation ? r.afterExtraTime : '',
                penalties
                  ? matchFormat(r.penalties, {
                      club: penalties[0] > penalties[1] ? setup.home.name : setup.away.name,
                      score: `${Math.max(...penalties)}–${Math.min(...penalties)}`,
                    })
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        <div className="match-report-you-row">
          <div className="match-report-footballer">
            <FootballerAvatar
              player={player}
              season={setup.season}
              home={setup.home}
              away={setup.away}
              className="match-report-avatar"
            />
            <div className="min-w-0">
              <p className="match-report-name">{player.name}</p>
              <p className="match-report-role">
                {player.primaryPosition} ·{' '}
                {matchFormat(m.age, { age: setup.season - player.birthSeason })}
                {/* Cards (match-16): a dismissal is said plainly, a booking noted. */}
                {report.cards?.sentOff ? (
                  <span className="match-report-cards is-red" data-testid="report-sent-off">
                    <span className="match-card-chip is-red" aria-hidden="true" />
                    {matchFormat(u.reportSentOff, {
                      minute: report.cards.sentOff.minute,
                      reason: u.sentOffReasons[report.cards.sentOff.reason],
                    })}
                  </span>
                ) : report.cards?.yellow ? (
                  <span className="match-report-cards">
                    <span className="match-card-chip" aria-hidden="true" />
                    {matchFormat(u.reportCards, { yellow: report.cards.yellow })}
                  </span>
                ) : null}
                {/* The bench (match-22): an unused substitute, or the minute they came on. */}
                {report.bench && (
                  <span className="match-report-cards" data-testid="report-bench">
                    {report.bench.cameOn === null
                      ? r.unusedTitle
                      : matchFormat(r.cameOn, { minute: report.bench.cameOn })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="match-rewards">
            <div className="is-rating">
              <strong>{unused ? '—' : rating.toFixed(1)}</strong>
              <span>{m.rating}</span>
            </div>
            <div
              className={cx('is-xp', career && !outcome && 'is-pending')}
              data-testid={outcome ? 'career-xp' : 'report-xp'}
              aria-busy={recording || undefined}
            >
              <strong>{!career ? `+${report.xp}` : outcome ? `+${outcome.record.xp}` : '—'}</strong>
              <span>
                {!career
                  ? m.earnedXp
                  : outcome
                    ? c.report.granted
                    : recording
                      ? r.xpConfirming
                      : r.xpPending}
              </span>
            </div>
            <div className="is-fame">
              <strong>{signed(fame)}</strong>
              <span>{m.fame}</span>
            </div>
          </div>
        </div>
        {career && level !== undefined && (
          <div className="match-report-level">
            <div className="match-report-level-text">
              <strong>{format(r.levelLine, { level })}</strong>
              <span>
                {!outcome
                  ? recording
                    ? r.xpConfirming
                    : r.xpPending
                  : progress && progress.needed > 0
                    ? format(r.levelProgress, { into: progress.into, needed: progress.needed })
                    : progress
                      ? r.levelMax
                      : ''}
              </span>
            </div>
            <span
              className="match-report-level-track"
              role="progressbar"
              aria-label={format(r.levelLabel, { next: level + 1 })}
              aria-valuemin={0}
              aria-valuemax={Math.max(1, progress?.needed ?? 1)}
              aria-valuenow={progress?.into ?? 0}
            >
              <span
                style={{
                  width: `${progress && progress.needed ? Math.min(100, (progress.into / progress.needed) * 100) : progress ? 100 : 0}%`,
                }}
              />
            </span>
            {points > 0 ? (
              <Link className="match-report-points" to="/career/profile">
                {plural(points, r.pointsToSpend)}
                <Icon name="arrow" className="h-4 w-4" />
              </Link>
            ) : skillPoints > 0 ? (
              <Link className="match-report-points" to="/career/skills">
                {plural(skillPoints, r.skillPoints)}
                <Icon name="arrow" className="h-4 w-4" />
              </Link>
            ) : (
              <span className="match-report-points is-empty" aria-hidden="true" />
            )}
          </div>
        )}
        <div className="match-report-status" role="status">
          {!career ? (
            <span>{r.friendlyNote}</span>
          ) : outcome ? (
            <span className="is-done">
              <Icon name="check" className="h-4 w-4 shrink-0" />
              {r.recorded}
            </span>
          ) : recording ? (
            <span>
              <Spinner />
              {r.recording}
            </span>
          ) : (
            <span>{r.unrecorded}</span>
          )}
          {outcome && outcome.celebrationFame > 0 && (
            <span className="is-gold" data-testid="celebration-fame">
              <Icon name="life" className="h-4 w-4 shrink-0" />
              {format(lifestyleText.celebrations.fame, { fame: outcome.celebrationFame })}
            </span>
          )}
        </div>
        {outcome?.injury && (
          <div className="match-injury" role="alert">
            <span className="match-injury-icon is-solid" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path
                  d="M12 4V20M4 12H20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <div>
              <strong>
                {format(c.report.injured, {
                  injury: c.injuries[outcome.injury.kind] ?? outcome.injury.kind,
                })}
              </strong>
              <p className="text-sm">
                {format(c.report.injuredBody, { weeks: outcome.injury.weeksRemaining })}
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="match-report-columns">
        <div className="match-report-column">
          <section className="match-panel match-report-press" aria-labelledby={`${id}-headline`}>
            <div className="match-newspaper">
              <div className="match-newspaper-masthead">
                <span>{m.headline}</span>
                {date && <span>{date}</span>}
              </div>
              <h3 id={`${id}-headline`} className="match-headline">
                {matchFormat(reportLabel(report.headlineId), report.headlineParams ?? {})}
              </h3>
              <p className="match-card-note">
                {matchFormat(u.headlineLine, {
                  home: setup.home.name,
                  away: setup.away.name,
                  homeScore,
                  awayScore,
                  stadium: setup.home.stadium.name,
                })}
              </p>
            </div>
          </section>
          <StorySection session={session} story={story} />
          {unused && (
            <p className="notice match-notice" data-testid="report-unused">
              {r.unusedBody}
            </p>
          )}
          {state.penaltyShootout && (
            <Suspense fallback={null}>
              <ReportShootout session={session} placement="panel" />
            </Suspense>
          )}
        </div>
        <div className="match-report-column">
          <MomentsSection recap={recap} />
        </div>
      </div>

      <div className="match-report-columns">
        <section
          className="match-panel match-report-column grid gap-4"
          aria-labelledby={`${id}-performance`}
        >
          <div className="match-card-head">
            <h3 id={`${id}-performance`} className="match-card-title is-display">
              {r.performance}
            </h3>
            <span className="match-breakdown-total">{rating.toFixed(1)}</span>
          </div>
          <dl className="match-report-stats">
            {stats.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {career && (
            <Disclosure summary={u.xpTitle} className="match-xp-breakdown">
              {xp ? (
                <dl>
                  <div>
                    <dt>{u.xpPerformance}</dt>
                    <dd>{xp.performance}</dd>
                  </div>
                  <div>
                    <dt>{r.xpDecisions}</dt>
                    <dd>+{xp.decisions}</dd>
                  </div>
                  <div>
                    <dt>{u.xpOpposition}</dt>
                    <dd>×{xp.opposition.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>{u.xpOccasion}</dt>
                    <dd>×{xp.importance.toFixed(2)}</dd>
                  </div>
                  <div className="is-total">
                    <dt>{u.xpEarned}</dt>
                    <dd>+{xp.total}</dd>
                  </div>
                </dl>
              ) : (
                <p className="m-0 pb-1 text-muted">{recording ? r.xpConfirming : r.xpPending}</p>
              )}
            </Disclosure>
          )}
          <Disclosure summary={r.ratingHow}>
            <ul className="match-factors is-rating">
              {ratingRows.map((row) => {
                const base = row.key === 'match.rating.base';
                const width = base ? 0 : Math.min(Math.abs(row.value) * 55, 50);
                return (
                  <li
                    key={row.key}
                    className={cx(
                      base
                        ? 'is-base'
                        : row.value > 0
                          ? 'is-up'
                          : row.value < 0
                            ? 'is-down'
                            : 'is-flat',
                    )}
                  >
                    <span>{row.label}</span>
                    <span className="match-factor-bar" aria-hidden="true">
                      {!base && (
                        <span
                          style={{
                            width: `${width}%`,
                            ...(row.value >= 0 ? { left: '50%' } : { right: '50%' }),
                          }}
                        />
                      )}
                    </span>
                    <strong>{signed2(row.value)}</strong>
                  </li>
                );
              })}
            </ul>
          </Disclosure>
        </section>
        <div className="match-report-column">
          <section className="match-panel" aria-labelledby={`${id}-objectives`}>
            <h3 id={`${id}-objectives`} className="match-card-title is-display">
              {m.objectives}
            </h3>
            <ul className="match-objective-results">
              {objectives.map((objective) => {
                const done = objective.progress >= objective.target;
                const unit = objective.kind === 'passing' ? '%' : '';
                return (
                  <li key={objective.id} className={done ? 'is-done' : 'is-missed'}>
                    <div className="match-objective-head">
                      <span className="match-objective-mark" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24">
                          <path
                            d={done ? 'M5 12L10 17L19 7' : 'M7 7L17 17M17 7L7 17'}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1">{m.objectiveNames[objective.kind]}</span>
                      <strong className="match-objective-state">
                        {done ? m.complete : m.missed}
                      </strong>
                    </div>
                    <div className="match-objective-progress">
                      <span aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.min(100, (objective.progress / Math.max(0.01, objective.target)) * 100)}%`,
                          }}
                        />
                      </span>
                      <small>
                        {matchFormat(m.objectiveProgress, {
                          progress: `${Math.round(objective.progress * 10) / 10}${unit}`,
                          target: `${objective.target}${unit}`,
                        })}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="match-panel" aria-labelledby={`${id}-touchline`}>
            <h3 id={`${id}-touchline`} className="match-card-title is-display">
              {m.reactions}
            </h3>
            <figure className="match-quote" data-testid="manager-reaction">
              {managerSvg ? (
                <Artwork svg={managerSvg} alt="" className="match-quote-face" />
              ) : (
                <span className="match-quote-face is-icon" aria-hidden="true">
                  <Icon name="player" className="h-5 w-5" />
                </span>
              )}
              <div>
                <figcaption>
                  {m.manager}
                  {manager ? ` · ${manager.name}` : ''}
                </figcaption>
                <blockquote>“{quote(reactionKey(session, 'manager'))}”</blockquote>
              </div>
            </figure>
            <figure className="match-quote" data-testid="fan-reaction">
              <span className="match-quote-face is-icon" aria-hidden="true">
                <Icon name="club" className="h-5 w-5" />
              </span>
              <div>
                <figcaption>{m.fans}</figcaption>
                <blockquote>“{quote(reactionKey(session, 'fans'))}”</blockquote>
              </div>
            </figure>
          </section>
        </div>
      </div>

      <details
        className="match-panel match-report-maps"
        onToggle={(event) => setMapsOpen(event.currentTarget.open)}
      >
        <summary>
          <Icon name="chevron" className="match-report-maps-chevron" />
          <span className="match-card-title is-display">{m.maps}</span>
          <span className="match-card-note">{r.mapsShow}</span>
        </summary>
        {mapsOpen && (
          <>
            <p className="match-card-note match-attacking mt-3">
              {matchFormat(u.attacking, { club: ownClub.name })}
              <Icon name="arrow" className="h-[18px] w-[18px]" />
            </p>
            <Suspense
              fallback={
                <p className="match-card-note mt-3" role="status">
                  {r.mapsLoading}
                </p>
              }
            >
              <MatchMaps
                report={report}
                heat={state.heat}
                events={state.match.events}
                side={side}
                team={ownClub.name}
              />
            </Suspense>
          </>
        )}
      </details>

      {/* Once the result is recorded, the coach reads it with the decisions before it. */}
      {outcome && world?.career && <CoachAdvice world={world} compact />}

      <div className="match-whats-next" role="group" aria-label={u.whatNext}>
        {career ? (
          outcome ? (
            career.actions
          ) : (
            <button
              type="button"
              className="button play button-lg"
              disabled={career.recording}
              aria-busy={career.recording || undefined}
              onClick={career.onRecord}
            >
              {career.recording ? c.report.recording : c.report.record}
              {!career.recording && <Icon name="arrow" />}
            </button>
          )
        ) : (
          <>
            <button type="button" className="button play button-lg" onClick={onAgain}>
              {m.again}
            </button>
            <button type="button" className="button match-night-button" onClick={onNew}>
              {m.newFixture}
            </button>
          </>
        )}
      </div>
      {outcome && outcome.levelsGained > 0 && (
        <LevelUpMoment outcome={outcome} progress={progress} reduced={reduced} />
      )}
    </div>
  );
}
