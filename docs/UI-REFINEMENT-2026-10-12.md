# Full UI refinement — 12 October 2026

Direction: refine the existing green-and-gold football identity, as selected by the user.
Scope includes every route, artwork, empty/populated/loading/error states, and transient
elements. Earlier layout fixes are the starting point, not a certificate of visual completion.

## Design contract

- Keep forest green, warm neutral backgrounds, gold match actions, Inter body type and the
  football display type. Improve the palette's surface hierarchy in both themes.
- Make related content feel grouped: a consistent header, compact card title, readable body,
  and a separate action row. Use container width and content to organize columns.
- Keep interactive targets at least 44 px, legible locked-state descriptions, and visible
  focus. Preserve routing, browser Back, save ownership and all gameplay behavior.
- Assets remain original SVG. Improve crests, kits and player portraits without changing
  stored identities or RNG output; add a small illustration family for career/world/match
  and honours contexts. No downloaded images or new UI dependencies.
- User constraint: preserve the current match token rendering, number clarity/alignment,
  ball/player movement and animations exactly. Pitch renderers, geometry, font sizes,
  interpolation and simulation motion are outside this refinement. Surrounding match panels
  and controls may be refined without scaling/filtering the pitch artwork.
- Give confirmations, sheets, tutorials, notices and tooltips a coherent surface, edge,
  spacing and motion treatment. Bound them to the viewport, including enlarged text.
- Empty states can be compact. Do not stretch a sentence across a giant panel or invent
  content merely to fill the screen.

## Passes

1. Foundations: tokens, typography, shared cards/actions, navigation, page headers and filters.
2. Artwork: procedural crest/kit/portrait finishing, thematic vector illustrations, gallery.
3. Composition: landing, creation, career management/history pages, world/editor, match/replay.
4. Transient elements: dialogs, sheets, tutorial, tooltips, statuses, errors, update notices.
5. Acceptance: seeded route/state captures, actual dark/light settings and text scaling,
   geometry and accessibility checks, browser journeys, typecheck/lint/build/bundle checks.

## Coverage ledger

| Family    | Routes / states                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Entry     | Clubhouse new/returning; New career identity, appearance, position, world, trial, sign                                               |
| Overview  | Hub quiet/urgent; Calendar upcoming/full; Inbox empty/list/reader                                                                    |
| Player    | Profile attributes/history; Skills branches/details/unlock; Training draft/mentor/report; National squad/history                     |
| Club      | Club life/selection/chemistry; Transfers empty/offers/counteroffers; Agent available/hired                                           |
| Life      | Media empty/questions/feed; Rival comparison; Lifestyle shop/owned/sponsors; Wardrobe look/kit/challenges/celebrations               |
| History   | Trophies empty/awards/ceremony/cups; Chronicle; Moments empty/replays/share; Legacy empty/retired                                    |
| Tools     | World empty/table/fixtures/cups/playoffs/inspector; Edit clubs/leagues/players; Gallery crests/kits/portraits; Saved games; Settings |
| Match     | No world, selection, briefing, live, decisions, outcomes, halftime, report, simulation-only; shared Moment viewer                    |
| Transient | Confirmation, training guard, skill sheet, More menu, shortcuts, tooltip, tutorial, errors/loading, update/offline notice            |

The ledger describes the affected UI families and their state inventory. Shared styling applies
throughout; individual screenshots and journeys cover representative states rather than every
possible generated career, language, viewport or dialogue permutation.

## Implemented

- Refined light/dark surface tokens, panel/control radii and shadows; unified page headings,
  card treatments, tabs, navigation selection, filters, numeric columns and action groups.
- Rebalanced the landing hero, World creation, Hub, new-career preview, Chronicle and empty
  Matchday/career/history/editor/replay compositions. Short panels take their natural height;
  the tablet Wardrobe preview places the figure beside its explanation.
- Added original theme-aware SVG illustrations; finished the procedural crest, kit and portrait
  artwork with restrained details and stronger crest-symbol contrast. Generation choices,
  seeds and persisted identities are unchanged. Sources are documented in `ASSETS.md`.
- Refined confirmations, sheets, tutorials, save/settings/gallery surfaces and status notices.
  Tooltips now escape scrolling-table clipping, track resize/scroll and clamp to the viewport;
  modal tooltips remain in the modal's top layer. Screen-reader descriptions remain available
  while the visual tooltip is closed.
- Added geometry regressions for pre-world text/action spacing and creation-panel size, and
  viewport-bounded table tooltips after keyboard focus, scrolling and resizing.

## Verification

- Full Vitest: **445 passed**, across 53 files, including procedural asset, playback and match
  motion checks. Simulation and persistence logic were not changed.
- Full Playwright: **253 passed, 5 existing skips** across Chromium, Firefox and WebKit.
  Includes match journeys, 22 centered SVG shirt numbers, reduced-motion/fallback playback,
  goalkeeper decisions, saves, offline journeys and accessibility across the screen catalogue.
  This broad run preceded the final tooltip portal and compact tablet Wardrobe corrections;
  the final production build is checked separately with the affected browser suites below.
- Final-build layout, lifestyle/Wardrobe and accessibility suites: **35 passed, 1 existing
  skip** across all three browsers. The new tooltip geometry regression passes in each;
  the screen catalogue passes axe in both themes and fits a phone.
- Typecheck, lint, production build, changed-file formatting and whitespace checks pass.
  Bundle budgets pass: entry output **283.1 KB / 300 KB**; route gzip budgets also pass.
- **264 post-change captures** across desktop, tablet and phones (390 and 360 px), light/dark
  themes and 130% text. Route sweeps and final targeted recaptures report no horizontal
  overflow; all capture runs report zero browser errors. Extra captures include wizard steps,
  negotiations, confirmations, skill/More sheets, tooltips, awards and shared replays.
  Local artifacts: `artifacts/ui-layout/refinement-after`, `refinement-dark-large`,
  `refinement-final`, and `artifacts/refinement-extra` (git-ignored).
- Protected match files have **no diff**: `Pitch.tsx`, `SvgPitch.tsx`, `pitchArt.ts`,
  `pitchScene.ts`, `playback.ts`, `useSvgPlayback.ts`, and `engine/match/motion.ts`.
  Shirt-number geometry/type/color logic, canvas resolution, token rendering and motion
  interpolation remain the current implementation; surrounding match panels were refined.

These are local changes, not a deployment check. WebKit testing is not physical iPhone/Safari
testing; no real-device performance certification or new Lighthouse result is claimed.
