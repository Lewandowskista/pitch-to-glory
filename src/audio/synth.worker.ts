/// <reference lib="webworker" />
import { encodeWav, renderSound, type SoundName } from './synth';

/** Renders sounds off the main thread; the crowd loop takes tens of milliseconds. */
self.onmessage = (event: MessageEvent<{ id: number; name: SoundName }>) => {
  const { id, name } = event.data;
  const wav = encodeWav(renderSound(name));
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, wav }, [wav.buffer]);
};
