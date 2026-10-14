import { CONFIG } from '../../engine/config';
import {
  agentAvailability,
  canReleaseAgent,
  careerStanding,
  type AgentAvailability,
} from '../../engine/career/market';
import type { Agent, Career, World } from '../../model/domain';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/Icon';
import { Button, CardTitle, Chip, Panel, cx } from '../../ui/kit';
import { ValueMeter } from '../../ui/kit/ValueMeter';
import { format } from '../../i18n';
import { marketText as m } from '../../i18n/market';
import { CareerPage } from './shared';
import { useUrlDialog } from './useUrlDialog';
import {
  ActionError,
  AgentPortrait,
  BlockNote,
  ClockIcon,
  money,
  useMarketAction,
} from './marketUi';

export default function CareerAgent() {
  return (
    <CareerPage title={m.titles.agent} description={m.agent.pageBody}>
      {({ world, career }) => <AgentContent world={world} career={career} />}
    </CareerPage>
  );
}

function AgentContent({ world, career }: { world: World; career: Career }) {
  const { run, error, block } = useMarketAction();
  const confirm = useUrlDialog('confirm');
  const current = career.market.agentId ? world.agents[career.market.agentId] : undefined;
  const standing = careerStanding(world);
  const release = canReleaseAgent(world);
  const agents = Object.values(world.agents).sort(
    (a, b) => a.minimumStanding - b.minimumStanding || (a.id < b.id ? -1 : 1),
  );
  const states = new Map(agents.map((agent) => [agent.id, agentAvailability(world, agent.id)]));
  // The strongest agent who would take the player on now; ties go to the cheaper one.
  const recommended = current
    ? undefined
    : agents
        .filter((agent) => states.get(agent.id) === 'available')
        .sort(
          (a, b) =>
            b.negotiation + b.network - (a.negotiation + a.network) ||
            a.commissionPercent - b.commissionPercent,
        )[0];
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-stretch gap-5">
        <Panel
          aria-labelledby="current-agent-heading"
          className="flex flex-[7_1_32rem] flex-col gap-4.5"
        >
          <h2
            id="current-agent-heading"
            className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase"
          >
            {m.agent.title}
          </h2>
          <BlockNote block={block} />
          <ActionError error={error} />
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-5">
                <AgentPortrait
                  avatar={current.avatar}
                  name={current.name}
                  className="h-24 w-24 shrink-0 rounded-full ring-4 ring-art-gold sm:h-30 sm:w-30"
                />
                <div className="min-w-0 flex-[1_1_13rem]">
                  <p className="font-display text-[2.75rem] leading-[0.9] break-words sm:text-[3.25rem]">
                    {current.name}
                  </p>
                  <Chip className="mt-1.5">{m.agent.personalities[current.personality]}</Chip>
                  <p className="mt-2.5 max-w-[26rem] text-sm">
                    {m.agent.personalityBodies[current.personality]}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-5">
                <ValueMeter
                  className="flex-[1_1_12rem]"
                  label={m.agent.negotiation}
                  value={current.negotiation}
                />
                <ValueMeter
                  className="flex-[1_1_12rem]"
                  label={m.agent.network}
                  value={current.network}
                  tone="gold"
                />
              </div>
              <div className="flex flex-wrap gap-2.5">
                <div className="flex-[1_1_12rem] rounded-control bg-surface-soft px-3.5 py-3">
                  <Commission percent={current.commissionPercent} />
                </div>
                <p className="flex-[1_1_12rem] rounded-control bg-surface-soft px-3.5 py-3 text-sm text-muted">
                  {m.agent.paid.split('{amount}')[0]}
                  <strong className="text-ink tabular-nums">
                    {money(career.market.finances.agentFees)}
                  </strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3.5 border-t border-line pt-4">
                <Button
                  variant="danger-outline"
                  aria-describedby="release-hint"
                  disabled={Boolean(block) || release !== 'available'}
                  onClick={() => confirm.open('release')}
                >
                  {m.agent.release}
                </Button>
                <p id="release-hint" className="text-xs text-muted">
                  {release === 'available' || release === 'standing'
                    ? format(m.agent.releaseBody, {
                        weeks: CONFIG.career.market.agents.changeCooldownWeeks,
                      })
                    : m.agent.states[release]}
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-4 rounded-control bg-surface-soft px-4 py-3.5">
              <span
                aria-hidden="true"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-dashed border-muted text-muted"
              >
                <Icon name="player" className="h-6 w-6" />
              </span>
              <p className="max-w-prose flex-[1_1_18rem] text-muted">{m.agent.none}</p>
            </div>
          )}
        </Panel>
        <StandingPanel standing={standing} agents={agents} />
      </div>
      <Panel aria-labelledby="agent-pool-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle id="agent-pool-heading" size="lg">
            {m.agent.pool}
          </CardTitle>
          <span className="text-[0.8125rem] font-semibold text-muted">{m.agent.sorted}</span>
        </div>
        {/* Each card spans five shared rows, so meters, commission and buttons line up across
            a row of cards even when a name or personality wraps. */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13.75rem),1fr))] gap-3">
          {agents.map((agent) => (
            <PoolCard
              key={agent.id}
              agent={agent}
              state={states.get(agent.id)!}
              best={agent.id === recommended?.id}
              block={block}
              onHire={() => run({ type: 'hire-agent', agentId: agent.id })}
            />
          ))}
        </ul>
      </Panel>
      {confirm.value === 'release' && current && (
        <Dialog
          title={format(m.agent.releaseTitle, { agent: current.name })}
          body={format(m.agent.releaseBody, {
            weeks: CONFIG.career.market.agents.changeCooldownWeeks,
          })}
          confirmLabel={m.agent.release}
          danger
          onClose={confirm.close}
          onConfirm={() => {
            confirm.close();
            run({ type: 'release-agent' });
          }}
        />
      )}
    </div>
  );
}

/**
 * The career's standing in Bebas on the gold card, with marks under the bar at the standing
 * each agent asks for: the ones already met are drawn in gold.
 */
function StandingPanel({ standing, agents }: { standing: number; agents: Agent[] }) {
  const marks = [...new Set(agents.map((agent) => agent.minimumStanding))].sort((a, b) => a - b);
  // Labels closer than this (in standing points) to the previous label would overlap.
  let lastLabel = -Infinity;
  const ticks = marks.map((mark) => {
    const label = mark - lastLabel >= 8;
    if (label) lastLabel = mark;
    return { mark, label, met: standing >= mark };
  });
  const value = m.agent.outOf;
  return (
    <Panel
      tone="gold"
      aria-labelledby="standing-heading"
      className="flex flex-[5_1_21rem] flex-col gap-3.5"
    >
      <CardTitle id="standing-heading" size="lg">
        {m.agent.standing}
      </CardTitle>
      <p className="flex items-end gap-3 text-gold-ink">
        <span className="font-display text-[5rem] leading-[0.8] tabular-nums sm:text-[6rem]">
          {standing}
        </span>
        <span className="pb-1.5 text-[0.8125rem] font-bold">{value}</span>
      </p>
      <div>
        <div
          role="meter"
          aria-label={m.agent.standing}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={standing}
          aria-valuetext={`${standing} ${value}`}
          className="h-3 overflow-hidden rounded-full bg-surface"
        >
          <span
            className="block h-full rounded-full bg-meter-gold"
            style={{ width: `${Math.max(0, Math.min(100, standing))}%` }}
          />
        </div>
        <div aria-hidden="true" className="relative mx-2 mt-1 h-7">
          {ticks.map((tick) => (
            <span
              key={tick.mark}
              className={cx(
                'absolute top-0 flex min-w-3.5 -translate-x-1/2 flex-col items-center border-t-[6px] pt-0.5 text-[0.6875rem] font-extrabold',
                tick.met ? 'border-meter-gold text-gold-ink' : 'border-line text-muted',
              )}
              style={{ left: `${tick.mark}%` }}
            >
              {tick.label ? tick.mark : ''}
            </span>
          ))}
        </div>
        <p className="text-xs text-gold-ink">{m.agent.ticks}</p>
      </div>
      <p className="text-ink">{m.agent.standingBody}</p>
    </Panel>
  );
}

const STATE_ICON: Record<Exclude<AgentAvailability, 'available'>, 'life' | 'lock' | 'contract'> = {
  current: 'life',
  standing: 'lock',
  cooldown: 'lock',
  negotiating: 'contract',
};

function PoolCard({
  agent,
  state,
  best,
  block,
  onHire,
}: {
  agent: Agent;
  state: AgentAvailability;
  best: boolean;
  block: string | null;
  onHire: () => void;
}) {
  const marked = state === 'current' || best;
  return (
    <li
      className={cx(
        'row-span-5 grid grid-rows-subgrid gap-3 rounded-control p-4',
        marked ? 'border-2 border-accent bg-accent-soft' : 'border border-line bg-surface-soft',
      )}
    >
      <div className="flex flex-col items-start gap-2">
        {state === 'current' && <Chip tone="solid">{m.agent.states.current}</Chip>}
        {best && <Chip tone="gold">{m.agent.recommended}</Chip>}
        <div className="flex items-center gap-3">
          <AgentPortrait avatar={agent.avatar} name={agent.name} className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-[1.625rem] leading-[0.95] break-words">{agent.name}</p>
            <p className="mt-0.5 text-[0.8125rem] font-bold text-accent">
              {m.agent.personalities[agent.personality]}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <ValueMeter
          size="sm"
          track="surface"
          label={m.agent.negotiation}
          ariaLabel={`${m.agent.negotiation} · ${agent.name}`}
          value={agent.negotiation}
        />
        <ValueMeter
          size="sm"
          track="surface"
          label={m.agent.network}
          ariaLabel={`${m.agent.network} · ${agent.name}`}
          value={agent.network}
          tone="gold"
        />
      </div>
      <Commission percent={agent.commissionPercent} />
      <p className="text-xs text-muted">{m.agent.personalityBodies[agent.personality]}</p>
      <div className="self-end">
        {state === 'available' ? (
          <>
            <p className="mb-2 text-xs text-muted">
              {format(m.agent.minimum, { standing: agent.minimumStanding })}
            </p>
            <Button
              variant={best ? 'primary' : 'secondary'}
              block
              disabled={Boolean(block)}
              onClick={onHire}
            >
              {m.agent.hire}
              <span className="sr-only"> {agent.name}</span>
            </Button>
          </>
        ) : (
          <p className="flex min-h-11 items-center gap-2 text-[0.8125rem] font-bold text-muted">
            {state === 'cooldown' ? (
              <ClockIcon className="h-4 w-4 shrink-0" />
            ) : (
              <Icon name={STATE_ICON[state]} className="h-4 w-4 shrink-0" />
            )}
            {state === 'standing'
              ? format(m.agent.states.standing, { standing: agent.minimumStanding })
              : m.agent.states[state]}
          </p>
        )}
      </div>
    </li>
  );
}

/** "Commission 3% of wages and fees", with the rate in bold. */
function Commission({ percent }: { percent: number }) {
  const [before = '', after = ''] = m.agent.commissionLine.split('{percent}');
  return (
    <p className="text-[0.8125rem]">
      {before}
      <strong className="tabular-nums">{format(m.agent.percent, { percent })}</strong>
      {after}
    </p>
  );
}
