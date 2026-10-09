# Asset provenance

- All 15 crest silhouettes, 33 symbols, kit geometries, avatar layers, stadium illustration, navigation icons, share illustration and PWA icons are original SVG artwork authored in this repository. No external image assets or hotlinks are used. SVG recipes are in `src/engine/assets/`, authored illustration in `src/assets/`, and standalone icons in `public/`.
- Inter: locally bundled Latin weights 400, 500, 600, 700 from `@fontsource/inter`. SIL Open Font License 1.1; upstream https://github.com/rsms/inter. License: `node_modules/@fontsource/inter/LICENSE`.
- Bebas Neue: locally bundled Latin regular from `@fontsource/bebas-neue`. SIL Open Font License 1.1; upstream https://github.com/dharmatype/Bebas-Neue. License: `node_modules/@fontsource/bebas-neue/LICENSE`.
- No audio assets are included in Milestone 1. Procedural audio and Howler integration belong to Milestone 9. No autoplay or network media requests occur.
- All PWA visual sources remain SVG as required. SVG manifest support varies by installation platform; additional raster icon derivatives for platform compatibility require a documented spec exception during release work.

## Wardrobe and celebration artwork (milestone 7)

The live pitch's circular player tokens, keeper gloves, direction markers, panelled football,
goal nets, corner arcs, flight trails and arrival rings are original procedural vector artwork
in `src/screens/match/pitchScene.ts` and `SvgPitch.tsx`. `pitchArt.ts` shares dimensions and
contrast choices between the GPU and SVG renderers. These assets use no downloaded images.

All of these are original, authored in code; no external images are used.

- **Dressed shirt** (sleeve length, captain's armband) and the **socks and boots**: flat SVG shapes from `src/engine/assets/gear.ts`, in each club's kit colours.
- **Celebration previews**: a pitch token in SVG.
- **Motions**: CSS keyframes (`src/styles/celebrations.css`) and the Pixi scene (`src/screens/match/pitchScene.ts`).

## Honours artwork (milestone 8)

All of these are original, authored in code; no external images are used.

- **Moment replay pitch**: flat SVG pitch and kit-coloured tokens in `src/screens/career/MomentPitch.tsx`.
- **Chronicle poster**: an SVG composed in `src/screens/career/ChronicleView.tsx` from the player's procedural portrait, then drawn to a canvas in the browser and exported as PNG. The PNG is generated on the player's device and never shipped with the app.
- **Trophy and award marks**: text glyphs (★ ✦ ◆) in the shared display styles.

## Audio (milestone 9)

No audio files are included. Every sound is synthesised on the player's device by original code in `src/audio/synth.ts` (oscillators, seeded noise and filters) and played with Howler.js (MIT licence, `node_modules/howler/LICENSE.md`). The sounds are interface taps, toggles, confirmations and errors; reward chimes and a level-up fanfare; a pea whistle, kick, net, goal roar, groan and a looping crowd. Nothing is downloaded or recorded, and nothing needs attribution.

## Audio refresh (9 October 2026)

The effects now use a softer, lower-register palette, restrained peaks and less resonant crowd
textures. **After the Floodlights** is an original 76 BPM instrumental lo-fi composition in
`src/audio/music.ts`: electric keys, bass, soft tonal percussion, sparse melody and stereo
room echoes. All instruments, notes and effects are authored here and synthesised from seeded
noise and oscillators. Balatro is a mood reference only; no soundtrack audio, samples, melody
or arrangement from it are used. There are no third-party music assets or remote media requests.

The stereo loop is generated in the audio worker after the first interaction, when enabled.
`node --import tsx scripts/render-audio.ts` exports the original track and all effects into
`artifacts/audio/` for listening; these generated WAVs are not shipped in the app. See
`docs/AUDIO-REVIEW.md` for the review, rationale and listening limitations.

The menu/hub track uses no noise-based brushes or hats: these were replaced with rounded
drum taps after player feedback that the percussion sounded like wind. Match crowd effects
are separate from the music.

## Release images and fonts (milestone 10)

- **PNG derivatives**: `public/share.png` (1200×630 share card), `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` and `public/apple-touch-icon.png` are rendered from the original `public/share.svg`, `public/icon.svg` and `public/icon-maskable.svg` by `scripts/raster.mjs`, because social cards and iOS home-screen icons do not accept SVG. The share card's text is set in the game's own self-hosted fonts. The SVGs remain the source; regenerate with `npm run raster`.
- **Inter**: now the variable font from `@fontsource-variable/inter` (Latin subset, weights 100–900), SIL Open Font License 1.1; upstream https://github.com/rsms/inter. License: `node_modules/@fontsource-variable/inter/LICENSE`. It replaces the four static weights from `@fontsource/inter`.
