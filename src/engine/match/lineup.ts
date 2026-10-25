/**
 * Line-ups and benches: the eleven each manager fields, the seven on the bench, and the best
 * bench replacement for a player coming off.
 */
import type { Club, Lineup, Player, Position } from '../../model/domain';
import { playerAbility } from '../strength';
import { available, selectLineup } from '../selection/lineup';
import type { Formation } from '../selection/formations';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';

const COMPATIBLE: Record<Position, Position[]> = {
  GK: ['GK'],
  CB: ['CB', 'LB', 'RB', 'DM'],
  LB: ['LB', 'RB', 'CB'],
  RB: ['RB', 'LB', 'CB'],
  DM: ['DM', 'CM', 'CB'],
  CM: ['CM', 'DM', 'AM'],
  AM: ['CM', 'AM', 'ST'],
  LW: ['LW', 'RW', 'ST'],
  RW: ['RW', 'LW', 'ST'],
  ST: ['ST', 'LW', 'RW'],
};

function fit(player: Player, position: Position): number {
  return player.primaryPosition === position
    ? 100
    : (player.secondaryPositions.find((p) => p.position === position)?.familiarity ?? 0);
}
/**
 * The eleven for a formation, by the shared selection (src/engine/selection/lineup.ts), with
 * the career player in their best slot. A match needs eleven available players.
 */
export function formationLineup(
  club: Club,
  players: Record<string, Player>,
  formation: Formation,
  selected: string,
  /** Players suspended for this match (match-16), as long as eleven remain. */
  suspended: readonly string[] = [],
): Lineup {
  const ready = club.playerIds.filter((id) => available(players[id]));
  if (ready.length < 11) throw new Error('A match requires eleven available players per team');
  const banned = suspended.filter((id) => id !== selected && ready.includes(id));
  const exclude = banned.slice(0, Math.max(0, ready.length - 11));
  // With every keeper out, the shared selection puts an outfielder in goal rather than
  // leaving the club unable to play.
  const choice = selectLineup(
    club.playerIds,
    players,
    formation,
    exclude.length ? { selected, exclude } : { selected },
  );
  if (choice.starterIds.length !== 11) throw new Error('Invalid lineup');
  return {
    teamId: club.id,
    formation,
    starterIds: choice.starterIds,
    benchIds: matchdayBench(choice.benchIds, players),
  };
}
/**
 * The seven on the bench (match-15): the best reserve keeper, then the best of each line
 * (centre-back, full-back, central midfield, wide or attacking midfield, striker), then the
 * best of the rest by ability, so a like-for-like change is usually there.
 */
function matchdayBench(ids: readonly string[], players: Record<string, Player>): string[] {
  const pool = [...ids].sort(byAbility(players));
  const bench: string[] = [];
  for (const line of BENCH_LINES) {
    const id = pool.find(
      (candidate) =>
        !bench.includes(candidate) && line.includes(players[candidate]!.primaryPosition),
    );
    if (id && bench.length < C.benchSize) bench.push(id);
  }
  for (const id of pool) if (bench.length < C.benchSize && !bench.includes(id)) bench.push(id);
  return bench;
}
const BENCH_LINES: readonly (readonly Position[])[] = [
  ['GK'],
  ['CB'],
  ['LB', 'RB'],
  ['DM', 'CM'],
  ['AM', 'LW', 'RW'],
  ['ST'],
];
function byAbility(players: Record<string, Player>) {
  return (a: string, b: string) =>
    playerAbility(players[b]!) - playerAbility(players[a]!) || (a < b ? -1 : 1);
}
/** Best bench replacement: same position, then a compatible one, then any outfielder. */
export function replacement(
  session: MatchSession,
  bench: string[],
  player: Player,
): string | undefined {
  const players = session.setup.players;
  const tier = (id: string) => {
    const candidate = players[id]!;
    if ((candidate.primaryPosition === 'GK') !== (player.primaryPosition === 'GK')) return 0;
    if (candidate.primaryPosition === player.primaryPosition) return 3;
    return fit(candidate, player.primaryPosition) > 0 ||
      COMPATIBLE[player.primaryPosition].includes(candidate.primaryPosition)
      ? 2
      : 1;
  };
  return bench
    .filter((id) => tier(id) > 0)
    .sort((a, b) => tier(b) - tier(a) || byAbility(players)(a, b))[0];
}
