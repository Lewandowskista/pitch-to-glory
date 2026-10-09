# Sound review and direction — 9 October 2026

## Findings

This is a code and signal review, not a claim of a listening test. The existing audio is
original procedural synthesis, rendered in a worker and played through lazy-loaded Howler.
That architecture is appropriate for offline play and avoids unlicensed recordings.

| Area        | Existing issue                                                                                                                 | Change                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Interface   | Every navigation click has a 1.25 kHz tone and 2.5 kHz overtone; toggle goes up to 1.32 kHz. Repetition makes these intrusive. | Short, rounded low notes with slower attacks and restrained peaks.                                                   |
| Rewards     | Notes reach 2.09 kHz, with an inharmonic partial at 2.76 times the fundamental.                                                | Warm consonant voicings in a lower register, gentle harmonic overtones and smoother decays.                          |
| Whistles    | Strong 2.86 kHz carrier, rapid modulation, long full-time blast.                                                               | Quieter, less warbling, shorter blasts with softened breath and gentler release.                                     |
| Match Foley | Kick transient is high-passed at 2.2 kHz; net noise centred at 3.2 kHz.                                                        | Rounded impact and muted fabric rustle.                                                                              |
| Crowd       | Narrow resonant noise voices and crisp high-frequency claps sound synthetic; roar peaks at 0.85.                               | Broader, darker texture, quieter claps and more restrained reactions. Still stylised, not recorded stadium realism.  |
| Mix         | Independent peak normalization ignores overlapping effects; late loads can play stale cues after mute.                         | Limit repeated cues and polyphony, re-check mute and visibility after loading, and apply gentle fades.               |
| Music       | No background music or music controls.                                                                                         | Original instrumental lo-fi composition, independent volume and enable switch; gently reduced during match ambience. |
| Preview     | First preview can be dropped while the audio chunk loads; crowd preview timeout outlives Settings.                             | Await audio unlock for explicit previews and clean up preview timers on navigation.                                  |
| Reliability | Worker errors leave promises pending; temporary WAV URLs are retained.                                                         | Bound worker requests, reject on worker errors, release URLs after decoding and retry failed loads.                  |

## Musical direction

Recommended: warm, mellow instrumental lo-fi. Alternative directions are a dreamier ambient
arrangement or a more energetic sporting beat. The recommended track uses 76 BPM, soft tonal
percussion, rounded bass, mellow electric keys, sparse melodic responses and stereo room
echoes. A 32-bar A/A'/B/A'' arrangement gives about 101 seconds before a seamless repeat.
The reference to Balatro informs the relaxed, absorbing mood; the melody, harmony and
recording are original. No samples or audio from that game are used.

Music synthesis runs only after a user gesture and when music is enabled and audible.
It remains a worker-only module, so the initial bundle is unaffected. The loop is stereo,
with circularly rendered note tails and effects; no edge fades that would cause a recurring
gap. Interface effects are rendered at 44.1 kHz; the intentionally band-limited music uses
32 kHz to keep decoded memory reasonable. Existing audio preferences keep their volumes;
missing music preferences receive the new defaults without changing save version or rules.

## Verification and practical limits

Check deterministic output, finite samples, peaks, frequency balance, loop seams, stereo WAV
encoding, settings validation and compatibility with older preferences. Exercise playback
lifecycle with deferred loads: mute, hidden tabs, repeated cues, concurrent loop startup,
music enable/disable and preview cleanup. Run sound settings in Chromium, Firefox and WebKit,
typecheck, lint and production build/bundle checks. Export the original track and effects to
`artifacts/audio/` for listening; automated checks cannot establish musical taste or replace
a headphone/speaker listening review.

### Completed verification

- 36 focused unit tests passed: effect and music signals, stereo encoding, playback lifecycle,
  settings validation, older preferences, edited-world save round trips and migration.
- Typecheck, repository lint and production build passed. Lint now excludes the generated
  `artifacts/` directory, consistent with the repository's existing Git/Prettier exclusions.
- All 27 route bundle checks passed (95.7–218.5 KB gzip); the music generator remains in the
  audio worker and Howler/player remains lazy-loaded.
- Eight browser checks passed: sound and music controls in Chromium, Firefox and WebKit;
  actual music start, independent channels, enable/disable and mute in Chromium and Firefox.
- One playback check is explicitly skipped on Windows WebKit. Direct diagnostics found no
  `AudioContext` or `webkitAudioContext` and generated WAV loading returned media error 4.
  The settings checks still run there. Actual Safari/macOS/iOS playback remains unverified.
  [Playwright documents platform differences in media support](https://playwright.dev/docs/browsers#webkit).
- The listening pack is in `artifacts/audio/`, including `after-the-floodlights.wav` and
  all 15 effects. Track duration: 101.05 seconds; peak: −6.02 dBFS; average RMS: −23.53 dBFS
  before the player's music/master controls. These are signal measurements, not LUFS or
  a subjective listening verdict.

### Follow-up: wind-like sound on the menu and career hub

The player reported the sound on the menu and hub as well as during play. Browser inspection
confirmed a single music loop playing on Settings, with no crowd loop active. The music's
filtered-noise brushes and hats were the likely source, rather than a separate weather sound.
These have been removed and replaced with short, low tonal drum taps; the keys, bass, melody
and music controls remain. Match ambience has not been changed in this follow-up. Automated
checks verify signal and playback integrity; the player's listening feedback remains the
test of whether this resolves the perceived wind sound.
