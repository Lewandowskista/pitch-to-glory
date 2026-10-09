# End-user UX Improvements Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Check off completed work and stop to summarize after each phase.

**Goal:** Make Pitch to Glory easier to play, browse and care about by resolving all nine findings in the [9 October UX review](../../UX-REVIEW-2026-10-09.md).

**Architecture:** Retain the existing routes, deterministic engine, worker simulation, save compatibility and green/cream/gold visual identity. Improve information hierarchy and interaction within the current screen structure; keep temporary training edits separate from committed career data. Derive club guidance and story summaries from actual world and career data rather than adding a second simulation or invented events.

**Tech stack:** Existing TypeScript, React, Zustand, React Router, Tailwind/shared CSS tokens, Framer Motion, Vitest and Playwright. SVG artwork and procedural audio remain the asset approach.

**Status:** Phase 1 implemented and verified on 9 October 2026; see the [completion report](../../UX-PHASE-1-2026-10-09.md). Phases 2–6 remain. The separate menu/hub audio change is already implemented and has passed 21 focused audio tests, typecheck, lint and a browser playback check. Its subjective listening check remains open.

## Delivery approach

- Ship six sequential phases. Each ends with a runnable game, focused verification, comparison screenshots and a short completion report.
- Prioritize actual loss of work and usability defects, then reduce friction, then improve storytelling and presentation.
- Keep existing transparency and accessibility features while reducing what is expanded by default.
- Recheck affected code before implementation: this workspace already contains unrelated gameplay and balance changes. Preserve them and stage only the phase's changes if making commits.
- Add regression tests for lost drafts, navigation, decisions, world creation and data-backed summaries. Use visual inspection for reversible spacing and copy changes rather than tests that duplicate CSS values.
- During implementation, use the project's Context7 workflow when current library-specific documentation is needed.

## Coverage and sequence

| Phase | Outcome                                                             | Review findings                                                       |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1     | Trustworthy edits, clean navigation and understandable save actions | 1: lost training edits; 4: tablet overflow; 9: terminology            |
| 2     | Compact, comparable match decisions                                 | 2: key-moment scrolling                                               |
| 3     | Useful mobile hub and local skill details                           | 3: distant skill details; 5: buried player status                     |
| 4     | Shorter onboarding and informed starting-club decisions             | 6: introductory friction; 8: weak trial guidance                      |
| 5     | More specific storytelling and distinct screen compositions         | 7: numerical, impersonal story screens                                |
| 6     | Verified consistency, accessibility, performance and audio comfort  | Cross-cutting validation of all nine findings and the audio follow-up |

Phases 2 and 3 follow the navigation corrections in Phase 1. Phase 4 uses the revised hub and decision layouts. Phase 5 uses the hierarchy established in those screens. Phase 6 repeats the complete player journey against the finished result.

## Phase 1 — Protect player intent and clean up navigation

**Outcome:** Editing a training plan is dependable, tablet navigation fits, and save actions say what they actually do.

### Work

- [x] Reproduce the training bug with a browser regression: change Session 1 from Normal to High, open Profile, return to Training, and verify that High survives as an unsaved draft.
- [x] Add a dedicated temporary training-draft slice to the existing store. Scope a draft to the active save, world seed, career player, in-game week and original saved plan. Keep the committed training plan unchanged until the player applies the draft.
- [x] Preserve the draft during internal navigation. Expose explicit **Save training** and **Discard changes** actions and distinguish **Training changes pending** from the career's autosave status.
- [x] Before advancing time with a pending draft, offer **Save and continue**, **Continue with saved training**, and **Keep editing**. Revalidate against the current world and edit lock before applying. If saving fails, retain the draft and show the existing error feedback; do not advance time.
- [x] Clear drafts after successful application or explicit discard. Loading/replacing a save or switching careers must never apply a previous career's draft. Warn about pending work before abandoning the active session or reloading the page; do not silently describe temporary edits as saved.
- [x] Keep the training action row near the controls and sticky on narrow screens, above the bottom navigation and safe-area inset. It must not cover the focused field or feedback.
- [x] Fix sidebar label and badge sizing at the tablet breakpoint. Preserve a usable vertical scroll area, while eliminating horizontal overflow rather than hiding clipped content.
- [x] Rename navigation to **Gallery** and **Saved games**. Use **Continue career** for career slots, **Load world** for world-only slots, and **Load gallery** for gallery-only slots. Use **Delete save** and content-appropriate replacement labels; preserve confirmation and Back behavior.
- [x] Update existing browser selectors affected by the wording changes.

### Files

- Create: `src/store/trainingDraftSlice.ts`; `tests/training-draft.test.ts`; `e2e/ux-improvements.spec.ts`.
- Modify: `src/store/index.ts`, `src/screens/career/CareerTraining.tsx`, `src/screens/career/CareerHub.tsx`, `src/screens/career/actions.ts`, `src/screens/career/shared.tsx`.
- Modify: `src/styles/shell.css`, `src/styles/responsive.css`, `src/ui/Shell.tsx`, `src/screens/SavesContent.tsx`, `src/i18n/en.ts`, `src/i18n/career.ts`.
- Extend: `e2e/coaching.spec.ts`, `e2e/navigation.spec.ts`, `e2e/foundation.spec.ts`, and other existing tests that locate renamed controls.

### Exit criteria

- A draft survives tab changes; saving applies it once; discarding restores the saved plan.
- Advancing a week with pending edits requires an explicit choice. Locked saves cannot be modified through this path.
- Drafts from another save, player or week cannot be silently applied.
- At 768 × 1024, with ordinary and 130% text and unread badges, sidebar `scrollWidth` does not exceed `clientWidth` by more than one rounding pixel. Labels and badges remain readable.
- A career slot has career-specific actions; world and gallery slots retain working load/export/import behavior.

## Phase 2 — Make key moments feel like football decisions

**Outcome:** The player can compare all available actions without reading four expanded reports.

### Work

- [ ] Add a four-choice layout regression. Extend the existing decision tests beyond visibility of the first action to visibility and accessibility of every collapsed action.
- [ ] Give each action a compact summary: number shortcut, action name, success chance and one short consequence. Move attribute lists, trait detail and the full calculation behind a disclosure per action.
- [ ] Keep full factor explanations available before selection and preserve the resolved outcome explanation afterward. Show probabilities directly from the engine.
- [ ] On desktop, use the width for pitch, decision comparison and compact live information together. Keep score, clock and rating in view; bound the commentary feed separately instead of letting it push choices downward.
- [ ] On phones, retain the small situation preview and place compact action rows immediately beneath it. Remove repeated headings and explanatory blocks from the comparison area.
- [ ] Maintain number-key selection, arrow-key focus, Escape disclosure behavior and focus on the first available choice. Disclosure interaction must never choose an action accidentally.
- [ ] Reposition first-match guidance so it does not cover choices, pitch context or the focused control.

### Files

- Modify: `src/screens/match/DecisionPanel.tsx`, `src/screens/Match.tsx`, `src/styles/match.css`, `src/styles/responsive.css`, `src/i18n/match.ts`, `src/ui/Tutorial.tsx`.
- Extend: `e2e/decision-layout.spec.ts`, `e2e/match.spec.ts`, `e2e/onboarding.spec.ts`.

### Exit criteria

- At 1440 × 900 and 390 × 844 with default text, all four collapsed actions show their name and chance together with score and situation context, without scrolling to compare them.
- At 1366 × 768, 360 × 640 and 130% text, use ordinary vertical scrolling when necessary; do not shrink text or tap targets to force a fit. All actions remain discoverable and focused controls remain uncovered.
- Controls retain at least 44 CSS-pixel touch targets. Full factors remain accessible by keyboard and touch.
- A complete match still supports kickoff, pause, skip, decisions, half-time, full-time and report recording, with unchanged deterministic outcomes for identical choices and seeds.

## Phase 3 — Improve mobile hierarchy and skill exploration

**Outcome:** The hub answers both “What should I do next?” and “How is my player doing?”; skill details stay close to the player's browsing context.

### Work

- [ ] Place a compact player strip near the next action: portrait/name, level/XP, fitness/fatigue and current form. Keep it scannable rather than adding another large panel.
- [ ] Shorten the mobile fixture card. Keep opponent, date, selection status and primary action prominent; show a short advance-time consequence with fuller explanation on request.
- [ ] Reuse `HubPriorities` to put urgent, actionable items ahead of empty or secondary summaries. Keep complete calendar, inbox and progression information available lower down or through labelled links.
- [ ] Retain the wide multi-column hub, adjusting hierarchy rather than stretching the mobile layout across desktop.
- [ ] Add a labelled skill-branch selector on narrow screens and show the selected branch. Keep desktop's broader tree view.
- [ ] On narrow screens, open skill details in a URL-controlled dialog/sheet using the existing dialog patterns. Preserve the selected branch and tree scroll position when closing; browser Back and Escape restore focus to the originating skill.
- [ ] Preserve direct `?skill=` links. Detail viewing and unlock confirmation must be distinct: Back from confirmation returns to the detail before returning to the tree.
- [ ] Show prerequisites and locked/available/unlocked states using text and simple SVG connections or markers, without relying on color alone.

### Files

- Modify: `src/screens/career/CareerHub.tsx`, `src/screens/career/HubPriorities.tsx`, `src/screens/career/CareerSkills.tsx`, `src/screens/career/useUrlDialog.ts`, `src/i18n/career.ts`.
- Reuse: `src/ui/Dialog.tsx`, `src/styles/tokens.css`.
- Extend: `e2e/career.spec.ts`, `e2e/navigation.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/ux-improvements.spec.ts`.

### Exit criteria

- At 390 × 844 with default text, the first hub viewport includes a recognisable player summary and primary next action.
- Selecting the first skill no longer jumps thousands of pixels beneath the tree. Closing its detail returns to the same skill and browsing position.
- Branch browsing and skill unlocking work for outfield players and goalkeepers with mouse, keyboard and touch.
- Large text, reduced motion and simulation-only preferences retain usable layouts.

## Phase 4 — Shorten onboarding and improve the first career decision

**Outcome:** A new player reaches meaningful play sooner and understands why they might choose each starting club.

### Work

- [ ] Reduce the normal creation flow to four stages: **Your player** (identity and appearance), **Playing style** (position, foot and archetype), **Choose a club**, **Review and sign**. Retain all existing customization, Back navigation and draft restoration.
- [ ] Generate the default world through the existing worker when player/style choices are confirmed. Remove the ordinary player's separate **Build world** step; keep seed and generation options in a clearly labelled advanced disclosure.
- [ ] Preserve visible generation progress, cancellation and retry. Returning to an earlier stage must not launch duplicate generation jobs or discard a valid generated world unnecessarily.
- [ ] Replace the seven-step hub tour with at most three essentials: player status, urgent tasks and Continue. Present secondary guidance when Training, Skills and other relevant screens are first used.
- [ ] Keep first-match guidance contextual: explain situation, action comparison, choices and outcome when each is relevant. Existing skip/reset controls and completed-tutorial preferences must continue working.
- [ ] Route the hub's next-match action directly to the relevant career briefing when the fixture is already known; retain manual fixture selection for other match modes.
- [ ] Add concise, factual trial comparisons: youth development environment, tactical/style fit and squad competition for the selected position. Explain the reputation scale and show evidence for each label.
- [ ] Preview the actual wage, contract duration, promised role and relevant bonuses before signing. Share the calculation with career creation so the preview cannot disagree with the committed contract.
- [ ] Treat squad competition as guidance, not guaranteed selection. Account for goalkeepers and secondary positions; explain that form, fitness and manager decisions still affect playing time.

### Files

- Modify: `src/screens/career/CareerNew.tsx`, `src/screens/career/CareerHub.tsx`, `src/screens/match/CareerMatchday.tsx`, `src/screens/match/SelectionBriefing.tsx`, `src/ui/Tutorial.tsx`.
- Modify: `src/i18n/career.ts`, `src/i18n/tutorial.ts`, `src/persistence/settings.ts` only if contextual tutorial preferences need additional fields and backward-compatible defaults.
- Modify: `src/engine/career/create.ts`; create `src/engine/career/startPreview.ts` and `tests/start-preview.test.ts` for shared, deterministic guidance and contract terms.
- Extend: `e2e/onboarding.spec.ts`, `e2e/coaching.spec.ts`, `e2e/career.spec.ts`, `tests/career.test.ts`.

### Exit criteria

- The normal flow has four creation stages, no required seed editing and no separate generation action.
- A fresh player reaches a first key moment without duplicated fixture selection or overlapping tutorials. Record stage/action counts against the original walkthrough; do not claim a fixed time saving without measuring it.
- Previewed contract terms match the signed contract for identical inputs and seed, including keeper and outfield cases.
- Repeated Back/forward, cancellation, refresh and worker failure preserve a recoverable creation flow.
- Existing saves and tutorial completion preferences remain readable; no simulation balance changes are introduced merely to make the guidance sound attractive.

## Phase 5 — Make the career feel personal

**Outcome:** Story screens lead with meaningful events and relationships, supported by numbers rather than dominated by them.

### Work

- [ ] Add read-only story summary selectors and localized templates based on actual career events, match records and relationship state. Prioritize debut, first contribution, selection changes, injuries and transfers where those facts exist.
- [ ] Lead Club life with a named manager/teammate relationship, its current meaning and one valid next action. Move exact chemistry, clique and culture modifiers into expandable sections while keeping them available.
- [ ] Give early Media a factual welcome/signing story when the career record supports it. When there are no press questions or posts, use a short purposeful empty state explaining what generates coverage; do not fabricate quotes, interviews or popularity.
- [ ] Make report headlines and reactions reference the actual contribution: assist, goal, clean sheet, saves, rating or objective result. Apply defined precedence so a poor result or brief substitute appearance does not receive unsupported praise.
- [ ] Give the screens distinct compositions inside the existing design system: Club life as relationships and conversation; Media as an editorial lead and feed; Chronicle as an illustrated timeline; the match report as a performance summary and reward sequence.
- [ ] Use existing procedural portraits, crests, kits and original SVG accents to strengthen identity. Reserve meters for information the player needs to compare or act on.
- [ ] Keep numeric breakdowns accessible and all new language in i18n files. Respect reduced motion when celebrating rewards and milestones.

### Files

- Create: `src/screens/career/storySummary.ts`, `tests/story-summary.test.ts`.
- Modify: `src/screens/career/CareerClub.tsx`, `src/screens/career/CareerMedia.tsx`, `src/screens/career/socialUi.tsx`, `src/screens/career/ChronicleView.tsx`, `src/screens/match/Report.tsx`.
- Modify: `src/i18n/social.ts`, `src/i18n/match.ts`, `src/i18n/honours.ts`, `src/styles/match.css` where existing report classes need adjustment.
- Extend: `e2e/social.spec.ts`, `e2e/honours.spec.ts`, `e2e/match.spec.ts`.

### Exit criteria

- Every story assertion can be traced to source data. Test scoreless appearances, assists without goals, keeper performances, defeats, injuries and genuinely empty media states.
- Opening Club life or Media gives a human interpretation and useful context before a wall of modifiers.
- Chronicle, Media, Club life and Report remain visually related but visibly distinct.
- This presentation pass does not change career rewards, probabilities, relationships or stored event history.

## Phase 6 — Verify the finished experience and comfort

**Outcome:** The improvements work together across supported browsers and common screen sizes, with remaining limits recorded honestly.

### Work

- [ ] Repeat the complete fresh-career journey: creation, trial comparison, signing, hub, pending training, first match, report, skills, media, saves and reload.
- [ ] Repeat with representative existing careers, including keeper, injury, pending transfer and late-career states. These are additional checks: the original review only covered an early career.
- [ ] Capture comparable screenshots at 1440 × 900, 1366 × 768, 768 × 1024, 390 × 844 and 360 × 640. Check light/dark themes, ordinary/130% text, reduced motion and simulation-only mode on affected screens.
- [ ] Verify keyboard navigation, focus restoration, screen-reader labels, touch targets, contrast, bottom-bar clearance and browser Back for every new disclosure/dialog flow.
- [ ] Run relevant Playwright journeys in Chromium, Firefox and WebKit. Document unavailable real-device checks separately; automated Windows WebKit audio support does not establish Safari/macOS/iOS playback quality.
- [ ] Check the revised music on headphones and speakers at default volume, including menu, hub, transitions, mute and hidden-tab behavior. The noisy brushes/hats have already been removed; obtain listening feedback before marking the perceived wind issue resolved.
- [ ] Inspect production route bundles and Lighthouse against the existing project targets: initial JS under 300 KB gzip; performance above 90 desktop/85 mobile; accessibility above 95. Confirm no main-thread world generation was introduced by the faster onboarding.
- [ ] Update the review with resolved findings, screenshot evidence and any remaining constraints. Update device acceptance notes with what was actually tested.

### Files and artifacts

- Update: `docs/UX-REVIEW-2026-10-09.md`, `docs/AUDIO-REVIEW.md`, `docs/DEVICE-ACCEPTANCE.md`.
- Evidence: `artifacts/ux-improvements/phase-1/` through `phase-6/`.
- Existing audio work: `src/audio/music.ts`, `tests/music.test.ts`, `tests/audio-player.test.ts`, `tests/audio.test.ts`, `artifacts/audio/after-the-floodlights.wav`.
- Existing journeys: `e2e/decision-layout.spec.ts`, `e2e/navigation.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/accessibility.spec.ts`, plus each phase's targeted tests.

### Verification commands

Run the targeted files after each phase; use the wider suite at the final gate or when a shared behavior changes. Commands below are PowerShell-compatible and use the existing project scripts.

```powershell
# Phase 1: drafts, navigation, save actions
npm.cmd test -- tests/training-draft.test.ts --configLoader runner
npm.cmd run test:e2e -- e2e/ux-improvements.spec.ts e2e/navigation.spec.ts e2e/coaching.spec.ts e2e/foundation.spec.ts

# Phase 2: decision comparison and match progression
npm.cmd run test:e2e -- e2e/decision-layout.spec.ts e2e/match.spec.ts e2e/onboarding.spec.ts

# Phase 3: mobile browsing and focus
npm.cmd run test:e2e -- e2e/ux-improvements.spec.ts e2e/career.spec.ts e2e/navigation.spec.ts e2e/accessibility.spec.ts

# Phase 4: starting-club guidance and first play
npm.cmd test -- tests/start-preview.test.ts tests/career.test.ts --configLoader runner
npm.cmd run test:e2e -- e2e/onboarding.spec.ts e2e/coaching.spec.ts e2e/career.spec.ts

# Phase 5: factual storytelling
npm.cmd test -- tests/story-summary.test.ts --configLoader runner
npm.cmd run test:e2e -- e2e/social.spec.ts e2e/honours.spec.ts e2e/match.spec.ts

# Final gate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --configLoader runner
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:performance
```

The browser suite uses the preview build, so rebuild after UI changes before invoking it. The default Playwright configuration includes Chromium, Firefox and WebKit. Test commands should exit successfully; skipped checks and environment limitations must be reported separately. The production build must pass the existing bundle checks. Use the existing performance harness for Lighthouse evidence rather than inferring performance from screenshots.

## Completion definition

All nine review findings have implementation evidence and passing behavioral or visual acceptance checks. The game retains its identity and depth while preventing lost edits, making match choices easier to compare, reducing mobile travel, shortening first play and grounding its stories in the player's actual career. Audio implementation is complete only as a technical change until listening feedback confirms the annoyance has gone.
