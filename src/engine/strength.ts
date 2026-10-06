/**
 * Shared team-strength model used by the background fixture resolver and the interactive match engine.
 *
 * Pure and framework-free: no browser, React or worker dependencies. Signatures are stable:
 *
 * - `playerAbility(player): number` — mean of the outfield attributes, or of the goalkeeping
 *   attributes for a primary goalkeeper.
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
import type { Player } from '../model/domain';
import { CONFIG } from './config';

const BACKGROUND = CONFIG.world.background;
const DEFENCE = ['CB', 'LB', 'RB'];
const MIDFIELD = ['DM', 'CM', 'AM'];
const ATTACK = ['LW', 'RW', 'ST'];

export function playerAbility(
  player: Pick<Player, 'primaryPosition' | 'attributes' | 'keeperAttributes'>,
): number {
  const values = Object.values(
    player.primaryPosition === 'GK' ? player.keeperAttributes : player.attributes,
  );
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function selectStartingPlayers<T extends Player>(players: readonly T[]): T[] {
  const ranked = players
    .filter((player) => !player.retired)
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
