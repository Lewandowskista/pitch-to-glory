import type {
  Attributes,
  Club,
  CliqueKind,
  DressingRoom,
  MoralePart,
  Player,
  World,
} from '../../../model/domain';
import { CONFIG } from '../../config';

/**
 * Pure social rules: club culture fit, clique membership, teammate compatibility and the
 * parts of the weekly morale target. Every value is explained by named parts so the UI can
 * show why the player thrives or struggles.
 */
export const S = CONFIG.career.social;
export const CLIQUE_KINDS: readonly CliqueKind[] = ['core', 'seniors', 'young', 'internationals'];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
/** −1 to 1 around 50. */
const centred = (value: number) => (value - 50) / 50;
const round1 = (value: number) => Math.round(value * 10) / 10;

export const ageAt = (world: World, player: Player) => world.date.season - player.birthSeason;
export const careerPlayer = (world: World) => world.players[world.career!.playerId]!;
export const careerClub = (world: World): Club => world.clubs[careerPlayer(world).clubId!]!;
export const careerRoom = (world: World): DressingRoom =>
  world.dressingRooms[careerClub(world).dressingRoomId]!;

/** Attributes each playing style rewards. */
const STYLE_ATTRIBUTES: Record<string, (keyof Attributes)[]> = {
  possession: ['passing', 'vision', 'firstTouch', 'composure'],
  direct: ['pace', 'crossing', 'heading', 'strength'],
  press: ['stamina', 'workRate', 'aggression', 'tackling'],
  counter: ['pace', 'acceleration', 'finishing', 'decisions'],
  balanced: [],
};
const ATTACKERS = ['ST', 'LW', 'RW', 'AM'];

export type FitPart =
  'ambition' | 'youth' | 'discipline' | 'loyalty' | 'style' | 'attacking' | 'sociability';
export interface CultureFit {
  value: number;
  parts: Record<FitPart, number>;
}
/**
 * How well the player's personality and style suit a club's culture (AGENTS.md §9.6).
 * Temperament is read as composure: calm players suit disciplined clubs.
 */
export function cultureFit(world: World, player: Player, club: Club): CultureFit {
  const p = player.personality;
  const culture = club.culture;
  const age = ageAt(world, player);
  const keeper = player.primaryPosition === 'GK';
  const values = Object.values(player.attributes);
  const overall = values.reduce((sum, v) => sum + v, 0) / values.length;
  const style = STYLE_ATTRIBUTES[club.playingStyle] ?? [];
  const styleAverage = style.length
    ? style.reduce((sum, key) => sum + player.attributes[key], 0) / style.length
    : overall;
  const parts: Record<FitPart, number> = {
    ambition: round1(centred(p.ambition) * centred((culture.winNow + club.reputation) / 2) * 12),
    youth:
      age <= 21
        ? round1(centred(culture.youth) * 10)
        : age >= 28
          ? round1(-centred(culture.youth) * 4)
          : 0,
    discipline: round1(centred(culture.discipline) * centred(p.temperament) * 10),
    loyalty: culture.fanOwned ? round1(centred(p.loyalty) * 8) : 0,
    style: keeper ? 0 : round1(clamp((styleAverage - overall) * 0.8, -10, 10)),
    attacking: keeper
      ? 0
      : round1(centred(culture.attacking) * (ATTACKERS.includes(player.primaryPosition) ? 6 : -6)),
    sociability: round1(centred(p.sociability) * 4),
  };
  const value = Math.round(clamp(55 + Object.values(parts).reduce((sum, v) => sum + v, 0), 0, 100));
  return { value, parts };
}

/** The clique a squad member belongs to. */
export function cliqueKindOf(
  world: World,
  club: Club,
  player: Player,
  internationals: boolean,
): CliqueKind {
  const age = ageAt(world, player);
  if (age <= S.cliques.youngAge) return 'young';
  if (age >= S.cliques.seniorAge) return 'seniors';
  if (internationals && player.nationalityId !== club.countryId) return 'internationals';
  return 'core';
}
/** Whether a club has enough foreign players for its own group. */
export function hasInternationals(world: World, club: Club): boolean {
  return (
    club.playerIds.filter((id) => {
      const player = world.players[id]!;
      const age = ageAt(world, player);
      return (
        player.nationalityId !== club.countryId &&
        age > S.cliques.youngAge &&
        age < S.cliques.seniorAge
      );
    }).length >= S.cliques.internationalsMinimum
  );
}

export type CompatibilityPart = 'clique' | 'nationality' | 'sociability' | 'temperament' | 'fit';
/** Starting chemistry between the player and a teammate, with its reasons. */
export function compatibility(
  world: World,
  player: Player,
  teammate: Player,
  club: Club,
): { value: number; parts: Record<CompatibilityPart, number> } {
  const T = S.teammates;
  const internationals = hasInternationals(world, club);
  const parts: Record<CompatibilityPart, number> = {
    clique:
      cliqueKindOf(world, club, player, internationals) ===
      cliqueKindOf(world, club, teammate, internationals)
        ? T.sameClique
        : 0,
    nationality: player.nationalityId === teammate.nationalityId ? T.sameNationality : 0,
    sociability: round1(
      ((player.personality.sociability + teammate.personality.sociability) / 2 - 50) *
        T.sociability,
    ),
    temperament: round1(
      -Math.abs(player.personality.temperament - teammate.personality.temperament) *
        T.temperamentClash,
    ),
    fit: round1((cultureFit(world, player, club).value - 50) * T.cultureFit),
  };
  return {
    value: Math.round(clamp(T.base + Object.values(parts).reduce((s, v) => s + v, 0), 5, 95)),
    parts,
  };
}

export const MORALE_PARTS: readonly MoralePart[] = [
  'results',
  'playingTime',
  'trust',
  'chemistry',
  'dressingRoom',
  'cultureFit',
  'fans',
  'media',
  'situation',
];
export const boundPart = (value: number, limit: number = S.morale.partLimit) =>
  round1(clamp(value, -limit, limit));
