/**
 * The persisted save shape (docs/RELEASE-1.0-PLAN.md step 2.2, review finding S8): every type a
 * save file can hold, read from the TypeScript declarations with the compiler API, described
 * canonically and hashed. `scripts/check-save-shape.ts` compares it with the shape recorded for
 * the current `CONFIG.saves.schemaVersion` (src/persistence/saveShape.json), so a change to what
 * a save stores cannot ship without a schema bump, and an older tab refuses a newer save.
 *
 * Each named type (an interface or type alias declared in the project) is described once:
 * its properties sorted by name, with their optionality and types; index signatures, arrays,
 * tuples, unions (sorted) and literals; references to other named types by name. Comments,
 * declaration order, `readonly` and formatting do not count. Renaming a type changes the
 * record without changing stored JSON; the check explains how to record that.
 */
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

/** The type a save file is, and where its shape is recorded. */
export const SAVE_SHAPE_ROOT = { file: 'src/model/domain.ts', type: 'SaveFile' } as const;
export const SAVE_SHAPE_RECORD = 'src/persistence/saveShape.json';

export interface SaveShape {
  /** SHA-256 over every type's description. */
  hash: string;
  /** Each persisted named type's canonical description. */
  types: Record<string, string>;
}
/** What src/persistence/saveShape.json records: the shape each schema version shipped with. */
export interface SaveShapeRecord {
  schemaVersion: number;
  hash: string;
  /** A short hash per type, so a failed check can say which types changed. */
  types: Record<string, string>;
}

const shortHash = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The program the check reads: the save types and everything they reference. */
export function saveShapeProgram(root: string, files: string[]): ts.Program {
  const configPath = resolve(root, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  // Ambient types (Vite, Node) cannot appear in a save; leaving them out keeps the check fast.
  return ts.createProgram({
    rootNames: files.map((file) => resolve(root, file)),
    options: { ...parsed.options, types: [], noEmit: true },
  });
}

/**
 * Describe every type reachable from `rootName`, exported from `file`. Throws on shapes JSON
 * cannot hold (functions, symbols, `any`) and on two persisted types sharing one name.
 */
export function extractSaveShape(program: ts.Program, file: string, rootName: string): SaveShape {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(resolve(file));
  if (!source) throw new Error(`${file} is not part of the program`);
  const module = checker.getSymbolAtLocation(source);
  const exported = module && checker.getExportsOfModule(module).find((s) => s.name === rootName);
  if (!exported) throw new Error(`${file} does not export ${rootName}`);
  const rootSymbol =
    exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
  // Library types (Record, Partial, Array) are expanded; only the project's own are named.
  const projectFile = (declaration: ts.Declaration | undefined): boolean => {
    const sourceFile = declaration?.getSourceFile();
    return (
      !!sourceFile &&
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      !sourceFile.fileName.includes('/node_modules/')
    );
  };
  const types = new Map<string, string>();
  const owners = new Map<string, ts.Symbol>();

  /** The name of a project-declared alias or interface, with its type arguments. */
  function namedKey(type: ts.Type): string | undefined {
    const alias = type.aliasSymbol;
    if (alias && projectFile(alias.declarations?.[0])) {
      const args = type.aliasTypeArguments ?? [];
      return register(
        alias,
        args.length ? `${alias.name}<${args.map(describe).join(', ')}>` : alias.name,
        type,
      );
    }
    const symbol = type.getSymbol();
    if (
      symbol &&
      symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class) &&
      projectFile(symbol.declarations?.[0])
    ) {
      const args =
        type.flags & ts.TypeFlags.Object &&
        ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0
          ? checker.getTypeArguments(type as ts.TypeReference)
          : [];
      return register(
        symbol,
        args.length ? `${symbol.name}<${args.map(describe).join(', ')}>` : symbol.name,
        type,
      );
    }
    return undefined;
  }
  function register(symbol: ts.Symbol, key: string, type: ts.Type): string {
    const owner = owners.get(key);
    if (owner && owner !== symbol)
      throw new Error(
        `Two persisted types are named ${key} (${symbol.declarations?.[0]?.getSourceFile().fileName}); rename one`,
      );
    if (!owner) {
      owners.set(key, symbol);
      types.set(key, '');
      types.set(key, structure(type));
    }
    return key;
  }
  let depth = 0;
  function describe(type: ts.Type): string {
    if (++depth > 200) throw new Error(`Recursive anonymous type: ${checker.typeToString(type)}`);
    try {
      return namedKey(type) ?? structure(type);
    } finally {
      depth--;
    }
  }
  /** A type's own structure, never its name. */
  function structure(type: ts.Type): string {
    const flags = type.flags;
    if (flags & ts.TypeFlags.Any) throw new Error('A persisted type is any');
    if (flags & ts.TypeFlags.Unknown) return 'unknown';
    if (flags & ts.TypeFlags.String) return 'string';
    if (flags & ts.TypeFlags.Number) return 'number';
    if (flags & ts.TypeFlags.Boolean) return 'boolean';
    if (flags & ts.TypeFlags.Null) return 'null';
    if (flags & ts.TypeFlags.Undefined) return 'undefined';
    if (flags & ts.TypeFlags.Never) return 'never';
    if (type.isStringLiteral()) return JSON.stringify(type.value);
    if (type.isNumberLiteral()) return String(type.value);
    if (flags & ts.TypeFlags.BooleanLiteral) return checker.typeToString(type);
    if (flags & ts.TypeFlags.TemplateLiteral) return checker.typeToString(type);
    if (type.isUnion()) return union(type.types);
    if (checker.isTupleType(type)) {
      const target = (type as ts.TypeReference).target as ts.TupleType;
      const items = checker.getTypeArguments(type as ts.TypeReference).map((item, index) => {
        const flag = target.elementFlags[index] ?? ts.ElementFlags.Required;
        const text = describe(item);
        return flag & ts.ElementFlags.Variable
          ? `...${text}[]`
          : flag & ts.ElementFlags.Optional
            ? `${text}?`
            : text;
      });
      return `[${items.join(', ')}]`;
    }
    if (checker.isArrayType(type)) {
      const element = checker.getTypeArguments(type as ts.TypeReference)[0]!;
      return `Array<${describe(element)}>`;
    }
    if (flags & ts.TypeFlags.Object || type.isIntersection()) return object(type);
    throw new Error(`A persisted type cannot be stored as JSON: ${checker.typeToString(type)}`);
  }
  function union(members: readonly ts.Type[]): string {
    return [...new Set(members.map(describe))].sort().join(' | ');
  }
  function object(type: ts.Type): string {
    if (type.getCallSignatures().length || type.getConstructSignatures().length)
      throw new Error(`A persisted type is a function: ${checker.typeToString(type)}`);
    const parts = checker.getPropertiesOfType(type).map((property) => {
      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      return `${JSON.stringify(property.name)}${optional ? '?' : ''}: ${propertyType(property, optional)}`;
    });
    for (const info of checker.getIndexInfosOfType(type))
      parts.push(`[${describe(info.keyType)}]: ${describe(info.type)}`);
    return `{ ${parts.sort().join('; ')} }`;
  }
  /** As declared where possible, so `position?: Position` keeps its name. */
  function propertyType(property: ts.Symbol, optional: boolean): string {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (
      !(property.flags & ts.SymbolFlags.Transient) &&
      declaration &&
      (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) &&
      declaration.type
    )
      return node(declaration.type);
    const type = checker.getTypeOfSymbol(property);
    // An optional property's type includes undefined; its `?` already says so.
    if (optional && type.isUnion())
      return union(type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined)));
    return describe(type);
  }
  function node(typeNode: ts.TypeNode): string {
    if (ts.isParenthesizedTypeNode(typeNode)) return node(typeNode.type);
    if (ts.isUnionTypeNode(typeNode))
      return [...new Set(typeNode.types.map(node))].sort().join(' | ');
    if (ts.isArrayTypeNode(typeNode)) return `Array<${node(typeNode.elementType)}>`;
    return describe(checker.getTypeFromTypeNode(typeNode));
  }

  const rootKey = describe(checker.getDeclaredTypeOfSymbol(rootSymbol));
  if (!types.has(rootKey)) throw new Error(`${rootName} is not a named project type`);
  const sorted = Object.fromEntries([...types].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const text = Object.entries(sorted)
    .map(([key, description]) => `${key} = ${description}`)
    .join('\n');
  return { hash: createHash('sha256').update(text).digest('hex'), types: sorted };
}

/** The record to commit for a shape. */
export function shapeRecord(schemaVersion: number, shape: SaveShape): SaveShapeRecord {
  return {
    schemaVersion,
    hash: shape.hash,
    types: Object.fromEntries(
      Object.entries(shape.types).map(([key, text]) => [key, shortHash(text)]),
    ),
  };
}

export interface ShapeComparison {
  ok: boolean;
  changed: string[];
  added: string[];
  removed: string[];
  /** Why the check failed and what to do, or a confirmation. */
  message: string;
}
/** Compare the current shape and schema version with the committed record. */
export function compareSaveShape(
  record: SaveShapeRecord,
  schemaVersion: number,
  shape: SaveShape,
): ShapeComparison {
  const current = shapeRecord(schemaVersion, shape).types;
  const changed = Object.keys(current).filter(
    (key) => record.types[key] !== undefined && record.types[key] !== current[key],
  );
  const added = Object.keys(current).filter((key) => record.types[key] === undefined);
  const removed = Object.keys(record.types).filter((key) => current[key] === undefined);
  const same = record.hash === shape.hash;
  const lists = [
    changed.length ? `  changed: ${changed.join(', ')}` : '',
    added.length ? `  added: ${added.join(', ')}` : '',
    removed.length ? `  removed: ${removed.join(', ')}` : '',
  ].filter(Boolean);
  const update = 'npm run check:save-shape -- --update';
  if (schemaVersion === record.schemaVersion && same)
    return {
      ok: true,
      changed,
      added,
      removed,
      message: `Save shape matches schema ${schemaVersion} (${shape.hash.slice(0, 12)}).`,
    };
  if (schemaVersion === record.schemaVersion)
    return {
      ok: false,
      changed,
      added,
      removed,
      message: [
        `The persisted save shape changed, but CONFIG.saves.schemaVersion is still ${schemaVersion}.`,
        ...lists,
        'An older tab or installed app would load this save as if it understood it. Bump',
        'CONFIG.saves.schemaVersion (src/engine/config.ts) and SaveFile.schemaVersion',
        '(src/model/domain.ts), add the migration in src/persistence/schema.ts and its test,',
        `then run ${update} and commit src/persistence/saveShape.json.`,
        `If schema ${schemaVersion} has not shipped yet (it was bumped on this branch), or the change`,
        `cannot alter stored JSON (a type renamed), run ${update} --same-version instead.`,
        'See docs/RELEASING.md, "Save schema".',
      ].join('\n'),
    };
  return {
    ok: false,
    changed,
    added,
    removed,
    message: [
      `CONFIG.saves.schemaVersion is ${schemaVersion}, but src/persistence/saveShape.json records schema ${record.schemaVersion}.`,
      ...lists,
      `After adding the migration and its test, run ${update} and commit the record.`,
    ].join('\n'),
  };
}
