/**
 * The world as UTF-8 JSON bytes (docs/RELEASE-1.0-PLAN.md step 3.3). The world worker encodes
 * its world once per checkpoint; the same bytes are what the persistence worker stores (an
 * ArrayBuffer is moved between threads without copying or parsing, and IndexedDB stores it
 * without walking an object graph) and what the UI decodes, part by part, in short tasks.
 *
 * The bytes are exactly `JSON.stringify(world)` in UTF-8. Alongside them, `parts` records where
 * each top-level value starts and ends; wide records (players, clubs, fixtures, results…) are
 * split into groups of entries, so no part takes long to parse. Pure: no browser dependencies
 * beyond TextEncoder and TextDecoder.
 */
export type WorldPart =
  /** The JSON value at `path`. */
  | { kind: 'value'; path: string[]; start: number; end: number }
  /** An empty record at `path`, filled by the `entries` parts that follow. */
  | { kind: 'record'; path: string[] }
  /** Entries of the record at `path`, as the text between its braces. */
  | { kind: 'entries'; path: string[]; start: number; end: number };
export interface EncodedWorld {
  bytes: Uint8Array;
  parts: WorldPart[];
}

/** Records with more keys than this are split into groups of this many entries. */
const GROUP = 1000;
type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const skipped = (value: unknown) =>
  value === undefined || typeof value === 'function' || typeof value === 'symbol';
function wide(value: unknown): value is Plain {
  if (!isPlain(value)) return false;
  let count = 0;
  for (const key in value) if (Object.hasOwn(value, key) && ++count > GROUP) return true;
  return false;
}

class ByteWriter {
  private buffer: Uint8Array;
  length = 0;
  private readonly encoder = new TextEncoder();
  constructor(capacity: number) {
    this.buffer = new Uint8Array(Math.max(1024, capacity));
  }
  write(text: string): void {
    let rest = text;
    for (;;) {
      const { read, written } = this.encoder.encodeInto(rest, this.buffer.subarray(this.length));
      this.length += written;
      if (read === rest.length) return;
      // encodeInto never splits a character, so the remainder starts on a whole one.
      rest = rest.slice(read);
      const grown = new Uint8Array(Math.max(this.buffer.length * 2, this.length + rest.length * 3));
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
  }
  /** The bytes written, in a buffer of exactly their length. */
  result(): Uint8Array {
    return this.buffer.length === this.length ? this.buffer : this.buffer.slice(0, this.length);
  }
}

/**
 * Encode a world. `capacity` is a guess at the size in bytes (the previous encoding's size is a
 * good one), so the buffer rarely grows.
 */
export function encodeWorld(world: object, capacity = 16 * 1024 * 1024): EncodedWorld {
  const out = new ByteWriter(capacity);
  const parts: WorldPart[] = [];
  const value = (item: unknown, path: string[]) => {
    const start = out.length;
    out.write(JSON.stringify(item));
    parts.push({ kind: 'value', path, start, end: out.length });
  };
  const record = (item: Plain, path: string[], depth: number) => {
    out.write('{');
    parts.push({ kind: 'record', path });
    let first = true;
    const keys = Object.keys(item);
    if (wide(item)) {
      // Entry by entry, straight into the buffer: faster than stringifying the record whole.
      for (let index = 0; index < keys.length; index += GROUP) {
        let start = -1;
        for (let at = index; at < Math.min(keys.length, index + GROUP); at++) {
          const key = keys[at]!;
          const child = item[key];
          if (skipped(child)) continue;
          if (!first) out.write(',');
          first = false;
          if (start < 0) start = out.length;
          out.write(`${JSON.stringify(key)}:${JSON.stringify(child)}`);
        }
        if (start >= 0) parts.push({ kind: 'entries', path, start, end: out.length });
      }
    } else {
      for (const key of keys) {
        const child = item[key];
        if (skipped(child)) continue;
        if (!first) out.write(',');
        first = false;
        out.write(`${JSON.stringify(key)}:`);
        // A small record holding a wide one (the archive, season statistics) is opened too.
        if (depth < 2 && isPlain(child) && (wide(child) || holdsWide(child)))
          record(child, [...path, key], depth + 1);
        else value(child, [...path, key]);
      }
    }
    out.write('}');
  };
  record(world as Plain, [], 0);
  return { bytes: out.result(), parts };
}
function holdsWide(item: Plain): boolean {
  let count = 0;
  for (const key in item) {
    if (!Object.hasOwn(item, key)) continue;
    if (++count > 32) return false;
    if (wide(item[key])) return true;
  }
  return false;
}

/**
 * Yield to the event loop for one task. A MessageChannel message, not `setTimeout(0)`, which
 * browsers stretch to 4 ms once nested: across a world's slices that alone cost 0.2 s.
 */
function nextTask(): Promise<void> {
  if (typeof MessageChannel === 'undefined')
    return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Decode the whole world at once (the persistence worker, off the UI thread). */
export function decodeWorldBytes(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

function assign(target: Plain, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
function at(root: Plain, path: string[]): Plain {
  let target = root;
  for (const key of path) target = target[key] as Plain;
  return target;
}
/**
 * Decode a world part by part, yielding to the event loop whenever `sliceMs` has passed, so a
 * 75 MB world never blocks the UI thread for long. The result equals `JSON.parse` of the bytes.
 */
export async function decodeWorld(
  encoded: EncodedWorld,
  options: { sliceMs?: number; yieldControl?: () => Promise<void>; now?: () => number } = {},
): Promise<unknown> {
  const sliceMs = options.sliceMs ?? 8;
  const yieldControl = options.yieldControl ?? nextTask;
  const now = options.now ?? (() => performance.now());
  const decoder = new TextDecoder();
  let root: Plain | null = null;
  let started = now();
  for (const part of encoded.parts) {
    if (part.kind === 'record') {
      if (!part.path.length) root = {};
      else assign(at(root!, part.path.slice(0, -1)), part.path.at(-1)!, {});
      continue;
    }
    const text = decoder.decode(encoded.bytes.subarray(part.start, part.end));
    if (part.kind === 'value') {
      const parsed: unknown = JSON.parse(text);
      if (!part.path.length) return parsed;
      assign(at(root!, part.path.slice(0, -1)), part.path.at(-1)!, parsed);
    } else {
      const target = at(root!, part.path);
      const entries = JSON.parse(`{${text}}`) as Plain;
      for (const key in entries)
        if (key === '__proto__') assign(target, key, entries[key]);
        else target[key] = entries[key];
    }
    if (now() - started >= sliceMs) {
      await yieldControl();
      started = now();
    }
  }
  return root;
}
