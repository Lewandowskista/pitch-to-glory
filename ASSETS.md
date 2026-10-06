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
