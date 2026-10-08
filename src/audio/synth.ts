import { createRng, type Rng } from '../engine/rng';

/**
 * Procedural sound effects and crowd ambience (AGENTS.md §2, §3). Every sound is synthesised
 * from oscillators, seeded noise and filters, so there are no audio files to ship or license.
 * Pure and deterministic: the same name always renders the same samples, which keeps tests
 * and the offline cache honest. Rendering runs in a worker; playback goes through Howler.
 */
export const SAMPLE_RATE = 44100;
export type SoundName =
  | 'tap'
  | 'toggle'
  | 'confirm'
  | 'error'
  | 'reward'
  | 'levelUp'
  | 'moment'
  | 'whistle'
  | 'whistleLong'
  | 'whistleFull'
  | 'kick'
  | 'net'
  | 'roar'
  | 'ooh'
  | 'crowd';
export const SOUND_NAMES: readonly SoundName[] = [
  'tap',
  'toggle',
  'confirm',
  'error',
  'reward',
  'levelUp',
  'moment',
  'whistle',
  'whistleLong',
  'whistleFull',
  'kick',
  'net',
  'roar',
  'ooh',
  'crowd',
];
/** Crowd sounds follow the crowd volume; everything else the effects volume. */
export const CROWD_SOUNDS: ReadonlySet<SoundName> = new Set(['roar', 'ooh', 'crowd']);

const TAU = Math.PI * 2;
const length = (seconds: number) => Math.round(seconds * SAMPLE_RATE);

/** RBJ biquad filter with coefficients that can be retuned while running. */
export class Biquad {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(
    private kind: 'lowpass' | 'highpass' | 'bandpass',
    frequency: number,
    q = Math.SQRT1_2,
    private sampleRate = SAMPLE_RATE,
  ) {
    this.tune(frequency, q);
  }
  tune(frequency: number, q = Math.SQRT1_2): void {
    const w0 = (TAU * Math.min(frequency, this.sampleRate * 0.45)) / this.sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number, b1: number, b2: number;
    if (this.kind === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (this.kind === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  next(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const white = (rng: Rng) => rng.next() * 2 - 1;
/** Pink noise (Paul Kellet's economy filter): a softer, more natural hiss than white. */
function pinkSource(rng: Rng): () => number {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return () => {
    const w = white(rng);
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.2;
  };
}

interface Voice {
  wave?: 'sine' | 'triangle';
  attack?: number;
  decay: number;
  gain?: number;
  /** A bell-like inharmonic partial at this ratio, decaying faster. */
  bell?: number;
}
/** Add a decaying note. */
function note(out: Float32Array, start: number, frequency: number, voice: Voice): void {
  const { wave = 'sine', attack = 0.009, decay, gain = 1, bell } = voice;
  const from = length(start);
  const count = Math.min(out.length - from, length(attack + decay * 5));
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = t < attack ? t / attack : Math.exp(-(t - attack) / decay);
    const phase = (frequency * t) % 1;
    const tone = wave === 'sine' ? Math.sin(TAU * phase) : 1 - 4 * Math.abs(phase - 0.5);
    const partial = bell
      ? 0.12 * Math.sin(TAU * frequency * bell * t) * Math.exp(-t / (decay * 0.35))
      : 0;
    out[from + i]! += (tone + partial) * envelope * gain;
  }
}

/** Scale to a peak, with short fades so nothing clicks. */
function finish(out: Float32Array, peak: number): Float32Array {
  const filter = new Biquad('lowpass', 3600);
  for (let i = 0; i < out.length; i++) out[i] = filter.next(out[i]!);
  let max = 0;
  for (const value of out) max = Math.max(max, Math.abs(value));
  const scale = max ? peak / max : 0;
  const fade = Math.min(length(0.01), out.length >> 2);
  for (let i = 0; i < out.length; i++) {
    const edge = Math.min(1, i / fade, (out.length - 1 - i) / fade);
    out[i] = out[i]! * scale * edge;
  }
  return out;
}

/** A pea whistle: a bright carrier warbled by the rattling pea, plus breath. */
function whistle(out: Float32Array, start: number, seconds: number, rng: Rng): void {
  const from = length(start);
  const count = Math.min(out.length - from, length(seconds));
  const breath = new Biquad('bandpass', 2200, 0.8);
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const rattle = Math.sin(TAU * 18 * t);
    phase += (2320 + 22 * rattle) / SAMPLE_RATE;
    const envelope = Math.min(1, t / 0.035, (seconds - t) / 0.09);
    const tone = Math.sin(TAU * phase) * (0.92 + 0.08 * rattle);
    out[from + i]! += (tone * 0.65 + breath.next(white(rng)) * 0.25) * Math.max(0, envelope);
  }
}

/**
 * Crowd texture: a pink-noise bed shaped like a stadium's murmur, many short "voices"
 * (narrow noise bands at speech formants), and scattered claps. `brightness` lifts the
 * formants for excitement; `density` sets how many voices overlap.
 */
function crowd(
  seconds: number,
  rng: Rng,
  options: { brightness: number; density: number; formants: [number, number] },
): Float32Array {
  const out = new Float32Array(length(seconds));
  const pink = pinkSource(rng);
  const band = new Biquad('bandpass', 520 * options.brightness, 0.6);
  const top = new Biquad('lowpass', 1400 * options.brightness);
  const phases = [rng.next(), rng.next(), rng.next()].map((p) => p * TAU);
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const swell =
      1 +
      0.16 * Math.sin(TAU * 0.13 * t + phases[0]!) +
      0.1 * Math.sin(TAU * 0.31 * t + phases[1]!) +
      0.06 * Math.sin(TAU * 0.71 * t + phases[2]!);
    out[i] = top.next(band.next(pink())) * 1.6 * swell;
  }
  const voices = Math.round(seconds * options.density);
  const [low, high] = options.formants;
  for (let v = 0; v < voices; v++) {
    const start = rng.next() * seconds;
    const duration = 0.12 + rng.next() * 0.5;
    const centre = low * (high / low) ** rng.next();
    const filter = new Biquad('bandpass', centre, 1 + rng.next() * 1.5);
    const gain = 0.25 + rng.next() * 0.6;
    const from = length(start);
    const count = Math.min(out.length - from, length(duration));
    for (let i = 0; i < count; i++) {
      const envelope = Math.sin((Math.PI * i) / count) ** 2;
      out[from + i]! += filter.next(white(rng)) * envelope * gain;
    }
  }
  const claps = Math.round(seconds * 3 * options.brightness);
  const crisp = new Biquad('bandpass', 900, 0.6);
  for (let c = 0; c < claps; c++) {
    const from = length(rng.next() * seconds);
    const count = Math.min(out.length - from, length(0.025));
    const gain = 0.025 + rng.next() * 0.045;
    for (let i = 0; i < count; i++)
      out[from + i]! += crisp.next(white(rng)) * Math.exp(-i / (count / 4)) * gain;
  }
  return out;
}

/** Render one sound as mono samples in [-1, 1]. Deterministic for each name. */
export function renderSound(name: SoundName): Float32Array {
  const rng = createRng(`pitch-to-glory:audio:${name}`);
  switch (name) {
    case 'tap': {
      const out = new Float32Array(length(0.09));
      note(out, 0, 390, { attack: 0.006, decay: 0.015 });
      note(out, 0, 780, { attack: 0.007, decay: 0.01, gain: 0.08 });
      return finish(out, 0.14);
    }
    case 'toggle': {
      const out = new Float32Array(length(0.14));
      note(out, 0, 330, { decay: 0.025 });
      note(out, 0.05, 440, { decay: 0.025, gain: 0.7 });
      return finish(out, 0.16);
    }
    case 'confirm': {
      const out = new Float32Array(length(0.45));
      note(out, 0, 329.63, { decay: 0.075, gain: 0.8, bell: 2 });
      note(out, 0.085, 493.88, { decay: 0.095, bell: 2 });
      return finish(out, 0.23);
    }
    case 'error': {
      const out = new Float32Array(length(0.4));
      note(out, 0, 330, { wave: 'triangle', decay: 0.05 });
      note(out, 0.11, 247, { wave: 'triangle', decay: 0.07 });
      return finish(out, 0.22);
    }
    case 'moment': {
      const out = new Float32Array(length(0.6));
      note(out, 0, 392, { decay: 0.1, bell: 2.0 });
      note(out, 0.14, 587.33, { decay: 0.12, bell: 2.0 });
      return finish(out, 0.25);
    }
    case 'reward': {
      const out = new Float32Array(length(1.1));
      [261.63, 329.63, 392, 493.88].forEach((frequency, index) =>
        note(out, index * 0.09, frequency, {
          attack: 0.012,
          decay: 0.16,
          bell: 2,
          gain: 0.8 + index * 0.05,
        }),
      );
      return finish(out, 0.31);
    }
    case 'levelUp': {
      const out = new Float32Array(length(1.8));
      [196, 261.63, 329.63, 392].forEach((frequency, index) =>
        note(out, index * 0.1, frequency, { decay: 0.1, gain: 0.7 }),
      );
      // A mellow major seventh chord rather than a metallic fanfare.
      for (const frequency of [261.63, 329.63, 392, 493.88])
        note(out, 0.42, frequency, { attack: 0.03, decay: 0.28, bell: 2, gain: 0.5 });
      return finish(out, 0.36);
    }
    case 'whistle': {
      const out = new Float32Array(length(0.45));
      whistle(out, 0, 0.28, rng);
      return finish(out, 0.2);
    }
    case 'whistleLong': {
      const out = new Float32Array(length(0.8));
      whistle(out, 0, 0.65, rng);
      return finish(out, 0.2);
    }
    case 'whistleFull': {
      const out = new Float32Array(length(1.5));
      whistle(out, 0, 0.2, rng);
      whistle(out, 0.33, 0.2, rng);
      whistle(out, 0.66, 0.65, rng);
      return finish(out, 0.21);
    }
    case 'kick': {
      const out = new Float32Array(length(0.25));
      let phase = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SAMPLE_RATE;
        phase += (55 + 110 * Math.exp(-t / 0.03)) / SAMPLE_RATE;
        out[i] = Math.sin(TAU * phase) * Math.exp(-t / 0.05);
      }
      const click = new Biquad('bandpass', 850, 0.6);
      for (let i = 0; i < length(0.012); i++)
        out[i]! += click.next(white(rng)) * 0.25 * (1 - i / length(0.012));
      return finish(out, 0.32);
    }
    case 'net': {
      const out = new Float32Array(length(0.45));
      const filter = new Biquad('bandpass', 1150, 0.65);
      for (let i = 0; i < out.length; i++) {
        const t = i / SAMPLE_RATE;
        out[i] = filter.next(white(rng)) * Math.min(1, t / 0.02) * Math.exp(-t / 0.12);
      }
      return finish(out, 0.2);
    }
    case 'roar': {
      const seconds = 4;
      const out = crowd(seconds, rng, { brightness: 1.15, density: 160, formants: [350, 1500] });
      for (let i = 0; i < out.length; i++) {
        const t = i / SAMPLE_RATE;
        const envelope = t < 0.35 ? (t / 0.35) ** 1.5 : t < 1.9 ? 1 : Math.exp(-(t - 1.9) / 0.7);
        out[i] = out[i]! * envelope;
      }
      return finish(out, 0.5);
    }
    case 'ooh': {
      const seconds = 1.9;
      const out = crowd(seconds, rng, { brightness: 0.8, density: 140, formants: [280, 820] });
      for (let i = 0; i < out.length; i++) {
        const t = i / SAMPLE_RATE;
        const envelope =
          t < 0.4 ? Math.sin(((t / 0.4) * Math.PI) / 2) : Math.exp(-(t - 0.4) / 0.45);
        out[i] = out[i]! * envelope;
      }
      return finish(out, 0.4);
    }
    case 'crowd': {
      // An eight-second loop: render nine and cross-fade the extra second into the start.
      const loop = 8;
      const overlap = length(1);
      const raw = crowd(loop + 1, rng, { brightness: 1, density: 60, formants: [350, 1500] });
      const out = new Float32Array(length(loop));
      for (let i = 0; i < out.length; i++) out[i] = raw[i]!;
      for (let i = 0; i < overlap; i++) {
        const mix = i / overlap;
        out[i] = raw[i]! * mix + raw[length(loop) + i]! * (1 - mix);
      }
      // No edge fades: the loop must join seamlessly.
      let max = 0;
      for (const value of out) max = Math.max(max, Math.abs(value));
      for (let i = 0; i < out.length; i++) out[i] = (out[i]! / max) * 0.38;
      return out;
    }
  }
}

/** 16-bit PCM mono or interleaved stereo WAV bytes. */
export function encodeWav(
  samples: Float32Array | readonly Float32Array[],
  sampleRate = SAMPLE_RATE,
): Uint8Array<ArrayBuffer> {
  const channels = samples instanceof Float32Array ? [samples] : samples;
  if (
    channels.length < 1 ||
    channels.length > 2 ||
    !Number.isInteger(sampleRate) ||
    sampleRate <= 0
  )
    throw new RangeError('Invalid WAV format');
  const frames = channels[0]!.length;
  if (channels.some((channel) => channel.length !== frames))
    throw new RangeError('Unequal WAV channels');
  const dataSize = frames * channels.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels.length; c++) {
      const sample = channels[c]![i]!;
      view.setInt16(
        44 + (i * channels.length + c) * 2,
        Math.round(Math.max(-1, Math.min(1, sample)) * 32767),
        true,
      );
    }
  return bytes;
}
