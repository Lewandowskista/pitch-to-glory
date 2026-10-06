import { useState } from 'react';
import { useAppStore } from '../../store';
import { CONFIG } from '../../engine/config';
import {
  TRAINING_GROUPS,
  defaultTrainingPlan,
  focusAttributes,
  isPositionFocus,
  mentorFor,
  validFocus,
} from '../../engine/career/training';
import { attributeValue, trainableAttributes } from '../../engine/career/progression';
import type {
  Career,
  Player,
  Position,
  TrainingFocus,
  TrainingPlan,
  TrainingSession,
  World,
} from '../../model/domain';
import { format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { CareerPage, PlayerPortrait, ui, useEditBlock } from './shared';
import { POSITIONS, samePlan, withTraining } from './selectors';

const T = CONFIG.career.training;
const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const intensities = ['low', 'normal', 'high'] as const;
type Intensity = TrainingSession['intensity'];

function sessionFatigue(focus: TrainingFocus, intensity: Intensity): number {
  return focus === 'recovery' ? T.fatigue.recovery : T.fatigue[intensity];
}

export default function CareerTraining() {
  return (
    <CareerPage eyebrow={c.training.eyebrow} title={c.training.title} description={c.training.body}>
      {(context) => (
        <TrainingPlanner world={context.world} career={context.career} player={context.player} />
      )}
    </CareerPage>
  );
}

function FocusSelect({
  id,
  player,
  value,
  onChange,
  allowRecovery,
}: {
  id: string;
  player: Player;
  value: TrainingFocus;
  onChange: (focus: TrainingFocus) => void;
  allowRecovery: boolean;
}) {
  const groups = TRAINING_GROUPS.filter((group) => validFocus(player, group));
  const positions = POSITIONS.filter((position) =>
    validFocus(player, `position:${position}` as TrainingFocus),
  );
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as TrainingFocus)}
      className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink"
    >
      <optgroup label={c.training.groups}>
        {groups.map((group) => (
          <option key={group} value={group}>
            {c.training.groupNames[group]}
          </option>
        ))}
      </optgroup>
      <optgroup label={c.training.single}>
        {trainableAttributes(player).map((key) => (
          <option key={key} value={key}>
            {attributeName(key)}
          </option>
        ))}
      </optgroup>
      <optgroup label={c.training.positions}>
        {positions.map((position: Position) => (
          <option key={position} value={`position:${position}`}>
            {format(c.training.positionFocus, { position: c.positions[position]! })}
          </option>
        ))}
      </optgroup>
      {allowRecovery && (
        <optgroup label={c.training.recovery}>
          <option value="recovery">{c.training.recovery}</option>
        </optgroup>
      )}
    </select>
  );
}

function FocusDescription({ player, focus }: { player: Player; focus: TrainingFocus }) {
  if (focus === 'recovery') return <>{c.training.recoveryBody}</>;
  if (isPositionFocus(focus)) {
    const position = focus.slice('position:'.length) as Position;
    const familiarity =
      player.secondaryPositions.find((entry) => entry.position === position)?.familiarity ?? 0;
    return (
      <>
        {format(c.training.positionBody, { position: c.positions[position]!, value: familiarity })}
      </>
    );
  }
  return (
    <>
      {format(c.training.focusBody, {
        attributes: focusAttributes(player, focus).map(attributeName).join(', '),
      })}
    </>
  );
}

function TrainingPlanner({
  world,
  career,
  player,
}: {
  world: World;
  career: Career;
  player: Player;
}) {
  const block = useEditBlock();
  const [plan, setPlan] = useState<TrainingPlan>(() => structuredClone(career.training));
  const [extraFocus, setExtraFocus] = useState<TrainingFocus>(
    career.training.extra?.focus ?? (player.primaryPosition === 'GK' ? 'goalkeeping' : 'technical'),
  );
  const [status, setStatus] = useState('');
  const mentor = plan.extra ? mentorFor(world, plan.extra.focus) : mentorFor(world, extraFocus);
  const savedMentor = career.training.extra
    ? world.players[career.training.extra.mentorId]
    : undefined;
  const mentorLeft = Boolean(
    career.training.extra && (!savedMentor || savedMentor.clubId !== player.clubId),
  );
  // The plan as it will be saved: the extra session is led by the best mentor available now.
  const effective: TrainingPlan = {
    sessions: plan.sessions,
    extra: plan.extra && mentor ? { focus: plan.extra.focus, mentorId: mentor.id } : null,
  };
  const dirty = !samePlan(effective, career.training);
  const keeper = player.primaryPosition === 'GK';
  const secondWind = career.skills.includes('second-wind');
  const fatigue = [
    ...plan.sessions.map((session) => sessionFatigue(session.focus, session.intensity)),
    ...(effective.extra ? [T.fatigue.extra] : []),
  ].reduce((sum, value) => sum + (value > 0 && secondWind ? value * T.secondWindSkill : value), 0);
  const risk =
    1 -
    [
      ...plan.sessions
        .filter((session) => session.focus !== 'recovery')
        .map((session) => T.injuryRisk[session.intensity]),
      ...(effective.extra ? [T.injuryRisk.extra] : []),
    ].reduce((product, value) => product * (1 - value), 1);
  const updateSession = (index: number, patch: Partial<TrainingSession>) => {
    setStatus('');
    setPlan((current) => ({
      ...current,
      sessions: current.sessions.map((session, i) =>
        i === index ? { ...session, ...patch } : session,
      ),
    }));
  };
  const save = () => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(withTraining(current, effective));
    setPlan(structuredClone(effective));
    setStatus(c.training.saved);
  };
  const percent = (value: number) => (value * 100).toFixed(value < 0.01 ? 1 : 0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
        {career.injury && (
          <p className="rounded-control border border-danger/40 bg-danger-soft p-4 text-sm font-semibold text-danger">
            {c.training.injuredNote}
          </p>
        )}
        {block && <p className="rounded-control bg-surface-soft p-3 text-sm">{block}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          {plan.sessions.map((session, index) => (
            <section
              key={index}
              aria-labelledby={`session-${index}`}
              className={`${ui.panel} flex flex-col gap-4`}
            >
              <h2 id={`session-${index}`} className={ui.heading}>
                {format(c.training.session, { number: index + 1 })}
              </h2>
              <div>
                <label htmlFor={`focus-${index}`} className="mb-1.5 block">
                  {c.training.focus}
                </label>
                <FocusSelect
                  id={`focus-${index}`}
                  player={player}
                  value={session.focus}
                  allowRecovery
                  onChange={(focus) => updateSession(index, { focus })}
                />
                <p className="mt-2 text-xs text-muted">
                  <FocusDescription player={player} focus={session.focus} />
                </p>
              </div>
              <fieldset disabled={session.focus === 'recovery'}>
                <legend className="mb-1.5 text-sm font-semibold">{c.training.intensity}</legend>
                <div className="grid grid-cols-3 gap-1 rounded-control bg-surface-soft p-1">
                  {intensities.map((intensity) => (
                    <label
                      key={intensity}
                      className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-[0.6rem] px-1 text-center text-xs leading-tight font-bold has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`intensity-${index}`}
                        value={intensity}
                        checked={session.intensity === intensity}
                        onChange={() => updateSession(index, { intensity })}
                      />
                      {c.training.intensities[intensity]}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {session.focus === 'recovery'
                    ? format(c.training.intensityRecovery, { fatigue: T.fatigue.recovery })
                    : format(c.training.intensityEffects, {
                        gain: (T.gain[session.intensity] / T.gain.normal).toFixed(1),
                        fatigue: T.fatigue[session.intensity],
                        risk: percent(T.injuryRisk[session.intensity]),
                      })}
                </p>
              </fieldset>
            </section>
          ))}
        </div>
        <section aria-labelledby="extra-heading" className={ui.panel}>
          <h2 id="extra-heading" className={ui.heading}>
            {c.training.extra}
          </h2>
          <p className={`${ui.muted} mt-2 max-w-prose`}>
            {format(c.training.extraBody, { bonus: Math.round(T.mentorBonus * 100) })}
          </p>
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={Boolean(plan.extra)}
              onChange={(event) => {
                setStatus('');
                setPlan((current) => ({
                  ...current,
                  extra: event.target.checked ? { focus: extraFocus, mentorId: '' } : null,
                }));
              }}
            />
            {c.training.extraEnable}
          </label>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="extra-focus" className="mb-1.5 block">
                {c.training.focus}
              </label>
              <FocusSelect
                id="extra-focus"
                player={player}
                value={plan.extra?.focus ?? extraFocus}
                allowRecovery={false}
                onChange={(focus) => {
                  setStatus('');
                  setExtraFocus(focus);
                  setPlan((current) =>
                    current.extra ? { ...current, extra: { ...current.extra, focus } } : current,
                  );
                }}
              />
              <p className="mt-2 text-xs text-muted">
                {format(c.training.extraEffects, {
                  fatigue: T.fatigue.extra,
                  risk: percent(T.injuryRisk.extra),
                })}
              </p>
            </div>
            <div className="rounded-control bg-surface-soft p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                {c.training.mentor}
              </p>
              {mentor ? (
                <div className="mt-2 flex items-center gap-3">
                  <PlayerPortrait
                    player={mentor}
                    age={world.date.season - mentor.birthSeason}
                    className="h-12 w-12 shrink-0"
                  />
                  <div className="min-w-0">
                    <strong className="block truncate">{mentor.name}</strong>
                    <span className="text-xs text-muted">
                      {format(c.training.mentorValue, {
                        position: c.positions[mentor.primaryPosition]!,
                        rating: mentorRating(mentor, player, plan.extra?.focus ?? extraFocus),
                      })}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm">{c.training.noMentor}</p>
              )}
            </div>
          </div>
          {mentorLeft && <p className="mt-3 text-sm text-danger">{c.training.mentorLeft}</p>}
        </section>
        <section
          aria-label={c.training.weekly}
          className="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-surface p-4 shadow-surface sm:p-5"
        >
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              {c.training.weekly}
            </p>
            <p className="text-sm">
              {format(c.training.weeklyFatigue, {
                value: `${fatigue > 0 ? '+' : ''}${Math.round(fatigue)}`,
              })}{' '}
              · {format(c.training.weeklyRisk, { value: percent(risk) })}
            </p>
            <p role="status" className="mt-1 text-sm font-semibold text-accent">
              {status || (dirty ? c.training.unsaved : '')}
            </p>
          </div>
          <button
            className="button secondary"
            disabled={Boolean(block)}
            onClick={() => {
              setStatus('');
              setPlan(defaultTrainingPlan(player.primaryPosition));
            }}
          >
            {c.training.reset}
          </button>
          <button
            className="button"
            disabled={Boolean(block) || !dirty || Boolean(plan.extra && !mentor)}
            onClick={save}
          >
            {c.training.save}
          </button>
        </section>
      </div>
      <TrainingReport career={career} player={player} keeper={keeper} />
    </div>
  );
}

function mentorRating(mentor: Player, player: Player, focus: TrainingFocus): number {
  const keys = isPositionFocus(focus)
    ? focusAttributes(mentor, 'technical')
    : focusAttributes(player, focus);
  if (!keys.length) return 0;
  return Math.round(keys.reduce((sum, key) => sum + attributeValue(mentor, key), 0) / keys.length);
}

function TrainingReport({
  career,
  player,
  keeper,
}: {
  career: Career;
  player: Player;
  keeper: boolean;
}) {
  const report = career.lastTraining;
  const progress = Object.entries(career.trainingProgress)
    .filter(([key, value]) => value > 0 && (trainableAttributes(player) as string[]).includes(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, keeper ? 7 : 8);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
      <section aria-labelledby="report-heading" className={ui.panel}>
        <h2 id="report-heading" className={ui.heading}>
          {c.training.report}
        </h2>
        {!report ? (
          <p className={`${ui.muted} mt-3`}>{c.training.reportEmpty}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              {format(c.training.reportWeek, { season: report.season, week: report.week })}
            </p>
            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">
                  {c.training.gains}
                </dt>
                <dd className="mt-1">
                  {Object.keys(report.gains).length ? (
                    <ul className="flex flex-wrap gap-2">
                      {Object.entries(report.gains)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, value]) => (
                          <li key={key} className={ui.chip}>
                            {attributeName(key)}{' '}
                            {format(c.training.gainValue, { value: value.toFixed(2) })}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    c.training.none
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">
                  {c.training.improved}
                </dt>
                <dd className="mt-1 font-semibold">
                  {report.improved.length
                    ? report.improved.map(attributeName).join(', ')
                    : c.training.none}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">
                  {c.training.declined}
                </dt>
                <dd className="mt-1 font-semibold">
                  {report.declined.length
                    ? report.declined.map(attributeName).join(', ')
                    : c.training.none}
                </dd>
              </div>
              {report.familiarity && (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-muted">
                    {c.training.positions}
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {format(c.training.familiarityGain, {
                      position: c.positions[report.familiarity.position]!,
                      value: report.familiarity.familiarity,
                    })}
                  </dd>
                </div>
              )}
            </dl>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">
                  {c.training.fatigueChange}
                </dt>
                <dd className="font-display text-2xl leading-tight">
                  {report.fatigue > 0 ? '+' : ''}
                  {report.fatigue}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">
                  {c.training.injury}
                </dt>
                <dd className={`font-semibold ${report.injuryId ? 'text-danger' : ''}`}>
                  {report.injuryId
                    ? (c.injuries[career.injury?.kind ?? ''] ?? c.hub.trainingInjury)
                    : c.training.none}
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>
      {progress.length > 0 && (
        <section aria-labelledby="progress-heading" className={ui.panel}>
          <h2 id="progress-heading" className={ui.heading}>
            {c.training.progressTitle}
          </h2>
          <ul className="mt-4 grid gap-3">
            {progress.map(([key, value]) => {
              const share = Math.round(value * 100);
              return (
                <li key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{attributeName(key)}</span>
                    <span className="text-muted">{share}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={format(c.training.progressLabel, {
                      attribute: attributeName(key),
                      value: share,
                    })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={share}
                    className="h-2 overflow-hidden rounded-full bg-surface-soft"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
