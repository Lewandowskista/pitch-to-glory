import { Link, useSearchParams } from 'react-router-dom';
import type { SeasonGoal, TrainingPlan, World } from '../../model/domain';
import {
  acceptGoal,
  adviceDraft,
  coachAdvice,
  declineGoal,
  goalOffer,
  goalProgress,
  type Recommendation,
} from '../../engine/career/coaching';
import { useAppStore } from '../../store';
import { format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { coachingText as k } from '../../i18n/coaching';
import { ui, useEditBlock } from './shared';
import { focusLabel } from './trainingLabels';
import { withSave } from './agenda';
import { samePlan } from './selectors';

const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;

function evidence(world: World, recommendation: Recommendation): string {
  const player = world.players[world.career!.playerId]!;
  switch (recommendation.reason) {
    case 'decisions':
      return format(k.evidence.decisions, {
        family: k.families[recommendation.family!],
        successes: recommendation.successes!,
        attempts: recommendation.attempts!,
        expected: recommendation.expected!,
        attribute: attributeName(recommendation.focus),
      });
    case 'fatigue':
      return format(k.evidence.fatigue, { fatigue: player.fatigue });
    case 'injury':
      return k.evidence.injury;
    default:
      return k.evidence.position;
  }
}

/**
 * The coach's advice: up to two training choices with the evidence behind them. On the
 * Training page `onApply` fills the planner (saving stays the player's choice); elsewhere it
 * links there with the advice ready to apply.
 */
export function CoachAdvice({
  world,
  onApply,
  applied = false,
  compact = false,
  className = '',
}: {
  world: World;
  onApply?: (plan: TrainingPlan) => void;
  applied?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [params] = useSearchParams();
  const block = useEditBlock();
  const advice = coachAdvice(world);
  const draft = adviceDraft(world.career!.training, advice);
  // Advice the saved plan already follows needs no button.
  const following = samePlan(draft, world.career!.training);
  const player = world.players[world.career!.playerId]!;
  const position = (c.positions[player.primaryPosition] ?? player.primaryPosition).toLowerCase();
  const first = advice.recommendations[0];
  const basis =
    first?.reason === 'injury'
      ? k.basis.injury
      : advice.basis === 'decisions'
        ? format(k.basis.decisions, { count: advice.sample })
        : first?.reason === 'fatigue'
          ? format(k.basis.recovery, { position })
          : format(advice.basis === 'steady' ? k.basis.steady : k.basis.position, {
              count: advice.sample,
              position,
            });
  return (
    <section aria-labelledby="coach-advice-heading" className={`${ui.panel} ${className}`}>
      <h2 id="coach-advice-heading" className={ui.heading}>
        {k.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{basis}</p>
      <ol className="mt-3 grid gap-3">
        {advice.recommendations.map((recommendation, index) => (
          <li key={`${recommendation.focus}:${index}`} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-bold">{focusLabel(recommendation.focus)}</p>
              {!compact && <p className="text-sm text-muted">{evidence(world, recommendation)}</p>}
            </div>
          </li>
        ))}
      </ol>
      {advice.basis === 'decisions' && !compact && (
        <p className="mt-3 text-xs text-muted">{k.caveat}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {following && !applied ? (
          <p className="text-sm font-semibold text-muted">{k.already}</p>
        ) : onApply ? (
          <button
            type="button"
            className="button secondary"
            disabled={Boolean(block)}
            onClick={() => onApply(draft)}
          >
            {k.apply}
          </button>
        ) : (
          <Link
            className="text-button -ml-3"
            to={withSave('/career/training?advice=1', params.get('save'))}
          >
            {k.open}
          </Link>
        )}
        {applied && <p className="text-sm font-semibold text-accent">{k.applied}</p>}
      </div>
    </section>
  );
}

const goalText = (goal: Pick<SeasonGoal, 'kind' | 'target' | 'attribute'>) =>
  format(k.goal.kinds[goal.kind], {
    target: goal.target,
    attribute: goal.attribute ? attributeName(goal.attribute) : '',
  });

/** The season's development goal: an offer to accept or turn down, then fixed progress. */
export function SeasonGoalCard({ world, className = '' }: { world: World; className?: string }) {
  const block = useEditBlock();
  const coaching = world.career!.coaching;
  const goal = coaching?.goal?.season === world.date.season ? coaching.goal : null;
  const offer = goal ? null : goalOffer(world);
  const last = coaching?.history.at(-1);
  const act = (action: (current: World) => World) => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(action(current));
  };
  return (
    <section aria-labelledby="season-goal-heading" className={`${ui.panel} ${className}`}>
      <h2 id="season-goal-heading" className={ui.heading}>
        {k.goal.title}
      </h2>
      {goal ? (
        <GoalProgress world={world} goal={goal} />
      ) : offer ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-muted">{k.goal.offer}</p>
          <p className="font-display text-2xl leading-tight">{goalText(offer)}</p>
          <p className="mt-1 text-sm text-muted">{k.goal.why[offer.kind]}</p>
          {block && <p className="mt-2 text-xs text-muted">{block}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="button"
              disabled={Boolean(block)}
              onClick={() => act(acceptGoal)}
            >
              {k.goal.accept}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={Boolean(block)}
              onClick={() => act(declineGoal)}
            >
              {k.goal.decline}
            </button>
          </div>
        </div>
      ) : (
        <p className={`${ui.muted} mt-3`}>
          {coaching?.declinedSeason === world.date.season ? k.goal.declined : k.goal.none}
        </p>
      )}
      {last && (
        <p className="mt-3 text-xs text-muted">
          {format(k.goal.last, {
            goal: goalText(last),
            result: last.completed
              ? k.goal.completed
              : format(k.goal.missed, { value: last.achieved, target: last.target }),
          })}
        </p>
      )}
    </section>
  );
}

function GoalProgress({ world, goal }: { world: World; goal: SeasonGoal }) {
  const value = goalProgress(world, goal);
  const share = Math.min(100, Math.round((value / goal.target) * 100));
  const label = format(k.goal.progress[goal.kind], { value, target: goal.target });
  const done = value >= goal.target;
  return (
    <div className="mt-3">
      <p className="font-display text-2xl leading-tight">{goalText(goal)}</p>
      <p className="mt-2 text-sm font-semibold">{label}</p>
      <div
        role="progressbar"
        aria-label={k.goal.label}
        aria-valuemin={0}
        aria-valuemax={goal.target}
        aria-valuenow={Math.min(value, goal.target)}
        aria-valuetext={label}
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full ${done ? 'bg-meter-gold' : 'bg-accent'}`}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {done ? k.goal.done : format(k.goal.fixed, { season: goal.season })}
      </p>
    </div>
  );
}

/** The hub's coaching tile: the first piece of advice and the season goal's progress. */
export function CoachTile({ world, className }: { world: World; className: string }) {
  const [params] = useSearchParams();
  const advice = coachAdvice(world);
  const coaching = world.career!.coaching;
  const goal = coaching?.goal?.season === world.date.season ? coaching.goal : null;
  const first = advice.recommendations[0];
  return (
    <section aria-labelledby="coach-tile-heading" className={className}>
      <h2 id="coach-tile-heading" className="text-base font-bold leading-tight">
        {k.title}
      </h2>
      {first && (
        <p className="mt-1 text-sm font-semibold">
          {format(k.tileFocus, { focus: focusLabel(first.focus) })}
        </p>
      )}
      <p className="text-sm text-muted">
        {goal
          ? `${goalText(goal)}: ${format(k.goal.progress[goal.kind], {
              value: goalProgress(world, goal),
              target: goal.target,
            })}`
          : goalOffer(world)
            ? k.goal.waiting
            : k.goal.none}
      </p>
      <div className="mt-auto pt-3">
        <Link
          className="text-button -ml-3 inline-flex items-center gap-1"
          to={withSave('/career/training?advice=1', params.get('save'))}
        >
          {k.tileOpen}
        </Link>
      </div>
    </section>
  );
}
