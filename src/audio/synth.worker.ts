/// <reference lib="webworker" />
import { encodeWav, renderSound, type SoundName } from './synth';
import { MUSIC, renderMusic } from './music';

/** Renders sounds off the main thread; the crowd loop takes tens of milliseconds. */
self.onmessage = (event: MessageEvent<{ id: number; name: SoundName | 'music' }>) => {
  const { id, name } = event.data;
  try {
    const wav =
      name === 'music' ? encodeWav(renderMusic(), MUSIC.sampleRate) : encodeWav(renderSound(name));
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, wav }, [wav.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
