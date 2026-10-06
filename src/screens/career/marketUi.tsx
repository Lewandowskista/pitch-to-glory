import { useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import {
  applyMarketAction,
  windowState,
  type MarketAction,
  type MarketResult,
} from '../../engine/career/market';
import type { Contract, InboxMessage, World } from '../../model/domain';
import { renderAvatar } from '../../engine/assets/avatar';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { marketText as m } from '../../i18n/market';
import { socialText } from '../../i18n/social';

const socialMessages = socialText.messages;
import { ui, useEditBlock } from './shared';

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
      setError(format(m.errors.action, { reason: cause instanceof Error ? cause.message : '' }));
      return null;
    }
  };
  return { run, error, block };
}

/** A message's subject and body with money and roles formatted. */
export function messageText(message: InboxMessage): { subject: string; body: string } {
  const template = m.messages[message.subjectKey] ??
    socialMessages[message.subjectKey] ?? { subject: message.subjectKey, body: '' };
  const params: Record<string, string | number> = { ...message.params };
  for (const key of ['fee', 'bid'] as const)
    if (typeof params[key] === 'number') params[key] = money(params[key]);
  if (typeof params.wage === 'number') params.wage = weekly(params.wage);
  if (typeof params.role === 'string' && params.role in m.roles)
    params.role = roleName(params.role as Contract['role']);
  return { subject: format(template.subject, params), body: format(template.body, params) };
}

export function WindowBanner({ world }: { world: World }) {
  const state = windowState(world);
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
      className={`flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold ${
        state.open && world.phase !== 'complete'
          ? 'bg-accent text-on-accent'
          : 'border border-line bg-surface-soft text-muted'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${state.open ? 'bg-gold' : 'bg-muted'}`}
      />
      {text}
    </p>
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
  const svg = useMemo(() => renderAvatar(avatar, 44), [avatar]);
  return (
    <Artwork
      svg={svg}
      alt={format(m.agent.portrait, { name })}
      className={`rounded-full bg-art-gold ${className}`}
    />
  );
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

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-control bg-surface-soft p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl leading-tight break-words">{value}</dd>
    </div>
  );
}

export const panel = ui.panel;
