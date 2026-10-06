import { useState } from 'react';
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

/** A Chronicle entry as a sentence. */
export function chronicleSentence(world: World, entry: ChronicleEntry): string {
  const p: Record<string, string | number> = { ...entry.params };
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
  const key =
    entry.kind === 'move'
      ? `move-${p.kind}`
      : entry.kind === 'start' && p.parent
        ? 'startChild'
        : entry.kind;
  return format(h.chronicle.entries[key] ?? '', p);
}
