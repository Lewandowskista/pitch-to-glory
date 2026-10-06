import { useState } from 'react';
import { useAppStore } from '../../store';
import { applySocialAction, type SocialAction } from '../../engine/career/social';
import type { Club, CliqueKind, MediaEffects, MediaItem } from '../../model/domain';
import { format } from '../../i18n';
import { socialText as s } from '../../i18n/social';
import { money } from './marketUi';
import { useEditBlock } from './shared';

/** Run a social decision against the loaded world, waiting like other career edits. */
export function useSocialAction() {
  const block = useEditBlock();
  const [error, setError] = useState('');
  const run = (action: SocialAction): boolean => {
    const world = useAppStore.getState().world;
    if (!world || block) return false;
    try {
      useAppStore.getState().setWorld(applySocialAction(world, action));
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '');
      return false;
    }
  };
  return { run, error, block };
}

/** A post, headline or question with its parameters formatted. */
export function mediaText(item: MediaItem): string {
  const params: Record<string, string | number> = { ...item.params };
  if (typeof params.fee === 'number') params.fee = money(params.fee);
  const template = item.choices.length > 0 ? s.press[item.textKey] : s.posts[item.textKey];
  return format(template ?? item.textKey, params);
}

/** The visible consequences of an answer, as signed chips. */
export function effectList(effects: MediaEffects): { label: string; value: number }[] {
  const list: { label: string; value: number }[] = [];
  for (const key of ['fame', 'trust', 'mood', 'fans', 'rival'] as const)
    if (effects[key]) list.push({ label: s.media.effectNames[key], value: effects[key] });
  for (const [kind, value] of Object.entries(effects.cliques) as [CliqueKind, number][])
    if (value) list.push({ label: s.room.cliqueNames[kind], value });
  return list;
}
export function EffectChips({ effects }: { effects: MediaEffects }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={s.media.effects}>
      {effectList(effects).map(({ label, value }) => (
        <li
          key={label}
          className={`inline-flex min-h-6 items-center rounded-full px-2 text-[0.7rem] font-bold ${
            value > 0 ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'
          }`}
        >
          {label} {value > 0 ? '+' : '−'}
          {Math.abs(value)}
        </li>
      ))}
    </ul>
  );
}

/** The club's notable culture traits (AGENTS.md §5), from its culture values. */
export function cultureTraits(club: Club): string[] {
  const traits: string[] = [];
  const names = s.fit.traitNames;
  if (club.culture.youth >= 65) traits.push(names.youth);
  if (club.culture.winNow >= 65) traits.push(names.winNow);
  if (club.culture.fanOwned) traits.push(names.fanOwned);
  if (club.culture.discipline >= 65) traits.push(names.discipline);
  if (club.culture.attacking >= 65) traits.push(names.attacking);
  traits.push(
    format(names.style, {
      style: s.fit.styles[club.playingStyle as keyof typeof s.fit.styles] ?? club.playingStyle,
    }),
  );
  return traits;
}

/** Signed one-decimal number for breakdowns. */
export const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`;
