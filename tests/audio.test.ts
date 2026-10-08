import { describe, expect, it } from 'vitest';
import { CROWD_SOUNDS, encodeWav, renderSound, SAMPLE_RATE, SOUND_NAMES } from '../src/audio/synth';
import { DEFAULT_SETTINGS, validateSettings } from '../src/persistence/settings';

const peak = (samples: Float32Array) => samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
const rms = (samples: Float32Array, from = 0, to = samples.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i]! ** 2;
  return Math.sqrt(sum / (to - from));
};

describe('procedural audio', () => {
  it('renders every sound deterministically, finite, audible and without clipping', () => {
    for (const name of SOUND_NAMES) {
      const samples = renderSound(name);
      expect(samples.length, name).toBeGreaterThan(SAMPLE_RATE * 0.05);
      expect(samples.every(Number.isFinite), name).toBe(true);
      expect(peak(samples), name).toBeLessThanOrEqual(0.9);
      expect(rms(samples), name).toBeGreaterThan(0.01);
      expect(renderSound(name), name).toEqual(samples);
    }
  }, 60000);

  it('keeps interface sounds short and quiet next to the crowd', () => {
    for (const name of ['tap', 'toggle'] as const) {
      const samples = renderSound(name);
      expect(samples.length / SAMPLE_RATE).toBeLessThan(0.2);
      expect(peak(samples)).toBeLessThanOrEqual(0.36);
    }
    expect(peak(renderSound('roar'))).toBeGreaterThan(0.35);
    expect(peak(renderSound('roar'))).toBeLessThanOrEqual(0.55);
    expect(CROWD_SOUNDS.has('crowd')).toBe(true);
    expect(CROWD_SOUNDS.has('whistle')).toBe(false);
  });

  it('keeps repeated clicks low and warm rather than piercing', () => {
    for (const name of ['tap', 'toggle'] as const) {
      const samples = renderSound(name);
      expect(peak(samples), name).toBeLessThanOrEqual(0.18);
      // Differentiation weights high frequencies: a signal-level brightness guard.
      const differences = samples.slice(1).map((value, i) => value - samples[i]!);
      expect(rms(differences) / rms(samples), name).toBeLessThan(0.12);
    }
  });

  it('keeps whistles and reward peaks restrained', () => {
    for (const name of ['whistle', 'whistleLong', 'whistleFull'] as const)
      expect(peak(renderSound(name)), name).toBeLessThanOrEqual(0.23);
    for (const name of ['reward', 'levelUp'] as const)
      expect(peak(renderSound(name)), name).toBeLessThanOrEqual(0.38);
  });

  it('starts and ends one-shot sounds at silence so nothing clicks', () => {
    for (const name of SOUND_NAMES.filter((n) => n !== 'crowd')) {
      const samples = renderSound(name);
      expect(Math.abs(samples[0]!), name).toBeLessThan(0.01);
      expect(Math.abs(samples[samples.length - 1]!), name).toBeLessThan(0.01);
    }
  });

  it('loops the crowd seamlessly at a steady level', () => {
    const crowd = renderSound('crowd');
    expect(crowd.length).toBe(SAMPLE_RATE * 8);
    // The join: the last and first samples continue the same signal, no step.
    expect(Math.abs(crowd[crowd.length - 1]! - crowd[0]!)).toBeLessThan(0.2);
    const quarter = crowd.length / 4;
    const levels = [0, 1, 2, 3].map((q) => rms(crowd, q * quarter, (q + 1) * quarter));
    expect(Math.max(...levels) / Math.min(...levels)).toBeLessThan(1.8);
  });

  it('builds the roar up and lets it die away', () => {
    const roar = renderSound('roar');
    const second = (s: number) => rms(roar, s * SAMPLE_RATE, (s + 0.25) * SAMPLE_RATE);
    expect(second(1)).toBeGreaterThan(second(0) * 1.5);
    expect(second(3.7)).toBeLessThan(second(1) * 0.5);
  });

  it('encodes 16-bit mono WAV', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1.5]);
    const wav = encodeWav(samples);
    const view = new DataView(wav.buffer);
    const text = (offset: number) => String.fromCharCode(...wav.slice(offset, offset + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect([1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      16384, -16383, 32767, -32767,
    ]);
  });

  it('interleaves stereo samples with the correct WAV format', () => {
    const wav = encodeWav([new Float32Array([0.5, -0.5]), new Float32Array([0.25, -0.25])], 32000);
    const view = new DataView(wav.buffer);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(32000);
    expect(view.getUint32(28, true)).toBe(128000);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      16384, 8192, -16383, -8192,
    ]);
  });
});

describe('music preferences', () => {
  it('adds music defaults to older audio preferences without changing their volumes', () => {
    const oldAudio = { muted: true, master: 0.5, effects: 0.4, crowd: 0 };
    const next = validateSettings({ ...DEFAULT_SETTINGS, audio: oldAudio });
    expect(next.audio).toEqual({ ...oldAudio, music: 0.35, musicEnabled: true });
  });
  it('rejects invalid music preferences and preserves explicit silence', () => {
    for (const music of [-1, 2, NaN, 'loud'])
      expect(() =>
        validateSettings({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, music } }),
      ).toThrow();
    expect(() =>
      validateSettings({
        ...DEFAULT_SETTINGS,
        audio: { ...DEFAULT_SETTINGS.audio, musicEnabled: 'yes' },
      }),
    ).toThrow();
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        audio: { ...DEFAULT_SETTINGS.audio, music: 0, musicEnabled: false },
      }).audio,
    ).toMatchObject({ music: 0, musicEnabled: false });
  });
});
