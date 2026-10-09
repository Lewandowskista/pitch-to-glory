# UI layout progress — 9 October 2026

Tracks the [implementation plan](UI-LAYOUT-PLAN-2026-10-09.md) against the findings in the
[UI layout review](UI-LAYOUT-REVIEW-2026-10-09.md). Each finding is resolved, intentionally
retained with a reason, or pending with its remaining scope.

Before/after captures are produced by `artifacts/ui-layout/capture.ts` (git-ignored, like the
review's own screenshots) at 1440 × 900, 768 × 1024 and 390 × 844 from the review's seeded
careers. Geometry that a page-width check misses is covered by `e2e/layout.spec.ts`.

## Shared rules (Phase 1)

- **Cascade.** Shared controls (`.button`, `.text-button`, text inputs) live in Tailwind's
  `components` layer in `styles/base.css`. Utilities on the same element now win, so
  `lg:hidden`, `w-full` and margin utilities behave as written. Page stylesheets stay unlayered:
  an audit of every component class combined with utilities found only intentional overrides
  (the fixed phone training bar, match panels, dialog actions), so they were not moved.
- **Spacing roles** (`styles/tokens.css`, usable as utilities and as `var(--spacing-*)`):
  `helper` 6 px (heading/label to helper text), `action` 12 px (content to its actions, and
  between actions), `section` 20 px, `panel-compact` / `panel` / `panel-lg` 16 / 20 / 24 px
  card padding, `control` 48 px standard action height. Compact controls (tabs, table rows,
  inline text buttons) keep 44 px targets.
- **Career class roles** (`screens/career/shared.tsx`): `ui.panel` reads the panel tokens;
  `ui.panelCompact`, `ui.helper`, `ui.actions` and `ui.empty` name the supporting-card,
  helper-text, action-row and inline empty-state treatments used by later phases.
- **Buttons**: 48 px standard height (was 46), 8 px icon-to-label gap (was ~10).
- **Page header**: functional pages use a compact title (36–48 px, was up to 67 px), a 64 px
  top bar (56 px on phones), a 24 px top inset (16 px on phones) and tighter tab/title gaps.
  The landing hero keeps its expressive type. Career content now starts at y=228 at
  1440 × 900 (baseline 306), y=217 at 768 × 1024 (280) and y=193 at 390 × 844 (237).

## Training and match (Phase 2)

- **Training** is a CSS container (`@container`). Sessions are rows with focus and intensity
  side by side once a card has room (~512 px), and three columns only from ~1024 px of planner
  width, where a subgrid aligns focus, description and intensity across the cards. Coaching,
  season goal and report sit beside the schedule from ~1024 px of content width (1366 px
  laptops and up). The save bar's three actions wrap as one group.
- **Live match**: on wide screens both columns end together; commentary fills the side
  column's remaining height and scrolls inside it (keyboard-focusable).
- **Key moments**: the decision gets the side column to itself (340–400 px; 320 px at
  951–1150 px) and stays in view while the pitch scrolls; live statistics and a bounded
  commentary move under the pitch. The situation is a body-type sentence instead of a
  display-type title. Each choice is one row (number, name, chance) with its risks beneath
  and factors behind "Why this choice?". Three choices fit beside the pitch at 1366 × 768 and
  1440 × 900. On phones and tablets the decision, with its cropped situation, comes before
  the full pitch, so the first viewport shows the situation and every choice.
- **Briefing / report**: unequal panels no longer stretch to each other. The selection
  explanation shows its outcome, with the formation and each part of the chance behind a
  disclosure, so the approach column ends near the kick-off. The note under Kick off has an
  explicit gap.
- Not yet captured with a real state: a four-choice moment, keeper choices, halftime talk and
  substitution prompts. They use the same panels and the existing match journeys pass; they
  stay on the Phase 6 acceptance list.

## Hub (Phase 3)

- The first block is a 12-column grid with explicit stacks: main (match card, Advance
  digest, Condition; then season statistics and Last result) and side (Needs you, player,
  club). The side stack spans both main rows (`grid-rows-[auto_1fr]`), so a short season-
  complete card or an empty Last result never leaves a row-sized hole. DOM order is the
  phone reading order: the match, what needs you, you, your club, then the season.
- Last result before a debut, quiet priorities and Condition take their natural height.
- Season statistics read as one row of five on tablets and up.
- Phones: a compact level/condition strip sits in the match card just above Play. The
  Condition card is hidden on phones unless there is an injury or re-injury risk to explain,
  so no value is lost; tablets and up keep the full card beside or below the match.
- Quiet summary tiles fill whole rows: 4 columns for 4, 7 or 8 tiles, 3 for 5 or 6, 2 on
  tablets, 1 on phones.
- Heights: early desktop hub 2,158 → 1,876 px, phone 3,817 → 3,548 px, populated phone
  4,669 → 4,362 px. The populated desktop hub is about the same height (2,450 → 2,415 px)
  but without the stretched cards and holes.

## Development, catalogue and calendar (Phase 4)

- **Profile**: the attributes panel is a container. Below 38rem (tablets beside the sidebar,
  phones, 130% text) it is one readable list; from 38rem the three groups sit side by side
  (Technical, Physical, Mental), so there is no long empty column under Technical. The side
  column is a fixed 20–24rem. The points counter stays beside the heading; a one-line
  summary replaces the long cost paragraph, which moves behind "How points are priced".
- **Skills**: a branch filter (All or one branch, `branch` in the URL) narrows the tree. The
  odd last branch no longer spans the row. Below xl, choosing a skill opens its detail as a
  bottom sheet (`detail=1`, pushed after the selection is recorded), so Back, Escape, Close
  and the backdrop all close it and focus returns to the skill. Unlock confirmation still
  opens over it. The desktop sticky detail is unchanged.
- **Lifestyle**: fame, then a row of sponsorships and money (savings, upkeep, morale, owned
  items), then the catalogue across the full width in 2/4 columns with category filters
  (`shop` in the URL). Prices and lock reasons stay on each card. Desktop 2,480 → 2,078 px.
- **Wardrobe**: section filters (All, Challenges, Look, Kit, Celebrations; `show` in the URL)
  and a compact phone preview (figure beside the token count). The sticky desktop preview is
  kept. Locked tiles keep their names and prices at full contrast; only the artwork fades.
- **Calendar**: "From this week" shows the next 8 weeks with a button for the rest
  (`rest=1`); "Whole season" is unchanged. Wide screens flow the weeks in two balanced
  columns read top-down, so a busy week no longer stretches its neighbour. Desktop 2,998 →
  929 px, phone 6,493 → 1,600 px.
- Filter rows share `ui.filters` / `filterButton`: they wrap on wider screens and scroll
  sideways on phones instead of taking three rows.
- Continental competition lists move to Phase 5 with the Trophies empty states.

## Secondary screens (Phase 5)

- **Shared empty treatment**: `EmptySection` (in `screens/career/shared.tsx`) is a compact,
  dashed card with the section's heading and its reason. It keeps the region name, and the
  full section replaces it once there is content.
- **National team**: two stable column stacks (call-up and caps, then tournaments / squad,
  then recent internationals), so column edges line up and no short card leaves a hole.
  Empty squad, internationals and tournaments use the compact treatment.
- **Media**: questions and the feed share the wide column; coverage is a short summary
  beside them that stays in view. With no questions at all, they collapse to a compact note.
- **Rival**: the identity block is a compact strip (smaller portraits, the description and
  intensity meter beside them); meetings and the story so far stack beside the table.
- **Settings**: two topic columns from 1280 px (appearance, reading, motion, simulation,
  tutorial / sound), with restore defaults and its status below both; one column below.
- **Saved games**: on single-column widths, empty slots drop their artwork and become compact
  rows, occupied artwork shrinks, slot copy loses its fixed height, the silent status line
  takes no room, and Delete sits apart at the end of the tools row.
- **Agent**: "Recommended" sits on the card's top edge, so every portrait starts level.
- **Transfers**: loyalty and clean-sheet notes move under their grids; empty Offers and
  Career moves use the compact treatment.
- **Trophies**: empty Golden Ball, cabinet, season awards and records are compact notes.
  Each continental cup's groups and knockouts open on request; the player's own cup opens
  by default.
- **Club life**: three cliques share one row; each teammate's chemistry modifiers and the
  culture-fit breakdown open on request.
- **Legacy**: numbers and honours no longer stretch to each other.
- **Landing**: a returning player's phone slogan is smaller, so the career summary is in
  the first view.
- **Shared**: comparable meter values use tabular numerals.

## Findings

| #   | Finding                                   | Status                                                                                                                                                                              |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Training cards too narrow on tablets      | **Resolved** — layout follows the planner's container width; selectors readable at 768 px and 130% text (e2e)                                                                       |
| 2   | Match decisions, long sidebar             | **Resolved** — decision has the side column; stats/commentary move under the pitch; phones show the decision before the pitch                                                       |
| 3   | Component CSS defeats utilities           | **Resolved** — controls layered; desktop Inbox hides Back, phones keep it (e2e)                                                                                                     |
| 4   | Hub rows stretch cards                    | **Resolved** — explicit main/side column stacks; the side stack spans both main rows, so no card stretches or leaves a hole                                                         |
| 5   | Hub summary tiles, 5 + 3 rows             | **Resolved** — quiet tiles use 4 columns for 4, 7 or 8 tiles and 3 for 5 or 6                                                                                                       |
| 6   | Phone hub condition far from action       | **Resolved** — phones show level, fitness, fatigue, form and morale in the match card above its action (e2e)                                                                        |
| 7   | Lifestyle unused column                   | **Resolved** — compact sponsor/money row, then a full-width catalogue with category filters                                                                                         |
| 8   | Profile attribute columns uneven          | **Resolved** — one list in narrow panels, three group columns from 38rem; cost rules disclosed (e2e)                                                                                |
| 9   | Skills tall tree, short detail            | **Resolved** — branch filter; below xl the detail opens as a URL sheet with Back, Escape and focus return (e2e)                                                                     |
| 10  | National team column proportions          | **Resolved** — two stable stacks (call-up, tournaments / squad, internationals); compact empty squad and history (e2e)                                                              |
| 11  | Briefing, report, Legacy equal heights    | **Resolved** — briefing and report (Phase 2); Legacy numbers and honours no longer stretch                                                                                          |
| 12  | Page chrome too tall                      | **Resolved** — compact functional header; content 78 px earlier on desktop, 44 px on phones                                                                                         |
| 13  | Empty content gets full panels            | **Resolved** — shared `EmptySection` used by Inbox, Transfers, Media, Trophies and National; Inbox drops its empty reader (e2e)                                                     |
| 14  | Settings underuses desktop width          | **Resolved** — two topic columns from 1280 px, one below; 2,222 → 1,426 px (e2e)                                                                                                    |
| 15  | Button/helper/badge formatting varies     | **Resolved** — roles and 48 px actions (Phase 1); Agent badge on the card edge, contract notes under their grids, counters by headings, tabular meter values, readable locked items |
| 16  | Saved games reserves room for empty slots | **Resolved** — phones: empty slots become compact rows, smaller artwork, silent notice takes no room, Delete set apart; phone 2,420 → ~1,900 px                                     |

## Screen-specific observations still open

These were noted in the review's coverage table and are not covered by the changes above.
They stay pending with this scope:

- **World** (phone 6,085 px): compact the overview and give direct access to club detail.
- **Edit mode** (phone): summary and filters fill the first view before the editor.
- **New career**: Continue below the first viewport on the identity step; long phone
  nationality list.
- **Gallery**: seed/helper/tab stack and the odd last kit card.

Phase 6 re-captures these screens after the shared changes to confirm nothing regressed.

## Validation log

- **Phase 1**: typecheck, lint, production build and bundle budget pass. Full Chromium e2e
  suite passes (75 passed, 1 skipped); the new layout spec passes in Chromium, Firefox and
  WebKit. No horizontal overflow and no page errors in any capture.
- **Phase 2**: typecheck, lint, format, build pass. Full Chromium e2e suite passes (76 passed,
  1 skipped); layout and decision-layout specs pass in Chromium, Firefox and WebKit. The new
  bounded commentary list was flagged by axe (`scrollable-region-focusable`) and made
  focusable. Desktop decision page 2,243 → 1,637 px; briefing 2,030 → ~1,830 px.
- **Phase 3**: typecheck, lint, format, build pass. Full Chromium e2e suite passes (77 passed,
  1 skipped); layout, agenda, stories, onboarding, career, update and accessibility specs
  pass in Chromium, Firefox and WebKit. States checked: new career, populated season with
  unread inbox and a press question, season complete with unspent points and retirement.
- **Phase 4**: typecheck, lint, format, build pass. Full Chromium e2e suite passes (79 passed,
  1 skipped); layout, agenda, lifestyle, career, navigation and accessibility specs pass in
  Chromium, Firefox and WebKit, including the new Skills sheet (Back, Escape, focus return,
  branch filter) and tablet Profile readability checks.
- **Phase 5**: typecheck, lint, format, build pass. Full Chromium e2e suite passes (81 passed,
  1 skipped); layout, market, social, honours, save-actions, foundation, accessibility,
  lifestyle and navigation specs pass in Chromium, Firefox and WebKit, including new checks
  for compact empty history, aligned National columns and two-column Settings.
