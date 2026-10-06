import { CREST_SHAPES, CREST_SYMBOLS } from '../engine/assets/crest';
import { NAME_LIMIT } from '../engine/world/edits';
import { kits, number, object, palette, requireValue, text } from './worldValidation';

/**
 * Edit mode records (milestone 9). Each edit names an existing club, league or player (a
 * renamed player who has since retired may live in the archive), carries only the fields it
 * changes, and keeps valid originals so it can be reverted.
 */
export function validateEdits(w: Record<string, unknown>): void {
  if (w.edits === undefined) return;
  const edits = object(w.edits);
  const clubs = object(w.clubs);
  const leagues = object(w.leagues);
  const players = object(w.players);
  const archived = w.archive ? object(object(w.archive).players) : {};
  const name = (value: unknown) => {
    text(value, NAME_LIMIT);
    requireValue((value as string).trim() === value && (value as string).length > 0);
  };
  const crest = (value: unknown) => {
    const c = object(value);
    number(c.shape, 0, CREST_SHAPES.length - 1, true);
    number(c.symbol, 0, CREST_SYMBOLS.length - 1, true);
  };
  for (const [id, value] of Object.entries(object(edits.clubs))) {
    requireValue(clubs[id] !== undefined);
    const edit = object(value);
    requireValue(edit.name !== undefined || edit.colors !== undefined || edit.crest !== undefined);
    if (edit.name !== undefined) name(edit.name);
    if (edit.colors !== undefined) palette(edit.colors);
    if (edit.crest !== undefined) crest(edit.crest);
    const original = object(edit.original);
    text(original.name);
    crest(original.crest);
    palette(object(original.crest).colors);
    kits(original.kits);
  }
  for (const [kind, map, alsoArchived] of [
    ['leagues', leagues, false],
    ['players', players, true],
  ] as const)
    for (const [id, value] of Object.entries(object(edits[kind]))) {
      requireValue(map[id] !== undefined || (alsoArchived && archived[id] !== undefined));
      const edit = object(value);
      name(edit.name);
      text(edit.original);
      requireValue(edit.name !== edit.original);
    }
}
