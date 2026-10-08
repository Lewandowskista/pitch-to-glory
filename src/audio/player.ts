import { Howl, Howler } from 'howler';
import type { AudioSettings } from '../model/domain';
import { DEFAULT_SETTINGS } from '../persistence/settings';
import { CROWD_SOUNDS, type SoundName } from './synth';
import type { AudioName } from './music';

/** Lazy playback and mixing. All synthesis stays off the main thread. */
let worker: Worker | null = null;
let nextId = 0;
interface Request {
  resolve: (wav: Uint8Array<ArrayBuffer>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<number, Request>();
const howls = new Map<AudioName, Promise<Howl>>();
let settings: AudioSettings = { ...DEFAULT_SETTINGS.audio };
let bedLevel: number | null = null;
interface Loop {
  name: 'music' | 'crowd';
  track: { howl: Howl; id: number; playing: boolean } | null;
  loading: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
const music: Loop = { name: 'music', track: null, loading: false, timer: null };
const bed: Loop = { name: 'crowd', track: null, loading: false, timer: null };
const active: { name: SoundName; howl: Howl; id: number }[] = [];
const lastPlayed = new Map<SoundName, number>();
let silenceVersion = 0;
const mixedContexts = new WeakSet<AudioContext>();
/** Smooth combined peaks without flattening the deliberately quiet individual effects. */
function mixOutput(): void {
  const ctx = Howler.ctx;
  const master = Howler.masterGain;
  if (!Howler.usingWebAudio || !ctx || !master || mixedContexts.has(ctx)) return;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 12;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;
  master.disconnect();
  master.connect(compressor);
  compressor.connect(ctx.destination);
  mixedContexts.add(ctx);
}

function failWorker(): void {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error('Audio rendering failed'));
  }
  pending.clear();
}
function render(name: AudioName): Promise<Uint8Array<ArrayBuffer>> {
  if (!worker) {
    worker = new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (
      event: MessageEvent<{ id: number; wav?: Uint8Array<ArrayBuffer>; error?: string }>,
    ) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      clearTimeout(request.timer);
      if (event.data.wav) request.resolve(event.data.wav);
      else request.reject(new Error(event.data.error ?? 'Audio rendering failed'));
    };
    worker.onerror = failWorker;
    worker.onmessageerror = failWorker;
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(failWorker, 30000);
    pending.set(id, { resolve, reject, timer });
    try {
      worker!.postMessage({ id, name });
    } catch {
      failWorker();
    }
  });
}
function load(name: AudioName): Promise<Howl> {
  let result = howls.get(name);
  if (!result) {
    result = render(name).then((wav) => {
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      return new Promise<Howl>((resolve, reject) => {
        const timeout = setTimeout(() => {
          URL.revokeObjectURL(url);
          sound.unload();
          reject(new Error('Audio decoding timed out'));
        }, 15000);
        const sound = new Howl({
          src: [url],
          format: ['wav'],
          loop: name === 'crowd' || name === 'music',
          preload: true,
          volume: 0,
          onload: () => {
            clearTimeout(timeout);
            mixOutput();
            // HTML audio still streams from the URL; Web Audio owns the decoded buffer.
            if (Howler.usingWebAudio && Reflect.get(sound, '_webAudio') !== false)
              URL.revokeObjectURL(url);
            resolve(sound);
          },
          onloaderror: (_, error) => {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            sound.unload();
            reject(new Error(String(error)));
          },
          onplayerror: (id) => {
            // Retry persistent beds on a genuine gesture. One-shots become stale.
            const loop = name === 'music' ? music : name === 'crowd' ? bed : null;
            if (loop) {
              if (loop.track) loop.track.playing = false;
              sound.once('unlock', () => {
                if (loop.track?.id === id) syncLoop(loop);
              });
            } else sound.stop(id);
          },
        });
      });
    });
    result.catch(() => howls.delete(name));
    howls.set(name, result);
  }
  return result;
}
const audible = () => !settings.muted && settings.master > 0 && !document.hidden;
const channel = (name: SoundName) => (CROWD_SOUNDS.has(name) ? settings.crowd : settings.effects);
const desired = (loop: Loop) =>
  audible() &&
  (loop.name === 'music'
    ? settings.musicEnabled && settings.music > 0
    : bedLevel !== null && settings.crowd > 0);
const loopVolume = (loop: Loop) =>
  loop.name === 'music'
    ? settings.music * (bedLevel === null || settings.crowd === 0 ? 1 : 0.45)
    : settings.crowd * (0.15 + 0.55 * (bedLevel ?? 0));

function syncLoop(loop: Loop): void {
  if (loop.timer !== null) {
    clearTimeout(loop.timer);
    loop.timer = null;
  }
  const track = loop.track;
  if (!desired(loop)) {
    if (track?.playing) {
      if (!audible()) {
        track.howl.pause(track.id);
        track.playing = false;
      } else {
        track.howl.fade(track.howl.volume(track.id) as number, 0, 700, track.id);
        loop.timer = setTimeout(() => {
          loop.timer = null;
          track.howl.pause(track.id);
          track.playing = false;
        }, 700);
      }
    }
    return;
  }
  if (track) {
    if (!track.playing) {
      track.howl.volume(0, track.id);
      track.howl.play(track.id);
      track.playing = true;
    }
    track.howl.fade(track.howl.volume(track.id) as number, loopVolume(loop), 1200, track.id);
  } else if (!loop.loading) {
    loop.loading = true;
    void load(loop.name)
      .then((howl) => {
        if (desired(loop)) {
          const id = howl.play();
          howl.volume(0, id);
          loop.track = { howl, id, playing: true };
          howl.fade(0, loopVolume(loop), 1800, id);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        loop.loading = false;
      });
  }
}
export function unlock(): void {
  mixOutput();
  if (Howler.ctx?.state === 'suspended') void Howler.ctx.resume().catch(() => undefined);
  syncLoop(music);
  syncLoop(bed);
}
export function configure(next: AudioSettings): void {
  settings = next;
  Howler.volume(next.master);
  mixOutput();
  Howler.mute(next.muted || document.hidden);
  if (!audible()) {
    silenceVersion++;
    for (const sound of [...active]) sound.howl.stop(sound.id);
    active.length = 0;
  } else {
    for (const sound of active) sound.howl.volume(channel(sound.name), sound.id);
  }
  syncLoop(music);
  syncLoop(bed);
}
export async function prepare(names: readonly SoundName[]): Promise<void> {
  await Promise.all(
    names.map((name) =>
      load(name)
        .then(() => undefined)
        .catch(() => undefined),
    ),
  );
}
function removeActive(id: number): void {
  const index = active.findIndex((sound) => sound.id === id);
  if (index !== -1) active.splice(index, 1);
}
export function play(name: SoundName): void {
  if (!audible() || channel(name) === 0) return;
  const now = Date.now();
  const cooldown =
    name === 'tap' || name === 'toggle' ? 90 : name === 'roar' || name === 'ooh' ? 1600 : 220;
  if (now - (lastPlayed.get(name) ?? -Infinity) < cooldown) return;
  lastPlayed.set(name, now);
  const version = silenceVersion;
  void load(name)
    .then((howl) => {
      if (!audible() || !channel(name) || version !== silenceVersion || Date.now() - now > 1500)
        return;
      const sameChannel = active.filter(
        (sound) => CROWD_SOUNDS.has(sound.name) === CROWD_SOUNDS.has(name),
      );
      if (sameChannel.length >= (CROWD_SOUNDS.has(name) ? 2 : 3)) {
        const oldest = sameChannel[0]!;
        oldest.howl.stop(oldest.id);
        removeActive(oldest.id);
      }
      const id = howl.play();
      howl.volume(channel(name), id);
      active.push({ name, howl, id });
      howl.once('end', () => removeActive(id), id);
      howl.once('stop', () => removeActive(id), id);
      howl.once('playerror', () => removeActive(id), id);
    })
    .catch(() => undefined);
}
/** Explicit previews wait for decoding; routine UI cues expire instead of playing late. */
export async function preview(name: SoundName): Promise<void> {
  const version = silenceVersion;
  await prepare([name]);
  if (version === silenceVersion) play(name);
}
export function crowd(level: number | null): void {
  bedLevel = level === null ? null : Math.max(0, Math.min(1, level));
  syncLoop(bed);
  syncLoop(music);
}
document.addEventListener('visibilitychange', () => configure(settings));
