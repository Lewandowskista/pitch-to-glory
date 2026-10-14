# Asset provenance

## UI refinement (12 October 2026)

`src/ui/FootballIllustration.tsx` contains original theme-aware vector illustrations for
career, world/match and honours empty states. Crest, kit and portrait recipes gained flat
finishing details, stronger symbol contrast and stitched kit edges while retaining all
stored options and deterministic generation. No new image downloads, raster assets or
third-party artwork were introduced. Live match tokens, digit rendering, pitch geometry
and animation code were retained unchanged.

- All 15 crest silhouettes, 33 symbols, kit geometries, avatar layers, stadium illustration, navigation icons, share illustration and PWA icons are original SVG artwork authored in this repository. No external image assets or hotlinks are used. SVG recipes are in `src/engine/assets/`, authored illustration in `src/assets/`, and standalone icons in `public/`.
- Inter: the variable font from `@fontsource-variable/inter` (Latin subset, weights 100–900), self-hosted. SIL Open Font License 1.1; upstream https://github.com/rsms/inter. License: `node_modules/@fontsource-variable/inter/LICENSE`.
- Bebas Neue: locally bundled Latin regular from `@fontsource/bebas-neue`. SIL Open Font License 1.1; upstream https://github.com/dharmatype/Bebas-Neue. License: `node_modules/@fontsource/bebas-neue/LICENSE`.
- No audio assets are included in Milestone 1. Procedural audio and Howler integration belong to Milestone 9. No autoplay or network media requests occur.
- All PWA visual sources remain SVG as required. SVG manifest support varies by installation platform; additional raster icon derivatives for platform compatibility require a documented spec exception during release work.

## Wardrobe and celebration artwork (milestone 7)

The full-body Wardrobe preview adds original SVG arms and hands beneath the shirt, sharing
the portrait's skin palette. Long sleeves cover the forearms; shirt trims and captain's bands
remain on top. This composition is separate from live match token artwork.

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

## UI redesign, phase 2 art (15 October 2026)

All of the following is original SVG artwork authored in this repository and generated in code.
No external images, fonts or hotlinks were added. Some shapes were adapted from the approved
Claude Design art sheets for this project, which are themselves original.

- **Player portraits** (`src/engine/assets/avatar.ts`): flat vector busts built from layered
  parts: 8 face shapes, 8 skin tones, 12 hairstyles (back, over-shoulder and highlight layers),
  8 hair colours, 9 facial-hair styles, 8 eyebrow shapes with their own thickness, 8 eye shapes,
  8 iris colours, 8 noses, 8 mouths and 9 accessories (headband, ear studs, captain's armband,
  nose strip, hoop earring, plaster, necklace, club-colour headband). Each portrait sits in its
  own tinted disc and wears the club's kit (pattern, collar and the crest as the chest badge).
  With age the hairline recedes, grey blends in, lines deepen and facial hair fills in.
- **Full-body figure** (`renderFigure` in `src/engine/assets/gear.ts`): the portrait head on a
  body with skin-matched arms, sleeves, captain's armband, shorts, socks and boots.
- **Crests v2** (`src/engine/assets/crest.ts`): 15 badge shapes × 8 field divisions × 33
  emblems × the club's three colours, with a drop shadow, sheen, inner rim and an optional
  founding-year ribbon. The division and founding year are calculated, never stored.
- **Kits v2** (`src/engine/assets/kit.ts`): 8 patterns, 4 collar styles in 2 treatments, cuff
  trims, a maker mark, the club crest as the badge and a fictional sponsor wordmark
  (`t.art.sponsors`).
- **Lettering** (`src/engine/assets/glyphs.ts`): an original condensed uppercase alphabet drawn
  as SVG paths, so text inside generated art renders without a web font.
- **Illustrations** (`src/engine/assets/`): trophies and medals (`trophies.ts`), national flags
  for England, France, Spain, Germany, Italy and Portugal with two-colour fallbacks
  (`flags.ts`), lifestyle shop drawings for every catalogue item (`lifestyle.ts`), weather and
  pitch-condition icons (`conditions.ts`), celebration key-frame poses (`celebrations.ts`) and a
  club-coloured stadium hero (`stadium.ts`) that recolours the composition of
  `src/assets/stadium.svg`. These replace the earlier text glyphs for trophy and award marks.
- **Chronicle poster** (`src/screens/career/chroniclePoster.ts`): the exported PNG embeds the
  self-hosted Bebas Neue (`@fontsource/bebas-neue`) and Inter (`@fontsource-variable/inter`)
  woff2 files as data-URI font faces at export time. Both are SIL Open Font License 1.1, and the
  files are the same ones the app already ships.
