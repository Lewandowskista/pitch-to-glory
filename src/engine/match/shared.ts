/**
 * Session helpers shared by the match modules: which side the selected player is on, where they
 * play, who is still on the pitch, and which way a team attacks.
 */
import type { Lineup, Position } from '../../model/domain';
import { slotPosition } from '../selection/lineup';
import { FORMATION_SLOTS, type Formation } from '../selection/formations';
import type { MatchSetup, MatchSession, MatchState } from './types';
import { MATCH_CONFIG as C } from './tuning';

export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const ATTACKERS: Position[] = ['ST', 'LW', 'RW', 'AM'];

export const selectedSide = (setup: MatchSetup) =>
  setup.players[setup.selectedPlayerId]!.clubId === setup.home.id ? 0 : 1;
/**
 * The selected player's effective position (`match-17`): the formation slot they start in, as
 * the shared selection places them (`selectedSlotIndex`), so role choices, objectives,
 * involvement and back-line credit follow the job they are given. A keeper never swaps with an
 * outfield slot. A setup without formations (from before them) uses the primary position.
 */
export function rolePosition(
  setup: Pick<MatchSetup, 'formations' | 'players' | 'selectedPlayerId' | 'home'>,
): Position {
  const player = setup.players[setup.selectedPlayerId]!;
  if (!setup.formations) return player.primaryPosition;
  const side = player.clubId === setup.home.id ? 0 : 1;
  return slotPosition(player, setup.formations[side]);
}
/** The opposition's playing style (match-19). */
export const opposingStyle = (setup: MatchSetup): string | undefined =>
  (selectedSide(setup) === 0 ? setup.away : setup.home).playingStyle;
/**
 * The flank of the selected player's post in their formation, in the attack frame: the side
 * a shot or cross is made from (match-19). Keepers and central posts have none.
 */
export function postFlank(session: MatchSession): 'left' | 'right' | 'centre' {
  const setup = session.setup;
  const own = selectedSide(setup) === 0 ? session.state.match.home : session.state.match.away;
  const formation = own.formation as Formation | undefined;
  const post = formation
    ? FORMATION_SLOTS[formation]?.[own.starterIds.indexOf(setup.selectedPlayerId)]
    : undefined;
  if (!post || setup.players[setup.selectedPlayerId]!.primaryPosition === 'GK') return 'centre';
  const lateral = post.in[1];
  return lateral < 50 - C.foot.centre ? 'left' : lateral > 50 + C.foot.centre ? 'right' : 'centre';
}
/** The last minute the session plays: 120 once extra time began (match-18), else 90. */
export function fullTime(session: Pick<MatchSession, 'state'>): number {
  return session.state.regulation ? 90 + C.extraTime.minutes : 90;
}
/** The players of a line-up on the pitch: its starters, less anyone sent off (match-16). */
export const onPitch = (team: Lineup): string[] =>
  team.sentOffIds?.length
    ? team.starterIds.filter((id) => !team.sentOffIds!.includes(id))
    : team.starterIds;
/**
 * The selected player is not on the pitch: substituted, sent off (match-16), or still on the
 * bench (match-22; `bench.on` is set when they come on).
 */
export const offPitch = (state: MatchState) =>
  state.substituted || state.sentOff !== undefined || onBench(state);
/** Still on the bench (match-22): started there and not brought on yet. */
export const onBench = (state: Pick<MatchState, 'bench'>) =>
  state.bench !== undefined && state.bench.on === undefined;
/**
 * The key of the minute being played for per-minute streams: the minute, or `minute+added` in
 * added time (match-22), so an added minute never replays its period's last minute's draws.
 */
export const clockKey = (state: Pick<MatchState, 'match' | 'added'>): string =>
  state.added ? `${state.match.minute}+${state.added}` : String(state.match.minute);
/** The added minute being played (match-22), as an event or line stamps it, or nothing. */
export const addedStamp = (state: Pick<MatchState, 'added'>): { addedTime?: number } =>
  state.added ? { addedTime: state.added } : {};
/** How many men each side is down (match-16). */
export const menDown = (match: MatchState['match']): [number, number] => [
  match.home.sentOffIds?.length ?? 0,
  match.away.sentOffIds?.length ?? 0,
];

/**
 * Where the selected player plays: the formation slot they fill (match-11), with their
 * familiarity there, or their primary position (familiarity 100) when the slot is theirs.
 */
export function playedSlot(session: MatchSession): { position: Position; familiarity: number } {
  const setup = session.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const primary = { position: player.primaryPosition, familiarity: 100 };
  const own = selectedSide(setup) === 0 ? session.state.match.home : session.state.match.away;
  const formation = own.formation as Formation | undefined;
  const index = own.starterIds.indexOf(player.id);
  const slot = formation ? FORMATION_SLOTS[formation]?.[index]?.position : undefined;
  if (
    !slot ||
    slot === player.primaryPosition ||
    (slot === 'GK') !== (player.primaryPosition === 'GK')
  )
    return primary;
  const familiarity = player.secondaryPositions.find((p) => p.position === slot)?.familiarity ?? 0;
  return { position: slot, familiarity };
}
/** True when the team attacks towards x = 100 at this minute. */
export const attacksRight = (session: MatchSession, teamId: string, minute: number) =>
  (teamId === session.setup.home.id) !== minute > 45;
export const sideTeam = (session: MatchSession, side: number) =>
  side === 0 ? session.setup.home.id : session.setup.away.id;
