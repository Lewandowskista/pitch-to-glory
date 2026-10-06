import { CONFIG } from '../../engine/config';
import { agentAvailability, canReleaseAgent, careerStanding } from '../../engine/career/market';
import type { Agent, Career, World } from '../../model/domain';
import { Dialog } from '../../ui/Dialog';
import { format } from '../../i18n';
import { marketText as m } from '../../i18n/market';
import { CareerPage, Meter, ui } from './shared';
import { useUrlDialog } from './useUrlDialog';
import { ActionError, AgentPortrait, BlockNote, money, Stat, useMarketAction } from './marketUi';

export default function CareerAgent() {
  return (
    <CareerPage eyebrow={m.eyebrow} title={m.titles.agent}>
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
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <section aria-labelledby="current-agent-heading" className={`${ui.panel} lg:col-span-7`}>
        <h2 id="current-agent-heading" className={ui.heading}>
          {m.agent.title}
        </h2>
        <div className="mt-4 grid gap-4">
          <BlockNote block={block} />
          <ActionError error={error} />
          {current ? (
            <>
              <AgentSummary agent={current} />
              <p className="text-sm text-muted">
                {format(m.agent.paid, { amount: money(career.market.finances.agentFees) })}
              </p>
              <div>
                <button
                  className="button secondary"
                  disabled={Boolean(block) || release !== 'available'}
                  onClick={() => confirm.open('release')}
                >
                  {m.agent.release}
                </button>
                {release !== 'available' && release !== 'standing' && (
                  <p className="mt-1.5 text-xs text-muted">{m.agent.states[release]}</p>
                )}
              </div>
            </>
          ) : (
            <p className="max-w-prose text-muted">{m.agent.none}</p>
          )}
        </div>
      </section>
      <section aria-labelledby="standing-heading" className={`${ui.panel} lg:col-span-5`}>
        <h2 id="standing-heading" className={ui.heading}>
          {m.agent.standing}
        </h2>
        <div className="mt-4">
          <Meter label={m.agent.standing} value={standing} tone="gold" />
        </div>
        <p className={`${ui.muted} mt-3`}>{m.agent.standingBody}</p>
      </section>
      <section aria-labelledby="agent-pool-heading" className={`${ui.panel} lg:col-span-12`}>
        <h2 id="agent-pool-heading" className={ui.heading}>
          {m.agent.pool}
        </h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {agents.map((agent) => {
            const state = agentAvailability(world, agent.id);
            return (
              <li
                key={agent.id}
                className={`flex flex-col gap-3 rounded-control border p-4 ${
                  state === 'current'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface-soft'
                }`}
              >
                <AgentSummary agent={agent} compact />
                <p className="text-xs text-muted">
                  {format(m.agent.minimum, { standing: agent.minimumStanding })}
                </p>
                <div className="mt-auto">
                  {state === 'available' ? (
                    <button
                      className="button w-full"
                      disabled={Boolean(block)}
                      onClick={() => run({ type: 'hire-agent', agentId: agent.id })}
                    >
                      {m.agent.hire}
                      <span className="sr-only"> {agent.name}</span>
                    </button>
                  ) : (
                    <p className="flex min-h-11 items-center text-sm font-semibold text-muted">
                      {state === 'standing'
                        ? format(m.agent.states.standing, { standing: agent.minimumStanding })
                        : m.agent.states[state]}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
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

function AgentSummary({ agent, compact = false }: { agent: Agent; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <AgentPortrait
          avatar={agent.avatar}
          name={agent.name}
          className={compact ? 'h-14 w-14 shrink-0' : 'h-20 w-20 shrink-0'}
        />
        <div className="min-w-0">
          <p
            className={`font-display leading-none break-words ${compact ? 'text-2xl' : 'text-3xl'}`}
          >
            {agent.name}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-accent">
            {m.agent.personalities[agent.personality]}
          </p>
        </div>
      </div>
      {!compact && <p className="text-sm">{m.agent.personalityBodies[agent.personality]}</p>}
      <Meter label={m.agent.negotiation} value={agent.negotiation} />
      <Meter label={m.agent.network} value={agent.network} tone="gold" />
      <dl>
        <Stat
          label={m.agent.commission}
          value={format(m.agent.commissionValue, { percent: agent.commissionPercent })}
        />
      </dl>
      {compact && (
        <p className="text-xs text-muted">{m.agent.personalityBodies[agent.personality]}</p>
      )}
    </div>
  );
}
