import type { Club, ClubEdit, Hex, Id, NameEdit, World, WorldEdits } from '../../model/domain';
import { createRng } from '../rng';
import { CREST_SHAPES, CREST_SYMBOLS } from '../assets/crest';

/**
 * Edit mode (AGENTS.md §5): rename clubs, leagues and players, change club colours and
 * regenerate crests. Every edit keeps the entity's original values, so it can be reverted
 * and exported as a pack that applies to other worlds with the same clubs and leagues.
 * Edits change presentation only: no sporting rule reads a name, colour or crest.
 */
export const NAME_LIMIT = 40;
export const EDIT_PACK_LIMIT = 50_000;
const HEX = /^#[0-9a-f]{6}$/;

export type EditAction =
  | { type: 'rename-club'; id: Id; name: string }
  | { type: 'recolour-club'; id: Id; colors: [Hex, Hex, Hex] }
  | { type: 'regenerate-crest'; id: Id }
  | { type: 'set-crest'; id: Id; crest: { shape: number; symbol: number } }
  | { type: 'revert-club'; id: Id }
  | { type: 'rename-league'; id: Id; name: string }
  | { type: 'revert-league'; id: Id }
  | { type: 'rename-player'; id: Id; name: string }
  | { type: 'revert-player'; id: Id };

export const emptyEdits = (): WorldEdits => ({ clubs: {}, leagues: {}, players: {} });

/** A trimmed, single-spaced name of 1–40 characters, or an error. */
export function cleanName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > NAME_LIMIT) throw new Error('Invalid name');
  return clean;
}
export function cleanColors(colors: readonly string[]): [Hex, Hex, Hex] {
  const clean = colors.map((color) => color.toLowerCase());
  if (clean.length !== 3 || clean.some((color) => !HEX.test(color)))
    throw new Error('Invalid colours');
  return clean as [Hex, Hex, Hex];
}
const validCrest = (crest: { shape: number; symbol: number }) =>
  Number.isInteger(crest.shape) &&
  crest.shape >= 0 &&
  crest.shape < CREST_SHAPES.length &&
  Number.isInteger(crest.symbol) &&
  crest.symbol >= 0 &&
  crest.symbol < CREST_SYMBOLS.length;

/** Recolour a club: the crest takes the colours in order, the kits rotate them. */
function paint(club: Club, colors: [Hex, Hex, Hex]): void {
  const [a, b, c] = colors;
  club.crest = { ...club.crest, colors: [a, b, c] };
  club.kits = {
    home: { ...club.kits.home, colors: [a, b, c] },
    away: { ...club.kits.away, colors: [c, a, b] },
    third: { ...club.kits.third, colors: [b, c, a] },
  };
}

/** The next crest for a club: a different shape and symbol, seeded by the current one. */
export function nextCrest(world: World, club: Club): { shape: number; symbol: number } {
  const rng = createRng(
    `${world.seed}:edit:crest:${club.id}:${club.crest.shape}:${club.crest.symbol}`,
  );
  const shape = (club.crest.shape + rng.int(1, CREST_SHAPES.length - 1)) % CREST_SHAPES.length;
  const symbol = (club.crest.symbol + rng.int(1, CREST_SYMBOLS.length - 1)) % CREST_SYMBOLS.length;
  return { shape, symbol };
}

/**
 * A private copy of what edits change: the edits record and the club, league and player
 * maps (entries are copied when edited), plus records and legacies that copy names.
 */
function draft(input: World): World {
  return {
    ...input,
    edits: structuredClone(input.edits ?? emptyEdits()),
    clubs: { ...input.clubs },
    leagues: { ...input.leagues },
    players: { ...input.players },
    records: [...input.records],
    legacies: [...input.legacies],
  };
}
function finish(world: World): World {
  const edits = world.edits!;
  if (
    !Object.keys(edits.clubs).length &&
    !Object.keys(edits.leagues).length &&
    !Object.keys(edits.players).length
  )
    delete world.edits;
  return world;
}

function setName(map: Record<Id, NameEdit>, id: Id, current: string, name: string): void {
  const original = map[id]?.original ?? current;
  if (name === original) delete map[id];
  else map[id] = { name, original };
}

/** Apply one edit to a draft. */
function edit(world: World, action: EditAction): void {
  const edits = world.edits!;
  switch (action.type) {
    case 'rename-league':
    case 'revert-league': {
      const current = world.leagues[action.id];
      if (!current) throw new Error('Unknown league');
      const original = edits.leagues[action.id]?.original ?? current.name;
      const name = action.type === 'revert-league' ? original : cleanName(action.name);
      setName(edits.leagues, action.id, current.name, name);
      world.leagues[action.id] = { ...current, name };
      return;
    }
    case 'rename-player':
    case 'revert-player': {
      const current = world.players[action.id];
      if (!current) throw new Error('Unknown player');
      const original = edits.players[action.id]?.original ?? current.name;
      const name = action.type === 'revert-player' ? original : cleanName(action.name);
      setName(edits.players, action.id, current.name, name);
      world.players[action.id] = { ...current, name };
      // Records and legacies copy the name; keep them in step.
      world.records.forEach((record, index) => {
        if (record.playerId === action.id) world.records[index] = { ...record, playerName: name };
      });
      world.legacies.forEach((legacy, index) => {
        if (legacy.playerId === action.id) world.legacies[index] = { ...legacy, name };
      });
      return;
    }
  }
  const current = world.clubs[action.id];
  if (!current) throw new Error('Unknown club');
  const club: Club = structuredClone(current);
  world.clubs[club.id] = club;
  const existing = edits.clubs[club.id];
  if (action.type === 'revert-club') {
    if (!existing) return;
    club.name = existing.original.name;
    club.crest = structuredClone(existing.original.crest);
    club.kits = structuredClone(existing.original.kits);
    delete edits.clubs[club.id];
    return;
  }
  const record: ClubEdit = existing ?? {
    original: {
      name: current.name,
      crest: structuredClone(current.crest),
      kits: structuredClone(current.kits),
    },
  };
  if (action.type === 'rename-club') {
    club.name = cleanName(action.name);
    if (club.name === record.original.name) delete record.name;
    else record.name = club.name;
  } else if (action.type === 'recolour-club') {
    record.colors = cleanColors(action.colors);
    paint(club, record.colors);
  } else {
    const crest = action.type === 'set-crest' ? action.crest : nextCrest(world, current);
    if (!validCrest(crest)) throw new Error('Invalid crest');
    record.crest = { shape: crest.shape, symbol: crest.symbol };
    club.crest = { ...club.crest, ...record.crest };
  }
  if (record.name || record.colors || record.crest) edits.clubs[club.id] = record;
  else delete edits.clubs[club.id];
}

/**
 * Apply one edit from the UI. Copies only what edits touch (structural sharing, like the
 * career actions), so the rest of the world graph is shared with the previous state.
 */
export function applyEditAction(input: World, action: EditAction): World {
  const world = draft(input);
  edit(world, action);
  return finish(world);
}

/** The shareable file: edited values, each with the entity's id and original name. */
export interface EditPack {
  format: 'pitch-to-glory-edits';
  version: 1;
  world: { seed: string; format: 'legacy' | 'national-v1' };
  clubs: {
    id: Id;
    original: string;
    name?: string;
    colors?: [Hex, Hex, Hex];
    crest?: { shape: number; symbol: number };
  }[];
  leagues: { id: Id; original: string; name: string }[];
  players: { id: Id; original: string; name: string }[];
}

export function exportEdits(world: World): EditPack {
  const edits = world.edits ?? emptyEdits();
  return {
    format: 'pitch-to-glory-edits',
    version: 1,
    world: { seed: world.seed, format: world.format === 'national-v1' ? 'national-v1' : 'legacy' },
    clubs: Object.entries(edits.clubs).map(([id, edit]) => ({
      id,
      original: edit.original.name,
      ...(edit.name ? { name: edit.name } : {}),
      ...(edit.colors ? { colors: edit.colors } : {}),
      ...(edit.crest ? { crest: edit.crest } : {}),
    })),
    leagues: Object.entries(edits.leagues).map(([id, edit]) => ({
      id,
      original: edit.original,
      name: edit.name,
    })),
    players: Object.entries(edits.players).map(([id, edit]) => ({
      id,
      original: edit.original,
      name: edit.name,
    })),
  };
}

/** Check an imported pack strictly; throws on anything malformed. */
export function parseEditPack(value: unknown): EditPack {
  const fail = (): never => {
    throw new Error('Invalid edit file');
  };
  const record = (v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail();
  const list = (v: unknown) => (Array.isArray(v) ? v : fail());
  const str = (v: unknown, max = 200) =>
    typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail();
  const name = (v: unknown) => {
    try {
      return cleanName(str(v));
    } catch {
      return fail();
    }
  };
  const pack = record(value);
  if (pack.format !== 'pitch-to-glory-edits' || pack.version !== 1) fail();
  const world = record(pack.world);
  const clubs = list(pack.clubs);
  const leagues = list(pack.leagues);
  const players = list(pack.players);
  if (clubs.length + leagues.length + players.length > EDIT_PACK_LIMIT) fail();
  const named = (entry: unknown) => {
    const e = record(entry);
    return { id: str(e.id), original: str(e.original), name: name(e.name) };
  };
  return {
    format: 'pitch-to-glory-edits',
    version: 1,
    world: {
      seed: str(world.seed, 400),
      format: world.format === 'national-v1' ? 'national-v1' : 'legacy',
    },
    clubs: clubs.map((entry) => {
      const e = record(entry);
      const club: EditPack['clubs'][number] = { id: str(e.id), original: str(e.original) };
      if (e.name !== undefined) club.name = name(e.name);
      if (e.colors !== undefined) {
        try {
          club.colors = cleanColors(list(e.colors).map((c) => str(c, 7)));
        } catch {
          fail();
        }
      }
      if (e.crest !== undefined) {
        const crest = record(e.crest);
        const parsed = { shape: crest.shape as number, symbol: crest.symbol as number };
        if (!validCrest(parsed)) fail();
        club.crest = parsed;
      }
      if (!club.name && !club.colors && !club.crest) fail();
      return club;
    }),
    leagues: leagues.map(named),
    players: players.map(named),
  };
}

type Kind = 'clubs' | 'leagues' | 'players';
/** The name an entity had before any edit. */
function originalName(world: World, kind: Kind, id: Id, current: string): string {
  if (kind === 'clubs') return world.edits?.clubs[id]?.original.name ?? current;
  return world.edits?.[kind][id]?.original ?? current;
}

/**
 * Apply a pack. Each entry targets the entity with its id when that entity's original name
 * matches (the same world), or otherwise the one entity of that kind with that original name
 * (another world with the same referenced clubs and leagues). Entries without a single match
 * are skipped. The world is copied once, however large the pack.
 */
export function applyEditPack(
  input: World,
  pack: EditPack,
): { world: World; applied: number; skipped: number } {
  const world = draft(input);
  let applied = 0;
  let skipped = 0;
  const target = (kind: Kind) => {
    const entities = input[kind] as Record<Id, { id: Id; name: string }>;
    const byName = new Map<string, Id | null>();
    for (const entity of Object.values(entities)) {
      const original = originalName(input, kind, entity.id, entity.name);
      byName.set(original, byName.has(original) ? null : entity.id);
    }
    return (id: Id, original: string): Id | null => {
      const direct = entities[id];
      if (direct && originalName(input, kind, id, direct.name) === original) return id;
      return byName.get(original) ?? null;
    };
  };
  const club = target('clubs');
  for (const entry of pack.clubs) {
    const id = club(entry.id, entry.original);
    if (!id) {
      skipped++;
      continue;
    }
    if (entry.name) edit(world, { type: 'rename-club', id, name: entry.name });
    if (entry.colors) edit(world, { type: 'recolour-club', id, colors: entry.colors });
    if (entry.crest) edit(world, { type: 'set-crest', id, crest: entry.crest });
    applied++;
  }
  for (const [kind, entries] of [
    ['leagues', pack.leagues],
    ['players', pack.players],
  ] as const) {
    const find = target(kind);
    for (const entry of entries) {
      const id = find(entry.id, entry.original);
      if (!id) {
        skipped++;
        continue;
      }
      edit(world, {
        type: kind === 'leagues' ? 'rename-league' : 'rename-player',
        id,
        name: entry.name,
      });
      applied++;
    }
  }
  return { world: finish(world), applied, skipped };
}
