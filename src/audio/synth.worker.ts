/// <reference lib="webworker" />
import { encodeWav, renderSound, type SoundName } from './synth';

/**
 * Renders sounds off the main thread; the crowd loop takes tens of milliseconds. The music is
 * not rendered here: it is rendered at build time (scripts/render-music.ts) and downloaded.
 */
self.onmessage = (event: MessageEvent<{ id: number; name: SoundName }>) => {
  const { id, name } = event.data;
  try {
    const wav = encodeWav(renderSound(name));
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, wav }, [wav.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
