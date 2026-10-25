import { CONFIG } from '../engine/config';
import { SaveError } from './errors';

/**
 * Backup files (release 1.0 step 3.7). An export is written gzip-compressed where the browser
 * has `CompressionStream` (a late save: about 78 MB of JSON, 9 MB as gzip), and as plain JSON
 * where it does not. An import accepts both, told apart by the gzip magic bytes rather than the
 * file name, so every plain backup from earlier releases still imports. Both run in the
 * persistence worker: the main thread only hands over a `Blob`, never reads or builds the file.
 *
 * The limits apply to the save's JSON, however it is packed: `CONFIG.saves.maxFileBytes`
 * uncompressed (so a gzip file that inflates past it, a decompression bomb, is refused as
 * `large` while it is being read, holding no more than the limit), and
 * `CONFIG.saves.maxCompressedFileBytes` for the gzip file itself.
 */
export interface BackupFile {
  /** The save's name (an empty string when a recovery copy has none). */
  name: string;
  file: Blob;
  /** Whether `file` is gzip (`.json.gz`), or plain JSON (`.json`). */
  compressed: boolean;
  /** The size of the save's JSON, uncompressed, in bytes. */
  bytes: number;
  /** The JSON is above `CONFIG.saves.warnExportBytes`: it nears what an import accepts. */
  nearLimit: boolean;
}

const GZIP = [0x1f, 0x8b] as const;
export const compressionAvailable = (): boolean => typeof CompressionStream === 'function';

/**
 * Pack a save's JSON as a backup file. Refuses (`large`) JSON that an import would refuse, so a
 * backup is never written that cannot be imported again. `compress: false` is the fallback for
 * a browser without `CompressionStream`.
 */
export async function packBackup(
  name: string,
  json: string,
  compress = compressionAvailable(),
): Promise<BackupFile> {
  // The Blob holds the UTF-8 bytes, so its size is the JSON's byte length without another copy.
  const plain = new Blob([json], { type: 'application/json' });
  const bytes = plain.size;
  if (bytes > CONFIG.saves.maxFileBytes) throw new SaveError('large');
  const nearLimit = bytes > CONFIG.saves.warnExportBytes;
  if (!compress) return { name, file: plain, compressed: false, bytes, nearLimit };
  const file = await new Response(plain.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return {
    name,
    file: new Blob([file], { type: 'application/gzip' }),
    compressed: true,
    bytes,
    nearLimit,
  };
}

/** Whether a file starts with the gzip magic bytes. */
export async function isGzip(file: Blob): Promise<boolean> {
  if (file.size < GZIP.length) return false;
  const head = new Uint8Array(await file.slice(0, GZIP.length).arrayBuffer());
  return head[0] === GZIP[0] && head[1] === GZIP[1];
}

/**
 * A backup file's JSON and its size in UTF-8 bytes, from plain JSON or gzip. Refuses a file
 * whose JSON exceeds the import limit (`large`), and a damaged gzip stream (`invalid`).
 */
export async function unpackBackup(file: Blob): Promise<{ json: string; bytes: number }> {
  if (!(await isGzip(file))) {
    if (file.size > CONFIG.saves.maxFileBytes) throw new SaveError('large');
    return { json: await file.text(), bytes: file.size };
  }
  if (file.size > CONFIG.saves.maxCompressedFileBytes) throw new SaveError('large');
  if (typeof DecompressionStream !== 'function') throw new SaveError('invalid');
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      // Stop as soon as the output passes the limit: a small file can inflate without bound.
      if (bytes > CONFIG.saves.maxFileBytes) {
        void reader.cancel().catch(() => {});
        throw new SaveError('large');
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } catch (error) {
    throw error instanceof SaveError ? error : new SaveError('invalid');
  }
  return { json: parts.join(''), bytes };
}

/**
 * Whether `text` is at most `limit` bytes as UTF-8, counted without encoding it (a 78 MB save
 * would otherwise be copied just to be measured).
 */
export function withinUtf8Bytes(text: string, limit: number): boolean {
  // Every UTF-16 unit takes one to three bytes (a surrogate pair four for two units).
  if (text.length > limit) return false;
  if (text.length * 3 <= limit) return true;
  let bytes = text.length;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) continue;
    if (code < 0x800) bytes += 1;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      // A pair: four bytes for two units. A lone surrogate encodes as U+FFFD, three bytes.
      if (next >= 0xdc00 && next <= 0xdfff) index++;
      bytes += 2;
    } else bytes += 2;
    if (bytes > limit) return false;
  }
  return true;
}
