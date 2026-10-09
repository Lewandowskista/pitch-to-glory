# UI layout improvement plan — 9 October 2026

Status: proposed; no application changes made as part of the review. This plan addresses the findings in [UI layout review](UI-LAYOUT-REVIEW-2026-10-09.md). Work in reviewable phases, keeping the app runnable and summarizing after each. Preserve existing gameplay, save schemas, training-draft protection, routing, and the established visual identity.

## Phase 1 — Make shared layout rules reliable

Addresses findings 3, 12, and the shared portion of 15.

1. Audit the CSS cascade for shared buttons, text buttons, headings, and form controls. Correct the verified `.button` / `lg:hidden` conflict. Put relevant component declarations into an intentional layer or narrowly adjust their styling responsibilities so utilities can control layout.
2. Add semantic spacing and control-size roles to `src/styles/tokens.css`: candidate values are 4–8 px for labels/helpers, 12–16 px from content to an action group, 16–24 px between sections, and 16/20/24 px compact/mobile/desktop panel padding. These are starting design decisions, not blanket replacements.
3. Standardize action heights around 48 px while preserving at least 44 px interactive targets. Keep icon-label gaps around 6–8 px, separate action gaps around 8–12 px, and larger separation from adjacent prose. Include wrapped labels and focus outlines.
4. Introduce a compact functional-page heading treatment through `CareerPage`/`Page` and shell CSS. Reduce stacked top inset, tab gap, heading gap, and title size together. Keep tabs stable across routes and preserve the landing hero treatment.
5. Introduce shared panel-header/action-group/empty-state patterns where reuse is real. New/reworked UI uses Tailwind utilities consuming the same tokens as component CSS.

Files: `tokens.css`, `base.css`, `shell.css`, `responsive.css`, `Page.tsx`, career `shared.tsx`, `CareerInbox.tsx`.

Acceptance: desktop Inbox's phone-only Back control is hidden; it remains usable on phones. No regressions in button variants, text scaling, tab labels/badges, or focus visibility. Career content begins materially earlier than baseline y=306 at 1440 × 900; agree the exact target after comparing a representative heading with and without description. Capture Hub, Profile, Training, Inbox, Settings, and Match before/after.

## Phase 2 — Fix tablet Training and match composition

Addresses findings 1, 2, and match portions of 11.

1. Make Training's session columns respond to the actual card/container width. At 768 px retain readable selectors; introduce three columns only when each card can support the full controls. Align corresponding form fields when shown side by side.
2. Move coaching/report summaries beside the schedule when sufficient width exists, retaining a sensible single-column reading order. Preserve draft persistence and mobile focus/scroll behavior.
3. Define separate live-play and decision match compositions. Essential score, pitch context, choice names, chances, and outcome risk should form a compact comparison. Keep the full breakdown on demand and retain number-key choices.
4. Bound commentary and compact live stats so neither forces a long vacant area below the pitch. On phones choose one compact situation presentation during decisions, with access to the full pitch.
5. Remove stretched blank areas in briefing/report by grouping unequal content into stacks. Add an explicit helper-text gap beneath Kick off. Keep recording/continue feedback nearby.

Files: `CareerTraining.tsx`, `Match.tsx`, `DecisionPanel.tsx`, `Preview.tsx`, `Report.tsx`, `match.css`.

Acceptance: no intensity-label overlap at 768 × 1024 or 130% text; all sessions usable. At 1440 × 900 and 1366 × 768, a four-choice decision is comparable without scrolling through full factor text. Essential context stays visible. At 390 × 844, target all compact choices together; at 360 × 640 and enlarged text prioritize readable controls with predictable scrolling instead of imposing a fixed fit. Expanded details, keeper choices, halftime, tutorial, substitution prompts, and simulation-only mode remain usable. Preserve training guard and match behavior tests.

## Phase 3 — Rebuild the hub around useful content

Addresses findings 4–6 and hub empty states.

1. Replace cross-page row coupling with explicit main/supporting column stacks for unequal content. Keep coherent DOM and keyboard order; avoid CSS dense packing that rearranges reading order.
2. Compact Last Result before the debut and quiet priorities. Keep urgent decisions prominent.
3. Move a compact player/condition summary near the phone match action.
4. Use a balanced quiet-summary grid (candidate: four desktop columns, two at intermediate widths, one on phones) with content-based heights. Standardize text-link action placement without unnecessary `mt-auto` gaps.

Files: `CareerHub.tsx`, `HubPriorities.tsx`, hub summary helpers.

Acceptance: the empty Last Result no longer becomes a 371 px card; Condition is not followed by a row-sized hole; eight quiet tiles do not produce a five-plus-three layout at baseline width. On 390 × 844, the primary action and concise player condition are available in the initial viewport. Verify new career, unread inbox, media question, injury, transfer offer, pending training, and season-complete states.

## Phase 4 — Improve development, catalogue, and calendar density

Addresses findings 7–9 and catalogue/long-list observations.

1. Replace Profile's uneven CSS columns with deliberate attribute-group layouts. Keep the point counter attached to the heading; disclose long cost explanations.
2. Add skill branch selection and nearby phone details. Use the existing URL-dialog infrastructure if choosing a sheet/dialog; preserve browser Back, focus return, roving keyboard navigation, prerequisites, and unlock confirmation.
3. Let Lifestyle purchases use full width below compact summaries, with category navigation. Keep locked prices/requirements readable.
4. Add Wardrobe category navigation and a compact phone preview; retain its sticky desktop preview.
5. Give Calendar a bounded upcoming default and access to whole-season browsing. Keep all fixtures/deadlines available and chronological. Apply similar disclosure to lengthy continental competition lists.

Files: `CareerProfile.tsx`, `CareerSkills.tsx`, `CareerLifestyle.tsx`, `CareerWardrobe.tsx`, `CareerCalendar.tsx`, relevant i18n strings.

Acceptance: no long unused Technical column; profile controls remain readable in the sidebar-constrained tablet workspace. Skill detail opens near the selection on phones and returns focus. Purchases do not remain confined to a seven-column strip beneath a short sponsor summary. Category switching preserves clear selection and keyboard behavior. Calendar still exposes the complete season without dropping events.

## Phase 5 — Complete the secondary screens and local formatting

Addresses findings 10, 13–16 and remaining screen-specific observations.

1. Give National team consistent column boundaries and independent stacks. Use compact empty squad/history states.
2. Place Media coverage alongside useful feed/questions content without leaving an entire column empty. Compact Rival's identity block and combine related meeting/history summaries.
3. Group desktop Settings into two comfortable columns by topic. Keep mobile single-column labels and switches aligned.
4. Compact empty save slots on phones; remove empty notice spacing without losing live-region announcements. Normalize backup/import/delete tool spacing.
5. Normalize Agent recommendation headers, contract note placement, point counters, comparable numeric alignment, and locked wardrobe contrast.
6. Compact secondary state-free panels in Transfers, Trophies, Inbox, and Club life. Keep factual explanatory copy and useful actions available.
7. Review creation steps, returning-player landing, Gallery toolbar, World table/inspector transitions, Edit mode, Chronicle, Moments replay, Legacy, and all overlays with the new shared rules.

Acceptance: National columns line up across sections; empty states use the same visual family and expand correctly when populated. Related controls have consistent gaps. Settings uses desktop width without unreadably wide prose. No destructive action becomes visually merged with adjacent actions. Compact layouts preserve all existing data/actions and Back behavior.

## Phase 6 — Verify the finished layout across states and browsers

Run this acceptance work within each preceding phase; this phase closes the remaining gaps.

| Dimension              | Required coverage                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop                | 1440 × 900, 1366 × 768, and a wider 1920 px screen                                                                                                                                 |
| Tablet and breakpoints | 768 × 1024; just above/below sidebar and affected grid breakpoints                                                                                                                 |
| Phones                 | 390 × 844, 360 × 640, landscape, safe-area padding                                                                                                                                 |
| Themes/readability     | Light, dark, system; 100% and 130% text through actual Settings controls; browser zoom/reflow where appropriate                                                                    |
| Browsers               | Chromium, Firefox, WebKit; real Safari/mobile touch comfort remains a separate device check                                                                                        |
| Content states         | Empty, populated, long names/text, many badges/messages, injury, pending drafts, offers/counteroffers, keeper, four match choices, report/level-up, awards, retired career, replay |
| Overlays               | Shortcuts, More, tutorials, save/import/delete, negotiation, skill details, update/offline notices; Back/Escape/focus return                                                       |

Use screenshot comparisons for design judgment and focused Playwright geometry checks for real regressions: label overlap, clipped controls, horizontal overflow, focused controls obscured by fixed bars, correct responsive visibility, and related content/action placement. A long page alone is not a test failure, and document overflow alone is not proof that controls fit.

Capture viewport screenshots in addition to full-page screenshots when inspecting fixed/sticky content. Freeze seeded state and theme before capturing. Reuse the existing browser flows; avoid brittle tests for arbitrary pixel coordinates or CSS class strings. Engine tests need new cases only if simulation logic changes, which this plan does not require.

Run typecheck, lint, production build/bundle checks, and affected Playwright flows in all three engines. Review all route families after shared CSS changes. Add no new heavy UI dependency for this work.

## Completion criteria

- Each review finding is recorded as resolved, intentionally retained with rationale, or still pending with explicit scope.
- No control labels overlap at supported widths/text sizes; focused actions stay reachable above fixed UI.
- Unequal content does not create avoidable stretched panels or empty grid rows on the core screens.
- Card/header/action spacing follows named roles and remains consistent across CSS and utility-based screens.
- All content and actions remain available in compact modes, including keyboard and Back navigation.
- Before/after evidence and validation results accompany each completed phase.

Recommended starting batch: **Phase 1 followed immediately by tablet Training in Phase 2**. That establishes reliable styling and fixes the clearest readability defect before larger screen restructuring.
