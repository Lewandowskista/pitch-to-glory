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

## Findings

| #   | Finding                                   | Status                                                                                      |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Training cards too narrow on tablets      | Pending — Phase 2                                                                           |
| 2   | Match decisions, long sidebar             | Pending — Phase 2                                                                           |
| 3   | Component CSS defeats utilities           | **Resolved** — controls layered; desktop Inbox hides Back, phones keep it (e2e)             |
| 4   | Hub rows stretch cards                    | Pending — Phase 3                                                                           |
| 5   | Hub summary tiles, 5 + 3 rows             | Pending — Phase 3                                                                           |
| 6   | Phone hub condition far from action       | Pending — Phase 3                                                                           |
| 7   | Lifestyle unused column                   | Pending — Phase 4                                                                           |
| 8   | Profile attribute columns uneven          | Pending — Phase 4                                                                           |
| 9   | Skills tall tree, short detail            | Pending — Phase 4                                                                           |
| 10  | National team column proportions          | Pending — Phase 5                                                                           |
| 11  | Briefing, report, Legacy equal heights    | Pending — match views in Phase 2, Legacy in Phase 5                                         |
| 12  | Page chrome too tall                      | **Resolved** — compact functional header; content 78 px earlier on desktop, 44 px on phones |
| 13  | Empty content gets full panels            | Pending — `ui.empty` role defined; screens in Phase 5                                       |
| 14  | Settings underuses desktop width          | Pending — Phase 5                                                                           |
| 15  | Button/helper/badge formatting varies     | Partly resolved — roles and 48 px actions defined; screen-level normalisation in Phase 5    |
| 16  | Saved games reserves room for empty slots | Pending — Phase 5                                                                           |

## Validation log

- **Phase 1**: typecheck, lint, production build and bundle budget pass. Full Chromium e2e
  suite passes (75 passed, 1 skipped); the new layout spec passes in Chromium, Firefox and
  WebKit. No horizontal overflow and no page errors in any capture.
