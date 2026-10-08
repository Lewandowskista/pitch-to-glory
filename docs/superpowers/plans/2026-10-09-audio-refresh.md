# Audio refresh implementation plan

**Goal:** Make the game's audio comfortable over long sessions and add an original mellow lo-fi background track.

**Architecture:** Keep the audio facade and lazy Howler player. Render all audio in the existing worker; isolate the original stereo composition in `src/audio/music.ts`. Share preferences defaults and extend validation so existing saves retain their settings.

**Tech stack:** TypeScript, Howler, seeded PCM synthesis, React settings, Vitest, Playwright.

- [x] Add failing signal tests for quieter, warmer effects and stereo WAV; preference migration and invalid music settings.
- [x] Retune `src/audio/synth.ts`, preserving semantic sound names; add a deterministic circular stereo composition in `src/audio/music.ts` and dispatch it in `synth.worker.ts`.
- [x] Add music preferences, controls and copy in domain/settings/i18n/Settings; await explicit previews and clean up crowd previews on unmount.
- [x] Harden player and facade: deferred-load checks, repeated cue suppression, concurrent loop startup, bounded worker requests, object URL cleanup, gesture unlock, hidden-tab pause, fades and music ducking.
- [x] Test player lifecycle with deferred Howler loads; test controls in all three browsers and playback in Chromium/Firefox; record the Windows WebKit limitation explicitly.
- [x] Export listening samples with an authored script, document provenance, run typecheck, lint, focused tests and production build. Record limitations honestly.

The review and acceptance criteria are in `docs/AUDIO-REVIEW.md`. Execute inline; no changes to unrelated career/simulation work.
