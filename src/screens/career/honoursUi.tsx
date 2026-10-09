import { useState } from 'react';
import { promiseMilestone } from './storiesUi';
import type { AmbitionId, ManagerPromise } from '../../model/domain';
import { ambitionName } from './ambitionText';
import { useAppStore } from '../../store';
import { applyHonoursAction, type HonoursAction } from '../../engine/career/honours';
import type { ChronicleEntry, World } from '../../model/domain';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { careerText as c } from '../../i18n/career';
import { money } from './marketUi';
import { useEditBlock } from './shared';
import { audio } from '../../audio';

export function useHonoursAction() {
  const block = useEditBlock();
  const [error, setError] = useState('');
  const run = (action: HonoursAction): boolean => {
    const world = useAppStore.getState().world;
    if (!world?.career || block) return false;
    try {
      useAppStore.getState().setWorld(applyHonoursAction(world, action));
      setError('');
      return true;
    } catch (cause) {
      audio.play('error');
      setError(cause instanceof Error ? cause.message : '');
      return false;
    }
  };
  return { run, error, block };
}

/** English ordinal: 1st, 2nd, 3rd, 11th, 21st, 92nd. */
export function ordinal(value: number): string {
  const tens = value % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th');
  return `${value}${suffix}`;
}

/** `count` with the singular or plural noun phrase, e.g. "1 goal" / "4 goals". */
export function counted(count: number, forms: { one: string; many: string }): string {
  return format(count === 1 ? forms.one : forms.many, { count });
}

const GLYPHS = {
  trophy:
    'M8 4H16V9A4 4 0 0 1 8 9ZM8 6H4V7A3 3 0 0 0 8 10M16 6H20V7A3 3 0 0 1 16 10M12 13V17M9 17H15V21H9Z',
  ball: 'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M12 8L16 11L14 16H10L8 11ZM12 8V2M16 11L22 9M14 16L18 20M10 16L6 20M8 11L2 9',
  boot: 'M5 4H11V11L18 13Q21 14 21 17V18H5ZM7 18V21M12 18V21M17 18V21',
  star: 'M12 3L14.6 8.6L20.7 9.3L16.2 13.4L17.4 19.4L12 16.4L6.6 19.4L7.8 13.4L3.3 9.3L9.4 8.6Z',
  medal:
    'M8 2L12 9L16 2M12 9A6 6 0 1 0 12 21A6 6 0 1 0 12 9M12 12.5L13 14.6L15.2 14.9L13.6 16.4L14 18.6L12 17.5L10 18.6L10.4 16.4L8.8 14.9L11 14.6Z',
  transfer: 'M4 8H18M14 4L18 8L14 12M20 16H6M10 12L6 16L10 20',
  injury: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 8V16M8 12H16',
  flag: 'M5 21V4M5 4H17L14.5 8L17 12H5',
  record: 'M12 3L21 12L12 21L3 12ZM12 8L16 12L12 16L8 12Z',
  rival: 'M13 2L4 14H11L10 22L20 9H13Z',
  fame: 'M3 10V14H7L14 19V5L7 10ZM17 9Q19 12 17 15M19.5 7Q23 12 19.5 17',
  moment: 'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M10 8L16 12L10 16Z',
  retirement: 'M4 21H20M6 21V10L12 5L18 10V21M10 21V15H14V21',
  contract: 'M6 3H15L19 7V21H6ZM15 3V7H19M9 12H16M9 16H14',
  lock: 'M6 11H18V21H6ZM8.5 11V7.5A3.5 3.5 0 0 1 15.5 7.5V11',
  check: 'M5 12L10 17L20 6',
} as const;
export type GlyphName = keyof typeof GLYPHS;

/** A small line icon for honours, the Chronicle and the wardrobe. Decorative. */
export function Glyph({ name, className = 'h-5 w-5' }: { name: GlyphName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={GLYPHS[name]} />
    </svg>
  );
}

/** Which glyph marks each kind of Chronicle entry. */
export const CHRONICLE_GLYPH: Record<ChronicleEntry['kind'], GlyphName> = {
  start: 'contract',
  debut: 'boot',
  'first-goal': 'ball',
  'hat-trick': 'ball',
  'goal-milestone': 'ball',
  'apps-milestone': 'boot',
  move: 'transfer',
  injury: 'injury',
  trophy: 'trophy',
  award: 'medal',
  'call-up': 'flag',
  cap: 'flag',
  'international-goal': 'ball',
  tournament: 'trophy',
  rival: 'rival',
  fame: 'fame',
  record: 'record',
  moment: 'moment',
  promise: 'check',
  ambition: 'star',
  retirement: 'retirement',
};

/** A Chronicle entry as a sentence. */
export function chronicleSentence(world: World, entry: ChronicleEntry): string {
  const p: Record<string, string | number> = { ...entry.params };
  const C = h.chronicle.counts;
  if (entry.kind === 'injury' && typeof p.weeks === 'number') p.weeks = counted(p.weeks, C.weeks);
  if (entry.kind === 'retirement') {
    if (typeof p.appearances === 'number') p.appearances = counted(p.appearances, C.apps);
    if (typeof p.goals === 'number') p.goals = counted(p.goals, C.goals);
  }
  if (entry.kind === 'goal-milestone' && typeof p.goals === 'number')
    p.goals = counted(p.goals, C.careerGoals);
  if (entry.kind === 'apps-milestone' && typeof p.appearances === 'number')
    p.appearances = counted(p.appearances, C.apps);
  if (entry.kind === 'moment' && typeof p.minute === 'number') p.minute = ordinal(p.minute);
  if (entry.kind === 'rival' && typeof p.goals === 'number') p.goals = counted(p.goals, C.goals);
  const club = entry.clubId ? world.clubs[entry.clubId]?.name : undefined;
  if (club && p.club === undefined) p.club = club;
  if (typeof p.fee === 'number') p.fee = money(p.fee);
  if (typeof p.level === 'string' && p.level in h.levels)
    p.level = h.levels[p.level as keyof typeof h.levels].toLowerCase();
  if (typeof p.stage === 'string' && p.stage in h.national.stages)
    p.stage = h.national.stages[p.stage as keyof typeof h.national.stages];
  if (entry.kind === 'award')
    p.award = `${h.awards.kinds[String(p.kind) as keyof typeof h.awards.kinds] ?? ''}${p.month ? ` (${format(h.awards.monthLabel, { month: p.month })})` : ''}`;
  if (entry.kind === 'injury')
    p.kind = (c.injuries[String(p.kind)] ?? String(p.kind)).toLowerCase();
  if (entry.kind === 'record')
    p.record = h.cabinet.recordKinds[String(p.kind) as keyof typeof h.cabinet.recordKinds] ?? '';
  if (entry.kind === 'moment')
    p.moment = (
      h.moments.kinds[String(p.kind) as keyof typeof h.moments.kinds] ?? ''
    ).toLowerCase();
  if (entry.kind === 'promise')
    p.goal = promiseMilestone({
      kind: String(p.kind) as ManagerPromise['kind'],
      target: Number(p.target),
      attribute: p.attribute ? String(p.attribute) : null,
    }).toLowerCase();
  if (entry.kind === 'ambition') {
    const name = ambitionName(String(p.ambition) as AmbitionId, {
      target: p.target,
      club: p.club,
    });
    p.ambition = name.charAt(0).toLowerCase() + name.slice(1);
  }
  const key =
    entry.kind === 'promise'
      ? `promise-${p.outcome}`
      : entry.kind === 'move'
        ? `move-${p.kind}`
        : entry.kind === 'start' && p.parent
          ? 'startChild'
          : entry.kind;
  return format(h.chronicle.entries[key] ?? '', p);
}
