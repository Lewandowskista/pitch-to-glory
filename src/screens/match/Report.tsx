import type { MatchSession } from '../../engine/match';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { Footballer } from './Shared';
import MatchMaps from './Maps';
import { motion, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';

export function Report({
  session,
  onAgain,
  onNew,
}: {
  session: MatchSession;
  onAgain: () => void;
  onNew: () => void;
}) {
  const { setup, state } = session;
  const report = state.report!;
  const systemReduced = useReducedMotion();
  const reduced = useAppStore((store) => store.settings.reducedMotion) || systemReduced;
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
          <div>
            <strong>+{report.xp}</strong>
            <span>{m.earnedXp}</span>
          </div>
          <div>
            <strong>
              {report.fameDelta >= 0 ? '+' : ''}
              {report.fameDelta}
            </strong>
            <span>{m.fame}</span>
          </div>
        </motion.div>
        <p className="muted">{m.friendlyRewards}</p>
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
        <button className="button" onClick={onAgain}>
          {m.again}
        </button>
        <button className="button secondary" onClick={onNew}>
          {m.newFixture}
        </button>
      </div>
    </div>
  );
}
