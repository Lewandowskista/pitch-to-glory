import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encodeWav, renderSound, SAMPLE_RATE, SOUND_NAMES } from '../src/audio/synth';
import { MUSIC, renderMusic } from '../src/audio/music';

/** Listening pack: node --import tsx scripts/render-audio.ts */
const directory = resolve('artifacts/audio');
await mkdir(directory, { recursive: true });
const levels: { name: string; seconds: number; peakDbfs: number; rmsDbfs: number }[] = [];
function measure(name: string, channels: Float32Array[], sampleRate: number) {
  let peak = 0,
    energy = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
  }
  levels.push({
    name,
    seconds: channels[0]!.length / sampleRate,
    peakDbfs: 20 * Math.log10(peak),
    rmsDbfs: 20 * Math.log10(Math.sqrt(energy / (channels[0]!.length * channels.length))),
  });
}
for (const name of SOUND_NAMES) {
  const samples = renderSound(name);
  await writeFile(resolve(directory, `${name}.wav`), encodeWav(samples));
  measure(name, [samples], SAMPLE_RATE);
}
const song = renderMusic();
await writeFile(resolve(directory, 'after-the-floodlights.wav'), encodeWav(song, MUSIC.sampleRate));
measure('After the Floodlights', song, MUSIC.sampleRate);
await writeFile(resolve(directory, 'levels.json'), JSON.stringify(levels, null, 2) + '\n');
console.table(
  levels.map((level) =>
    Object.fromEntries(
      Object.entries(level).map(([key, value]) => [
        key,
        typeof value === 'number' ? value.toFixed(2) : value,
      ]),
    ),
  ),
);
console.log(`Listening pack: ${directory}`);
