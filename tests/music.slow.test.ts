import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MUSIC, renderMusic } from '../src/audio/music';
import { encodeWav } from '../src/audio/synth';

const AUDIO = resolve('src/assets/audio');
const SOURCE = JSON.parse(readFileSync(resolve(AUDIO, 'after-the-floodlights.json'), 'utf8')) as {
  frames: number;
  wavSha256: string;
  files: Record<string, { bytes: number; sha256: string }>;
};

describe('original lo-fi composition', () => {
  it('renders a finite, warm stereo song with variation, headroom and a continuous loop', async () => {
    const [left, right] = renderMusic();
    expect(left.length).toBe(Math.round(((MUSIC.bars * 4 * 60) / MUSIC.bpm) * MUSIC.sampleRate));
    expect(right.length).toBe(left.length);
    expect(left.length / MUSIC.sampleRate).toBeGreaterThan(90);
    let peak = 0,
      energy = 0,
      high = 0,
      difference = 0,
      finite = true;
    for (let i = 0; i < left.length; i++) {
      const l = left[i]!,
        r = right[i]!;
      finite &&= Number.isFinite(l) && Number.isFinite(r);
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      energy += l * l;
      high += (l - left[(i + left.length - 1) % left.length]!) ** 2;
      difference += (l - r) ** 2;
    }
    expect(finite).toBe(true);
    expect(peak).toBeLessThanOrEqual(0.6);
    expect(Math.sqrt(energy / left.length)).toBeGreaterThan(0.035);
    expect(Math.sqrt(high / energy)).toBeLessThan(0.3);
    expect(Math.sqrt(difference / left.length)).toBeGreaterThan(0.005);
    expect(Math.abs(left[0]! - left[left.length - 1]!)).toBeLessThan(0.02);
    expect(Math.abs(right[0]! - right[right.length - 1]!)).toBeLessThan(0.02);
    const repeat = renderMusic();
    expect(Buffer.from(repeat[0].buffer).equals(Buffer.from(left.buffer))).toBe(true);
    expect(Buffer.from(repeat[1].buffer).equals(Buffer.from(right.buffer))).toBe(true);
    // A later section differs from the opening rather than repeating a single bar.
    const bar = Math.round(((4 * 60) / MUSIC.bpm) * MUSIC.sampleRate);
    expect(
      Buffer.from(left.slice(0, bar).buffer).equals(
        Buffer.from(left.slice(bar * 16, bar * 17).buffer),
      ),
    ).toBe(false);
    // The shipped files were rendered from this exact composition (`npm run render:music`).
    const wav = createHash('sha256')
      .update(encodeWav([left, right], MUSIC.sampleRate))
      .digest('hex');
    expect(wav).toBe(SOURCE.wavSha256);
    expect(SOURCE.frames).toBe(left.length);
  }, 60000);
  it('ships the rendered loop as sample-exact Ogg Opus and an AAC fallback', () => {
    for (const [name, { bytes, sha256 }] of Object.entries(SOURCE.files)) {
      const file = readFileSync(resolve(AUDIO, name));
      expect(file.length).toBe(bytes);
      expect(file.length).toBeLessThan(1024 * 1024);
      if (name.endsWith('.ogg'))
        expect(createHash('sha256').update(file).digest('hex')).toBe(sha256);
    }
    // Ogg Opus: the decoder plays granule − pre-skip samples at 48 kHz, which is the loop.
    const ogg = readFileSync(resolve(AUDIO, 'after-the-floodlights.ogg'));
    expect(ogg.toString('latin1', 28, 36)).toBe('OpusHead');
    const preSkip = ogg.readUInt16LE(28 + 10);
    const last = ogg.lastIndexOf('OggS');
    expect(ogg.readUInt8(last + 5) & 0x04).toBe(0x04);
    const granule = Number(ogg.readBigInt64LE(last + 6));
    expect(granule - preSkip).toBe((SOURCE.frames * 48000) / MUSIC.sampleRate);
  });
});
