import type { World } from '../../../model/domain';
import { CONFIG } from '../../config';

/**
 * A revealed ambition as a stated career preference (review phase 4, step 4.2): what the
 * player wants from their career, and how far they have it now. It moves their weekly morale;
 * every decision stays theirs.
 */
const D = CONFIG.career.social.morale.drive;
export type DriveKind = 'summit' | 'starter' | 'roots';
export interface Drive {
  kind: DriveKind;
  /** The morale it adds this week (negative when the career goes against it). */
  value: number;
  /** Whether the career gives the player what they want now. */
  met: boolean;
  /** For the statement: the age by which the summit is wanted. */
  age?: number;
}

/** The ambition as a preference: summit, regular football or roots. */
export const driveKind = (ambition: number): DriveKind =>
  ambition >= D.summit.from ? 'summit' : ambition >= D.starter.from ? 'starter' : 'roots';

/** Seasons at the current club, this one included. */
function seasonsHere(world: World): number {
  const career = world.career!;
  const clubId = world.players[career.playerId]!.clubId;
  const move = [...career.market.moves]
    .reverse()
    .find((entry) => entry.toClubId === clubId && entry.kind !== 'renewal');
  return world.date.season - (move?.date.season ?? career.startSeason) + 1;
}

/** The player's stated preference, once their ambition is revealed; null before. */
export function careerDrive(world: World): Drive | null {
  const career = world.career;
  if (!career) return null;
  const player = world.players[career.playerId]!;
  if (!player.hidden.revealed.includes('ambition')) return null;
  const kind = driveKind(player.hidden.ambition);
  if (kind === 'summit') {
    const club = player.clubId ? world.clubs[player.clubId] : undefined;
    const top = club ? world.leagues[club.leagueId]?.tier === 1 : false;
    const age = world.date.season - player.birthSeason;
    // Past the age without it, each season costs more, to the limit.
    const late = Math.max(0, age - D.summit.age);
    const value = top ? D.summit.met : late ? Math.max(-D.summit.limit, late * D.summit.behind) : 0;
    return { kind, value, met: top, age: D.summit.age };
  }
  if (kind === 'starter') {
    const selection = career.market.selection;
    const matchdays = selection.selected + selection.dropped;
    if (player.injuryId || matchdays < D.starter.matchdays) return { kind, value: 0, met: true };
    const share = selection.selected / matchdays;
    return {
      kind,
      value:
        share >= D.starter.regular
          ? D.starter.met
          : share < D.starter.fringe
            ? D.starter.missed
            : 0,
      met: share >= D.starter.fringe,
    };
  }
  const seasons = seasonsHere(world);
  const moved = seasons === 1 && career.market.moves.some((move) => move.kind !== 'renewal');
  return {
    kind,
    value: seasons >= D.roots.settled ? D.roots.met : moved ? D.roots.moved : 0,
    met: !moved,
  };
}
