import type { Counterpart, Hex, KitPattern } from '../../../model/domain';

/**
 * Identity data for new national worlds. Countries and their geography are real; clubs,
 * leagues and competitions are fictional but clearly reference their real counterparts.
 * Sporting rules stay in profiles.ts; this data only names and places things.
 */
export interface Town {
  /** Real town or city name. */
  name: string;
  /** Real coordinates, decimal degrees (about two decimal places is enough). */
  lat: number;
  lon: number;
}

/** A fictional club referencing exactly one real club in the professional tiers. */
export interface ReferencedClub {
  /** Fictional name: real city plus a nod to the real club's nickname or colours. */
  name: string;
  /** The real club referenced. Documentation only: never shown in the game or saved. */
  reference: string;
  /** Real home city or town. */
  city: string;
  lat: number;
  lon: number;
  /**
   * The region key of the lowest simulated division's group the club belongs to by geography
   * (for example England 'North' or 'South'); used when clubs move between regional groups.
   */
  region: string;
  /** Primary, secondary and accent colours as #rrggbb, matching the real club's colours. */
  colours: [Hex, Hex, Hex];
  /** Home shirt pattern resembling the real club's usual home kit. */
  pattern: KitPattern;
  /** Fictional stadium name evoking the real ground without using its real name. */
  stadium: string;
  /** Approximate real stadium capacity. */
  capacity: number;
  /** Stature within its division, 1 (smallest) to 10 (biggest), from real size and recent standing. */
  stature: number;
  /** For reserve teams: the fictional `name` of the parent club in this file. */
  reserveOf?: string;
}

export interface NamedReference {
  /** Fictional display name. */
  name: string;
  /** The real competition it references. Documentation only. */
  reference: string;
}

export interface CountryIdentity {
  counterpart: Counterpart;
  /** Real country name shown in the game. */
  name: string;
  /** Adjective used in competition names, e.g. 'English'. */
  adjective: string;
  /** Display names by tier, with group display names for multi-group tiers (in profile order). */
  divisions: Record<number, NamedReference & { groups?: string[] }>;
  cup: NamedReference;
  /** Italy only: the third-tier cup. */
  tierCup?: NamedReference;
  /**
   * Referenced professional tiers. Each listed tier holds exactly the profile's club count for
   * the 2026/27 reference season. Tiers not listed are filled with clubs in real towns.
   */
  clubs: Partial<Record<number, ReferencedClub[]>>;
  /**
   * Real towns for generated lower-tier and feeder clubs, keyed by the lowest division's region
   * keys. No town appears twice, and none is the home city of a referenced club.
   */
  towns: Record<string, Town[]>;
  /**
   * For every non-referenced tier: per group (profile order), the region keys whose towns supply
   * that group. The lowest division's groups each use their own region.
   */
  groupRegions: Partial<Record<number, string[][]>>;
}
