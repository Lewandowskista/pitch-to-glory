# Asset provenance

- All 15 crest silhouettes, 33 symbols, kit geometries, avatar layers, stadium illustration, navigation icons, share illustration and PWA icons are original SVG artwork authored in this repository. No external image assets or hotlinks are used. SVG recipes are in `src/engine/assets/`, authored illustration in `src/assets/`, and standalone icons in `public/`.
- Inter: locally bundled Latin weights 400, 500, 600, 700 from `@fontsource/inter`. SIL Open Font License 1.1; upstream https://github.com/rsms/inter. License: `node_modules/@fontsource/inter/LICENSE`.
- Bebas Neue: locally bundled Latin regular from `@fontsource/bebas-neue`. SIL Open Font License 1.1; upstream https://github.com/dharmatype/Bebas-Neue. License: `node_modules/@fontsource/bebas-neue/LICENSE`.
- No audio assets are included in Milestone 1. Procedural audio and Howler integration belong to Milestone 9. No autoplay or network media requests occur.
- All PWA visual sources remain SVG as required. SVG manifest support varies by installation platform; additional raster icon derivatives for platform compatibility require a documented spec exception during release work.

## Wardrobe and celebration artwork (milestone 7)

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
