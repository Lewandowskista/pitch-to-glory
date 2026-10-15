import { useEffect, useMemo, useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MatchSession } from '../../engine/match';
import type { CareerMatchFinal, CareerMatchOutcome } from '../../engine/career/matches';
import { CONFIG } from '../../engine/config';
import { levelProgress } from '../../engine/career/progression';
import { renderAvatar } from '../../engine/assets/avatar';
import { calendarDate } from '../../engine/world/calendar';
import { formatGameDate } from '../../i18n/calendar';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { careerText as c } from '../../i18n/career';
import { lifestyleText } from '../../i18n/lifestyle';
import { format } from '../../i18n';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/kit';
import { FootballerAvatar } from './Shared';
import MatchMaps from './Maps';
import { m as motion, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';
import { audio } from '../../audio';
import { CoachAdvice } from '../career/CoachAdvice';
import { selectedSide } from './cam';

const u = m.ui;

/** Career fixtures: the granted XP once recorded, or the action that records it. */
export interface CareerReport {
  outcome: CareerMatchOutcome | null;
  recording: boolean;
  onRecord: () => void;
  actions: ReactNode;
}

function LevelUp({ outcome, reduced }: { outcome: CareerMatchOutcome; reduced: boolean }) {
  const level = outcome.previousLevel + outcome.levelsGained;
  const career = useAppStore((store) => store.world?.career);
  const progress = career ? levelProgress(career) : null;
  useEffect(() => audio.play('levelUp'), []);
  return (
    <motion.section
      role="status"
      data-testid="level-up"
      aria-labelledby="level-up-title"
      className="match-level-up"
      initial={reduced ? false : { opacity: 0, scale: 0.7, rotate: -2 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.35 }}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true" className="match-level-up-star">
        <path
          d="M100 10L123 72L190 76L138 118L156 184L100 146L44 184L62 118L10 76L77 72Z"
          fill="#ffffff"
        />
      </svg>
      {!reduced && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgb(255_255_255/0.55)_50%,transparent_70%)]"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.1, delay: 0.7, ease: 'easeInOut' }}
        />
      )}
      <h2 id="level-up-title" className="match-level-up-title">
        {c.report.levelUp}
      </h2>
      <p className="relative font-bold">{format(c.report.levelUpBody, { level })}</p>
      <p className="relative text-sm">
        {format(c.report.levelPoints, {
          attribute: outcome.levelsGained * CONFIG.career.attributePointsPerLevel,
          skill: outcome.levelsGained * CONFIG.career.skillPointsPerLevel,
        })}
      </p>
      {progress && progress.needed > 0 && (
        <div className="relative grid gap-1.5">
          <span className="match-level-up-track" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (progress.into / progress.needed) * 100)}%` }} />
          </span>
          <span className="text-xs font-bold">
            {format(c.common.level, { level: career!.level })} ·{' '}
            {format(c.common.xp, { into: progress.into, needed: progress.needed })}
          </span>
        </div>
      )}
      <div className="relative mt-1 flex flex-wrap gap-2">
        <Link className="match-level-up-link is-solid" to="/career/profile">
          {c.report.allocate}
        </Link>
        <Link className="match-level-up-link" to="/career/skills">
          {c.report.unlock}
        </Link>
      </div>
    </motion.section>
  );
}

/** The deciding result of a recorded career match: score, extra time and penalties. */
function FinalResult({
  final,
  shootout,
  keeper,
}: {
  final: CareerMatchFinal;
  shootout?: { probability: number; success: boolean };
  keeper: boolean;
}) {
  const pair = ([own, opposition]: [number, number]) => ({ own, opposition });
  const [own, opposition] = final.score;
  const won = final.penalties ? final.penalties[0] > final.penalties[1] : own > opposition;
  const drew = !final.penalties && own === opposition;
  return (
    <div className="match-final" data-testid="final-result">
      <p className="match-tile-label">{c.report.finalTitle}</p>
      <p className="match-final-score">{format(c.report.finalScore, pair(final.score))}</p>
      <p className="match-card-note">{won ? u.finalWon : drew ? u.finalDrew : u.finalLost}</p>
      {final.extraTime && (
        <>
          <p className="mt-2 text-sm">{c.report.afterExtraTime}</p>
          <p className="text-sm text-muted">
            {format(c.report.extraTimeScore, pair(final.extraTime))}
          </p>
        </>
      )}
      {final.penalties && (
        <p className="mt-1 text-sm font-semibold">
          {format(
            final.penalties[0] > final.penalties[1]
              ? c.report.penaltiesWon
              : c.report.penaltiesLost,
            pair(final.penalties),
          )}
        </p>
      )}
      {shootout && (
        <p className="mt-1 text-sm" data-testid="shootout-kick">
          {format(
            final.penalties
              ? keeper
                ? shootout.success
                  ? c.report.shootoutSaved
                  : c.report.shootoutBeaten
                : shootout.success
                  ? c.report.shootoutScored
                  : c.report.shootoutMissed
              : c.report.shootoutUnneeded,
            { percent: Math.round(shootout.probability * 100) },
          )}
        </p>
      )}
      {final.extraTime && (
        <p className="mt-1 text-sm">
          {final.extraTimeMinutes
            ? format(c.report.extraTimeYou, {
                minutes: final.extraTimeMinutes,
                goals: final.extraTimeGoals,
                assists: final.extraTimeAssists,
              })
            : c.report.extraTimeOff}
        </p>
      )}
    </div>
  );
}

/** A signed rating step with two decimals and a true minus sign. */
const signed2 = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;

/**
 * The match report (redesign phase 5b): the morning headline with your rewards, the result
 * and how the XP was worked out; a level-up and the touchline quotes beside it; the rating
 * breakdown, objectives and coach's advice; "Your match, mapped"; then what to do next.
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
  // A recorded career match reports its finalized values, simulated extra time included.
  const final = outcome?.final;
  const rating = final?.rating ?? report.rating;
  const fame = final?.fame ?? report.fameDelta;
  const performance = final?.xp ?? report.xp;
  const objectives = final?.objectives ?? report.objectives;
  const extraTimeRating = Math.round((rating - report.rating) * 100) / 100;
  const importance = setup.fixture?.importance ?? 1;
  const opposition = outcome && performance ? outcome.record.xp / (performance * importance) : 1;
  const player = setup.players[setup.selectedPlayerId]!;
  const side = selectedSide(setup);
  const ownClub = side === 0 ? setup.home : setup.away;
  const manager = world?.managers[world.clubs[ownClub.id]?.managerId ?? ''];
  const managerSvg = useMemo(
    () => (manager ? renderAvatar(manager.avatar, manager.age) : null),
    [manager],
  );
  const fixture = setup.fixture && world ? world.fixtures[setup.fixture.id] : undefined;
  const date = fixture
    ? formatGameDate(calendarDate(fixture.date.season, fixture.date.week, fixture.date.day), true)
    : null;
  const [homeScore, awayScore] = state.match.score;
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
  return (
    <div className="match-report">
      <div className="match-report-heading">
        <div>
          <h2 className="match-report-title">{m.report}</h2>
        </div>
        {outcome && (
          <span className="match-recorded">
            <Icon name="check" className="h-4 w-4" />
            {u.recorded}
          </span>
        )}
      </div>
      <div className="match-report-row">
        <section className="match-panel match-report-hero" aria-labelledby={`${id}-headline`}>
          <div className="match-newspaper">
            <div className="match-newspaper-masthead">
              <span>{m.headline}</span>
              {date && <span>{date}</span>}
            </div>
            <h3 id={`${id}-headline`} className="match-headline">
              {matchFormat(matchLabel(report.headlineId), report.headlineParams ?? {})}
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
          <div className="match-report-player">
            <div className="match-report-footballer">
              <FootballerAvatar
                player={player}
                season={setup.season}
                home={setup.home}
                away={setup.away}
                className="match-report-avatar"
              />
              <div className="min-w-0">
                <p className="match-tile-label">{m.selected}</p>
                <p className="match-report-name">{player.name}</p>
                <p className="match-card-note">
                  {player.primaryPosition} ·{' '}
                  {matchFormat(m.age, { age: setup.season - player.birthSeason })}
                </p>
              </div>
            </div>
            <motion.div
              className="match-rewards"
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="is-rating">
                <strong>{rating.toFixed(1)}</strong>
                <span>{m.rating}</span>
              </div>
              <div className="is-xp" data-testid={outcome ? 'career-xp' : undefined}>
                <strong>+{outcome ? outcome.record.xp : report.xp}</strong>
                <span>{outcome ? c.report.granted : m.earnedXp}</span>
              </div>
              <div className="is-fame">
                <strong>
                  {fame > 0 ? '+' : fame < 0 ? '−' : ''}
                  {Math.abs(fame)}
                </strong>
                <span>{m.fame}</span>
              </div>
            </motion.div>
          </div>
          {!career ? (
            <p className="match-card-note">{m.friendlyRewards}</p>
          ) : outcome && final ? (
            <>
              <div className="match-report-result">
                <FinalResult
                  final={final}
                  shootout={state.shootout}
                  keeper={player.primaryPosition === 'GK'}
                />
                <div className="match-xp-breakdown">
                  <h4>{u.xpTitle}</h4>
                  <dl>
                    <div>
                      <dt>{u.xpPerformance}</dt>
                      <dd>{performance}</dd>
                    </div>
                    <div>
                      <dt>{u.xpOpposition}</dt>
                      <dd>×{opposition.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>{u.xpOccasion}</dt>
                      <dd>×{importance.toFixed(2)}</dd>
                    </div>
                    <div className="is-total">
                      <dt>{u.xpEarned}</dt>
                      <dd>+{outcome.record.xp}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <p className="match-card-note">{c.report.careerRewards}</p>
              {outcome.celebrationFame > 0 && (
                <p className="match-celebration-fame" data-testid="celebration-fame">
                  <Icon name="life" className="h-4 w-4 shrink-0" />
                  {format(lifestyleText.celebrations.fame, { fame: outcome.celebrationFame })}
                </p>
              )}
              {outcome.injury && (
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
            </>
          ) : (
            <div className="match-record">
              <strong>{c.report.recordTitle}</strong>
              <p className="match-card-note">{c.report.recordBody}</p>
              <button
                type="button"
                className="button"
                disabled={career.recording}
                aria-busy={career.recording || undefined}
                onClick={career.onRecord}
              >
                {career.recording ? c.report.recording : c.report.record}
              </button>
              {career.recording && (
                <p role="status" className="sr-only">
                  {c.report.recording}
                </p>
              )}
            </div>
          )}
        </section>
        <div className="match-report-side">
          {outcome && outcome.levelsGained > 0 && <LevelUp outcome={outcome} reduced={reduced} />}
          <section className="match-panel" aria-labelledby={`${id}-touchline`}>
            <h3 id={`${id}-touchline`} className="match-card-title is-display">
              {m.reactions}
            </h3>
            <figure className="match-quote">
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
                <blockquote>“{matchLabel(state.managerReactionKey)}”</blockquote>
              </div>
            </figure>
            <figure className="match-quote">
              <span className="match-quote-face is-icon" aria-hidden="true">
                <Icon name="club" className="h-5 w-5" />
              </span>
              <div>
                <figcaption>{m.fans}</figcaption>
                <blockquote>“{matchLabel(state.fanReactionKey)}”</blockquote>
              </div>
            </figure>
          </section>
        </div>
      </div>
      <div className="match-report-row">
        <section className="match-panel match-rating-breakdown" aria-labelledby={`${id}-rating`}>
          <div className="match-card-head">
            <h3 id={`${id}-rating`} className="match-card-title is-display">
              {m.ratingBreakdown}
            </h3>
            <span className="match-breakdown-total">{rating.toFixed(1)}</span>
          </div>
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
          <dl className="match-report-stats">
            {stats.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="match-report-side">
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
          {/* Once the result is recorded, the coach reads it with the decisions before it. */}
          {career?.outcome && world?.career && <CoachAdvice world={world} compact />}
        </div>
      </div>
      <section className="match-panel" aria-labelledby={`${id}-maps`}>
        <div className="match-card-head">
          <h3 id={`${id}-maps`} className="match-card-title is-display">
            {m.maps}
          </h3>
          <span className="match-card-note match-attacking">
            {matchFormat(u.attacking, { club: ownClub.name })}
            <Icon name="arrow" className="h-[18px] w-[18px]" />
          </span>
        </div>
        <MatchMaps
          report={report}
          heat={state.heat}
          events={state.match.events}
          side={side}
          team={ownClub.name}
        />
      </section>
      <div className="match-whats-next" role="group" aria-label={u.whatNext}>
        {career ? (
          career.actions
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
    </div>
  );
}
