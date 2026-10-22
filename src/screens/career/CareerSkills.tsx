import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
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
import { skillEffects } from '../../engine/match/decisions';
import type { Career, Player, Skill, SkillBranch, World } from '../../model/domain';
import { format, t } from '../../i18n';
import { matchLabel } from '../../i18n/match';
import { careerText as c } from '../../i18n/career';
import { Button, EffectChip, Panel, cx } from '../../ui/kit';
import { CareerPage, filterButton, plural, ui, useEditBlock } from './shared';
import { useUrlDialog } from './useUrlDialog';
import { SkillGlyph } from './skillGlyphs';
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

/** A skill's longevity contribution, in points out of 100. */
const longevityPoints = (id: string) => Math.round((CONFIG.career.longevity.skills[id] ?? 0) * 100);
/** The tiers of the tree with the cost and level each asks for, read from the catalogue. */
const TIERS = [...new Set(SKILLS.map((skill) => skill.tier))]
  .sort((a, b) => a - b)
  .map((tier) => {
    const sample = SKILLS.find((skill) => skill.tier === tier)!;
    return { tier, cost: sample.pointCost, level: sample.minimumLevel };
  });
const TIER_COUNT = TIERS.length;
/** Height of one row in a lane, in the connector drawing's units (one row = 3.5rem). */
const ROW = 56;
const COLUMN = 100;

interface LaneNode {
  skill: Skill;
  row: number;
}
interface Lane {
  branch: SkillBranch;
  nodes: LaneNode[];
  rows: number;
}

/**
 * Place a branch's skills on a grid: one column per tier, and within a tier each skill on the
 * row nearest the average row of its prerequisites (ties go up), so connectors stay short and
 * rarely cross. Tier-one skills keep catalogue order.
 */
function layoutLane(branch: SkillBranch, skills: Skill[]): Lane {
  const rowOf = new Map<string, number>();
  const nodes: LaneNode[] = [];
  for (const { tier } of TIERS) {
    const inTier = skills.filter((skill) => skill.tier === tier);
    const preferred = inTier.map((skill, index) => {
      const rows = skill.prerequisites.flatMap((id) => (rowOf.has(id) ? [rowOf.get(id)!] : []));
      return {
        skill,
        want: rows.length ? rows.reduce((sum, row) => sum + row, 0) / rows.length : index,
        index,
      };
    });
    preferred.sort((a, b) => a.want - b.want || a.index - b.index);
    const taken = new Set<number>();
    const placed: LaneNode[] = [];
    for (const { skill, want } of preferred) {
      let row = 0;
      let best = Infinity;
      for (let candidate = 0; candidate <= skills.length; candidate++) {
        if (taken.has(candidate)) continue;
        const distance = Math.abs(candidate - want);
        if (distance < best - 1e-9) {
          best = distance;
          row = candidate;
        }
      }
      taken.add(row);
      rowOf.set(skill.id, row);
      placed.push({ skill, row });
    }
    nodes.push(...placed.sort((a, b) => a.row - b.row));
  }
  return { branch, nodes, rows: Math.max(1, ...nodes.map((node) => node.row + 1)) };
}

/**
 * Elbow connectors from each prerequisite to the skill it opens, in a 100-units-per-tier
 * drawing scaled to the lane. A link that skips a tier runs along the gap between rows, so it
 * never hides behind the skill in the tier it passes.
 */
function connectors(lane: Lane, career: Career) {
  const at = new Map(lane.nodes.map((node) => [node.skill.id, node]));
  return lane.nodes.flatMap(({ skill, row }) =>
    skill.prerequisites.flatMap((id) => {
      const from = at.get(id);
      if (!from) return [];
      const x1 = (from.skill.tier - 1) * COLUMN + COLUMN / 2;
      const y1 = from.row * ROW + ROW / 2;
      const x2 = (skill.tier - 1) * COLUMN + COLUMN / 2;
      const y2 = row * ROW + ROW / 2;
      const turn = (skill.tier - 1) * COLUMN;
      let d: string;
      if (skill.tier - from.skill.tier <= 1) d = `M${x1} ${y1}H${turn}V${y2}H${x2}`;
      else {
        const below = Math.min(from.row, row) + 1;
        const channel = (below < lane.rows ? below : Math.min(from.row, row)) * ROW;
        d = `M${x1} ${y1}H${from.skill.tier * COLUMN - 6}V${channel}H${turn}V${y2}H${x2}`;
      }
      return [{ key: `${id}>${skill.id}`, d, on: career.skills.includes(id) }];
    }),
  );
}

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
            : kind === 'longevity'
              ? longevityPoints(id)
              : kind === 'foot'
                ? percent(1 - CONFIG.match.foot.weak)
                : 0;
  return format(c.skills.systemic[kind], { value });
}

const NODE: Record<SkillState, string> = {
  unlocked: 'border border-accent bg-accent text-on-accent',
  available: 'border-2 border-gold bg-art-gold text-ink ring-3 ring-gold/40',
  locked: 'border border-line bg-surface text-muted',
  unavailable: 'border border-dashed border-muted bg-surface-soft text-muted',
};
const MARK: Record<SkillState, string> = {
  unlocked: 'bg-on-accent/20 text-on-accent',
  available: 'bg-gold text-on-gold',
  locked: 'bg-surface-soft text-muted',
  unavailable: 'border border-dashed border-muted text-muted',
};
const LEGEND_MARK: Record<SkillState, string> = { ...MARK, unlocked: 'bg-accent text-on-accent' };
const CHIP: Record<SkillState, string> = {
  unlocked: 'bg-accent text-on-accent',
  available: 'border-2 border-gold bg-art-gold text-gold-ink',
  locked: 'border border-line bg-surface-soft text-muted',
  unavailable: 'border border-dashed border-muted text-muted',
};
const SYMBOL: Record<SkillState, string> = {
  unlocked: '✓',
  available: '+',
  locked: '•',
  unavailable: '–',
};
const STATES: SkillState[] = ['unlocked', 'available', 'locked', 'unavailable'];

export default function CareerSkills() {
  return (
    <CareerPage title={c.titles.skills} description={c.skills.body}>
      {(context) => (
        <SkillTree world={context.world} career={context.career} player={context.player} />
      )}
    </CareerPage>
  );
}

/** Move focus to the nearest skill in the arrow's direction, as the tree is drawn. */
function nearest(from: HTMLElement, all: HTMLElement[], key: string): HTMLElement | undefined {
  if (key === 'Home') return all[0];
  if (key === 'End') return all.at(-1);
  const box = from.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  let best: HTMLElement | undefined;
  let score = Infinity;
  for (const other of all) {
    if (other === from) continue;
    const rect = other.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    const [main, cross] =
      key === 'ArrowRight'
        ? [dx, dy]
        : key === 'ArrowLeft'
          ? [-dx, dy]
          : key === 'ArrowDown'
            ? [dy, dx]
            : [-dy, dx];
    if (main <= 4) continue;
    const value = main + Math.abs(cross) * 2;
    if (value < score) {
      score = value;
      best = other;
    }
  }
  return best;
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
  const lanes = useMemo(
    () =>
      SKILL_BRANCHES.map((branch) =>
        layoutLane(
          branch,
          SKILLS.filter((skill) => skill.branch === branch),
        ),
      ).filter(({ nodes }) =>
        nodes.some(({ skill }) => skill.for === 'all' || (skill.for === 'keeper') === keeper),
      ),
    [keeper],
  );
  // One branch at a time, or all of them (the default); the choice is kept in the URL.
  const branch = params.get('branch');
  const shown = lanes.some((lane) => lane.branch === branch)
    ? lanes.filter((lane) => lane.branch === branch)
    : lanes;
  const selectedId =
    SKILL_BY_ID[params.get('skill') ?? ''] &&
    shown.some(({ nodes }) => nodes.some(({ skill }) => skill.id === params.get('skill')))
      ? params.get('skill')!
      : shown[0]!.nodes[0]!.skill.id;
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
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const all = Array.from(tree.current?.querySelectorAll<HTMLButtonElement>('[data-skill]') ?? []);
    const target = nearest(event.currentTarget, all, event.key);
    if (!target) return;
    setFocusId(target.dataset.skill!);
    target.focus();
  };
  // One node in the tab order: the last focused one while it is shown, else the selection.
  const rovingId = shown.some(({ nodes }) => nodes.some(({ skill }) => skill.id === focusId))
    ? focusId
    : selectedId;
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
  const points = career.skillPoints;
  return (
    <div className="flex flex-wrap items-start gap-5">
      <section
        aria-label={c.titles.skills}
        className={cx(ui.panel, '@container min-w-0 flex-[1_1_30rem]')}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid min-w-0 flex-[1_1_17.5rem] gap-2.5">
            <p className="text-[0.8125rem] text-muted max-[700px]:hidden">{c.skills.keyboard}</p>
            <ul
              aria-label={c.skills.legend}
              className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs font-bold"
            >
              {STATES.filter((state) => state !== 'unavailable' || keeper).map((state) => (
                <li key={state} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cx(
                      'grid h-5.5 w-5.5 place-items-center rounded-full text-xs font-extrabold',
                      LEGEND_MARK[state],
                    )}
                  >
                    {SYMBOL[state]}
                  </span>
                  {c.skills.states[state]}
                </li>
              ))}
            </ul>
          </div>
          <div
            className={cx(
              'flex shrink-0 flex-col items-center rounded-control px-5 py-2',
              points ? 'bg-gold text-on-gold' : 'bg-surface-soft text-muted',
            )}
          >
            <span className="text-[0.6875rem] font-extrabold tracking-[0.1em] uppercase">
              {c.skills.points}
            </span>
            <strong
              className="font-display text-[2.75rem] leading-[0.9] font-normal"
              data-testid="skill-points"
            >
              {points}
            </strong>
          </div>
        </div>
        <div role="group" aria-label={c.skills.branchFilter} className={cx('mt-4', ui.filters)}>
          {[null, ...lanes.map((lane) => lane.branch)].map((id) => {
            const pressed = id === null ? shown.length === lanes.length : branch === id;
            return (
              <button
                key={id ?? 'all'}
                type="button"
                aria-pressed={pressed}
                onClick={() => showBranch(id)}
                className={filterButton(pressed)}
              >
                {id === null ? c.skills.allBranches : c.branches[id]}
              </button>
            );
          })}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        {/* Tier headers: what each column costs and from which level (wide trees only). */}
        <div
          aria-hidden="true"
          className="mt-5 hidden px-3 @min-[34rem]:grid"
          style={{ gridTemplateColumns: `repeat(${TIER_COUNT}, minmax(0, 1fr))` }}
        >
          {TIERS.map(({ tier, cost, level }) => (
            <div key={tier} className="px-1.5">
              <div className="text-xs font-extrabold tracking-[0.12em] uppercase">
                {format(c.skills.tierHeading, { tier })}
              </div>
              <div className="text-xs text-muted">{format(c.skills.tierCost, { cost, level })}</div>
            </div>
          ))}
        </div>
        <div ref={tree} className="mt-3 grid gap-3">
          {shown.map((lane) => {
            const unlocked = lane.nodes.filter(({ skill }) =>
              career.skills.includes(skill.id),
            ).length;
            return (
              <div
                key={lane.branch}
                role="group"
                aria-labelledby={`branch-${lane.branch}`}
                className="rounded-control bg-surface-soft px-3 pt-2.5 pb-2"
              >
                <div className="flex items-baseline justify-between gap-3 px-1.5 pb-1">
                  <h3
                    id={`branch-${lane.branch}`}
                    className="font-display text-[1.375rem] leading-none font-normal tracking-[0.02em]"
                  >
                    {c.branches[lane.branch]}
                  </h3>
                  <span className="text-xs font-semibold text-muted">
                    {format(c.skills.laneCount, { count: unlocked, total: lane.nodes.length })}
                  </span>
                </div>
                <div className="relative">
                  <svg
                    viewBox={`0 0 ${TIER_COUNT * COLUMN} ${lane.rows * ROW}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                    className="pointer-events-none absolute inset-0 hidden h-full w-full @min-[34rem]:block"
                  >
                    {connectors(lane, career).map((edge) => (
                      <path
                        key={edge.key}
                        d={edge.d}
                        fill="none"
                        className={edge.on ? 'stroke-accent' : 'stroke-muted'}
                        strokeOpacity={edge.on ? 1 : 0.4}
                        strokeWidth={edge.on ? 3 : 2}
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                  <ol
                    className="relative grid gap-1.5 @min-[34rem]:gap-0 @min-[34rem]:[grid-template-columns:repeat(var(--tiers),minmax(0,1fr))] @min-[34rem]:[grid-template-rows:repeat(var(--rows),3.5rem)]"
                    style={{ '--rows': lane.rows, '--tiers': TIER_COUNT } as CSSProperties}
                  >
                    {lane.nodes.map(({ skill, row }, index) => {
                      const state = skillState(world, skill.id);
                      const newTier =
                        index === 0 || lane.nodes[index - 1]!.skill.tier !== skill.tier;
                      const isSelected = skill.id === selectedId;
                      return (
                        <li
                          key={skill.id}
                          className="relative z-[1] flex min-w-0 flex-col @min-[34rem]:[grid-column:var(--col)] @min-[34rem]:[grid-row:var(--row)] @min-[34rem]:justify-center @min-[34rem]:px-1.5 @min-[34rem]:py-1.5"
                          style={{ '--col': skill.tier, '--row': row + 1 } as CSSProperties}
                        >
                          {newTier && (
                            <span
                              aria-hidden="true"
                              className="mt-1 mb-0.5 text-xs font-bold tracking-[0.12em] text-muted uppercase @min-[34rem]:hidden"
                            >
                              {format(c.skills.tierHeading, { tier: skill.tier })} ·{' '}
                              {format(c.skills.tierCost, {
                                cost: skill.pointCost,
                                level: skill.minimumLevel,
                              })}
                            </span>
                          )}
                          <m.button
                            type="button"
                            data-skill={skill.id}
                            tabIndex={skill.id === rovingId ? 0 : -1}
                            aria-pressed={isSelected}
                            aria-label={format(c.skills.nodeLabel, {
                              name: skillName(skill.id),
                              tier: skill.tier,
                              state: c.skills.states[state],
                              cost: plural(
                                skill.pointCost,
                                c.common.skillPoint,
                                c.common.skillPoints,
                              ),
                            })}
                            onKeyDown={move}
                            onFocus={() => setFocusId(skill.id)}
                            onClick={() => select(skill.id)}
                            animate={
                              celebrate === skill.id && !reduced
                                ? { scale: [1, 1.12, 1] }
                                : { scale: 1 }
                            }
                            transition={{ duration: 0.45 }}
                            className={cx(
                              'flex min-h-11 w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-[0.8125rem] leading-tight font-bold transition-[box-shadow,transform] hover:-translate-y-px @min-[34rem]:gap-1.5 @min-[34rem]:px-2 @min-[34rem]:text-xs @min-[46rem]:gap-2 @min-[46rem]:px-2.5 @min-[46rem]:text-[0.8125rem]',
                              NODE[state],
                              isSelected && 'outline-2 outline-offset-2 outline-ink',
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cx(
                                'grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full text-xs font-extrabold @min-[34rem]:h-4.5 @min-[34rem]:w-4.5 @min-[46rem]:h-5.5 @min-[46rem]:w-5.5',
                                MARK[state],
                              )}
                            >
                              {SYMBOL[state]}
                            </span>
                            <span className="min-w-0 flex-1 break-words hyphens-auto">
                              {skillName(skill.id)}
                            </span>
                            <span
                              aria-hidden="true"
                              className="shrink-0 text-xs font-semibold opacity-80 @min-[34rem]:hidden"
                            >
                              {format(c.skills.cost, { cost: skill.pointCost })}
                            </span>
                          </m.button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            );
          })}
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
      className="skill-sheet mx-0 mt-auto mb-0 max-h-[88dvh] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-sheet border-0 bg-surface p-0 text-ink shadow-overlay sm:mx-auto sm:max-w-2xl"
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
  const unlocks = UNLOCKED_CHOICES[skill.id] ?? [];
  // What it adds to this build, choice by choice, with the skills already held.
  const boosts = skillEffects(career.skills, skill.id).filter((effect) =>
    unlocks.every((choice) => choice !== effect.choiceId),
  );
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
  const body = (
    <>
      {onClose && (
        <button type="button" className="text-button -mt-2.5 -ml-3 self-start" onClick={onClose}>
          <span aria-hidden="true">← </span>
          {c.skills.backToTree}
        </button>
      )}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cx(
            'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full',
            state === 'unlocked'
              ? 'bg-field text-gold shadow-[inset_0_0_0_3px_var(--color-gold)]'
              : 'bg-surface-soft text-accent',
          )}
        >
          <SkillGlyph branch={skill.branch} />
        </span>
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-bold text-accent">
            {c.branches[skill.branch]} · {format(c.skills.tier, { tier: skill.tier })}
          </p>
          <h2
            id="skill-detail-heading"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-6 font-display text-[2.25rem] leading-[0.95] font-normal break-words focus:outline-none sm:text-[2.75rem]"
          >
            {skillName(skill.id)}
          </h2>
        </div>
      </div>
      <span
        className={cx(
          'inline-flex min-h-7 items-center gap-1.5 self-start rounded-full px-3 text-xs font-extrabold',
          CHIP[state],
        )}
      >
        <span aria-hidden="true">{SYMBOL[state]}</span>
        {c.skills.states[state]}
      </span>
      <p className="text-[0.9375rem]">{c.skillBodies[skill.id]}</p>
      <dl className="grid gap-3.5 text-sm">
        {(boosts.length > 0 || unlocks.length > 0 || systemic || longevityPoints(skill.id) > 0) && (
          <div>
            <dt className="text-[0.8125rem] font-bold text-muted">{c.skills.effects}</dt>
            {boosts.length > 0 && (
              <dd className="mt-1">
                {career.skills.includes(skill.id) ? c.skills.boostsOwned : c.skills.boostsNext}
                <ul className="mt-1 grid gap-0.5">
                  {boosts.map((effect) => (
                    <li key={effect.choiceId} className="tabular-nums">
                      {format(
                        effect.path === 'odds' ? c.skills.effectOdds : c.skills.effectImpact,
                        {
                          choice: choiceName(effect.choiceId),
                          before: effect.before.toFixed(2),
                          after: effect.after.toFixed(2),
                        },
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
            )}
            {unlocks.map((choice) => (
              <dd key={choice} className="mt-1 font-extrabold text-accent">
                {format(c.skills.unlocksChoice, { choice: choiceName(choice) })}
              </dd>
            ))}
            {systemic && <dd className="mt-1">{systemic}</dd>}
            {longevityPoints(skill.id) > 0 &&
              SYSTEMIC_SKILLS[skill.id as keyof typeof SYSTEMIC_SKILLS] !== 'longevity' && (
                <dd className="mt-1">
                  {format(c.skills.longevity, { value: longevityPoints(skill.id) })}
                </dd>
              )}
          </div>
        )}
        <div>
          <dt className="text-[0.8125rem] font-bold text-muted">{c.skills.bonuses}</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(skill.attributeBonuses).map(([key, value]) => (
              <EffectChip key={key} value={value} label={attributeName(key)} />
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-bold text-muted">{c.skills.prerequisites}</dt>
          <dd className="mt-1">
            {skill.prerequisites.length ? (
              <ul className="grid gap-1">
                {skill.prerequisites.map((id) => {
                  const done = career.skills.includes(id);
                  return (
                    <li key={id} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cx(
                          'grid h-5 w-5 place-items-center rounded-full text-[0.6875rem] font-extrabold',
                          done ? LEGEND_MARK.unlocked : LEGEND_MARK.locked,
                        )}
                      >
                        {done ? SYMBOL.unlocked : SYMBOL.locked}
                      </span>
                      {skillName(id)}
                      <span className="sr-only">
                        : {c.skills.states[done ? 'unlocked' : 'locked']}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              c.skills.noPrerequisites
            )}
          </dd>
        </div>
      </dl>
      <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-sm">
        <span className="font-bold">
          {skill.pointCost === 1
            ? c.skills.costLongOne
            : format(c.skills.costLong, { cost: skill.pointCost })}
        </span>
        <span className="text-muted">
          {format(c.skills.minimumLevel, { level: skill.minimumLevel })}
        </span>
      </p>
      {reasons.length > 0 && (
        <ul className="grid gap-1 rounded-control bg-surface-soft px-3.5 py-3 text-[0.8125rem]">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {block && state === 'available' && (
        <p className="rounded-control bg-surface-soft p-3 text-sm">{block}</p>
      )}
      {state !== 'unlocked' && state !== 'unavailable' && (
        <>
          <Button
            size="lg"
            block
            disabled={state !== 'available' || Boolean(block)}
            onClick={onUnlock}
          >
            {c.skills.unlock}
          </Button>
          {state === 'available' && (
            <p className="-mt-1 text-center text-xs text-muted">{c.skills.permanent}</p>
          )}
        </>
      )}
    </>
  );
  if (onClose)
    return (
      <aside
        aria-labelledby="skill-detail-heading"
        className="flex flex-col gap-3.5 p-panel sm:p-panel-lg"
      >
        {body}
      </aside>
    );
  return (
    <Panel
      as="aside"
      aria-labelledby="skill-detail-heading"
      className="sticky top-6 flex w-[19rem] shrink-0 flex-col gap-3.5 min-[1440px]:w-[22.5rem]"
    >
      {body}
    </Panel>
  );
}
