/**
 * The save shape check (docs/RELEASING.md, "Save schema"): fails when the persisted save shape
 * (every type a save file holds, from SaveFile in src/model/domain.ts) differs from the shape
 * recorded for the current CONFIG.saves.schemaVersion in src/persistence/saveShape.json.
 *
 *   npm run check:save-shape                              check (CI, checks job)
 *   npm run check:save-shape -- --update                  record a new schema version's shape
 *   npm run check:save-shape -- --update --same-version   re-record an unshipped schema's shape
 *   npm run check:save-shape -- --print                   print every type's description
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CONFIG } from '../src/engine/config';
import {
  compareSaveShape,
  extractSaveShape,
  SAVE_SHAPE_RECORD,
  SAVE_SHAPE_ROOT,
  saveShapeProgram,
  shapeRecord,
  type SaveShapeRecord,
} from './saveShape';

const { values } = parseArgs({
  options: {
    update: { type: 'boolean', default: false },
    'same-version': { type: 'boolean', default: false },
    print: { type: 'boolean', default: false },
  },
});
const program = saveShapeProgram('.', [SAVE_SHAPE_ROOT.file]);
const shape = extractSaveShape(program, SAVE_SHAPE_ROOT.file, SAVE_SHAPE_ROOT.type);
const version = CONFIG.saves.schemaVersion;
if (values.print)
  for (const [key, description] of Object.entries(shape.types))
    console.log(`${key} = ${description}`);
const record = existsSync(SAVE_SHAPE_RECORD)
  ? (JSON.parse(readFileSync(SAVE_SHAPE_RECORD, 'utf8')) as SaveShapeRecord)
  : null;

if (values.update) {
  if (record && record.schemaVersion > version) {
    console.error(`The record is for schema ${record.schemaVersion}, newer than ${version}.`);
    process.exit(1);
  }
  if (record?.schemaVersion === version && record.hash !== shape.hash && !values['same-version']) {
    console.error(
      `Schema ${version} already has a recorded shape. Bump CONFIG.saves.schemaVersion (with a` +
        ' migration) first, or pass --same-version if this schema has not shipped yet or the' +
        ' change cannot alter stored JSON.',
    );
    process.exit(1);
  }
  writeFileSync(SAVE_SHAPE_RECORD, `${JSON.stringify(shapeRecord(version, shape), null, 2)}\n`);
  console.log(
    `Recorded the save shape of schema ${version} (${Object.keys(shape.types).length} types, ${shape.hash.slice(0, 12)}).`,
  );
  process.exit(0);
}
if (!record) {
  console.error(`${SAVE_SHAPE_RECORD} is missing: run npm run check:save-shape -- --update.`);
  process.exit(1);
}
const result = compareSaveShape(record, version, shape);
if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}
console.log(result.message);
