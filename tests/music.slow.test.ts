import { describe, expect, it } from 'vitest';
import { MUSIC, renderMusic } from '../src/audio/music';

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
  }, 60000);
});
