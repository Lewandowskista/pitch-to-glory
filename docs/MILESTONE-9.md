# Milestone 9: edit mode, accessibility pass, tutorial, audio and polish

## Scope

AGENTS.md §5 (edit mode), §9.9 (accessibility), §11 (onboarding tutorial), §2 and §3 (audio with Howler.js, starting after the first interaction), and a polish pass on every screen. The web release work (deployment, PWA and offline polish, bundle audit, share tags) belongs to milestone 10 and is not started.

## Design

**Edit mode** (`/edit`, a main navigation destination).

- **What can change:** club, league and player names (1–40 characters); club colours; and new crests drawn on request.
- **How colours apply:** the crest takes the three colours in order, and the home, away and third kits rotate them, keeping their patterns.
- **The list:** clubs, leagues or players as tabs (arrow keys, Home and End), with search, a country filter and "Edited only". The tab, filters and selection live in the URL, so back, forward and refresh work.
- **The club editor:** previews colours before applying them. It shows the crest and all three kits, and a kit clash check (below) for the club's own kits and against every league opponent.
- **Reverting:** every edit keeps the original name, crest and kits in `World.edits`. Reverting restores them, and renaming back to the original removes the edit.
- **Edit files:** an export holds the edited values, each with the entity's id and original name. On import, an entry applies to the entity with that id if its original name matches. Otherwise it applies to the one entity of that kind with that original name, so a pack of names for referenced clubs carries over to another world. Entries without a single match are skipped and counted. Files go through the platform adapter (download, file picker).
- **Copied names:** records and legacies that copy a player's name follow a rename. Edits change presentation only: no sporting rule reads a name, colour or crest.
- **Timing:** edits wait while a world job or match session is active, like career actions.

**Colour-blind-safe kit clash detection.**

- Shirt colours are compared in CIELAB as seen with typical vision and with protanopia, deuteranopia and tritanopia (Machado, Oliveira and Fernandes 2009 simulation, full severity). The smallest of the four differences decides.
- Two kits clash below a difference of 22 (CIE76, `CONFIG.accessibility.kitClash`).
- In a match, the away side wears the first of its away, third and home kits that is distinct from the home kit for every viewer. If none is, it wears the most distinct one, and away tokens get a second, solid ring on top of their dashed ring. This applies to the Pixi pitch, the SVG fallback and saved Moments.
- Edit mode shows the same check while colours are chosen.

**Tutorial.**

- **First week:** six steps on the hub (fixture card, footballer, training, career navigation, inbox, the matchday button). They run while the career has played no match.
- **First match:** tactics; kick-off, which waits for the player to kick off; controls; following play; the first key moment, which waits for a choice; the explained outcome.
- **The card:** non-modal, beside the highlighted element, or a bottom sheet on phones. It has Next, Back and Skip. Escape skips the tour instead of navigating back.
- **Focus:** reading steps take focus on their heading; action steps leave focus where the action is.
- **Completion:** finishing or skipping records the track in the device settings. Loading a save never brings back a tour this device has finished. Settings can show it again.

**Audio.**

- **The sounds:** every sound is synthesised on the device, with no audio files and nothing to license. There are three groups:
  - interface: tap, toggle, confirm, error;
  - rewards: reward chime and level-up fanfare;
  - match: key-moment cue, pea whistle (short, long, full time), kick, net, goal roar, groan, and an eight-second seamless crowd loop.
- **Rendering:** a pure DSP module (`src/audio/synth.ts`: oscillators, seeded noise, RBJ biquad filters) renders 16-bit WAV in a worker. Playback goes through Howler.js.
- **Loading:** Howler and the synthesiser load only after the first click or key press, as their own chunk, so the initial bundle and the autoplay rules are untouched.
- **Interface sounds:** buttons, links and tabs tap, and switches toggle. Rewards (skill unlock, challenge claim, sponsor deal, level-up, Golden Ball reveal) and failed career actions have their own sounds.
- **Match sounds:**
  - whistles at kick-off, half-time and full time, and a cue at each key moment;
  - goals: the net, then a roar for the player's side or a groan for the opposition;
  - a kick on shots, and an "ooh" at saves against the opposition;
  - a crowd that rises with play and momentum, quietens when paused, and is silent when the tab is hidden.
- **Settings:** mute, plus master, effects and crowd volumes, and buttons to try the sounds.

**Accessibility pass.**

- A sweep checks all 26 routes with axe in light and dark on a populated career, checks overflow at 390 px, and tabs through key screens checking that focus is visible. It found and fixed these issues, most of them from earlier milestones:
  - menu styles leaked pale "eyebrow" labels onto the World screen;
  - the gallery index numbers had too little contrast;
  - unavailable skills were faded below the contrast minimum;
  - definition lists on Skills and Training were invalid;
  - the profile's match history pushed the page wider than a phone;
  - Saves' import labels looked disabled without saying so.
- Hover-only tooltips now have equivalents for every input. The shared `Tooltip` opens on hover, keyboard focus and a touch long press, and is always linked by `aria-describedby`. Hover titles that only repeated visible text were removed.
- Dark-mode pages no longer paint the light theme first (from milestone 8). Colour inputs are excluded from the text-field styling.
- Match shortcuts (Space, 1–4) and playback ignore non-modal dialogs such as the tutorial.

**Polish.**

- Plurals ("1 club"), copy matched to on-screen labels, and the tutorial's pointer to whichever matchday button is shown.
- The engine is now lint-checked against browser globals as well as browser imports.

**Persistence.** File schema 13. `World.edits` is optional and validated by `editsValidation.ts`. Settings gain `audio` and `tutorial`; preferences and saves from before get defaults.

## Implementation checklist

- [x] Kit clash engine and pitch integration.
- [x] Edit engine (actions, packs), validation, schema 13, Edit mode screen and navigation.
- [x] Procedural synthesiser, rendering worker, Howler player and facade; interface, reward and match sounds; sound settings.
- [x] Tutorial component and both tours; settings flag and replay; device-level completion.
- [x] Tooltip with touch long press; accessibility sweep fixes; engine lint scope.
- [x] Unit tests (21) and browser journeys for edit mode, onboarding, sound settings, and the accessibility and keyboard sweep.
- [x] Docs.

## Known limits

- Avatars still have no "no accessory" or bald option; adding one touches avatar validation, the wizard and the wardrobe's cosmetic catalogue.
- Edit mode renames leagues, not cups or continental competitions.
- Synthesised crowd sound is stylised rather than recorded; CC0 recordings could replace the crowd sounds later behind the same audio facade, without changing the match or settings code.
- Sounds are verified for loading, rendering and determinism; how they sound is a human judgement.
- The tutorial runs once per device; a second career on the same device does not show it unless replayed from Settings.
