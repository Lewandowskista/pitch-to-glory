import { preseasonText } from '../../i18n/preseason';
import { useMemo, useState } from 'react';
import { storiesText } from '../../i18n/stories';
import { ambitionsText } from '../../i18n/ambitions';
import { ambitionName } from './ambitionText';
import { storyletsText } from '../../i18n/storylets';
import { storyMessageParams } from './storyText';
const storiesMessages: Record<string, { subject: string; body: string }> = storiesText.messages;
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
import { useAppStore } from '../../store';
import {
  applyMarketAction,
  windowState,
  type MarketAction,
  type MarketResult,
} from '../../engine/career/market';
import type { AmbitionId, Contract, InboxMessage, World } from '../../model/domain';
import { renderAvatar } from '../../engine/assets/avatar';
import { ART } from '../../engine/assets/shared';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { marketText as m } from '../../i18n/market';
import { disciplineText, matchesLabel, scopeLabel } from '../../i18n/discipline';
import { socialText } from '../../i18n/social';
import { lifestyleText } from '../../i18n/lifestyle';
import { honoursText } from '../../i18n/honours';

const socialMessages = socialText.messages;
const lifestyleMessages = lifestyleText.messages;
const honoursMessages = honoursText.messages;
import { ui, useEditBlock } from './shared';
import { audio } from '../../audio';

const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
export const money = (value: number) => format(m.money, { amount: integer.format(value) });
export const weekly = (value: number) => format(m.perWeek, { amount: integer.format(value) });
export const roleName = (role: Contract['role']) => m.roles[role];

/**
 * Run a market decision against the loaded world. Edits wait while the world is being
 * simulated or a match is in progress, exactly like the other career edits.
 */
export function useMarketAction() {
  const block = useEditBlock();
  const [error, setError] = useState('');
  const run = (action: MarketAction): MarketResult | null => {
    const world = useAppStore.getState().world;
    if (!world || block) return null;
    try {
      const { world: next, result } = applyMarketAction(world, action);
      useAppStore.getState().setWorld(next);
      setError('');
      return result;
    } catch (cause) {
      audio.play('error');
      setError(format(m.errors.action, { reason: cause instanceof Error ? cause.message : '' }));
      return null;
    }
  };
  return { run, error, block };
}

/** A message's subject and body with money and roles formatted. */
export function messageText(message: InboxMessage): { subject: string; body: string } {
  const template = m.messages[message.subjectKey] ??
    socialMessages[message.subjectKey] ??
    lifestyleMessages[message.subjectKey] ??
    honoursMessages[message.subjectKey] ??
    storiesMessages[message.subjectKey] ??
    ambitionsText.messages[message.subjectKey] ??
    storyletsText.messages[message.subjectKey] ?? { subject: message.subjectKey, body: '' };
  const params: Record<string, string | number> =
    typeof message.params.story === 'string'
      ? storyMessageParams(message.params)
      : { ...message.params };
  for (const key of ['fee', 'bid', 'bonus', 'proceeds'] as const)
    if (typeof params[key] === 'number') params[key] = money(params[key]);
  if (typeof params.wage === 'number') params.wage = weekly(params.wage);
  if (typeof params.kind === 'string' && params.kind in honoursText.awards.kinds)
    params.kind = honoursText.awards.kinds[params.kind as keyof typeof honoursText.awards.kinds];
  if (typeof params.level === 'string' && params.level in honoursText.levels)
    params.level = honoursText.levels[params.level as keyof typeof honoursText.levels];
  if (typeof params.stage === 'string' && params.stage in honoursText.national.stages)
    params.stage =
      honoursText.national.stages[params.stage as keyof typeof honoursText.national.stages];
  if (typeof params.ambition === 'string')
    params.ambition = lowerFirst(ambitionName(params.ambition as AmbitionId, message.params));
  if (typeof params.role === 'string' && params.role in m.roles)
    params.role = roleName(params.role as Contract['role']);
  // A ban (the discipline phase): its length, where it is served and why, in words.
  // A season's ambition (review phase 5), in words.
  if (message.subjectKey.startsWith('season-ambition') && typeof params.goal === 'string')
    params.goal =
      preseasonText.goals[params.goal as keyof typeof preseasonText.goals] ?? params.goal;
  if (message.subjectKey === 'suspended') {
    if (typeof params.matches === 'number') params.matches = matchesLabel(params.matches);
    if (typeof params.scope === 'string') params.scope = scopeLabel(params.scope);
    if (typeof params.reason === 'string')
      params.reason =
        disciplineText.reasons[params.reason as keyof typeof disciplineText.reasons] ??
        params.reason;
  }
  return { subject: format(template.subject, params), body: format(template.body, params) };
}

/**
 * The transfer window as one pill: filled green with a gold dot while it is open, quiet and
 * outlined otherwise. The dot is decoration; the sentence carries the state.
 */
export function WindowBanner({ world, className = '' }: { world: World; className?: string }) {
  const state = windowState(world);
  const open = state.open && world.phase !== 'complete';
  const text =
    world.phase === 'complete'
      ? m.window.between
      : state.open
        ? format(m.window.open, { week: state.closes! })
        : state.opens
          ? format(m.window.opens, { week: state.opens })
          : m.window.closed;
  return (
    <p
      className={`inline-flex min-h-11 max-w-full items-center gap-2.5 self-start justify-self-start rounded-full px-4.5 py-2 text-sm font-bold text-balance ${
        open ? 'bg-accent text-on-accent' : 'border border-line bg-surface text-muted'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${open ? 'bg-gold' : 'bg-muted'}`}
      />
      {text}
    </p>
  );
}

/** A clock face, for deadlines ("Answer by week 17"). Decorative: the text says the week. */
export function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18ZM12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A rising or falling line, for an effect that helps or hurts. Decorative. */
export function TrendIcon({
  down = false,
  className = '',
}: {
  down?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        d={down ? 'M4 7l6 6 4-4 6 7M15 16h5v-5' : 'M4 17l6-6 4 4 6-7M15 8h5v5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AgentPortrait({
  avatar,
  name,
  className = '',
}: {
  avatar: World['agents'][string]['avatar'];
  name: string;
  className?: string;
}) {
  // Agents wear the neutral shirt on a gold disc, apart from any club.
  const svg = useMemo(() => renderAvatar(avatar, 44, { background: ART.artGold }), [avatar]);
  return <Artwork svg={svg} alt={format(m.agent.portrait, { name })} className={className} />;
}

export function ActionError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="inline-error">
      {error}
    </p>
  );
}

export function BlockNote({ block }: { block: string | null }) {
  if (!block) return null;
  return <p className="rounded-control bg-surface-soft p-3 text-sm">{block}</p>;
}

/**
 * A labelled figure. Values use the body font with tabular numbers, so money reads "204 Cr /
 * week" exactly as in running text. `note` explains this one figure; `row` lays label and value
 * side by side on phones, for short lists of totals. `display` sets the value in Bebas for
 * headline counts; `outline` draws a bordered box instead of the soft fill.
 */
export function Stat({
  label,
  value,
  note,
  row = false,
  display = false,
  outline = false,
  className = '',
}: {
  label: string;
  value: string | number;
  note?: string;
  row?: boolean;
  display?: boolean;
  outline?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-control px-3.5 py-3 ${outline ? 'border border-line' : 'bg-surface-soft'} ${row ? 'flex flex-wrap items-baseline justify-between gap-x-3 sm:block' : ''} ${className}`}
    >
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd
        className={
          display
            ? 'font-display text-[2rem] leading-none tabular-nums break-words'
            : 'mt-0.5 text-lg leading-tight font-extrabold tabular-nums break-words'
        }
      >
        {value}
      </dd>
      {note && <dd className="mt-1 text-xs text-muted">{note}</dd>}
    </div>
  );
}

export const panel = ui.panel;
