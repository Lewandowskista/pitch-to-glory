import type { Avatar, Crest, Kit } from '../model/domain';

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
