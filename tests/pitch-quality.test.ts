import { expect, it } from 'vitest';
import { pitchQuality } from '../src/screens/match/pitchQuality';

it('caps the pitch at 1.5x and keeps antialiasing only on coarse screens with memory to spare', () => {
  expect(pitchQuality(1)).toEqual({ resolution: 1, antialias: true });
  expect(pitchQuality(1.25, 8)).toEqual({ resolution: 1.25, antialias: true });
  expect(pitchQuality(1.5)).toEqual({ resolution: 1.5, antialias: true });
  // Dense phones and laptops: 1.5x and no MSAA.
  expect(pitchQuality(2)).toEqual({ resolution: 1.5, antialias: false });
  expect(pitchQuality(3, 8)).toEqual({ resolution: 1.5, antialias: false });
  // A low-memory device drops MSAA even on a coarse screen.
  expect(pitchQuality(1, 4)).toEqual({ resolution: 1, antialias: false });
  expect(pitchQuality(1, 2)).toEqual({ resolution: 1, antialias: false });
  // Nonsense ratios fall back to 1x.
  expect(pitchQuality(0)).toEqual({ resolution: 1, antialias: true });
});
