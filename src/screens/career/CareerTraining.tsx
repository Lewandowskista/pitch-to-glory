import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { adviceDraft, coachAdvice } from '../../engine/career/coaching';
import { CoachAdvice, SeasonGoalCard } from './CoachAdvice';
import { useAppStore } from '../../store';
import { CONFIG } from '../../engine/config';
import { renderAvatar, clubDress } from '../../engine/assets/avatar';
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
import { errorText, format, t } from '../../i18n';
import { persistence } from '../../persistence/lazy';
import { errorCode } from '../../persistence/errors';
import { careerText as c } from '../../i18n/career';
import { Artwork } from '../../ui/Artwork';
import { Button, CardTitle, Chip, EffectChip, Panel, StatTile, cx } from '../../ui/kit';
import { CareerPage, plural, ui, useEditBlock } from './shared';
import { POSITIONS, samePlan } from './selectors';
import { PHONE_QUERY, usePhone } from './usePhone';

const T = CONFIG.career.training;
const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const intensities = ['low', 'normal', 'high'] as const;
type Intensity = TrainingSession['intensity'];
type FocusKind = 'group' | 'single' | 'position' | 'recovery' | 'opponent';

const KIND_ICON: Record<FocusKind, string> = {
  group: 'M4 4H10V10H4ZM14 4H20V10H14ZM4 14H10V20H4ZM14 14H20V20H14Z',
  single: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 8A4 4 0 1 0 12 16A4 4 0 1 0 12 8M12 11.5V12.5',
  position:
    'M12 21S5 14 5 9.5A7 7 0 0 1 19 9.5C19 14 12 21 12 21ZM12 7A2.5 2.5 0 1 0 12 12A2.5 2.5 0 1 0 12 7',
  recovery: 'M5 19Q5 6 19 5Q18 19 5 19ZM5 19L13 11',
  opponent: 'M2 12S6 5 12 5S22 12 22 12S18 19 12 19S2 12 2 12ZM12 9A3 3 0 1 0 12 15A3 3 0 1 0 12 9',
};
/** Sessions that ignore intensity: recovery, and studying the next opponent (review phase 4). */
const fixedIntensity = (focus: TrainingFocus) => focus === 'recovery' || focus === 'opponent';

function focusKind(focus: TrainingFocus): FocusKind {
  if (focus === 'recovery') return 'recovery';
  if (focus === 'opponent') return 'opponent';
  if (isPositionFocus(focus)) return 'position';
  return (TRAINING_GROUPS as readonly string[]).includes(focus) ? 'group' : 'single';
}
const kindName = (kind: FocusKind) =>
  kind === 'group'
    ? c.training.groups
    : kind === 'single'
      ? c.training.single
      : kind === 'position'
        ? c.training.positions
        : kind === 'opponent'
          ? c.training.opponent
          : c.training.recovery;

function sessionFatigue(focus: TrainingFocus, intensity: Intensity): number {
  return focus === 'recovery'
    ? T.fatigue.recovery
    : focus === 'opponent'
      ? T.fatigue.opponent
      : T.fatigue[intensity];
}

function TrainingActionsPortal({ phone, children }: { phone: boolean; children: ReactNode }) {
  // The page transition's transform creates a containing block for fixed descendants.
  // Put the phone action bar at the document level so it follows the actual viewport.
  return phone ? createPortal(children, document.body) : children;
}

function revealTrainingControl(target: HTMLElement, bar: HTMLElement | null) {
  if (!bar || bar.contains(target) || !window.matchMedia(PHONE_QUERY).matches) return;
  const visible = target.closest('label') ?? target;
  if (visible.getBoundingClientRect().bottom > bar.getBoundingClientRect().top)
    visible.scrollIntoView({ block: 'center', behavior: 'auto' });
}

export default function CareerTraining() {
  return (
    <CareerPage title={c.titles.training} description={c.training.body}>
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
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1.5 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-control bg-accent-soft text-accent"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path
            d={KIND_ICON[focusKind(value)]}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as TrainingFocus)}
        className="min-h-12 w-full min-w-0 rounded-control border border-line bg-surface pr-3 pl-12 text-sm font-bold text-ink"
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
        {allowRecovery && (
          <optgroup label={c.training.opponent}>
            <option value="opponent">{c.training.opponentFocus}</option>
          </optgroup>
        )}
      </select>
    </div>
  );
}

function FocusDescription({ player, focus }: { player: Player; focus: TrainingFocus }) {
  const kind = <span className="font-bold text-ink">{kindName(focusKind(focus))} · </span>;
  if (focus === 'recovery')
    return (
      <>
        {kind}
        {c.training.recoveryBody}
      </>
    );
  if (focus === 'opponent')
    return (
      <>
        {kind}
        {format(c.training.opponentBody, {
          percent: Math.round((1 - CONFIG.match.prepared) * 100),
        })}
      </>
    );
  if (isPositionFocus(focus)) {
    const position = focus.slice('position:'.length) as Position;
    const familiarity =
      player.secondaryPositions.find((entry) => entry.position === position)?.familiarity ?? 0;
    return (
      <>
        {kind}
        {format(c.training.positionBody, { position: c.positions[position]!, value: familiarity })}
      </>
    );
  }
  return (
    <>
      {kind}
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
  const [params] = useSearchParams();
  // Arriving from advice elsewhere (`?advice=1`) starts from the advised draft; the saved plan
  // stays in force until the player saves.
  const draft = useAppStore((s) => s.trainingDraft);
  const saving = useAppStore((s) => s.trainingSaving);
  const [applied, setApplied] = useState(false);
  const plan = draft?.plan ?? career.training;
  const setPlan = (next: TrainingPlan | ((current: TrainingPlan) => TrainingPlan)) =>
    useAppStore.getState().editTrainingDraft(typeof next === 'function' ? next(plan) : next);
  const adviceOpened = useRef(false);
  useEffect(() => {
    if (adviceOpened.current || params.get('advice') !== '1') return;
    adviceOpened.current = true;
    if (useAppStore.getState().trainingDraft) return;
    const advised = adviceDraft(career.training, coachAdvice(world));
    if (!samePlan(advised, career.training)) {
      useAppStore.getState().editTrainingDraft(advised);
      setApplied(true);
    }
  }, [params, career.training, world]);
  const actionBar = useRef<HTMLElement>(null);
  const phone = usePhone();
  // The bar rests above the tab bar. `--tabbar` is the bar's nominal height; large text can
  // make the real bar taller, so the measured height wins once it is known.
  const [barBottom, setBarBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const nav = document.querySelector('.bottom-nav');
    if (!phone || !nav) return;
    const update = () => setBarBottom(nav.getBoundingClientRect().height + 12);
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    update();
    return () => observer.disconnect();
  }, [phone]);
  useLayoutEffect(() => {
    if (!phone) return;
    const reveal = () => {
      const target = document.activeElement;
      if (target instanceof HTMLElement && target.closest('[data-training-planner]'))
        revealTrainingControl(target, actionBar.current);
    };
    // Text scaling can move a control that already has focus beneath the action bar.
    const observer = new ResizeObserver(reveal);
    observer.observe(document.documentElement);
    if (actionBar.current) observer.observe(actionBar.current);
    reveal();
    return () => observer.disconnect();
  }, [phone, barBottom]);
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
        .filter((session) => !fixedIntensity(session.focus))
        .map((session) => T.injuryRisk[session.intensity]),
      ...(effective.extra ? [T.injuryRisk.extra] : []),
    ].reduce((product, value) => product * (1 - value), 1);
  // Distinct attributes this plan builds each week (positions and recovery build none).
  const growing = new Set(
    [
      ...plan.sessions.map((session) => session.focus),
      ...(effective.extra ? [effective.extra.focus] : []),
    ].flatMap((focus) => focusAttributes(player, focus)),
  ).size;
  // How many parts of the plan differ from the saved one: each session, and the extra one.
  const changes =
    plan.sessions.filter((session, index) => {
      const saved = career.training.sessions[index];
      return !saved || saved.focus !== session.focus || saved.intensity !== session.intensity;
    }).length +
    (samePlan(
      { sessions: [], extra: effective.extra },
      { sessions: [], extra: career.training.extra },
    )
      ? 0
      : 1);
  const updateSession = (index: number, patch: Partial<TrainingSession>) => {
    setStatus('');
    setPlan((current) => ({
      ...current,
      sessions: current.sessions.map((session, i) =>
        i === index ? { ...session, ...patch } : session,
      ),
    }));
  };
  const save = async () => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().editTrainingDraft(effective);
    try {
      const api = await persistence();
      if (await api.saveTrainingDraft()) {
        setStatus(c.training.saved);
        setApplied(false);
      } else {
        setStatus(errorText(useAppStore.getState().saveError ?? 'storage'));
      }
    } catch (error) {
      const code = errorCode(error);
      useAppStore.getState().setSaveStatus('error', code);
      setStatus(errorText(code));
    }
  };
  const percent = (value: number) => (value * 100).toFixed(value < 0.01 ? 1 : 0);
  const noMentor = Boolean(plan.extra && !mentor);
  const fatigueText = `${fatigue > 0 ? '+' : ''}${Math.round(fatigue)}`;
  // Why saving is or is not available, next to the button.
  const saveHint = block
    ? ''
    : noMentor
      ? c.training.noMentor
      : dirty
        ? phone
          ? plural(changes || 1, c.training.unsavedCountOne, c.training.unsavedCount)
          : c.training.unsaved
        : status || c.training.noChanges;
  const reset = () => {
    setStatus('');
    setPlan(defaultTrainingPlan(player.primaryPosition));
  };
  return (
    <div
      data-training-planner
      className="grid grid-cols-[minmax(0,1fr)] gap-5 max-[700px]:pb-40"
      onFocusCapture={(event) => {
        revealTrainingControl(event.target as HTMLElement, actionBar.current);
      }}
    >
      {career.injury && (
        <p className="flex items-start gap-2.5 rounded-control border border-danger/40 bg-danger-soft px-4 py-3.5 text-sm font-bold text-danger">
          {c.training.injuredNote}
        </p>
      )}
      {block && <p className="rounded-control bg-surface-soft p-3 text-sm">{block}</p>}
      {/* Phones: the week's cost first, as three numbers; wider screens keep it in the bar. */}
      <Panel aria-labelledby="weekly-heading" padding="compact" className="min-[701px]:hidden">
        <h2 id="weekly-heading" className="text-[0.9375rem] font-extrabold">
          {c.training.weekly}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile size="sm" valueFirst label={c.training.fatigueTile} value={fatigueText} />
          <StatTile
            size="sm"
            valueFirst
            label={c.training.injuryTile}
            value={`${percent(risk)}%`}
          />
          <StatTile size="sm" valueFirst label={c.training.growTile} value={growing} />
        </div>
        <p className="mt-2.5 text-xs text-muted">{c.training.summaryNote}</p>
      </Panel>
      <div className="flex flex-wrap gap-4">
        {plan.sessions.map((session, index) => {
          const saved = career.training.sessions[index];
          const changed =
            !saved || saved.focus !== session.focus || saved.intensity !== session.intensity;
          return (
            <Panel
              key={index}
              aria-labelledby={`session-${index}`}
              padding="compact"
              className={cx(
                'flex min-w-0 flex-[1_1_17.5rem] flex-col gap-4',
                changed && 'ring-2 ring-gold',
              )}
            >
              <div className="flex items-center justify-between gap-2.5">
                <CardTitle id={`session-${index}`}>
                  {format(c.training.session, { number: index + 1 })}
                </CardTitle>
                {changed && (
                  <Chip tone="gold-soft">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-meter-gold" />
                    {c.training.changed}
                  </Chip>
                )}
              </div>
              <div>
                <label
                  htmlFor={`focus-${index}`}
                  className="mb-1.5 block text-[0.8125rem] font-bold"
                >
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
              <fieldset disabled={fixedIntensity(session.focus)} className="mt-auto min-w-0">
                <legend className="mb-1.5 text-[0.8125rem] font-bold">
                  {c.training.intensity}
                </legend>
                <div
                  className={cx(
                    'grid grid-cols-3 gap-1 rounded-control bg-surface-soft p-1',
                    fixedIntensity(session.focus) && 'opacity-50',
                  )}
                >
                  {intensities.map((intensity) => (
                    <label
                      key={intensity}
                      className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-chip px-1 text-center text-[0.8125rem] leading-tight font-extrabold has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
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
                    : session.focus === 'opponent'
                      ? format(c.training.intensityOpponent, { fatigue: T.fatigue.opponent })
                      : format(c.training.intensityEffects, {
                          gain: (T.gain[session.intensity] / T.gain.normal).toFixed(1),
                          fatigue: T.fatigue[session.intensity],
                          risk: percent(T.injuryRisk[session.intensity]),
                        })}
                </p>
              </fieldset>
            </Panel>
          );
        })}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-labelledby="extra-heading"
          className="flex min-w-0 flex-[1.6_1_30rem] flex-col gap-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle id="extra-heading">{c.training.extra}</CardTitle>
              <p className="mt-1 text-xs text-muted">
                {format(c.training.extraEffects, {
                  fatigue: T.fatigue.extra,
                  risk: percent(T.injuryRisk.extra),
                })}
              </p>
            </div>
            <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 text-sm font-bold">
              <span className="max-sm:sr-only">{c.training.extraEnable}</span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={Boolean(plan.extra)}
                onChange={(event) => {
                  setStatus('');
                  setPlan((current) => ({
                    ...current,
                    extra: event.target.checked ? { focus: extraFocus, mentorId: '' } : null,
                  }));
                }}
              />
            </label>
          </div>
          <p className="max-w-[35rem] text-sm text-muted">
            {format(c.training.extraBody, { bonus: Math.round(T.mentorBonus * 100) })}
          </p>
          {plan.extra && (
            <div className="flex flex-wrap gap-4">
              <div className="min-w-0 flex-[1_1_13.75rem]">
                <label htmlFor="extra-focus" className="mb-1.5 block text-[0.8125rem] font-bold">
                  {c.training.focus}
                </label>
                <FocusSelect
                  id="extra-focus"
                  player={player}
                  value={plan.extra.focus}
                  allowRecovery={false}
                  onChange={(focus) => {
                    setStatus('');
                    setExtraFocus(focus);
                    setPlan((current) =>
                      current.extra ? { ...current, extra: { ...current.extra, focus } } : current,
                    );
                  }}
                />
              </div>
              <MentorCard world={world} player={player} mentor={mentor} focus={plan.extra.focus} />
            </div>
          )}
          {mentorLeft && (
            <p className="text-sm font-semibold text-danger">{c.training.mentorLeft}</p>
          )}
        </Panel>
        <CoachAdvice
          world={world}
          applied={applied}
          className="flex-[1_1_21.25rem]"
          onApply={(next) => {
            setPlan(next);
            setStatus('');
            setApplied(true);
          }}
        />
      </div>
      <TrainingActionsPortal phone={phone}>
        <section
          ref={actionBar}
          data-testid="training-actions"
          style={phone && barBottom !== null ? { bottom: barBottom } : undefined}
          aria-label={c.training.weekly}
          className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-panel border border-line bg-surface p-3 shadow-surface sm:px-5.5 sm:py-4.5 max-[700px]:fixed max-[700px]:inset-x-3 max-[700px]:bottom-[calc(var(--tabbar)+0.75rem)] max-[700px]:z-25 max-[700px]:gap-2 max-[700px]:shadow-overlay"
        >
          <div className="min-w-0 flex-[1_1_17.5rem] max-[700px]:basis-full">
            <p className="text-[0.8125rem] font-bold text-muted max-[700px]:hidden">
              {c.training.weekly}
            </p>
            <p className="text-sm max-[700px]:hidden">
              <span className="font-extrabold">
                {format(c.training.weeklyFatigue, { value: fatigueText })}
              </span>{' '}
              · {format(c.training.weeklyRisk, { value: percent(risk) })}
            </p>
            <p
              id="save-hint"
              role="status"
              className={cx(
                'mt-0.5 flex items-center gap-2 text-[0.8125rem] font-bold',
                dirty || status ? 'text-accent' : 'text-muted',
              )}
            >
              {dirty && !saving && (
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-meter-gold" />
              )}
              {saving ? t.app.saving : saveHint}
            </p>
          </div>
          {/* One group, so the actions wrap together rather than one at a time. */}
          <div className="flex flex-wrap items-center gap-3 max-[700px]:w-full max-[700px]:flex-nowrap max-[700px]:gap-2">
            <Button
              variant="secondary"
              className="max-[700px]:hidden"
              disabled={Boolean(block)}
              onClick={reset}
            >
              {c.training.reset}
            </Button>
            <Button
              variant="text"
              className="min-[701px]:hidden"
              disabled={Boolean(block)}
              onClick={reset}
            >
              {c.training.resetShort}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(block) || !draft}
              onClick={() => {
                useAppStore.getState().discardTrainingDraft();
                setStatus('');
                setApplied(false);
              }}
            >
              <span className="max-[700px]:hidden">{c.training.discard}</span>
              <span className="min-[701px]:hidden">{c.training.discardShort}</span>
            </Button>
            <Button
              icon={phone ? 'check' : undefined}
              className="max-[700px]:flex-1"
              disabled={Boolean(block) || !dirty || noMentor}
              aria-describedby="save-hint"
              onClick={() => void save()}
            >
              {c.training.save}
            </Button>
          </div>
        </section>
      </TrainingActionsPortal>
      <div className="flex flex-wrap items-start gap-5">
        <TrainingReport career={career} phone={phone} />
        <Progress career={career} player={player} keeper={keeper} />
        <SeasonGoalCard world={world} className="flex-[1_1_17.5rem]" />
      </div>
    </div>
  );
}

function MentorCard({
  world,
  player,
  mentor,
  focus,
}: {
  world: World;
  player: Player;
  mentor: Player | null;
  focus: TrainingFocus;
}) {
  const portrait = useMemo(
    () =>
      mentor
        ? renderAvatar(
            mentor.avatar,
            world.date.season - mentor.birthSeason,
            clubDress(mentor.clubId ? world.clubs[mentor.clubId] : null),
          )
        : '',
    [mentor, world],
  );
  const rating = mentor ? mentorRating(mentor, player, focus) : 0;
  const lead = mentor && !isPositionFocus(focus) ? rating - mentorRating(player, player, focus) : 0;
  return (
    <div className="min-w-0 flex-[1_1_13.75rem] rounded-control bg-surface-soft p-3.5">
      <p className="text-[0.8125rem] font-bold text-muted">{c.training.mentor}</p>
      {mentor ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Artwork
            svg={portrait}
            alt={format(c.wizard.previewAlt, { age: world.date.season - mentor.birthSeason })}
            className="h-13 w-13 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <strong className="block text-[0.9375rem] break-words">{mentor.name}</strong>
            <span className="text-xs text-muted">
              {format(c.training.mentorValue, {
                position: c.positions[mentor.primaryPosition]!,
                rating,
              })}
            </span>
          </div>
          {lead > 0 && <EffectChip value={lead} label={c.training.mentorLead} />}
        </div>
      ) : (
        <p className="mt-2 text-sm">{c.training.noMentor}</p>
      )}
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

function TrainingReport({ career, phone }: { career: Career; phone: boolean }) {
  const report = career.lastTraining;
  const gainsCount = report ? Object.keys(report.gains).length : 0;
  const week = report
    ? format(c.training.reportWeek, { season: report.season, week: report.week })
    : '';
  const content = !report ? (
    <p className={cx(ui.muted, 'mt-3')}>{c.training.reportEmpty}</p>
  ) : (
    <>
      <dl className="mt-3.5 flex flex-wrap gap-x-8 gap-y-3.5 text-sm">
        <div className="basis-full">
          <dt className="text-[0.8125rem] font-bold text-muted">{c.training.gains}</dt>
          <dd className="mt-1">
            {gainsCount ? (
              <>
                <p className="font-bold">
                  {plural(gainsCount, c.training.gainsCountOne, c.training.gainsCount)}
                </p>
                <details className="mt-0.5">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-accent underline underline-offset-4">
                    {c.training.details}
                  </summary>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(report.gains)
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, value]) => (
                        <li key={key} className={ui.chip}>
                          {attributeName(key)}{' '}
                          {format(c.training.gainValue, { value: value.toFixed(2) })}
                        </li>
                      ))}
                  </ul>
                </details>
              </>
            ) : (
              c.training.none
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-bold text-muted">{c.training.improved}</dt>
          <dd className={cx('mt-0.5 font-extrabold', report.improved.length > 0 && 'text-accent')}>
            {report.improved.length
              ? report.improved.map(attributeName).join(', ')
              : c.training.none}
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-bold text-muted">{c.training.declined}</dt>
          <dd className="mt-0.5 font-bold">
            {report.declined.length
              ? report.declined.map(attributeName).join(', ')
              : c.training.none}
          </dd>
        </div>
        {report.familiarity && (
          <div className="basis-full">
            <dt className="text-[0.8125rem] font-bold text-muted">{c.training.positions}</dt>
            <dd className="mt-0.5 font-bold">
              {format(c.training.familiarityGain, {
                position: c.positions[report.familiarity.position]!,
                value: report.familiarity.familiarity,
              })}
            </dd>
          </div>
        )}
      </dl>
      <dl className="mt-3.5 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-3 text-sm">
        <div>
          <dt className="text-[0.8125rem] font-bold text-muted">{c.training.fatigueChange}</dt>
          <dd className="font-display text-[2rem] leading-[1.1]">
            {report.fatigue > 0 ? '+' : ''}
            {report.fatigue}
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-bold text-muted">{c.training.injury}</dt>
          <dd className={cx('mt-1 font-bold', report.injuryId && 'text-danger')}>
            {report.injuryId
              ? (c.injuries[career.injury?.kind ?? ''] ?? c.hub.trainingInjury)
              : c.training.none}
          </dd>
        </div>
      </dl>
    </>
  );
  // Phones: the report folds behind its headline, so the plan stays the focus.
  if (phone && report)
    return (
      <Panel as="div" padding="none" className="min-w-0 flex-[1.3_1_23.75rem] px-panel-compact">
        <details className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-2.5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-extrabold">{c.training.report}</span>
              <span className="block text-xs text-muted">
                {format(c.training.reportSummary, {
                  week,
                  progress: plural(gainsCount, c.training.gainsCountOne, c.training.gainsCount),
                })}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4.5 w-4.5 shrink-0 transition-transform group-open:rotate-180"
            >
              <path
                d="M6 9L12 15L18 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div className="pb-panel-compact">{content}</div>
        </details>
      </Panel>
    );
  return (
    <Panel aria-labelledby="report-heading" className="min-w-0 flex-[1.3_1_23.75rem]">
      <CardTitle id="report-heading">{c.training.report}</CardTitle>
      {report && <p className="mt-0.5 text-xs text-muted">{week}</p>}
      {content}
    </Panel>
  );
}

function Progress({ career, player, keeper }: { career: Career; player: Player; keeper: boolean }) {
  const progress = Object.entries(career.trainingProgress)
    .filter(([key, value]) => value > 0 && (trainableAttributes(player) as string[]).includes(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, keeper ? 7 : 8);
  if (!progress.length) return null;
  return (
    <Panel aria-labelledby="progress-heading" className="min-w-0 flex-[1_1_18.75rem]">
      <CardTitle id="progress-heading">{c.training.progressTitle}</CardTitle>
      <ul className="mt-3.5 grid gap-2.5">
        {progress.map(([key, value]) => {
          const share = Math.round(value * 100);
          return (
            <li key={key}>
              <div className="mb-1 flex justify-between text-[0.8125rem]">
                <span className="font-bold">{attributeName(key)}</span>
                <span className="text-muted tabular-nums">{share}%</span>
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
                className="h-2 overflow-hidden rounded-full bg-track"
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
    </Panel>
  );
}
