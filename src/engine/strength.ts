/**
 * Shared team-strength model used by the background fixture resolver and the interactive match engine.
 *
 * Pure and framework-free: no browser, React or worker dependencies. Signatures are stable:
 *
 * - `playerAbility(player): number` — weighted mean of the outfield attributes, where the
 *   attributes the player's position relies on count three times and supporting ones twice
 *   (`ABILITY_WEIGHTS`), or the plain mean of the goalkeeping attributes for a keeper. A flat
 *   profile scores its plain mean; a specialised one scores what it is good at.
 * - `selectStartingPlayers(players): Player[]` — best goalkeeper, four best defenders
 *   (CB/LB/RB), three best midfielders (DM/CM/AM) and three best attackers (LW/RW/ST), then the
 *   best remaining outfielders until eleven. Ranking is ability descending, ties by ascending id.
 *   Retired players are ignored; callers pass the players that are available to the club.
 * - `teamStrength(reputation, starters): number` —
 *   `reputation × background.reputationWeight + meanAbility(starters) × background.squadWeight`.
 * - `expectedGoals(homeStrength, awayStrength, neutral): [λhome, λaway]` —
 *   `max(minimumGoals, baseGoals ± homeAdvantage ± (home − away) × strengthScale)`, with no home
 *   advantage on neutral ground.
 *
 * All constants come from `CONFIG.world` (`baseGoals`, `homeAdvantage`, `strengthScale`) and
 * `CONFIG.world.background` (`reputationWeight`, `squadWeight`, `minimumGoals`). The arithmetic
 * order matches the original resolver so both paths produce bit-identical expectations.
 */
import type { Attributes, Player, Position } from '../model/domain';
import { CONFIG } from './config';

const BACKGROUND = CONFIG.world.background;
const DEFENCE = ['CB', 'LB', 'RB'];
const MIDFIELD = ['DM', 'CM', 'AM'];
const ATTACK = ['LW', 'RW', 'ST'];

type Weights = Partial<Record<keyof Attributes, number>>;
const FULL_BACK: Weights = {
  pace: 3,
  tackling: 3,
  stamina: 3,
  acceleration: 2,
  crossing: 2,
  positioning: 2,
  workRate: 2,
  dribbling: 2,
};
const WINGER: Weights = {
  pace: 3,
  acceleration: 3,
  dribbling: 3,
  crossing: 2,
  finishing: 2,
  firstTouch: 2,
  agility: 2,
  vision: 2,
};
/**
 * How much each outfield attribute counts toward a position's ability; unlisted attributes
 * count once. Every position lists three at 3 and five at 2, so the weights sum to 33 and
 * a flat profile scores its plain mean.
 */
export const ABILITY_WEIGHTS: Readonly<Record<Position, Weights>> = {
  GK: {},
  CB: {
    tackling: 3,
    positioning: 3,
    heading: 3,
    strength: 2,
    jumping: 2,
    composure: 2,
    decisions: 2,
    aggression: 2,
  },
  LB: FULL_BACK,
  RB: FULL_BACK,
  DM: {
    tackling: 3,
    positioning: 3,
    decisions: 3,
    passing: 2,
    strength: 2,
    workRate: 2,
    stamina: 2,
    composure: 2,
  },
  CM: {
    passing: 3,
    vision: 3,
    decisions: 3,
    firstTouch: 2,
    stamina: 2,
    workRate: 2,
    tackling: 2,
    composure: 2,
  },
  AM: {
    passing: 3,
    vision: 3,
    dribbling: 3,
    firstTouch: 2,
    finishing: 2,
    longShots: 2,
    composure: 2,
    decisions: 2,
  },
  LW: WINGER,
  RW: WINGER,
  ST: {
    finishing: 3,
    positioning: 3,
    composure: 3,
    heading: 2,
    firstTouch: 2,
    pace: 2,
    acceleration: 2,
    strength: 2,
  },
};

export function playerAbility(
  player: Pick<Player, 'primaryPosition' | 'attributes' | 'keeperAttributes'>,
): number {
  if (player.primaryPosition === 'GK') {
    const values = Object.values(player.keeperAttributes);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const weights = ABILITY_WEIGHTS[player.primaryPosition];
  let total = 0;
  let weight = 0;
  for (const [key, value] of Object.entries(player.attributes) as [keyof Attributes, number][]) {
    const w = weights[key] ?? 1;
    total += value * w;
    weight += w;
  }
  return total / weight;
}

export function selectStartingPlayers<T extends Player>(players: readonly T[]): T[] {
  const ranked = players
    // Only the career player can be injured; AI selections are unchanged.
    .filter((player) => !player.retired && !player.injuryId)
    .sort((a, b) => playerAbility(b) - playerAbility(a) || (a.id < b.id ? -1 : 1));
  const keeper = ranked.find((player) => player.primaryPosition === 'GK');
  const defence = ranked.filter((player) => DEFENCE.includes(player.primaryPosition)).slice(0, 4);
  const midfield = ranked.filter((player) => MIDFIELD.includes(player.primaryPosition)).slice(0, 3);
  const attack = ranked.filter((player) => ATTACK.includes(player.primaryPosition)).slice(0, 3);
  const selected = [...(keeper ? [keeper] : []), ...defence, ...midfield, ...attack];
  for (const player of ranked)
    if (selected.length < 11 && !selected.includes(player) && player.primaryPosition !== 'GK')
      selected.push(player);
  return selected;
}

export function teamStrength(
  reputation: number,
  starters: readonly Pick<Player, 'primaryPosition' | 'attributes' | 'keeperAttributes'>[],
): number {
  return (
    reputation * BACKGROUND.reputationWeight +
    (starters.reduce((sum, player) => sum + playerAbility(player), 0) / starters.length) *
      BACKGROUND.squadWeight
  );
}

/** Team strength from a mean ability already worked out, such as a lineup's slot values. */
export function strengthFromAbility(reputation: number, meanAbility: number): number {
  return reputation * BACKGROUND.reputationWeight + meanAbility * BACKGROUND.squadWeight;
}

/** Weekly wage for an ability at a club: ability² × (base + weight × (reputation/100)²). */
export function wageFor(ability: number, reputation: number): number {
  const G = CONFIG.world.generation;
  return Math.max(
    G.wageFloor,
    Math.round(ability * ability * (G.wageBase + G.wageReputationWeight * (reputation / 100) ** 2)),
  );
}
/** What a manager adds to team strength: (ability − 60) × the configured weight. */
export function managerStrengthBonus(ability: number): number {
  return (ability - 60) * BACKGROUND.managerAbilityWeight;
}
export function expectedGoals(
  homeStrength: number,
  awayStrength: number,
  neutral: boolean,
): [number, number] {
  const difference = (homeStrength - awayStrength) * CONFIG.world.strengthScale;
  const homeAdvantage = neutral ? 0 : CONFIG.world.homeAdvantage;
  return [
    Math.max(BACKGROUND.minimumGoals, CONFIG.world.baseGoals + homeAdvantage + difference),
    Math.max(BACKGROUND.minimumGoals, CONFIG.world.baseGoals - homeAdvantage - difference),
  ];
}
