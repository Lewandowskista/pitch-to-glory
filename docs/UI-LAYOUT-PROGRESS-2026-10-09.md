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

## Findings

| #   | Finding                                   | Status                                                                                                                        |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Training cards too narrow on tablets      | **Resolved** — layout follows the planner's container width; selectors readable at 768 px and 130% text (e2e)                 |
| 2   | Match decisions, long sidebar             | **Resolved** — decision has the side column; stats/commentary move under the pitch; phones show the decision before the pitch |
| 3   | Component CSS defeats utilities           | **Resolved** — controls layered; desktop Inbox hides Back, phones keep it (e2e)                                               |
| 4   | Hub rows stretch cards                    | Pending — Phase 3                                                                                                             |
| 5   | Hub summary tiles, 5 + 3 rows             | Pending — Phase 3                                                                                                             |
| 6   | Phone hub condition far from action       | Pending — Phase 3                                                                                                             |
| 7   | Lifestyle unused column                   | Pending — Phase 4                                                                                                             |
| 8   | Profile attribute columns uneven          | Pending — Phase 4                                                                                                             |
| 9   | Skills tall tree, short detail            | Pending — Phase 4                                                                                                             |
| 10  | National team column proportions          | Pending — Phase 5                                                                                                             |
| 11  | Briefing, report, Legacy equal heights    | Partly resolved — briefing and report no longer stretch; Legacy in Phase 5                                                    |
| 12  | Page chrome too tall                      | **Resolved** — compact functional header; content 78 px earlier on desktop, 44 px on phones                                   |
| 13  | Empty content gets full panels            | Pending — `ui.empty` role defined; screens in Phase 5                                                                         |
| 14  | Settings underuses desktop width          | Pending — Phase 5                                                                                                             |
| 15  | Button/helper/badge formatting varies     | Partly resolved — roles and 48 px actions defined; screen-level normalisation in Phase 5                                      |
| 16  | Saved games reserves room for empty slots | Pending — Phase 5                                                                                                             |

## Validation log

- **Phase 1**: typecheck, lint, production build and bundle budget pass. Full Chromium e2e
  suite passes (75 passed, 1 skipped); the new layout spec passes in Chromium, Firefox and
  WebKit. No horizontal overflow and no page errors in any capture.
- **Phase 2**: typecheck, lint, format, build pass. Full Chromium e2e suite passes (76 passed,
  1 skipped); layout and decision-layout specs pass in Chromium, Firefox and WebKit. The new
  bounded commentary list was flagged by axe (`scrollable-region-focusable`) and made
  focusable. Desktop decision page 2,243 → 1,637 px; briefing 2,030 → ~1,830 px.
