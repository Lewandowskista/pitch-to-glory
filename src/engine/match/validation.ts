import type { Position } from '../../model/domain';
import type { MatchSetup, MatchCommand, Tactics } from './types';
import { isRoleFor } from './roles';

const attributes = [
  'finishing',
  'passing',
  'dribbling',
  'firstTouch',
  'crossing',
  'heading',
  'tackling',
  'longShots',
  'setPieces',
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'jumping',
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
  'aggression',
];
const keeping = [
  'handling',
  'reflexes',
  'diving',
  'oneOnOnes',
  'kicking',
  'commandOfArea',
  'aerialReach',
];
const positions = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
export function validateJson(value: unknown, depth = 0): void {
  if (depth > 64) throw new Error('Match data nesting exceeds limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const entry of value) validateJson(entry, depth + 1);
    return;
  }
  if (
    value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Invalid match data key');
      validateJson(entry, depth + 1);
    }
    return;
  }
  throw new Error('Match data must contain finite JSON values');
}
function number(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function string(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
export function validateSetup(setup: MatchSetup): void {
  if (
    !setup ||
    setup.version !== 1 ||
    !string(setup.seed) ||
    !Number.isSafeInteger(setup.season) ||
    setup.season < 1 ||
    typeof setup.neutral !== 'boolean' ||
    !setup.home ||
    !setup.away ||
    setup.home.id === setup.away.id ||
    !setup.players ||
    !string(setup.selectedPlayerId)
  )
    throw new Error('Invalid match setup');
  const ids: string[] = [];
  for (const club of [setup.home, setup.away]) {
    if (
      !string(club.id) ||
      !number(club.reputation, 1, 99) ||
      !number(club.stadium?.pitchQuality, 0, 100) ||
      !Array.isArray(club.playerIds) ||
      club.playerIds.length < 11 ||
      club.playerIds.length > 100
    )
      throw new Error('Invalid match club');
    for (const id of club.playerIds) {
      const p = setup.players[id];
      ids.push(id);
      if (
        !string(id) ||
        !p ||
        p.id !== id ||
        p.clubId !== club.id ||
        !positions.includes(p.primaryPosition) ||
        typeof p.retired !== 'boolean' ||
        (p.injuryId !== null && !string(p.injuryId)) ||
        !number(p.fatigue, 0, 100) ||
        !number(p.fitness, 0, 100) ||
        !number(p.form, 0, 100) ||
        !Array.isArray(p.traits) ||
        p.traits.some((t) => !string(t)) ||
        !Array.isArray(p.secondaryPositions)
      )
        throw new Error('Invalid match player');
      for (const [names, values] of [
        [attributes, p.attributes],
        [keeping, p.keeperAttributes],
      ] as const) {
        if (
          !values ||
          Object.keys(values).length !== names.length ||
          names.some((name) => !number((values as Record<string, number>)[name], 1, 99))
        )
          throw new Error('Invalid match attributes');
      }
      if (
        p.secondaryPositions.some(
          (s) => !s || !positions.includes(s.position) || !number(s.familiarity, 0, 100),
        )
      )
        throw new Error('Invalid match position');
    }
  }
  if (
    new Set(ids).size !== ids.length ||
    Object.keys(setup.players).length !== ids.length ||
    !ids.includes(setup.selectedPlayerId)
  )
    throw new Error('Invalid match roster');
  const p = setup.players[setup.selectedPlayerId]!;
  if (p.retired || p.injuryId || p.fitness <= 0) throw new Error('Selected player unavailable');
}
/** Tactics must use a personal role from the selected player's own position list. */
export function validateTactics(t: Tactics, position: Position): void {
  if (
    !t ||
    typeof t.role !== 'string' ||
    !isRoleFor(position, t.role) ||
    !['low', 'balanced', 'high'].includes(t.risk) ||
    !['defensive', 'balanced', 'attacking'].includes(t.mentality) ||
    Object.keys(t).sort().join(',') !== 'mentality,risk,role'
  )
    throw new Error('Invalid tactics');
}
export function validateCommand(command: MatchCommand): void {
  if (!command || typeof command !== 'object') throw new Error('Invalid match command');
  const fields: Record<string, string[]> = {
    kickoff: ['type'],
    advance: ['type'],
    choose: ['choiceId', 'type'],
    halftime: ['response', 'type'],
    captain: ['instruction', 'type'],
    substitution: ['response', 'type'],
  };
  if (
    !fields[command.type] ||
    Object.keys(command).sort().join(',') !== fields[command.type]!.join(',')
  )
    throw new Error('Invalid match command');
  if (command.type === 'choose' && !string(command.choiceId)) throw new Error('Invalid choice');
}
