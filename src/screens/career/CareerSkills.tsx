import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { m, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';
import { Dialog } from '../../ui/Dialog';
import { CONFIG } from '../../engine/config';
import {
  SKILLS,
  SKILL_BRANCHES,
  SKILL_BY_ID,
  SYSTEMIC_SKILLS,
} from '../../engine/career/catalogue';
import { skillState, unlockSkill, type SkillState } from '../../engine/career/progression';
import { SITUATIONS } from '../../engine/match/situations';
import { TRAIT_BOOSTS } from '../../engine/match/decisions';
import type { Career, Player, Skill, World } from '../../model/domain';
import { format, t } from '../../i18n';
import { matchLabel } from '../../i18n/match';
import { careerText as c } from '../../i18n/career';
import { CareerPage, filterButton, plural, ui, useEditBlock } from './shared';
import { useUrlDialog } from './useUrlDialog';
import { audio } from '../../audio';

const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const skillName = (id: string) => c.skillNames[id] ?? id;
const choiceName = (id: string) => matchLabel(`match.choice.${id}`);
const percent = (value: number) => Math.round(Math.abs(value) * 100);
/** Tailwind `xl`: the skill detail sits beside the tree and stays in view. */
const SIDE_BY_SIDE = '(min-width: 1280px)';
/** Whether the detail sits beside the tree; narrower screens open it as a sheet. */
function useSideBySide(): boolean {
  return useSyncExternalStore(
    (change) => {
      const list = window.matchMedia(SIDE_BY_SIDE);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => window.matchMedia(SIDE_BY_SIDE).matches,
    () => true,
  );
}

/** Key-moment choices a skill unlocks (choices requiring it as a trait). */
const UNLOCKED_CHOICES: Readonly<Record<string, string[]>> = (() => {
  const result: Record<string, string[]> = {};
  for (const situation of SITUATIONS)
    for (const choice of situation.choices)
      if (choice.requiredTraitId) (result[choice.requiredTraitId] ??= []).push(choice.id);
  return result;
})();

function systemicText(id: string): string | null {
  const kind = SYSTEMIC_SKILLS[id as keyof typeof SYSTEMIC_SKILLS];
  if (!kind) return null;
  const T = CONFIG.career.training;
  const value =
    kind === 'training'
      ? percent(T.professionalSkill - 1)
      : kind === 'fatigue'
        ? percent(1 - T.secondWindSkill)
        : kind === 'injury'
          ? percent(1 - CONFIG.career.injuries.ironManSkill)
          : kind === 'importance'
            ? percent(CONFIG.match.decision.bigGame.skill)
            : 0;
  return format(c.skills.systemic[kind], { value });
}

const stateStyles: Record<SkillState, string> = {
  unlocked: 'border-accent bg-accent text-on-accent',
  available: 'border-gold bg-art-gold text-ink ring-2 ring-gold/60',
  locked: 'border-line bg-surface-soft text-muted',
  unavailable: 'border-dashed border-line bg-transparent text-muted',
};
const stateMark: Record<SkillState, string> = {
  unlocked: '✓',
  available: '+',
  locked: '•',
  unavailable: '–',
};

export default function CareerSkills() {
  return (
    <CareerPage title={c.titles.skills} description={c.skills.body}>
      {(context) => (
        <SkillTree world={context.world} career={context.career} player={context.player} />
      )}
    </CareerPage>
  );
}

function SkillTree({ world, career, player }: { world: World; career: Career; player: Player }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const wide = useSideBySide();
  // The phone sheet's open state lives in the URL, so Back closes it.
  const sheetPushed = useRef(false);
  const dialog = useUrlDialog('unlock');
  const block = useEditBlock();
  const [announcement, setAnnouncement] = useState('');
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const systemReduced = useReducedMotion();
  const reduced = useAppStore((s) => s.settings.reducedMotion) || Boolean(systemReduced);
  const keeper = player.primaryPosition === 'GK';
  const columns = useMemo(
    () =>
      SKILL_BRANCHES.map((branch) => ({
        branch,
        skills: SKILLS.filter((skill) => skill.branch === branch).sort((a, b) => a.tier - b.tier),
      })).filter(({ skills }) =>
        skills.some((skill) => skill.for === 'all' || (skill.for === 'keeper') === keeper),
      ),
    [keeper],
  );
  // One branch at a time, or all of them (the default); the choice is kept in the URL.
  const branch = params.get('branch');
  const shown = columns.some((column) => column.branch === branch)
    ? columns.filter((column) => column.branch === branch)
    : columns;
  const selectedId =
    SKILL_BY_ID[params.get('skill') ?? ''] &&
    shown.some(({ skills }) => skills.some((skill) => skill.id === params.get('skill')))
      ? params.get('skill')!
      : shown[0]!.skills[0]!.id;
  const showBranch = (next: string | null) => {
    const query = new URLSearchParams(params);
    if (next) query.set('branch', next);
    else query.delete('branch');
    query.delete('skill');
    setParams(query, { replace: true });
  };
  const [focusId, setFocusId] = useState(selectedId);
  const tree = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLHeadingElement>(null);
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('skill', id);
    setFocusId(id);
    if (wide) {
      setParams(next, { replace: true });
      return;
    }
    // Narrower screens: the detail opens as a sheet over the tree, beside the choice. The
    // selection is recorded first, so closing the sheet (Back) returns to the same skill.
    setParams(next, { replace: true });
    const sheet = new URLSearchParams(next);
    sheet.set('detail', '1');
    sheetPushed.current = true;
    setParams(sheet);
  };
  const closeSheet = () => {
    if (sheetPushed.current) {
      sheetPushed.current = false;
      navigate(-1);
    } else {
      const next = new URLSearchParams(params);
      next.delete('detail');
      setParams(next, { replace: true });
    }
  };
  const sheetOpen = !wide && params.get('detail') === '1';
  // Focus returns to the skill the sheet described, however it closed (button, Escape, Back).
  const wasOpen = useRef(sheetOpen);
  useEffect(() => {
    if (wasOpen.current && !sheetOpen)
      tree.current
        ?.querySelector<HTMLButtonElement>(`[data-skill="${selectedId}"]`)
        ?.focus({ preventScroll: true });
    wasOpen.current = sheetOpen;
  }, [sheetOpen, selectedId]);
  const move = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const column = shown.findIndex(({ skills }) => skills.some((skill) => skill.id === id));
    const row = shown[column]!.skills.findIndex((skill) => skill.id === id);
    let target: string | undefined;
    if (event.key === 'ArrowDown') target = shown[column]!.skills[row + 1]?.id;
    else if (event.key === 'ArrowUp') target = shown[column]!.skills[row - 1]?.id;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const next = shown[column + (event.key === 'ArrowRight' ? 1 : -1)];
      if (next) target = next.skills[Math.min(row, next.skills.length - 1)]?.id;
    } else if (event.key === 'Home') target = shown[0]!.skills[0]!.id;
    else if (event.key === 'End') target = shown.at(-1)!.skills.at(-1)!.id;
    else return;
    event.preventDefault();
    if (!target) return;
    setFocusId(target);
    tree.current?.querySelector<HTMLButtonElement>(`[data-skill="${target}"]`)?.focus();
  };
  const selected = SKILL_BY_ID[selectedId]!;
  const unlocking = dialog.value ? SKILL_BY_ID[dialog.value] : undefined;
  const confirmUnlock = () => {
    const current = useAppStore.getState().world;
    if (!unlocking || !current || block || skillState(current, unlocking.id) !== 'available') {
      dialog.close();
      return;
    }
    useAppStore.getState().setWorld(unlockSkill(current, unlocking.id));
    audio.play('reward');
    setAnnouncement(format(c.skills.unlocked, { name: skillName(unlocking.id) }));
    setCelebrate(unlocking.id);
    dialog.close();
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-label={c.titles.skills} className={`${ui.panel} self-start`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label={c.skills.branchFilter}
            className={`min-w-0 flex-1 basis-72 ${ui.filters}`}
          >
            {[null, ...columns.map((column) => column.branch)].map((id) => {
              const pressed = id === null ? shown.length === columns.length : branch === id;
              return (
                <button
                  key={id ?? 'all'}
                  aria-pressed={pressed}
                  onClick={() => showBranch(id)}
                  className={filterButton(pressed)}
                >
                  {id === null ? c.skills.allBranches : c.branches[id]}
                </button>
              );
            })}
          </div>
          <div
            className={`flex shrink-0 items-baseline gap-2 rounded-control px-3 py-1.5 ${
              career.skillPoints ? 'bg-gold text-[#1d3127]' : 'bg-surface-soft text-muted'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider">{c.skills.points}</span>
            <strong className="font-display text-2xl leading-none" data-testid="skill-points">
              {career.skillPoints}
            </strong>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">{c.skills.keyboard}</p>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        <div
          ref={tree}
          className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 2xl:grid-cols-4"
        >
          {shown.map(({ branch, skills }) => (
            <div
              key={branch}
              role="group"
              aria-labelledby={`branch-${branch}`}
              className="rounded-control border border-line bg-bg/60 p-3"
            >
              <h3
                id={`branch-${branch}`}
                className="mb-3 font-display text-xl leading-none tracking-wide"
              >
                {c.branches[branch]}
              </h3>
              <ol className="grid gap-2">
                {skills.map((skill, index) => {
                  const state = skillState(world, skill.id);
                  const newTier = index === 0 || skills[index - 1]!.tier !== skill.tier;
                  return (
                    <li key={skill.id}>
                      {newTier && (
                        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-muted">
                          {format(c.skills.tier, { tier: skill.tier })}
                        </span>
                      )}
                      <m.button
                        data-skill={skill.id}
                        tabIndex={skill.id === focusId ? 0 : -1}
                        aria-pressed={skill.id === selectedId}
                        aria-label={format(c.skills.nodeLabel, {
                          name: skillName(skill.id),
                          tier: skill.tier,
                          state: c.skills.states[state],
                          cost: plural(skill.pointCost, c.common.skillPoint, c.common.skillPoints),
                        })}
                        onKeyDown={(event) => move(event, skill.id)}
                        onFocus={() => setFocusId(skill.id)}
                        onClick={() => select(skill.id)}
                        animate={
                          celebrate === skill.id && !reduced
                            ? { scale: [1, 1.12, 1] }
                            : { scale: 1 }
                        }
                        transition={{ duration: 0.45 }}
                        className={`flex min-h-12 w-full items-center gap-2 rounded-control border px-2.5 py-2 text-left text-sm font-semibold transition hover:-translate-y-px ${
                          stateStyles[state]
                        } ${skill.id === selectedId ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/10 text-xs font-bold"
                        >
                          {stateMark[state]}
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">{skillName(skill.id)}</span>
                        <span aria-hidden="true" className="shrink-0 text-xs">
                          {format(c.skills.cost, { cost: skill.pointCost })}
                        </span>
                      </m.button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>
      {wide && (
        <SkillDetail
          world={world}
          career={career}
          skill={selected}
          block={block}
          headingRef={detail}
          onUnlock={() => dialog.open(selected.id)}
        />
      )}
      {sheetOpen && (
        <SkillSheet labelledBy="skill-detail-heading" onClose={closeSheet}>
          <SkillDetail
            world={world}
            career={career}
            skill={selected}
            block={block}
            headingRef={detail}
            onClose={closeSheet}
            onUnlock={() => dialog.open(selected.id)}
          />
        </SkillSheet>
      )}
      {unlocking && (
        <Dialog
          title={format(c.skills.unlockTitle, { name: skillName(unlocking.id) })}
          body={
            unlocking.pointCost === 1
              ? format(c.skills.unlockBodyOne, { name: skillName(unlocking.id) })
              : format(c.skills.unlockBody, {
                  name: skillName(unlocking.id),
                  cost: unlocking.pointCost,
                })
          }
          confirmLabel={c.skills.unlock}
          onClose={dialog.close}
          onConfirm={confirmUnlock}
        />
      )}
    </div>
  );
}

/**
 * Below xl, a skill's detail rises as a sheet over the tree instead of sitting after every
 * branch. Escape, the backdrop, Close and browser Back all close it.
 */
function SkillSheet({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className="mx-0 mt-auto mb-0 max-h-[88dvh] w-full max-w-full rounded-t-[1.25rem] border-0 bg-surface p-0 text-ink shadow-[0_-12px_40px_rgb(0_0_0/0.25)] backdrop:bg-[rgb(8_20_14/0.55)] sm:mx-auto sm:max-w-2xl"
      // Escape closes here and stops, so the shell's Escape shortcut never adds a second "back".
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pb-[env(safe-area-inset-bottom)]">{children}</div>
    </dialog>
  );
}

function SkillDetail({
  world,
  career,
  skill,
  block,
  headingRef,
  onClose,
  onUnlock,
}: {
  world: World;
  career: Career;
  skill: Skill;
  block: string | null;
  headingRef: RefObject<HTMLHeadingElement>;
  /** In the sheet: close it and return to the tree. */
  onClose?: () => void;
  onUnlock: () => void;
}) {
  const state = skillState(world, skill.id);
  const boosts = TRAIT_BOOSTS[skill.id] ?? [];
  const unlocks = UNLOCKED_CHOICES[skill.id] ?? [];
  const systemic = systemicText(skill.id);
  const missing = skill.prerequisites.filter((id) => !career.skills.includes(id));
  const reasons: string[] = [];
  if (state === 'unavailable')
    reasons.push(
      format(c.skills.why.family, {
        family: c.skills.families[skill.for === 'keeper' ? 'keeper' : 'outfield'],
      }),
    );
  if (state === 'locked') {
    if (missing.length)
      reasons.push(format(c.skills.why.prerequisite, { names: missing.map(skillName).join(', ') }));
    if (career.level < skill.minimumLevel)
      reasons.push(format(c.skills.why.level, { level: skill.minimumLevel }));
    if (career.skillPoints < skill.pointCost)
      reasons.push(
        format(c.skills.why.points, { cost: skill.pointCost, points: career.skillPoints }),
      );
  }
  return (
    <aside
      aria-labelledby="skill-detail-heading"
      className={onClose ? 'p-panel sm:p-panel-lg' : `${ui.panel} self-start xl:sticky xl:top-6`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-accent">
          {c.branches[skill.branch]} · {format(c.skills.tier, { tier: skill.tier })}
        </p>
        {onClose && (
          <button className="text-button -mt-2.5 -mr-3 shrink-0" onClick={onClose}>
            {c.skills.backToTree}
          </button>
        )}
      </div>
      <h2
        id="skill-detail-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 scroll-mt-6 font-display text-[2.2rem] leading-none focus:outline-none"
      >
        {skillName(skill.id)}
      </h2>
      <span
        className={`mt-3 inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-bold ${stateStyles[state]}`}
      >
        {c.skills.states[state]}
      </span>
      <p className="mt-3 text-sm">{c.skillBodies[skill.id]}</p>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="text-sm font-semibold text-muted">{c.skills.effects}</dt>
          <dd className="mt-1 grid gap-1">
            {boosts.length > 0 && (
              <p>
                {format(c.skills.boosts, {
                  value: percent(CONFIG.match.decision.traitMultiplier - 1),
                  choices: boosts.map(choiceName).join(', '),
                })}
              </p>
            )}
            {unlocks.map((choice) => (
              <p key={choice} className="font-semibold text-accent">
                {format(c.skills.unlocksChoice, { choice: choiceName(choice) })}
              </p>
            ))}
            {systemic && <p>{systemic}</p>}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">{c.skills.bonuses}</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {Object.entries(skill.attributeBonuses).map(([key, value]) => (
              <span key={key} className={ui.chip}>
                +{value} {attributeName(key)}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">{c.skills.prerequisites}</dt>
          <dd className="mt-1">
            {skill.prerequisites.length ? (
              <ul className="grid gap-1">
                {skill.prerequisites.map((id) => (
                  <li key={id} className="flex items-center gap-2">
                    <span aria-hidden="true">{career.skills.includes(id) ? '✓' : '•'}</span>
                    {skillName(id)}
                    <span className="sr-only">
                      : {c.skills.states[career.skills.includes(id) ? 'unlocked' : 'locked']}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              c.skills.noPrerequisites
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          {skill.pointCost === 1
            ? c.skills.costLongOne
            : format(c.skills.costLong, { cost: skill.pointCost })}
        </span>
        <span>{format(c.skills.minimumLevel, { level: skill.minimumLevel })}</span>
      </p>
      {reasons.length > 0 && (
        <ul className="mt-4 grid gap-1 rounded-control bg-surface-soft p-3 text-sm">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {block && state === 'available' && (
        <p className="mt-4 rounded-control bg-surface-soft p-3 text-sm">{block}</p>
      )}
      {state !== 'unlocked' && state !== 'unavailable' && (
        <button
          className="button mt-5 w-full"
          disabled={state !== 'available' || Boolean(block)}
          onClick={onUnlock}
        >
          {c.skills.unlock}
        </button>
      )}
    </aside>
  );
}
