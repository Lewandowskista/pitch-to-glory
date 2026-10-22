import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { LateCareerStep, SeasonAmbition, World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import {
  ambitionGoal,
  ambitionMeasure,
  applyPreseason,
  preseasonBrief,
  type PreseasonAction,
} from '../../engine/career/preseason';
import { useAppStore } from '../../store';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { preseasonText as p } from '../../i18n/preseason';
import { Button, CardTitle, Panel, cx } from '../../ui/kit';
import { CareerPage, useEditBlock } from './shared';
import { SeasonGoalCard } from './CoachAdvice';
import { ordinal } from './honoursUi';
import { withSave } from './agenda';

/**
 * The preseason briefing (review phase 5, step 5.3): what the manager expects, where the
 * player stands for a place, the season's development target and ambition, and from 31 one
 * late-career step. Every choice stays the player's.
 */
export default function CareerPreseason() {
  return (
    <CareerPage title={p.title} description={p.pageBody}>
      {({ world }) => <Briefing world={world} />}
    </CareerPage>
  );
}

function usePreseason() {
  const block = useEditBlock();
  const [error, setError] = useState('');
  const run = (action: PreseasonAction): boolean => {
    const world = useAppStore.getState().world;
    if (!world?.career || block) return false;
    try {
      useAppStore.getState().setWorld(applyPreseason(world, action));
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '');
      return false;
    }
  };
  return { run, error, block };
}

function Briefing({ world }: { world: World }) {
  const brief = preseasonBrief(world);
  const { run, error, block } = usePreseason();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state =
    world.career!.preseason?.season === world.date.season ? world.career!.preseason : undefined;
  const manager = world.managers[brief.club.managerId]?.name ?? '';
  const ahead = brief.competition.aheadIds
    .map((id) => world.players[id]?.name)
    .filter(Boolean)
    .join(', ');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 lg:items-start">
      <Panel aria-labelledby="expectations-heading" className="flex flex-col gap-2">
        <CardTitle id="expectations-heading">{p.expectations}</CardTitle>
        {brief.league && (
          <p>
            {format(p.expectedPlace, {
              manager,
              club: brief.club.name,
              place: ordinal(brief.expectedPlace),
              size: brief.leagueSize,
              league: brief.league.name,
            })}
          </p>
        )}
        <p className="font-bold">{format(p.role, { role: p.roles[brief.role] })}</p>
        {brief.deserved !== brief.role && (
          <p className="text-sm text-muted">
            {format(p.deserved, { role: p.roles[brief.deserved] })}
          </p>
        )}
      </Panel>
      <Panel aria-labelledby="competition-heading" className="flex flex-col gap-2">
        <CardTitle id="competition-heading">{p.competition}</CardTitle>
        <p>
          {format(p.slot, {
            position: c.positions[brief.competition.position] ?? brief.competition.position,
            fit: brief.competition.fit,
          })}
        </p>
        <p className="text-sm">
          {brief.competition.inTeam ? p.inTeam : format(p.ahead, { names: ahead || '—' })}
        </p>
        <p className="font-bold">
          {format(p.start, { percent: Math.round(brief.startChance * 100) })}
        </p>
      </Panel>
      <SeasonGoalCard world={world} />
      <Panel aria-labelledby="ambition-heading" className="flex flex-col gap-3">
        <div>
          <CardTitle id="ambition-heading">{p.ambition}</CardTitle>
          <p className="mt-1 text-sm text-muted">{p.ambitionBody}</p>
        </div>
        {state?.ambition ? (
          <p className="font-bold" data-testid="season-ambition">
            {format(p.ambitionChosen, {
              goal: p.goals[ambitionGoal(world, state.ambition)],
              value: ambitionMeasure(world, state.ambition),
              target: state.ambition.target,
            })}
          </p>
        ) : (
          <ul className="grid gap-2">
            {brief.ambitions.map((ambition) => (
              <AmbitionOption
                key={ambition.kind}
                world={world}
                ambition={ambition}
                disabled={Boolean(block)}
                onChoose={() => run({ type: 'ambition', kind: ambition.kind })}
              />
            ))}
          </ul>
        )}
      </Panel>
      {brief.late.length > 0 && (
        <Panel aria-labelledby="late-heading" className="flex flex-col gap-3 lg:col-span-2">
          <div>
            <CardTitle id="late-heading">{p.late}</CardTitle>
            <p className="mt-1 text-sm text-muted">{p.lateBody}</p>
          </div>
          {state?.late ? (
            <p className="font-bold">
              {format(p.taken, { step: stepName(state.late, brief.late) })}
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {brief.late.map((entry) => (
                <li
                  key={entry.step}
                  className={cx(
                    'flex flex-col gap-2 rounded-control border border-line p-3.5',
                    entry.blocked && 'opacity-70',
                  )}
                >
                  <strong>{stepName(entry.step, brief.late)}</strong>
                  <span className="text-sm text-muted">
                    {entry.blocked
                      ? p.blocked[entry.blocked]
                      : format(p.stepBodies[entry.step], {
                          retrain: CONFIG.career.preseason.retrain,
                        })}
                  </span>
                  {!entry.blocked && (
                    <Button
                      variant="secondary"
                      className="self-start"
                      disabled={Boolean(block)}
                      onClick={() => run({ type: 'late', step: entry.step })}
                    >
                      {p.takeStep}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        {!state?.done && (
          <Button
            variant="play"
            disabled={Boolean(block)}
            onClick={() => {
              if (run({ type: 'done' })) navigate(withSave('/career', params.get('save')));
            }}
          >
            {p.done}
          </Button>
        )}
        <Link className="text-button" to={withSave('/career', params.get('save'))}>
          {c.report.hub}
        </Link>
        {(error || block) && (
          <p className="basis-full text-sm font-semibold text-danger">{error || block}</p>
        )}
      </div>
    </div>
  );
}

function stepName(step: LateCareerStep, late: ReturnType<typeof preseasonBrief>['late']): string {
  const position = late.find((entry) => entry.step === 'new-position')?.position;
  return format(p.steps[step], {
    position: position ? (c.positions[position] ?? position) : '',
  });
}

function AmbitionOption({
  world,
  ambition,
  disabled,
  onChoose,
}: {
  world: World;
  ambition: SeasonAmbition;
  disabled: boolean;
  onChoose: () => void;
}) {
  const goal = ambitionGoal(world, ambition);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3.5">
      <span className="min-w-0">
        <strong className="block first-letter:uppercase">{p.goals[goal]}</strong>
        <span className="text-sm text-muted">
          {format(p.goalTargets[goal], { target: ambition.target })}
        </span>
      </span>
      <Button variant="secondary" disabled={disabled} onClick={onChoose}>
        {p.choose}
      </Button>
    </li>
  );
}
