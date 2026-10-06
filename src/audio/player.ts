import { Howl, Howler } from 'howler';
import type { AudioSettings } from '../model/domain';
import { CROWD_SOUNDS, type SoundName } from './synth';

/**
 * Playback through Howler.js, loaded only after the player's first interaction. Sounds are
 * rendered once in a worker, wrapped as WAV blob URLs and cached as Howls.
 */
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (wav: Uint8Array<ArrayBuffer>) => void>();
const howls = new Map<SoundName, Promise<Howl>>();
let settings: AudioSettings = { muted: false, master: 0.8, effects: 0.8, crowd: 0.6 };
let bed: { howl: Howl; id: number } | null = null;
let bedLevel: number | null = null;

function render(name: SoundName): Promise<Uint8Array<ArrayBuffer>> {
  worker ??= new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<{ id: number; wav: Uint8Array<ArrayBuffer> }>) => {
    pending.get(event.data.id)?.(event.data.wav);
    pending.delete(event.data.id);
  };
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ id, name });
  });
}

function load(name: SoundName): Promise<Howl> {
  let howl = howls.get(name);
  if (!howl) {
    howl = render(name).then((wav) => {
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      return new Promise<Howl>((resolve, reject) => {
        const sound = new Howl({
          src: [url],
          format: ['wav'],
          loop: name === 'crowd',
          preload: true,
          onload: () => resolve(sound),
          onloaderror: (_, error) => reject(new Error(String(error))),
        });
      });
    });
    // A failed load is retried next time rather than cached.
    howl.catch(() => howls.delete(name));
    howls.set(name, howl);
  }
  return howl;
}

const channel = (name: SoundName) => (CROWD_SOUNDS.has(name) ? settings.crowd : settings.effects);

export function configure(next: AudioSettings): void {
  settings = next;
  Howler.volume(next.master);
  Howler.mute(next.muted || document.hidden);
  if (bed && bedLevel !== null) bed.howl.volume(bedVolume(bedLevel), bed.id);
}

export function prepare(names: readonly SoundName[]): void {
  for (const name of names) void load(name).catch(() => undefined);
}

export function play(name: SoundName): void {
  if (settings.muted || settings.master === 0 || channel(name) === 0) return;
  void load(name)
    .then((howl) => {
      const id = howl.play();
      howl.volume(channel(name), id);
    })
    .catch(() => undefined);
}

const bedVolume = (level: number) => settings.crowd * (0.25 + 0.75 * level);

/** The crowd's ambience: a level from 0 (murmur) to 1 (roaring), or null for silence. */
export function crowd(level: number | null): void {
  bedLevel = level;
  if (level === null) {
    if (bed) {
      const { howl, id } = bed;
      bed = null;
      howl.fade(howl.volume(id) as number, 0, 500, id);
      howl.once('fade', () => howl.stop(id), id);
    }
    return;
  }
  if (bed) {
    bed.howl.fade(bed.howl.volume(bed.id) as number, bedVolume(level), 700, bed.id);
    return;
  }
  void load('crowd')
    .then((howl) => {
      if (bed || bedLevel === null) return;
      const id = howl.play();
      howl.volume(0, id);
      howl.fade(0, bedVolume(bedLevel), 900, id);
      bed = { howl, id };
    })
    .catch(() => undefined);
}

document.addEventListener('visibilitychange', () => Howler.mute(settings.muted || document.hidden));
