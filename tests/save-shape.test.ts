import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  compareSaveShape,
  extractSaveShape,
  SAVE_SHAPE_RECORD,
  SAVE_SHAPE_ROOT,
  saveShapeProgram,
  shapeRecord,
  type SaveShape,
  type SaveShapeRecord,
} from '../scripts/saveShape';
import { CONFIG } from '../src/engine/config';

/** The shape of an in-memory `save.ts` exporting `SaveFile`. */
function shapeOf(source: string): SaveShape {
  const file = resolve('/virtual/save.ts');
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    noEmit: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, ...rest) =>
    name === file
      ? ts.createSourceFile(name, source, language)
      : getSourceFile(name, language, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === file || fileExists(name);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => (name === file ? source : readFile(name));
  return extractSaveShape(ts.createProgram([file], options, host), file, 'SaveFile');
}
const BASE = `
  export type Position = 'GK' | 'ST';
  export interface Player { id: string; position: Position; rating?: number }
  export interface SaveFile {
    schemaVersion: 3;
    players: Record<string, Player>;
    history: { season: number; goals: number }[];
    score: [number, number];
  }
`;

describe('save shape guard', () => {
  it('records the shape of the current save types for the current schema version', () => {
    const record = JSON.parse(readFileSync(SAVE_SHAPE_RECORD, 'utf8')) as SaveShapeRecord;
    const shape = extractSaveShape(
      saveShapeProgram('.', [SAVE_SHAPE_ROOT.file]),
      SAVE_SHAPE_ROOT.file,
      SAVE_SHAPE_ROOT.type,
    );
    const result = compareSaveShape(record, CONFIG.saves.schemaVersion, shape);
    expect(result.ok, result.message).toBe(true);
    // The walk reaches the world, the career and the saved match session.
    for (const name of ['World', 'Career', 'Player', 'MatchSession', 'Settings'])
      expect(shape.types).toHaveProperty([name]);
  });
  it('describes names, optionality, unions, records, arrays and tuples', () => {
    const shape = shapeOf(BASE);
    expect(shape.types).toEqual({
      Player: '{ "id": string; "position": Position; "rating"?: number }',
      Position: '"GK" | "ST"',
      SaveFile:
        '{ "history": Array<{ "goals": number; "season": number }>; "players": { [string]: Player }; "schemaVersion": 3; "score": [number, number] }',
    });
  });
  it('ignores comments, declaration order and readonly', () => {
    const reordered = `
      /** A position. */
      export type Position = 'ST' | 'GK';
      export interface SaveFile {
        readonly score: [number, number];
        // Seasons played.
        history: Array<{ goals: number; season: number }>;
        players: { [id: string]: Player };
        schemaVersion: 3;
      }
      export interface Player { rating?: number; position: Position; id: string }
    `;
    expect(shapeOf(reordered).hash).toBe(shapeOf(BASE).hash);
  });
  it.each([
    [
      'an added optional field',
      BASE.replace('rating?: number', 'rating?: number; captain?: boolean'),
    ],
    ['a removed field', BASE.replace('; rating?: number', '')],
    ['a field made optional', BASE.replace('id: string', 'id?: string')],
    ['a changed type', BASE.replace('rating?: number', 'rating?: string')],
    ['a new union member', BASE.replace("'GK' | 'ST'", "'GK' | 'ST' | 'CB'")],
    ['a changed nested object', BASE.replace('goals: number', 'goals: number; assists: number')],
  ])('changes the hash for %s, and names the changed type', (_label, source) => {
    const before = shapeOf(BASE);
    const after = shapeOf(source);
    expect(after.hash).not.toBe(before.hash);
    const result = compareSaveShape(shapeRecord(3, before), 3, after);
    expect(result.ok).toBe(false);
    expect([...result.changed, ...result.added, ...result.removed].length).toBeGreaterThan(0);
  });
  it('rejects types JSON cannot hold', () => {
    expect(() => shapeOf(BASE.replace('rating?: number', 'rating?: () => number'))).toThrow(
      /function/,
    );
    expect(() => shapeOf(BASE.replace('rating?: number', 'rating?: any'))).toThrow(/any/);
  });
  it('asks for a schema bump when the shape changes under the same version', () => {
    const before = shapeOf(BASE);
    const after = shapeOf(BASE.replace('rating?: number', 'rating?: number; captain?: boolean'));
    const same = compareSaveShape(shapeRecord(3, before), 3, after);
    expect(same.ok).toBe(false);
    expect(same.changed).toEqual(['Player']);
    expect(same.message).toMatch(/CONFIG\.saves\.schemaVersion is still 3/);
    expect(same.message).toMatch(/migration/);
    // Bumped but not recorded: the record must follow the bump.
    const bumped = compareSaveShape(shapeRecord(3, before), 4, after);
    expect(bumped.ok).toBe(false);
    expect(bumped.message).toMatch(/records schema 3/);
    // Recorded: passes.
    expect(compareSaveShape(shapeRecord(4, after), 4, after).ok).toBe(true);
    // A bump without a shape change still needs the record updated.
    expect(compareSaveShape(shapeRecord(3, before), 4, before).ok).toBe(false);
  });
});
