import type { ReplayFrame } from '../../../model/domain';
import type { MatchSetup } from '../../../engine/match';
import { OFF_ANIMATION } from '../../../engine/match/parked';
import { replayIds, surname } from '../cam';
import { shirtNumber } from '../pitchArt';
import type { ChainCastView } from './chain';

/*
 * Who a clip draws (docs/EXPERIENCE-REDESIGN-1.0.md §1.3): a cast of at most seven as 24–26 px
 * tokens in their team's colours — you, your direct opponent, one or two teammates, one or two
 * defenders and the keeper — and up to four context players as faint 16 px ghosts. Everyone
 * else is hidden. Labels: a gold YOU always; the direct opponent's name on a chain's first step
 * only (the matchup is the read); shirt numbers otherwise; no other names.
 */
export const MAX_CAST = 7;
export const MAX_GHOSTS = 4;

export type ClipRole = 'you' | 'opponent' | 'teammate' | 'defender' | 'keeper';
export interface ClipMember {
  id: string;
  role: ClipRole;
  /** On the selected player's side. */
  own: boolean;
  /** What the token carries under it: YOU, the opponent's name, or nothing (its number). */
  label: 'you' | 'name' | 'number';
  /** The surname, when the label is a name. */
  name?: string;
  /** The shirt number drawn on the token. */
  number: number;
}
export interface ClipCast {
  members: ClipMember[];
  ghosts: string[];
}

type CastSetup = Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>;

/**
 * The tokens of a clip from a step's cast: anyone who plays the ball in the clip's keyframes
 * (the teammate who finishes a square pass, the keeper who saves) joins after you and your
 * opponent, ahead of the rest; at most seven, and only players on the pitch.
 */
export function clipCast(
  cast: ChainCastView,
  setup: CastSetup,
  frames: readonly ReplayFrame[],
  options: { step: number; numbers?: Readonly<Record<string, number>> },
): ClipCast {
  const last = frames.at(-1);
  const index = new Map((frames[0]?.players ?? []).map((player, i) => [player.id, i]));
  const onPitch = new Set(
    (last?.players ?? [])
      .filter((player) => player.animation !== OFF_ANIMATION)
      .map((player) => player.id),
  );
  const own = new Set(
    (setup.home.playerIds.includes(setup.selectedPlayerId) ? setup.home : setup.away)
      .playerIds as string[],
  );
  const keeper = (id: string) => setup.players[id]?.primaryPosition === 'GK';
  const actors = replayIds(frames).filter(
    (id) => id !== cast.you && id !== cast.opponent && id !== cast.keeper,
  );
  const candidates: [string | undefined, ClipRole | null][] = [
    [cast.you, 'you'],
    [cast.opponent, 'opponent'],
    ...actors.map((id): [string, null] => [id, null]),
    [cast.keeper, 'keeper'],
    ...cast.teammates.map((id): [string, ClipRole] => [id, 'teammate']),
    ...cast.defenders.map((id): [string, ClipRole] => [id, 'defender']),
  ];
  const members: ClipMember[] = [];
  const seen = new Set<string>();
  for (const [id, given] of candidates) {
    if (!id || seen.has(id) || members.length >= MAX_CAST) continue;
    if (!onPitch.has(id) && id !== cast.you) continue;
    if (!setup.players[id]) continue;
    seen.add(id);
    const mine = own.has(id);
    const role: ClipRole = given ?? (keeper(id) ? 'keeper' : mine ? 'teammate' : 'defender');
    const label =
      role === 'you' ? 'you' : role === 'opponent' && options.step === 0 ? 'name' : 'number';
    members.push({
      id,
      role,
      own: mine,
      label,
      ...(label === 'name' ? { name: surname(setup.players[id]!.name) } : {}),
      number: shirtNumber(options.numbers, id, index.get(id) ?? 0),
    });
  }
  const ghosts = cast.ghosts.filter((id) => !seen.has(id) && onPitch.has(id)).slice(0, MAX_GHOSTS);
  return { members, ghosts };
}

/** The clip's accessible description: who is in it, as the tokens show them. */
export function castDescription(cast: ClipCast, setup: CastSetup, words: { you: string }): string {
  return cast.members
    .map((member) =>
      member.label === 'you'
        ? `${words.you} (${member.number})`
        : member.label === 'name'
          ? `${member.name} (${member.number})`
          : `${member.number}${setup.players[member.id] ? ` ${surname(setup.players[member.id]!.name)}` : ''}`,
    )
    .join(', ');
}
