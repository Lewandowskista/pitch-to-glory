import type { Agent, World } from '../../../model/domain';
import { createRng } from '../../rng';
import { generateAvatar } from '../../assets/avatar';
import { ensureClubRelationships } from './records';
import { M } from './rules';

/** Agents work internationally; a compact name list keeps this module small for the UI. */
const FIRST = [
  'Alex',
  'Sam',
  'Jordan',
  'Morgan',
  'Rui',
  'Luca',
  'Nico',
  'Hugo',
  'Marta',
  'Elena',
  'Sofia',
  'Clara',
  'Jonas',
  'Felix',
  'Iker',
  'Diego',
  'Inês',
  'Léa',
  'Noah',
  'Ada',
];
const LAST = [
  'Mercer',
  'Delacroix',
  'Varga',
  'Moreau',
  'Castell',
  'Brandt',
  'Ferreira',
  'Rossi',
  'Okafor',
  'Lindqvist',
  'Navarro',
  'Keller',
  'Duval',
  'Serrano',
  'Albers',
  'Costa',
];
const PERSONALITIES: readonly Agent['personality'][] = [
  'economical',
  'connected',
  'aggressive',
  'economical',
  'connected',
  'aggressive',
  'connected',
  'aggressive',
];

/**
 * The agents a career can hire, seeded by the world: aggressive negotiators who charge more,
 * well-connected agents who bring more clubs, and cheap agents. Quality rises through the
 * pool, and better agents only take on clients with a higher standing.
 */
export function generateAgents(world: World): Record<string, Agent> {
  const rng = createRng(`${world.seed}:agents`);
  const agents: Record<string, Agent> = {};
  const names = new Set<string>();
  for (let index = 0; index < M.agents.pool; index++) {
    const personality = PERSONALITIES[index % PERSONALITIES.length]!;
    const quality = index / (M.agents.pool - 1);
    const base = 35 + Math.round(quality * 45);
    const lean = (kind: Agent['personality']) =>
      personality === kind ? 15 : personality === 'economical' ? -8 : 0;
    let name = '';
    while (!name || names.has(name)) name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    names.add(name);
    const id = `agent:${index}`;
    agents[id] = {
      id,
      name,
      avatar: generateAvatar(rng),
      personality,
      negotiation: Math.max(1, Math.min(99, base + rng.int(-4, 4) + lean('aggressive'))),
      network: Math.max(1, Math.min(99, base + rng.int(-4, 4) + lean('connected'))),
      commissionPercent:
        personality === 'aggressive'
          ? rng.int(10, 12)
          : personality === 'connected'
            ? rng.int(7, 9)
            : rng.int(3, 5),
      minimumStanding: Math.round(quality * 55),
      clientIds: [],
    };
  }
  return agents;
}

/**
 * The world-level records a career's market needs: the agent pool and relationships with
 * the current club's manager and fans. Also used when migrating careers saved before them.
 */
export function attachMarket(world: World): void {
  if (!Object.keys(world.agents).length) world.agents = generateAgents(world);
  ensureClubRelationships(world);
}
