import type {
  FoundationState,
  WorldState,
  SaveFile,
  Settings,
  SlotId,
  World,
} from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import { CONFIG, ENGINE_VERSION } from '../engine/config';
import { validateWorld } from './worldSchema';
import { validateMatchSession } from '../engine/match';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontScale: 1,
  reducedMotion: false,
  backupReminder: true,
  simulationOnly: false,
};
export type FoundationSave = Omit<SaveFile, 'payload'> & { payload: FoundationState };
export type AppSave = Omit<SaveFile, 'payload'> & {
  payload: FoundationState | WorldState;
  /** Set when loading had to discard a stale or invalid match session; never persisted. */
  recovery?: SaveRecovery;
};
export type SaveRecovery = 'match-discarded';
export class SaveError extends Error {
  constructor(
    public readonly code: 'invalid' | 'future' | 'conflict' | 'locked' | 'large' | 'busy',
  ) {
    super(code);
  }
}
const invalid = (): never => {
  throw new SaveError('invalid');
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
const text = (value: unknown, max: number): string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value : invalid();
const integer = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const boolean = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid());
const date = (value: unknown): string => {
  const result = text(value, 40);
  return /^\d{4}-\d{2}-\d{2}T/.test(result) && Number.isFinite(Date.parse(result))
    ? result
    : invalid();
};
export function validateSlot(slot: number): asserts slot is SlotId {
  if (![1, 2, 3].includes(slot)) invalid();
}
export function validateSettings(value: unknown): Settings {
  const s = object(value);
  if (
    !['system', 'light', 'dark'].includes(String(s.theme)) ||
    typeof s.fontScale !== 'number' ||
    !Number.isFinite(s.fontScale) ||
    s.fontScale < CONFIG.accessibility.minFontScale ||
    s.fontScale > CONFIG.accessibility.maxFontScale
  )
    invalid();
  return {
    theme: s.theme as Settings['theme'],
    fontScale: s.fontScale as number,
    reducedMotion: boolean(s.reducedMotion),
    backupReminder: boolean(s.backupReminder),
    simulationOnly: boolean(s.simulationOnly),
  };
}
export function validateFoundation(value: unknown): FoundationState {
  const p = object(value);
  if (p.kind !== 'foundation') invalid();
  const g = object(p.gallery);
  return {
    kind: 'foundation',
    gallery: { seed: text(g.seed, 120), generation: integer(g.generation) },
    settings: validateSettings(p.settings),
  };
}
type Migration = (old: Record<string, unknown>) => Record<string, unknown>;
const migrations: Readonly<Record<number, Migration>> = {
  1: (old) => ({
    format: old.format,
    schemaVersion: 2,
    engineVersion: ENGINE_VERSION,
    slot: old.slot,
    name: old.name,
    createdAt: old.createdAt,
    updatedAt: old.updatedAt,
    revision: 0,
    payload: {
      kind: 'foundation',
      gallery: { seed: text(old.seed, 120), generation: 0 },
      settings: { ...DEFAULT_SETTINGS },
    },
  }),
  2: (old) => ({ ...old, schemaVersion: 3 }),
  // Keep the old world untouched. Its absent format discriminator selects legacy rules.
  3: (old) => ({ ...old, schemaVersion: 4 }),
  4: (old) => ({ ...old, schemaVersion: 5 }),
  // v6 adds optional lifecycle fields (archived people, release seasons) and versioned match sessions.
  5: (old) => ({ ...old, schemaVersion: 6 }),
};
export function migrateSave(value: unknown): AppSave {
  let save = object(value);
  if (save.format !== 'pitch-to-glory') invalid();
  let version = integer(save.schemaVersion);
  if (version > CONFIG.saves.schemaVersion) throw new SaveError('future');
  while (version < CONFIG.saves.schemaVersion) {
    const migration = migrations[version];
    if (!migration) return invalid();
    save = migration(save);
    version = integer(save.schemaVersion);
  }
  if (typeof save.slot !== 'number') invalid();
  validateSlot(save.slot as number);
  const createdAt = date(save.createdAt);
  const updatedAt = date(save.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) invalid();
  const { payload, recovery } = validatePayload(save.payload);
  return {
    format: 'pitch-to-glory',
    schemaVersion: CONFIG.saves.schemaVersion,
    engineVersion: text(save.engineVersion, 80),
    slot: save.slot as SlotId,
    name: text(save.name, 60),
    createdAt,
    updatedAt,
    revision: integer(save.revision),
    payload,
    ...(recovery ? { recovery } : {}),
  };
}
function validatePayload(value: unknown): {
  payload: FoundationState | WorldState;
  recovery?: SaveRecovery;
} {
  const payload = object(value);
  if (payload.kind === 'foundation') return { payload: validateFoundation(payload) };
  if (payload.kind !== 'world') invalid();
  const foundation = validateFoundation({ ...payload, kind: 'foundation' });
  let world;
  try {
    world = validateWorld(payload.world);
  } catch {
    return invalid();
  }
  if (payload.matchSession === undefined)
    return { payload: { ...foundation, kind: 'world', world } };
  // A match session is optional, replaceable state. If it was made by another engine
  // version, or no longer replays against this world, drop it and keep the world.
  const matchSession = matchSessionFor(world, payload.matchSession);
  return matchSession
    ? { payload: { ...foundation, kind: 'world', world, matchSession } }
    : { payload: { ...foundation, kind: 'world', world }, recovery: 'match-discarded' };
}
/** Returns the validated session, or null when it cannot belong to this world under this engine. */
export function matchSessionFor(world: World, value: unknown): MatchSession | null {
  try {
    const session = validateMatchSession(value);
    const setup = session.setup;
    if (
      setup.season !== world.date.season ||
      !world.clubs[setup.home.id] ||
      !world.clubs[setup.away.id]
    )
      return null;
    // Friendly snapshots must originate from this exact world, never imported fabricated squads.
    for (const club of [setup.home, setup.away]) {
      if (JSON.stringify(club) !== JSON.stringify(world.clubs[club.id])) return null;
      for (const id of club.playerIds)
        if (JSON.stringify(setup.players[id]) !== JSON.stringify(world.players[id])) return null;
    }
    return session;
  } catch {
    return null;
  }
}
export function parseSave(json: string): AppSave {
  if (new TextEncoder().encode(json).byteLength > CONFIG.saves.maxFileBytes)
    throw new SaveError('large');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    invalid();
  }
  return migrateSave(value);
}
export function createSave(slot: SlotId, name: string, payload: FoundationState): FoundationSave;
export function createSave(
  slot: SlotId,
  name: string,
  payload: FoundationState | WorldState,
): AppSave;
export function createSave(
  slot: SlotId,
  name: string,
  payload: FoundationState | WorldState,
): AppSave {
  const now = new Date().toISOString();
  return migrateSave({
    format: 'pitch-to-glory',
    schemaVersion: CONFIG.saves.schemaVersion,
    engineVersion: ENGINE_VERSION,
    slot,
    name,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    payload,
  });
}
