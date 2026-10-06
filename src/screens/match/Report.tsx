import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MatchSession } from '../../engine/match';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import { CONFIG } from '../../engine/config';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { careerText as c } from '../../i18n/career';
import { lifestyleText } from '../../i18n/lifestyle';
import { format } from '../../i18n';
import { Footballer } from './Shared';
import MatchMaps from './Maps';
import { motion, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';
import { audio } from '../../audio';

/** Career fixtures: the granted XP once recorded, or the action that records it. */
export interface CareerReport {
  outcome: CareerMatchOutcome | null;
  recording: boolean;
  onRecord: () => void;
  actions: ReactNode;
}

function LevelUp({ outcome, reduced }: { outcome: CareerMatchOutcome; reduced: boolean }) {
  const level = outcome.previousLevel + outcome.levelsGained;
  useEffect(() => audio.play('levelUp'), []);
  return (
    <motion.div
      role="status"
      data-testid="level-up"
      className="relative mt-5 overflow-hidden rounded-panel bg-gold p-5 text-[#1d3127] shadow-surface"
      initial={reduced ? false : { opacity: 0, scale: 0.7, rotate: -2 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.35 }}
    >
      {!reduced && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgb(255_255_255/0.55)_50%,transparent_70%)]"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.1, delay: 0.7, ease: 'easeInOut' }}
        />
      )}
      <p className="relative font-display text-[2.6rem] leading-none tracking-wide">
        {c.report.levelUp}
      </p>
      <p className="relative mt-1 font-semibold">{format(c.report.levelUpBody, { level })}</p>
      <p className="relative text-sm">
        {format(c.report.levelPoints, {
          attribute: outcome.levelsGained * CONFIG.career.attributePointsPerLevel,
          skill: outcome.levelsGained * CONFIG.career.skillPointsPerLevel,
        })}
      </p>
      <div className="relative mt-3 flex flex-wrap gap-2">
        <Link
          className="inline-flex min-h-11 items-center rounded-control bg-[#1d3127] px-4 text-sm font-bold text-white"
          to="/career/profile"
        >
          {c.report.allocate}
        </Link>
        <Link
          className="inline-flex min-h-11 items-center rounded-control border border-[#1d3127] px-4 text-sm font-bold"
          to="/career/skills"
        >
          {c.report.unlock}
        </Link>
      </div>
    </motion.div>
  );
}

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
  const systemReduced = useReducedMotion();
  const reduced = useAppStore((store) => store.settings.reducedMotion) || Boolean(systemReduced);
  const outcome = career?.outcome ?? null;
  const importance = setup.fixture?.importance ?? 1;
  const opposition = outcome && report.xp ? outcome.record.xp / (report.xp * importance) : 1;
  return (
    <div className="match-report">
      <h2>{m.report}</h2>
      <section className="match-panel match-report-hero">
        <span className="match-eyebrow">{m.headline}</span>
        <h2>{matchLabel(report.headlineId)}</h2>
        <Footballer player={setup.players[setup.selectedPlayerId]!} season={setup.season} />
        <motion.div
          className="match-rewards"
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div>
            <strong>{report.rating.toFixed(1)}</strong>
            <span>{m.rating}</span>
          </div>
          <div data-testid={outcome ? 'career-xp' : undefined}>
            <strong>+{outcome ? outcome.record.xp : report.xp}</strong>
            <span>{outcome ? c.report.granted : m.earnedXp}</span>
          </div>
          <div>
            <strong>
              {report.fameDelta >= 0 ? '+' : ''}
              {report.fameDelta}
            </strong>
            <span>{m.fame}</span>
          </div>
        </motion.div>
        {!career ? (
          <p className="muted">{m.friendlyRewards}</p>
        ) : outcome ? (
          <>
            <p className="muted">
              {format(c.report.breakdown, {
                xp: report.xp,
                opposition: `×${opposition.toFixed(2)}`,
                importance: `×${importance.toFixed(2)}`,
              })}
            </p>
            <p className="muted">{c.report.careerRewards}</p>
            {outcome.celebrationFame > 0 && (
              <p className="match-celebration" data-testid="celebration-fame">
                {format(lifestyleText.celebrations.fame, { fame: outcome.celebrationFame })}
              </p>
            )}
            {outcome.levelsGained > 0 && <LevelUp outcome={outcome} reduced={reduced} />}
            {outcome.injury && (
              <div className="mt-4 rounded-control bg-danger-soft p-4 text-danger" role="alert">
                <strong>
                  {format(c.report.injured, {
                    injury: c.injuries[outcome.injury.kind] ?? outcome.injury.kind,
                  })}
                </strong>
                <p className="text-sm">
                  {format(c.report.injuredBody, { weeks: outcome.injury.weeksRemaining })}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="mt-4 rounded-control bg-surface-soft p-4">
            <strong className="block">{c.report.recordTitle}</strong>
            <p className="muted mt-1 text-sm">{c.report.recordBody}</p>
            <button className="button mt-3" disabled={career.recording} onClick={career.onRecord}>
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
      <div className="match-preview">
        <section className="match-panel">
          <h2>{m.ratingBreakdown}</h2>
          <ul className="match-objectives">
            {report.ratingFactors.map((factor) => (
              <li key={factor.labelKey}>
                <span>{matchLabel(factor.labelKey)}</span>
                <strong>
                  {factor.contribution >= 0 ? '+' : ''}
                  {factor.contribution.toFixed(2)}
                </strong>
              </li>
            ))}
            {[
              [m.minutes, state.selectedPlayerMinutes],
              [m.goals, state.stats.goals],
              [m.assists, state.stats.assists],
              [m.passes, `${state.stats.passesCompleted}/${state.stats.passesAttempted}`],
              [m.tackles, state.stats.tackles],
              [m.saves, state.stats.saves],
              [m.errors, state.stats.errors],
            ].map(([name, value]) => (
              <li key={name}>
                <span>{name}</span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="match-panel">
          <h2>{m.objectives}</h2>
          <ul className="match-objectives">
            {report.objectives.map((objective) => (
              <li key={objective.id}>
                <div>
                  {m.objectiveNames[objective.kind]}
                  <small>
                    {matchFormat(m.objectiveProgress, {
                      progress: Math.round(objective.progress * 10) / 10,
                      target: objective.target,
                    })}
                  </small>
                </div>
                <strong>{objective.progress >= objective.target ? m.complete : m.missed}</strong>
              </li>
            ))}
          </ul>
          <h3>{m.reactions}</h3>
          <blockquote>
            <strong>{m.manager}</strong>
            <p>{matchLabel(state.managerReactionKey)}</p>
          </blockquote>
          <blockquote>
            <strong>{m.fans}</strong>
            <p>{matchLabel(state.fanReactionKey)}</p>
          </blockquote>
        </section>
      </div>
      <section className="match-panel">
        <h2>{m.maps}</h2>
        <MatchMaps report={report} />
      </section>
      <div className="match-controls">
        {career ? (
          career.actions
        ) : (
          <>
            <button className="button" onClick={onAgain}>
              {m.again}
            </button>
            <button className="button secondary" onClick={onNew}>
              {m.newFixture}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
