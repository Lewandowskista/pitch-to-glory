# UI kit

The shared building blocks of the redesign (phase 3). Every screen builds on these, so the
whole game reads as one family in light and dark. This file is the contract for the screen
work: if a screen needs something the kit does not have, add it here (and to the kit) rather
than styling a one-off.

Design source: the approved Claude Design artboards (`UIKit`, `UIKitDark`, `Feedback`,
`Tutorial`, `Main`, `MainDark`, `HubMobile`, `MobileHubLight`, `MobileMore`, `Saves`). Where an
artboard hex differs slightly from `src/styles/tokens.css`, the token wins.

## Rules

- **Import** from `src/ui/kit` (the barrel) in screens. Always-loaded code (the shell,
  `src/ui/*`) imports the individual files (`./kit/Button`), because `Rating.tsx` pulls in the
  rating model and the career copy.
- **Tokens, never hex.** Colours come from the theme utilities (`bg-surface`, `text-muted`,
  `border-line`, `bg-accent-soft`, `text-gold-ink`, `bg-track`, ...). They switch with the
  theme automatically. The only fixed colours are the pitch (`bg-field`, `bg-field-stripes`),
  gold (`bg-gold`, `text-on-gold`), hero text (`text-hero-ink`, `text-hero-muted`) and the night
  chrome (`bg-night`, `bg-night-soft`, `bg-night-raised`, `border-night-line`, `text-night-ink`,
  `text-night-muted`, `text-mint`) used by match screens and `Panel tone="dark"`.
- **Radii:** `rounded-chip` 8px (result pills, keycaps), `rounded-control` 12px (buttons,
  fields, rows, tiles), `rounded-panel` 20px (cards, dialogs), `rounded-sheet` 28px (phone
  sheets), `rounded-full` for pills. No other radii.
- **Type:** Bebas (`font-display`) for page titles, card titles, scores and big numbers; Inter
  for everything else. Buttons are Inter 700 (the gold button 800). At most one uppercase
  eyebrow per card.
- **One gold button per screen** (`variant="play"`): the "go and play" action. Everything else
  is primary green, secondary or text.
- **Never colour alone.** Results carry W/D/L, effects carry their sign, meters carry their
  written value, errors carry an icon and an outline.
- **Targets ≥ 44px.** Buttons, tabs, filters, summaries and icon buttons already are. Keep
  custom rows at `min-h-11` or more.
- **Focus** is global: a 3px accent outline, 4px out (`:focus-visible` in `base.css`). Do not
  remove it; inside tight tab bars use `outline-offset: 2px`.
- **Motion** respects reduced motion (the system setting and the in-game switch). Use CSS
  guarded by `:root:not([data-reduced-motion='true'])` inside
  `@media (prefers-reduced-motion: no-preference)`, or Framer Motion (which reads the setting
  through the shell's `MotionConfig`).

## Tokens added in phase 3

| Token                                              | Utility                            | Use                                                    |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `--radius-chip` / `-control` / `-panel` / `-sheet` | `rounded-chip` ... `rounded-sheet` | 8 / 12 / 20 / 28px                                     |
| `--shadow-gold`                                    | `shadow-gold`                      | the gold button's pressed edge, `0 4px 0 gold-pressed` |
| `--shadow-overlay`                                 | `shadow-overlay`                   | floating layers: dialogs, tutorial card, sheets        |
| `--gold-ink`                                       | `text-gold-ink`                    | text on `bg-art-gold` (dark gold; light gold in dark)  |
| `--on-danger`                                      | `text-on-danger`                   | text on a danger fill                                  |
| `--track`                                          | `bg-track`                         | meter and progress tracks                              |
| `--scrim`                                          | `bg-scrim`                         | modal backdrops                                        |
| `--spotlight`                                      | `bg-spotlight`                     | the tutorial's lighter dimming                         |
| `--color-night*`, `--color-mint`                   | `bg-night`, `text-mint`, ...       | always-dark match chrome                               |

`--radius-panel` grew from 16 to 20px and `--radius-control` from ~10 to 12px, so every
existing card and control picked up the new shape.

## Components

All in `src/ui/kit/`, exported from `src/ui/kit/index.ts`. Every component takes `className`
for layout (margins, grid placement, width); do not use it to restyle colours.

### Buttons (`Button.tsx`)

| Export                                  | Props                                                                                                                                                                              | When                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                | `variant` (`primary` · `play` · `secondary` · `danger` · `danger-outline` · `text` · `tool`), `size` (`md` · `lg`), `block`, `icon`, `iconEnd`, `busy`, plus every `<button>` prop | Actions. `busy` keeps the label, adds a spinner, sets `aria-busy` and `aria-disabled` and ignores clicks (focus stays). `disabled` for unavailable. |
| `ButtonLink`                            | the same look props + `LinkProps`                                                                                                                                                  | Navigation that looks like a button ("Continue to matchday" when it only navigates).                                                                |
| `IconButton`                            | `label` (required, the accessible name), `icon`, `tooltip` (default true)                                                                                                          | 44 × 44 round icon-only actions.                                                                                                                    |
| `IconButtonLink`                        | `label`, `icon`, `LinkProps`                                                                                                                                                       | The top bar's settings link and similar.                                                                                                            |
| `Spinner`                               | `className`                                                                                                                                                                        | Inline "working" mark; turns only without reduced motion.                                                                                           |
| `buttonClass(variant, { size, block })` | —                                                                                                                                                                                  | The class string, for elements the kit does not render (a `<label>` file picker, a third-party link).                                               |

The variants are the component classes in `styles/base.css` (`.button`, `.button.play`,
`.button.secondary`, `.button.danger`, `.button.danger-outline`, `.button.tool`,
`.button-lg`, `.text-button`, `.icon-button`), so screens that still write
`className="button secondary"` match the kit exactly. Prefer the component in new code.

- `play` + `size="lg"` is the 52px hero CTA. Only one per screen, usually on a `HeroPanel`.
- `danger` destroys or ends (delete, retire); `danger-outline` is the softer undo (withdraw,
  release). `tool` is the small bordered action in lists and slot cards; add `text-danger` for a
  destructive tool.

### Surfaces (`Panel.tsx`)

| Export                      | Props                                                                                                                                                                                    | When                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Panel`                     | `as` (`section` default, `div`, `article`, `aside`, `li`, `header`, `form`), `tone` (`default` · `soft` · `gold` · `green` · `blue` · `dark`), `padding` (`normal` · `compact` · `none`) | Every card. `gold` = needs you / rewards, `green` = career and good news, `blue` = neutral information, `soft` = a quiet inset without shadow, `dark` = match chrome. |
| `panelClass(tone, padding)` | —                                                                                                                                                                                        | The class string (`ui.panel` = `panelClass()`, `ui.panelCompact` = `panelClass('default', 'compact')`).                                                               |
| `HeroPanel`                 | `as`, `markings` (faint pitch lines), `padding` (`normal` · `compact`)                                                                                                                   | The one field-green card per screen that shows the football. Text inside: `text-hero-ink` (default), `text-hero-muted`, `text-gold` for the eyebrow.                  |
| `PitchMarkings`             | `className`                                                                                                                                                                              | The faint pitch lines alone, for a custom hero.                                                                                                                       |
| `PageHeader`                | `title`, `eyebrow`, `description`, `actions`                                                                                                                                             | Every page title. Renders the shared `.page-heading` (`h1` in Bebas, 72px on wide screens).                                                                           |
| `CardTitle`                 | `as` (`h2` default · `h3` · `h4`), `size` (`sm` 24 · `md` 28–32 · `lg` 32–38)                                                                                                            | Card titles. `cardTitleClass(size)` is the string (`ui.heading` = `cardTitleClass('md')`).                                                                            |

Give each titled `Panel` an `aria-labelledby` that points at its `CardTitle` id. Vary card
sizes by importance; never a grid of identical cards.

### Chips and badges (`Chip.tsx`, `Results.tsx`)

| Export       | Props                                                                                                                     | When                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Chip`       | `tone` (`accent` · `solid` · `gold` · `gold-soft` · `danger` · `info` · `neutral` · `lock`), `icon`                       | 28px status pills. `lock` always shows the lock icon. `chipClass(tone)` is the string (`ui.chip` = accent). |
| `EffectChip` | `value` (signed number), `label`, `percent`, `tone` (auto: accent for gains, danger for losses; `gold` for trait bonuses) | "+3 Finishing", "−2 Morale", "+8% Trickster". Writes the sign (a true minus).                               |
| `CountBadge` | `count`, `label` (optional spoken text)                                                                                   | Gold unread counts, "99+" cap. The number is `aria-hidden`; pass `label` or speak the count yourself.       |
| `ResultChip` | `result` (`W` · `D` · `L`), `onHero`, `size` (`sm` 24 · `md` 26)                                                          | One result, announced "Won" / "Drew" / "Lost".                                                              |
| `FormGuide`  | `results` (oldest first), `label` (subject, e.g. "Birchfield form"), `onHero`, `size`                                     | The last five results, read as one phrase. `onHero` for the next-match hero (gold wins, red losses).        |

### Meters (`Meter.tsx`, `StatTile.tsx`)

| Export         | Props                                                                                                   | When                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Meter`        | `label`, `value`, `max` (100), `tone` (`accent` · `danger` · `gold` · `info`), `valueText`, `ariaLabel` | Form, morale, fitness, fatigue, challenge progress. Writes "72 of 100" (or "2 of 3"). `role="meter"`.   |
| `XpBar`        | `level`, `into`, `needed` (0 = maximum level)                                                           | Level and experience, green to gold. The career's `XpBar` (shared.tsx) feeds it from `levelProgress`.   |
| `AttributeBar` | `label`, `value`, `softCap`, `max` (99), `capLabel`, `note`                                             | One attribute with the soft-cap tick; the fill turns gold beyond the cap.                               |
| `DivergingBar` | `label`, `value` (signed), `range` (20)                                                                 | Changes around zero (trust +6, affection −4).                                                           |
| `StatTile`     | `label`, `value`, `hint`, `valueFirst`, `size` (`lg` 44px · `sm` 26px), `tone` (`soft` · `surface`)     | Bebas numbers with an Inter label: season stats, the four-attribute strip ("71 PAC" with `valueFirst`). |

### Ratings (`Rating.tsx`)

| Export         | Props                                            | When                                                                                                                                                            |
| -------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OverallBadge` | `player` or `value`, `size` (`sm` · `md` · `lg`) | The hexagon with the gold Bebas overall. Uses `overallRating` (the one rating shown everywhere). `role="img"`.                                                  |
| `RadarChart`   | `player` or `axes`, `label`, `size` (220)        | The six-axis summary (`attributeSummary`; keepers get their own axes). Labels from `careerText.profile.axesShort`; the image's name lists every axis and value. |

### Disclosure, empty states, status lines, keys

| Export       | Props                                                                                          | When                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Disclosure` | `summary`, `hint`, `defaultOpen`                                                               | Depth behind a click ("Show details", "Why this choice?"). Native `<details>`, 44px summary, turning chevron.                                                   |
| `EmptyState` | `icon`, `title`, `body`, `action`, `tone` (`green` · `blue` · `gold`), `headingLevel`, `plain` | A section with nothing yet: 56px icon disc, title, one line on how it fills up, one action (usually a secondary `ButtonLink`).                                  |
| `StatusLine` | `tone` (`success` · `neutral` · `warning` · `error`), children                                 | The result of an action, under the control that caused it. Errors are `role="alert"` with an outline and icon. Render it empty to keep the live region mounted. |
| `KeyHint`    | `keys` (string or list), `onHero`                                                              | Keycaps: "Press Enter to continue", shortcut lists. Desktop help: hide on touch layouts with `max-sm:hidden` where it adds nothing.                             |

`EmptySection` (career `shared.tsx`) stays for a titled section inside a page that is empty
for now (one dashed line); use `EmptyState` when the whole card or page is empty.

## Shared helpers that now delegate to the kit

`src/screens/career/shared.tsx`:

- `ui.panel`, `ui.panelCompact`, `ui.heading`, `ui.chip` are the kit's class strings (see
  above); `ui.eyebrow`, `ui.muted`, `ui.focus`, `ui.helper`, `ui.actions`, `ui.filters`,
  `ui.empty` are unchanged.
- `Meter` and `XpBar` render the kit's `Meter` and `XpBar` (same props as before).
- `CareerPage` renders `PageHeader`; `CareerNav` uses `CountBadge` for the Inbox count.
- `UnsavedCareer`, `CareerEmpty` and `JobProgress` use `ButtonLink` / `Button`.
- `PlayerPortrait` and `CrestImage` are unchanged.

Component classes restyled to the new design, for screens not yet rebuilt: `.button*`,
`.text-button`, `.icon-button` (new), `.switch` (moved from `settings.css` to `base.css`),
fields (`input`, `textarea`: 48px, hover, focus, `aria-invalid`, disabled), `.segmented-tabs`
(white bar, solid accent selected tab), `.career-tabs`, `.dialog*`, `.global-notice`,
`.global-error`, `.inline-error`, `.pwa-prompt`, `.loading-page`, `.error-page`,
`.state-page` (404).

Still class-based (no component yet, use as is): `.segmented-tabs` for in-page tablists,
`filterButton(pressed)` + `ui.filters` for pill filters, `.eyebrow`.

## Artboard → component map

| UIKit / Feedback artboard section      | Use                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons matrix (9 variants × 6 states) | `Button` / `ButtonLink` / `IconButton` (`variant`, `busy`, `disabled`); file picker: `<label className={buttonClass('secondary')}>` around a visually hidden `input[type=file]` |
| Fields: text, number, search, select   | native elements (styled globally); label above (13px 600), hint `text-xs text-muted`, error `StatusLine tone="error"` or the field's `aria-invalid` + `aria-describedby`        |
| Switch                                 | `<input type="checkbox" role="switch" className="switch">`                                                                                                                      |
| Checkbox, radio cards, choice cards    | native inputs; not in the kit yet (screens own them)                                                                                                                            |
| Segmented tabs                         | `.segmented-tabs` with `role="tab"` children                                                                                                                                    |
| Pill filters                           | `filterButton(pressed)` in `ui.filters`                                                                                                                                         |
| Career group tabs, nav badge           | the shell (`CareerNav`, sidebar) with `CountBadge`                                                                                                                              |
| Chips and tags                         | `Chip`; results `ResultChip` / `FormGuide`; effects `EffectChip`                                                                                                                |
| Breadcrumb                             | the shell's top bar                                                                                                                                                             |
| Tooltip                                | `src/ui/Tooltip.tsx` (unchanged)                                                                                                                                                |
| Disclosure                             | `Disclosure`                                                                                                                                                                    |
| Meters, progress, XP                   | `Meter`, `XpBar`; simulation progress `JobProgress`                                                                                                                             |
| Attribute and diverging                | `AttributeBar`, `DivergingBar`                                                                                                                                                  |
| Save indicator                         | the shell's top bar (4 states)                                                                                                                                                  |
| Dialog anatomy, danger dialogs         | `src/ui/Dialog.tsx` (`danger` adds the icon disc; `busy`; `children` for lists)                                                                                                 |
| Keyboard shortcuts                     | the shell's help dialog with `KeyHint`                                                                                                                                          |
| Global banners                         | the shell (`.global-notice`, `.global-error`)                                                                                                                                   |
| Offline and update prompt              | `src/ui/PwaPrompt.tsx`                                                                                                                                                          |
| Loading, error and not-found pages     | `App.tsx` fallback, `ErrorBoundary`, 404, all with `FootballIllustration` (`loading`, `error`, `lost`)                                                                          |
| Empty states                           | `EmptyState`                                                                                                                                                                    |
| Inline status lines                    | `StatusLine`                                                                                                                                                                    |
| Hub hero, overall hexagon, stat tiles  | `HeroPanel` + `Button variant="play" size="lg"`, `OverallBadge`, `StatTile`, `FormGuide onHero`                                                                                 |

## Shell behaviour screens can rely on

- **Desktop** (> 700px): sidebar (logo, tagline, nav with the career groups nested under
  Career, utilities, the save card with the career player's portrait, the shortcuts button);
  top bar with the breadcrumb ("Overview / Hub"), the simulation pill, the save indicator and
  the settings button.
- **Phones** (≤ 700px): a top app bar (logo, the group or page name in Bebas, the save dot,
  settings) and the bottom tab bar, which stays visible on every screen including matches.
  `--tabbar` holds the bar's height (0 on desktop): place fixed bottom UI at
  `bottom: calc(var(--tabbar) + 0.75rem)`, never at a hard-coded offset.
- **More sheet**: docked on top of the tab bar; the bar stays live above the backdrop and the
  page behind is `inert`. URL-driven (`?more=1`): Back, Escape and the backdrop close it.
- **Tutorial**: the target gets `data-tour-active` (ring + glow) and the page around it is
  dimmed by a non-blocking spotlight (`pointer-events: none`), so action steps stay usable.
  Mark targets with `data-tour="id"`; on phones, action steps render inside
  `data-tour-slot="id"` in the page flow (no dimming then).

## Pitfalls

- Utilities beat component classes (they are layered); unlayered page CSS beats both. When a
  screen's old stylesheet fights the kit, delete the old rule rather than adding `!important`.
- `ResultChip`, `OverallBadge` and the save dot are `role="img"` with a name: never put
  `aria-label` on a plain `span` (axe flags it).
- `CountBadge` renders `.nav-badge` (e2e and the shell's CSS position it by that class).
- Keep the first `<nav>` in the DOM the sidebar's: e2e uses `getByRole('navigation').first()`.
- The save indicator keeps its full text in the DOM on phones (visually hidden), so
  `.save-indicator` text assertions hold at every width.
- Real dates: `calendarDate(season, week, day)` (`src/engine/world/calendar.ts`) and
  `formatGameDate()` (`src/i18n/calendar.ts`) give "Sat 14 Nov". Week 1 day 1 is the first
  Saturday of August; day 1 Saturday, 2 Tuesday, 3–4 Wednesday, 5 Thursday, 6–7 Friday.
- Save cards: `summaryPortrait()` (`src/persistence/summary.ts`) returns the portrait inputs
  from a slot listing, or null for records written before the redesign.

## Added in phase 3b (Player screens)

- **`PositionPitch`** (`src/ui/kit/PositionPitch.tsx`, imported directly, not through the
  barrel): `positions` (`{ position, familiarity, primary? }[]`), `label`, `width` (92). A
  small vertical pitch with the player's positions, made for field-green heroes: the primary
  position is a gold disc, comfortable secondary positions mint discs, positions still being
  learned (`familiarityLevel` "learning") dashed rings. The drawing is one `role="img"`; pass a
  `label` that names every position in words, so nothing rests on colour.
- Fixed bottom bars on phones (the Profile points bar, the Training action bar) sit at
  `calc(var(--tabbar) + 0.75rem)`; a bar inside a page that animates in must be `sticky` or
  portalled to `body`, because the page transition's transform traps `position: fixed`.
