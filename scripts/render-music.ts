/**
 * Renders the music loop ("After the Floodlights", src/audio/music.ts) at build time and encodes
 * it for the browser (release 1.0 step 3.9, review P6). The game used to synthesise the 101 s
 * stereo loop in the audio worker on the first tap of every session (a 3.85 s task and about
 * 50 MB); it now downloads one small file after the first gesture.
 *
 *   npm run render:music
 *
 * The synthesis is the game's own code, so the track is the same composition, sample for
 * sample, before lossy encoding. Encoding uses macOS's `afconvert`, so there is no encoder
 * dependency; the outputs are committed in src/assets/audio/ (provenance in ASSETS.md), and
 * this only needs rerunning when music.ts changes.
 *
 * - `.ogg`: Opus in Ogg, for Chromium, Edge and Firefox. afconvert cannot write Opus to Ogg
 *   directly, so it writes Opus to CAF and the packets are rewrapped in Ogg pages here, with the
 *   encoder delay as the pre-skip and the exact length in the last granule position, which
 *   every Ogg Opus decoder trims by. The loop is therefore sample-exact.
 * - `.m4a`: AAC-LC in MP4, for Safari, whose decoder trims AAC's priming exactly.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { encodeWav } from '../src/audio/synth';
import { MUSIC, renderMusic } from '../src/audio/music';

const OUT = resolve('src/assets/audio');
const NAME = 'after-the-floodlights';
const OPUS_BITRATE = 48000;
const AAC_BITRATE = 64000;

// --- CAF (Core Audio Format) reader: the Opus packets and their trim ---------------------------

interface OpusStream {
  channels: number;
  framesPerPacket: number;
  priming: number;
  validFrames: number;
  packets: Uint8Array[];
}
function readCafOpus(bytes: Buffer): OpusStream {
  if (bytes.toString('latin1', 0, 4) !== 'caff') throw new Error('Not a CAF file');
  let offset = 8;
  let channels = 0;
  let framesPerPacket = 0;
  let sizes: number[] = [];
  let priming = 0;
  let validFrames = 0;
  let data: Buffer | null = null;
  while (offset < bytes.length) {
    const type = bytes.toString('latin1', offset, offset + 4);
    const size = Number(bytes.readBigInt64BE(offset + 4));
    const body = offset + 12;
    const end = size === -1 ? bytes.length : body + size;
    if (type === 'desc') {
      if (bytes.toString('latin1', body + 8, body + 12) !== 'opus') throw new Error('Not Opus');
      framesPerPacket = bytes.readUInt32BE(body + 20);
      channels = bytes.readUInt32BE(body + 24);
    } else if (type === 'pakt') {
      const count = Number(bytes.readBigInt64BE(body));
      validFrames = Number(bytes.readBigInt64BE(body + 8));
      priming = bytes.readInt32BE(body + 16);
      let at = body + 24;
      sizes = [];
      for (let i = 0; i < count; i++) {
        // Variable-length integers, seven bits a byte, most significant first.
        let value = 0;
        let byte: number;
        do {
          byte = bytes[at++]!;
          value = value * 128 + (byte & 0x7f);
        } while (byte & 0x80);
        sizes.push(value);
      }
    } else if (type === 'data') {
      data = bytes.subarray(body + 4, end); // after the edit count
    }
    offset = end;
  }
  if (!data || !sizes.length || !framesPerPacket) throw new Error('Incomplete Opus CAF');
  const packets: Uint8Array[] = [];
  let at = 0;
  for (const size of sizes) {
    packets.push(data.subarray(at, at + size));
    at += size;
  }
  return { channels, framesPerPacket, priming, validFrames, packets };
}

// --- Ogg Opus writer (RFC 3533, RFC 7845) ------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index << 24;
  for (let bit = 0; bit < 8; bit++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  return crc >>> 0;
});
function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  return crc;
}
function oggPage(
  packets: Uint8Array[],
  flags: number,
  granule: bigint,
  serial: number,
  sequence: number,
): Buffer {
  const lacing: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  if (lacing.length > 255) throw new Error('Too many segments for one Ogg page');
  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0, 'latin1');
  header.writeUInt8(0, 4);
  header.writeUInt8(flags, 5);
  header.writeBigInt64LE(granule, 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header.writeUInt8(lacing.length, 26);
  lacing.forEach((value, index) => header.writeUInt8(value, 27 + index));
  const page = Buffer.concat([header, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}
function writeOggOpus(stream: OpusStream, inputRate: number): Buffer {
  const serial = 0x50544721; // fixed, so the output is reproducible
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head.writeUInt8(1, 8);
  head.writeUInt8(stream.channels, 9);
  head.writeUInt16LE(stream.priming, 10);
  head.writeUInt32LE(inputRate, 12);
  head.writeInt16LE(0, 16);
  head.writeUInt8(0, 18);
  const vendor = Buffer.from('pitch-to-glory render-music (afconvert)', 'utf8');
  const title = Buffer.from(`TITLE=${MUSIC.title}`, 'utf8');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4 + 4 + title.length);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(1, 12 + vendor.length);
  tags.writeUInt32LE(title.length, 16 + vendor.length);
  title.copy(tags, 20 + vendor.length);
  const pages = [oggPage([head], 0x02, 0n, serial, 0), oggPage([tags], 0, 0n, serial, 1)];
  // About one second of packets a page; the last page's granule position marks the true end.
  const end = BigInt(stream.priming + stream.validFrames);
  let samples = 0;
  for (let first = 0; first < stream.packets.length; first += 50) {
    const batch = stream.packets.slice(first, first + 50);
    samples += batch.length * stream.framesPerPacket;
    const last = first + 50 >= stream.packets.length;
    const granule = last ? end : BigInt(samples);
    pages.push(oggPage(batch, last ? 0x04 : 0, granule, serial, pages.length));
  }
  return Buffer.concat(pages);
}

// --- Render and encode -------------------------------------------------------------------------

const work = mkdtempSync(join(tmpdir(), 'ptg-music-'));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const outputs: Record<string, { bytes: number; sha256: string }> = {};
const report = (name: string, bytes: Buffer) => {
  outputs[name] = { bytes: bytes.length, sha256: sha256(bytes) };
  console.log(`${name}: ${(bytes.length / 1024).toFixed(0)} KiB`);
};
try {
  const started = performance.now();
  const song = renderMusic();
  const wav = join(work, 'music.wav');
  const pcm = encodeWav(song, MUSIC.sampleRate);
  writeFileSync(wav, pcm);
  console.log(
    `Rendered ${MUSIC.title}: ${song[0].length} frames (${(song[0].length / MUSIC.sampleRate).toFixed(3)} s at ${MUSIC.sampleRate} Hz) in ${Math.round(performance.now() - started)} ms`,
  );
  const caf = join(work, 'music.caf');
  execFileSync('afconvert', [
    '-f',
    'caff',
    '-d',
    'opus@48000',
    '-b',
    String(OPUS_BITRATE),
    wav,
    caf,
  ]);
  const opus = readCafOpus(readFileSync(caf));
  const expected = Math.round((song[0].length * 48000) / MUSIC.sampleRate);
  if (opus.validFrames !== expected)
    throw new Error(`Opus length ${opus.validFrames} frames, expected ${expected}`);
  const ogg = writeOggOpus(opus, MUSIC.sampleRate);
  writeFileSync(join(OUT, `${NAME}.ogg`), ogg);
  report(`${NAME}.ogg`, ogg);
  const m4a = join(OUT, `${NAME}.m4a`);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(AAC_BITRATE), wav, m4a]);
  report(`${NAME}.m4a`, readFileSync(m4a));
  // What the files were rendered from: tests/music.slow.test.ts fails when music.ts changes
  // without a fresh render.
  const source = {
    title: MUSIC.title,
    frames: song[0].length,
    sampleRate: MUSIC.sampleRate,
    wavSha256: sha256(pcm),
    files: outputs,
  };
  writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify(source, null, 2) + '\n');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT')
    console.error('afconvert was not found: render the music on macOS (see ASSETS.md).');
  throw error;
} finally {
  rmSync(work, { recursive: true, force: true });
}
