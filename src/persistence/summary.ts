import type { Avatar, Crest, Kit, World } from '../model/domain';

/**
 * The career player on a save card (part of the slot index record, `WorldSummary.career`).
 * `avatar`, `birthSeason` and `kit` arrived with the redesign's portrait cards: index records
 * written before then lack them, so readers fall back to the crest via `summaryPortrait`.
 * Index record only: no save-schema change. Kept free of Dexie so any screen can import it.
 */
export interface CareerSummary {
  name: string;
  level: number;
  clubName: string;
  crest: Crest;
  avatar?: Avatar;
  birthSeason?: number;
  /** The club's home kit, for the portrait's shirt. */
  kit?: Kit;
}

/** What a save card needs to draw the portrait, or null for an older index record. */
export function summaryPortrait(summary: {
  season: number;
  career?: CareerSummary;
}): { avatar: Avatar; age: number; kit?: Kit; crest: Crest } | null {
  const career = summary.career;
  if (!career?.avatar || typeof career.birthSeason !== 'number') return null;
  const age = summary.season - career.birthSeason;
  if (!Number.isFinite(age) || age < 0 || age > 110) return null;
  return { avatar: career.avatar, age, kit: career.kit, crest: career.crest };
}

/** A slot's world as its save card shows it (part of the slot index record). */
export interface WorldSummary {
  worldId: string;
  season: number;
  week: number;
  clubs: number;
  crests: Crest[];
  /** Present for career worlds: the player shown on the save card. */
  career?: CareerSummary;
}
/**
 * The index record's summary of a world. Light enough for the UI thread and the world worker,
 * which send it with a write so the persistence worker never reads the world for it.
 */
export function summarizeWorld(world: World): WorldSummary {
  return {
    worldId: world.id,
    season: world.date.season,
    week: world.date.week,
    clubs: Object.values(world.clubs).filter((club) => world.leagues[club.leagueId]).length,
    crests: Object.values(world.clubs)
      .slice(0, 3)
      .map((club) => club.crest),
    ...careerSummary(world),
  };
}
function careerSummary(world: World): Pick<WorldSummary, 'career'> {
  const player = world.career ? world.players[world.career.playerId] : undefined;
  const club = player?.clubId ? world.clubs[player.clubId] : undefined;
  return player && club
    ? {
        career: {
          name: player.name,
          level: world.career!.level,
          clubName: club.name,
          crest: club.crest,
          avatar: player.avatar,
          birthSeason: player.birthSeason,
          kit: club.kits.home,
        },
      }
    : {};
}
/** A summary sent with a write: checked for shape only, as it is display data. */
export function validSummary(value: unknown, worldId: string): value is WorldSummary {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  return (
    summary.worldId === worldId &&
    Number.isSafeInteger(summary.season) &&
    Number.isSafeInteger(summary.week) &&
    Number.isSafeInteger(summary.clubs) &&
    Array.isArray(summary.crests) &&
    summary.crests.length <= 3 &&
    (summary.career === undefined ||
      (summary.career !== null && typeof summary.career === 'object'))
  );
}
