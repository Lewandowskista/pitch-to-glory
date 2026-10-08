import { createRng } from '../engine/rng';
import { Biquad } from './synth';

/** Original composition: After the Floodlights. No borrowed melodies or samples. */
export const MUSIC = {
  title: 'After the Floodlights',
  bpm: 76,
  bars: 32,
  sampleRate: 32000,
} as const;
export type AudioName = import('./synth').SoundName | 'music';
const TAU = Math.PI * 2;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const beat = 60 / MUSIC.bpm;
const sr = MUSIC.sampleRate;
const frames = Math.round(MUSIC.bars * 4 * beat * sr);
type Stereo = [Float32Array, Float32Array];

// Voice-led ninth/seventh chords: Dm9, G13, Cmaj9, Am9; contrasting Fmaj9/Em7 bridge.
const harmony = [
  { root: 38, keys: [53, 57, 60, 64] },
  { root: 43, keys: [53, 57, 59, 64] },
  { root: 36, keys: [52, 55, 59, 62] },
  { root: 33, keys: [52, 55, 59, 60] },
  { root: 41, keys: [52, 57, 60, 67] },
  { root: 40, keys: [50, 55, 59, 62] },
  { root: 38, keys: [53, 57, 60, 64] },
  { root: 43, keys: [53, 57, 59, 64] },
] as const;

/** All note and room tails wrap around the song boundary, preserving the groove at the join. */
export function renderMusic(): Stereo {
  const dry: Stereo = [new Float32Array(frames), new Float32Array(frames)];
  const rng = createRng('pitch-to-glory:after-the-floodlights:v1');
  function voice(start: number, seconds: number, pan: number, sample: (t: number) => number) {
    const from = Math.round(start * sr);
    const count = Math.round(seconds * sr);
    const left = Math.cos(((pan + 1) * Math.PI) / 4);
    const right = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < count; i++) {
      const t = i / sr;
      const edge = Math.min(1, t / 0.009, (seconds - t) / 0.05);
      const value = sample(t) * Math.max(0, edge);
      const at = (from + i + frames) % frames;
      dry[0][at]! += value * left;
      dry[1][at]! += value * right;
    }
  }
  function keys(start: number, midi: number, gain: number, pan: number, decay = 0.65) {
    const frequency = hz(midi);
    voice(start, decay * 6, pan, (t) => {
      const wobble = 0.0008 * Math.sin(TAU * 0.7 * t) + 0.0002 * Math.sin(TAU * 4.1 * t);
      const p = TAU * frequency * t + wobble * frequency;
      // Soft electric piano: rounded fundamental, gently decaying tine and octave.
      const tine = Math.sin(p * 2 + 0.45 * Math.sin(p) * Math.exp(-t / 0.12));
      return (
        gain *
        (Math.sin(p) * Math.exp(-t / decay) +
          0.18 * tine * Math.exp(-t / (decay * 0.55)) +
          0.035 * Math.sin(p * 3) * Math.exp(-t / 0.1))
      );
    });
  }
  function bass(start: number, midi: number, duration: number, gain = 0.15) {
    const frequency = hz(midi);
    voice(
      start,
      duration,
      0,
      (t) =>
        gain *
        (Math.sin(TAU * frequency * t) +
          0.14 * Math.sin(TAU * frequency * 2 * t) * Math.exp(-t / 0.12)) *
        Math.exp(-t / 0.6) *
        Math.min(1, (duration - t) / 0.1),
    );
  }
  function kick(start: number, gain: number) {
    voice(
      start,
      0.32,
      0,
      (t) =>
        gain * Math.sin(TAU * (48 * t + 1.7 * (1 - Math.exp(-t / 0.025)))) * Math.exp(-t / 0.065),
    );
  }
  function drumTap(start: number, gain: number, pan: number) {
    // Rounded tonal taps keep the groove without a repeating noise/hiss texture.
    voice(
      start,
      0.16,
      pan,
      (t) =>
        gain * (Math.sin(TAU * 175 * t) + 0.18 * Math.sin(TAU * 350 * t)) * Math.exp(-t / 0.035),
    );
  }
  // A / A' / B / A'': different melodic phrases, chord attacks and drum fills.
  for (let bar = 0; bar < MUSIC.bars; bar++) {
    const section = Math.floor(bar / 8);
    const chord = harmony[section === 2 ? 4 + (bar % 4) : bar % 4]!;
    const start = bar * 4 * beat;
    const bridge = section === 2;
    for (const [index, midi] of chord.keys.entries()) {
      keys(
        start + index * 0.016 + (bar % 2 ? 0.08 : 0),
        midi,
        0.075,
        (index - 1.5) * 0.22,
        bridge ? 0.85 : 0.65,
      );
      if (bar % 2 === 1)
        keys(start + 2.65 * beat + index * 0.012, midi, 0.035, (1.5 - index) * 0.2, 0.4);
    }
    bass(start + 0.01, chord.root, beat * 1.55);
    bass(start + beat * 2.55, chord.root + (bar % 2 ? 7 : 12), beat * 0.75, 0.09);
    if (bar % 4 === 3) bass(start + beat * 3.5, chord.root - 1, beat * 0.45, 0.07);
    kick(start, bridge ? 0.15 : 0.23);
    kick(start + beat * 2, 0.16);
    if (bar % 4 === 2) kick(start + beat * 2.7, 0.1);
    drumTap(start + beat * (1.02 + rng.next() * 0.018), 0.11, -0.12);
    drumTap(start + beat * (3.015 + rng.next() * 0.018), 0.09, 0.12);
    // Sparse call and response, with space between phrases.
    const melody = bridge ? [72, 71, 67, 64] : [69, 67, 64, 62];
    if (bar % 2 === 0 || section === 3) {
      const first = melody[(bar + section) % 4]!;
      keys(start + beat * 1.6, first, 0.038, 0.28, 0.45);
      keys(start + beat * 2.8, chord.keys[3] + 12, 0.025, -0.3, 0.5);
    }
    if (bar % 8 === 7) drumTap(start + beat * 3.65, 0.045, 0.25);
  }

  const out: Stereo = [new Float32Array(frames), new Float32Array(frames)];
  const delays = [0.073, 0.113, beat * 0.75, beat * 1.5].map((seconds) => Math.round(seconds * sr));
  for (let c = 0; c < 2; c++) {
    const low = new Biquad('lowpass', 3200, 0.6, sr);
    const high = new Biquad('highpass', 32, Math.SQRT1_2, sr);
    // First pass settles filter history at the loop boundary; second pass is the output.
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < frames; i++) {
        let value = dry[c]![i]!;
        for (let d = 0; d < delays.length; d++) {
          const at = (i - delays[d]! + frames) % frames;
          value += dry[(c + d + 1) % 2]![at]! * [0.1, 0.07, 0.095, 0.04][d]!;
        }
        out[c]![i] = Math.tanh(high.next(low.next(value)) * 1.12);
      }
  }
  // Linked stereo normalization preserves imaging, average listening level and headroom.
  let peak = 0,
    energy = 0;
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(out[0][i]!), Math.abs(out[1][i]!));
    energy += out[0][i]! ** 2 + out[1][i]! ** 2;
  }
  const scale = Math.min(0.5 / peak, 0.085 / Math.sqrt(energy / (frames * 2)));
  for (const channel of out) for (let i = 0; i < frames; i++) channel[i] = channel[i]! * scale;
  return out;
}
