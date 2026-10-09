# UI layout review — 9 October 2026

This review focuses on empty space, formatting, consistency, alignment, and the placement of controls relative to their content. The green/cream/gold identity and vector artwork should stay. The largest improvements come from restructuring layouts and defining consistent spacing roles.

## Scope and evidence

Reviewed the current application in Chromium using Playwright, plus the route components and shared CSS. Captured the landing page, all three gallery views, saved games, settings, world creation, career creation, all 18 career destinations, world browser, editor, and matchday. Desktop captures use 1440 × 900; phone captures use 390 × 844. Hub, profile, training, and wardrobe also have 768 × 1024 tablet captures.

A seeded current-format career provides the early-career baseline. A separately simulated legacy-format season provides populated Inbox, Media, Trophy cabinet, Chronicle, and retirement screens. This latter fixture tests populated layouts; it does not establish current-format continental or international layout coverage. Also played a competitive match and captured briefing, live play, a three-choice decision, and the report.

Screenshots and measured bounds are in [artifacts/ui-review-2026-10-09](../artifacts/ui-review-2026-10-09/). The baseline [metrics.json](../artifacts/ui-review-2026-10-09/metrics.json) records page heights and section bounds; all 60 baseline captures had zero document horizontal overflow. The successful extended walkthrough recorded no JavaScript page errors. These observations do not replace cross-browser or accessibility testing.

Limitations: not every wizard step, negotiation dialog, tooltip, award ceremony, replay state, or international tournament state was visually exercised. Those components received source inspection where relevant and need targeted acceptance captures during implementation. Enlarged-text/dark filenames from the extended capture script are **not reliable evidence**: direct changes to root styles were overwritten by app settings. Use the actual Settings controls for that acceptance pass. Full-page screenshots can place fixed navigation at the capture's scroll position; judge overlap against viewport captures and bounds, not that artifact alone.

The previous [UX review](UX-REVIEW-2026-10-09.md) and [Phase 1](UX-PHASE-1-2026-10-09.md) were consulted. Preserved training drafts, revised saved-game terminology, and the earlier sidebar-overflow fix are not being proposed again.

## Findings

Priority definitions: **P1** affects control readability or the core playing layout; **P2** materially wastes space or weakens hierarchy; **P3** is local visual polish. Measurements below describe this fixture, not fixed requirements for every game state.

### 1. P1 — Training cards become too narrow on tablets

At 768 px the 190 px sidebar remains visible, but `md:grid-cols-3` makes the sessions three columns inside the remaining workspace. Card padding leaves approximately 116 px for three intensity options. “Low”, “Normal”, and “High” run together, and the attribute descriptions become tall, uneven blocks. There is no document overflow, so a page-width check misses the problem.

Use the training container's available width to choose the session layout. Keep one column until three cards can each fit their descriptions and a readable intensity selector. Align equivalent fields across comparable session cards at wider sizes. Bring coach advice alongside the schedule at a suitable container width; the current secondary column starts only at `2xl`, leaving advice as a very wide section below the controls at 1440 px.

Locations: `CareerTraining.tsx` (outer layout, session grid, intensity selectors), `shared.tsx` (`ui.panel`), shell/sidebar widths.

Evidence: [tablet training](../artifacts/ui-review-2026-10-09/training-tablet.png), [desktop training](../artifacts/ui-review-2026-10-09/training-desktop.png).

### 2. P1 — Match decisions create a long sidebar and unused space below the pitch

The desktop live layout reserves 340 px for the right column. A decision, live statistics, and commentary stack there. Even the observed three-choice moment extends well below the pitch; four-choice moments need an additional acceptance case. The left column ends after the pitch and playback controls while the right continues. The explanatory situation heading is also a long all-caps block in that narrow column.

Give decisions their own layout state: pitch/situation beside a compact choice comparison, with essential rating/score information nearby and commentary in a bounded region. Keep the existing probability and risk information, but place detailed attributes/factors behind disclosure. At phone width, the full pitch and cropped situation both precede the choices in document order. Review which context is needed during a decision and avoid making the player traverse both.

Locations: `Match.tsx`, `match/DecisionPanel.tsx`, `.match-live-layout`, `.match-live-aside`, `.match-choice`, `.match-situation` in `match.css`.

Evidence: [desktop decision](../artifacts/ui-review-2026-10-09/decision-desktop.png), [phone decision](../artifacts/ui-review-2026-10-09/decision-phone.png).

### 3. P1 — Component CSS defeats responsive utility classes

The populated desktop Inbox shows “Back to the inbox” even though that button has `lg:hidden`. The unlayered `.button { display: inline-flex }` wins over Tailwind's layered display utility. This is a concrete cause of incorrect element placement, and it makes future utility-based layout fixes unreliable.

Audit shared component declarations against the utilities they are combined with. Establish an intentional cascade, beginning with buttons and text buttons; verify existing routes before moving other declarations. Avoid fixing each collision by adding scattered `!important` rules. Check the skill detail's `xl:hidden` text button as well; that is a separate selector and should not be assumed to have the same outcome.

Locations: `styles/base.css`, `CareerInbox.tsx:208`, `CareerSkills.tsx:325`, shared CSS imports/layers.

Evidence: [populated Inbox](../artifacts/ui-review-2026-10-09/inbox-populated-desktop.png).

### 4. P2 — Hub rows stretch empty cards and reserve gaps

At desktop width, “Last result” is 371 px tall despite containing one sentence. It stretches to the height of the player/season-stat row. “Needs you” is 432 px tall with a large gap above its bottom link. Condition is 184 px tall beside a 335 px club card; the next row starts below the taller card, leaving approximately 151 px of unused space below Condition.

Use explicit main and supporting stacks for unequal content, and compact early-career states for Last Result and quiet priorities. Equal-height cards are useful for comparable statistics, but these sections are different content types. Merely applying `items-start` would remove stretched backgrounds while retaining the row-sized gaps.

Locations: `CareerHub.tsx`, `HubPriorities.tsx`, `CardLink` positioning.

Evidence: [desktop hub](../artifacts/ui-review-2026-10-09/hub-desktop.png).

### 5. P2 — Hub summary tiles end with an incomplete row

Eight quiet summaries occupy five columns followed by three. Two column positions remain empty, while the narrow tiles force Fame and Rival content into many lines. Their bottom-aligned links also leave sizeable blank interiors in the shortest tiles.

Use a balanced summary grid, such as four columns when the content width permits, and a consistent compact summary treatment. Treat that as a content-width decision rather than a hardcoded viewport assumption. Keep unread/actionable items prominent.

Locations: `CareerHub.tsx` summary grid and tile/link classes.

### 6. P2 — Mobile hub places player condition far below the next action

The phone hub is 3,817 px tall in the baseline. Tabs, title, the large fixture card, and priorities precede the player. Condition is below the player, Last Result, and season statistics. The primary action is clear, but checking fatigue before using it takes substantial travel.

Place a compact identity/fitness/fatigue/level summary beside or immediately before the match action on phones. Compress quiet priorities and early empty summaries. Preserve the larger fixture presentation where desktop space supports it.

Evidence: [phone hub](../artifacts/ui-review-2026-10-09/hub-phone.png).

### 7. P2 — Lifestyle leaves a long unused column

Sponsorships occupy five grid columns and the entire purchase catalogue occupies seven. In an early career, sponsorships end after a short empty-state message while cars, homes, staff, time off, giving back, and investments continue down the other side. Most of the left side is empty over a 2,480 px page.

Use a compact top row for fame, finances, and sponsorship status, then let the catalogue use the available width. Add category navigation/disclosure to manage the much longer phone list. Preserve prices and lock reasons beside each item.

Location: `CareerLifestyle.tsx` outer grid, Sponsors and Purchases sections.

Evidence: [desktop Lifestyle](../artifacts/ui-review-2026-10-09/lifestyle-desktop.png).

### 8. P2 — Profile attribute columns have very uneven lengths

`md:columns-2` combines groups with `break-inside-avoid`. The nine Technical attributes occupy one column; Physical and Mental stack in the other. This leaves a large unused area below Technical. At tablet width, two attribute columns remain active inside a much narrower workspace, reducing the room for labels, values, meters, and increment controls.

Choose a deliberate group layout based on container width: a single readable group list on small containers, three group columns when each fits, or group tabs with an accessible view-all option. Keep values and increment buttons consistently aligned. Shorten the default explanatory block and disclose the full point-cost rules.

Locations: `CareerProfile.tsx` Attributes and outer grid.

Evidence: [desktop profile](../artifacts/ui-review-2026-10-09/profile-desktop.png), [tablet profile](../artifacts/ui-review-2026-10-09/profile-tablet.png).

### 9. P2 — Skills uses a tall tree with a short detail column

The desktop tree is 2,367 px tall; the selected detail card ends near its first branch pair. The final Set Pieces branch spans the full tree width and produces unusually wide skill buttons. On phones the page is 4,282 px tall, with details after all branches. Selection scrolls toward that distant detail in the current implementation.

Keep the sticky desktop detail, but add branch navigation so the tree does not require every branch at once. Open phone details in an accessible URL-controlled sheet/dialog or adjacent disclosure. Preserve prerequisites, point cost, keyboard navigation, focus return, and browser Back.

Locations: `CareerSkills.tsx` tree grid, odd-last-branch span, select/back logic, SkillDetail.

Evidence: [desktop skills](../artifacts/ui-review-2026-10-09/skills-desktop.png).

### 10. P2 — National team grid changes column proportions between rows

The first row has a 5-column call-up card beside a 7-column squad card; the next has 7-column recent matches beside 5-column tournaments. Vertical edges do not line up. In the baseline, the 114 px squad card sits beside a 432 px call-up card, leaving a 318 px gap before the following row.

Use stable column stacks: selection/caps/tournament summaries on one side and squad/fixtures on the other, with a deliberate phone order. Collapse empty historical sections into compact notices until results exist.

Location: `CareerNational.tsx` section spans and order.

Evidence: [National team](../artifacts/ui-review-2026-10-09/national-desktop.png).

### 11. P2 — Briefing, report, and Legacy stretch unlike panels to equal heights

Before kickoff, the short objectives/instructions panel stretches to match the long tactics/selection panel. In the report, objectives and two reactions stretch beside the much longer rating breakdown. After retirement, an empty trophies/records panel stretches beside career numbers.

Group unequal sections into independent stacks, or put short supporting sections beneath related content. Maintain aligned comparison rows for genuinely comparable data. Position the kickoff/continue actions near their immediate context. In the briefing the explanation beneath Kick off currently begins immediately after the button, without a clear separate text/action gap.

Locations: `.match-preview`, report layout in `match.css`, `match/Preview.tsx`, `match/Report.tsx`, `CareerLegacy.tsx` detail grid.

Evidence: [briefing](../artifacts/ui-review-2026-10-09/briefing-desktop.png), [report](../artifacts/ui-review-2026-10-09/report-desktop.png), [Legacy](../artifacts/ui-review-2026-10-09/legacy-populated-desktop.png).

### 12. P2 — Shared page chrome consumes too much vertical space

On most desktop career screens the first card starts at y=306: an 82 px topbar, 40 px page inset, a 56 px tab group, 28 px gap, a 68 px title, and 32 px heading-to-content spacing. Descriptions add further height. Phone career content starts around y=239 without a description and lower with a wrapped title/description.

Define a compact functional-page header treatment. Preserve stable tabs across career routes, but tighten the page inset and title/tab spacing together. Keep expressive hero typography for the landing page; task pages need less ceremony. Do not remove touch target sizes to achieve this.

Locations: `shell.css` page/topbar/heading/tabs, `responsive.css`, `CareerPage`.

### 13. P2 — Empty content repeatedly receives a full panel

Early Inbox has both “No messages yet” and an empty reader. Transfers starts with a full-width empty Offers panel. Media has separate empty questions and feed panels. Trophies gives Golden Ball, cabinet, awards, and records their own empty areas. Each message is understandable, but the combination makes a sparse career feel like a series of unfilled forms.

Create a compact inline empty treatment and a richer empty treatment for a whole destination. Expand sections when there is content or an actionable explanation. Keep a useful next step when one exists; do not manufacture gameplay content to fill the page.

Locations: `CareerInbox.tsx`, `CareerTransfers.tsx`, `CareerMedia.tsx`, `CareerTrophies.tsx`, common panel patterns.

### 14. P2 — Settings underuses desktop width while remaining a long page

`.settings-layout { max-width: 46rem }` leaves a broad blank area to the right. Appearance, reading, motion, simulation, audio, tutorial, and reset controls make a 2,222 px desktop page. The readable text width is useful; the problem is putting every independent setting in the same vertical stream.

Use two grouped desktop columns where each setting can retain a comfortable reading width. Keep labels and switches consistently aligned, audio controls grouped, and reset/preferences feedback together. Retain one column on small containers.

Locations: `Settings.tsx`, `settings.css`.

Evidence: [Settings](../artifacts/ui-review-2026-10-09/settings-desktop.png).

### 15. P3 — Button, helper, badge, and numeric formatting varies

The app mixes 44, 46, and 48 px control heights; 20 and 24 px card padding; several heading sizes; and per-screen helper-text gaps. Variations can be intentional, but the code does not name their roles. Agent's recommended badge inserts a line above only one portrait, shifting it relative to the other cards and adding air to their shared header row. Contract cells stretch when one value includes a long note. Profile's Available badge wraps below a long explanation on phones, separating the value from the Attributes heading.

Define compact/standard panel roles, one standard action height, and clear title/body/helper/action spacing. Keep icon-to-label spacing smaller than text-to-action spacing. Move recommendation badges into a consistent header slot; separate long contract notes from comparable numeric cells; keep point counters beside headings. Apply tabular numerals to comparable values. Preserve adequate readable contrast for locked wardrobe items instead of fading the whole informational tile.

Locations: `tokens.css`, `base.css`, `shared.tsx`, `CareerAgent.tsx`, `CareerTransfers.tsx`, `CareerProfile.tsx`, `CareerWardrobe.tsx`.

### 16. P3 — Saved games reserves too much room for empty slots

Slot artwork reserves 150 px; copy reserves at least 132 px; actions are pushed down with `margin-top:auto`. This aligns desktop slot actions, but empty slots carry large gaps, and phones stack all three illustrated cards into a 2,420 px page. An empty `.notice` also reserves a line above the cards.

Keep three clear slot identities. Use compact empty-slot rows on phones, smaller artwork where it adds little information, and content-aware status spacing. Retain desktop action alignment when it aids comparison. Slot tools need a consistent gap and wrapping policy that keeps Delete visually distinct.

Locations: `saves.css`, `SavesContent.tsx`, responsive slot styles.

Evidence: [saved games](../artifacts/ui-review-2026-10-09/saves-desktop.png).

## Screen-specific coverage and secondary observations

| Screen family                                    | Review result / follow-up                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing / main menu                              | Strong desktop hero and illustration balance. The returning phone hero remains tall because its large slogan precedes the career summary; reduce that slogan for returning players. Keep the entry action prominent.                                                                                                              |
| New career                                       | Form and preview already align well on desktop. The identity form's Continue is below the initial viewport and phone nationality choices are long single-column rows. Compact repeated descriptions and review the preview's position per step. Do not squeeze all fields into one viewport. Other steps need targeted captures.  |
| Gallery: crests, kits, portraits                 | Artwork spacing is largely intentional. Compact the seed/helper/tab stack and keep save actions associated with the toolbar. An odd final kit card leaves an unused second column; low priority for a finite gallery.                                                                                                             |
| Hub                                              | Findings 4–6; strongest candidate for independent column stacks and compact quiet summaries.                                                                                                                                                                                                                                      |
| Inbox                                            | Findings 3 and 13. Populated list/reader is a useful layout; keep it. Review bounded scrolling and reader focus at each breakpoint.                                                                                                                                                                                               |
| Calendar                                         | Desktop paired week cards stretch to the busier neighbour. Phone calendar is 6,493 px tall despite quiet-week grouping. Default to a bounded upcoming window with access to the whole season, keeping chronological reading and week context.                                                                                     |
| Profile / Skills / Training                      | Findings 1, 8, 9. Container width matters more than raw screen width.                                                                                                                                                                                                                                                             |
| Transfers / Agent                                | Transfers already uses independent stacks effectively. Compact empty offers and long notes. Agent comparison alignment is worth preserving; normalize header badges. Negotiation dialogs still need state captures.                                                                                                               |
| Club life                                        | Existing independent stacks work. The third clique leaves an empty half-row, and numerous modifiers lengthen the phone screen to 4,744 px. Put summaries first and exact modifiers behind disclosure.                                                                                                                             |
| Media / Rival                                    | Populated Media leaves a long blank region beneath coverage before the full-width feed. Use coverage as a compact summary beside a feed/questions stack. Rival's large identity hero pushes comparison down; compact it and move meeting/history content together.                                                                |
| Lifestyle / Wardrobe                             | Finding 7. Wardrobe's desktop sticky preview is purposeful; keep it. On phones, its 5,338 px list needs category navigation and a smaller preview. Keep wearing/locked/price states readable.                                                                                                                                     |
| National / Trophies                              | Findings 10 and 13. Move competition browsing behind clear selection/disclosure so all continental groups do not dominate an early trophy cabinet.                                                                                                                                                                                |
| Chronicle / Moments / Legacy                     | Chronicle's season gutter is useful, especially once populated. Sparse empty views may remain compact and leave background space. Moments replay and ceremony states need targeted visual verification. Legacy has finding 11.                                                                                                    |
| World / Squad / fixtures                         | Two-column desktop browsing is appropriate, but all headers/actions/facts/rules precede the table. Phone World is 6,085 px tall and requires a long traverse to the inspector. Compact the overview, allow direct club detail access, and preserve table scrolling. Fixture/cup/playoff views need representative state captures. |
| Edit mode                                        | Desktop list/editor association is strong. On phones, edits summary and filtering/list controls consume the first viewport before editor content. Check selected-item transitions, return focus, and save actions for club, league, and player editing.                                                                           |
| Settings / Saved games                           | Findings 14–16. Group settings and compact empty save slots.                                                                                                                                                                                                                                                                      |
| Dialogs / More sheet / tutorial / update notices | Shared dialog spacing exists, but a complete overlay audit remains an implementation acceptance item: wrapped titles, action rows, viewport bounds, keyboard focus, Back/Escape, safe areas, and interference between notices and fixed controls.                                                                                 |

## What should remain spacious

Keep readable line lengths, safe tap targets, artwork display space, and the sticky wardrobe/skill previews when they serve the current task. A short Chronicle or empty Legacy does not need to fill a monitor. The target is space that separates related controls or prolongs a task without improving comprehension. Do not add decorative content solely to occupy gaps.

See the [implementation plan](UI-LAYOUT-PLAN-2026-10-09.md) for sequencing and acceptance criteria.
