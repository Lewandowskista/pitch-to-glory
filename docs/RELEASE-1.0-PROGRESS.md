# Release 1.0 progress

Tracks the [1.0 implementation plan](RELEASE-1.0-PLAN.md) for the
[25 October review](APP-REVIEW-2026-10-25.md). Each phase records what changed, how it was
verified, and what remains open.

## Phase 1 — Hotfixes (release 0.9.1, 25 October 2026)

Status: released ([#3](https://github.com/Lewandowskista/pitch-to-glory/pull/3)). Save schema
unchanged; match engine unchanged (`match-21`).

| Step | Finding | Outcome                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | M1      | A level knockout is settled at commit (`sessionPenalties`) from the session's own `:penalties` stream when the player was off the pitch, so stored sessions replay unchanged. `recordTournamentMatch` refuses a level knockout without penalties; `knockoutWinner` repairs a 0.9.0 save's stuck bracket deterministically. `tests/knockout-shootout.test.ts`. |
| 1.2  | S1      | `notBefore` clamps `updatedAt` to `createdAt` on read and on every write path, so a clock behind a save's creation can no longer brick it, and bricked saves load. `tests/save-recovery.test.ts`.                                                                                                                                                             |
| 1.3  | S3      | Raw recovery export of a slot's stored records, without validation, from the slot card, the delete/replace dialogs and the error banner. `tests/save-recovery.test.ts`, `e2e/save-actions.spec.ts`.                                                                                                                                                           |
| 1.4  | S5      | `leaveInternationalFootball` clears the career's tournament place and window on retirement (and on creating a career in an older save). `tests/honours.test.ts`.                                                                                                                                                                                              |
| 1.5  | S6      | A taken career id adds the number of earlier careers. `tests/honours.test.ts`.                                                                                                                                                                                                                                                                                |
| 1.6  | S7      | An agreed pre-contract closes renewal talks; a signed renewal cancels it; rollover executes a pre-contract only on an expired contract. `tests/contract-expiry.test.ts`.                                                                                                                                                                                      |
| 1.7  | U5      | Quality bands from the chance alone; the helping skill as its own chip; each percentage names its outcome. `tests/match-choices.test.ts`.                                                                                                                                                                                                                     |
| 1.8  | U2      | Scoreboard names never break inside a word (two lines, then ellipsis, then the three-letter mark); the status text has its own grid area. `e2e/match.spec.ts`.                                                                                                                                                                                                |
| 1.9  | U7      | `MESSAGE_DESTINATIONS` maps every inbox kind deliberately. `tests/inbox-links.test.ts`.                                                                                                                                                                                                                                                                       |
| 1.10 | C15     | `seasonEdge` compares keepers and defenders on clean sheets. `tests/review.test.ts`.                                                                                                                                                                                                                                                                          |
| 1.11 | U6      | A gold focus ring (`--color-hero-focus`) on every field-green hero, checked for 3:1 contrast. `e2e/accessibility.spec.ts`.                                                                                                                                                                                                                                    |
| 1.12 | M17     | "Late winner/equaliser" only for the deciding goal, behind the narrative-only `decidingHeadline` setup flag. `tests/match-drama.test.ts`.                                                                                                                                                                                                                     |
| 1.13 | K12     | Development dependencies updated (Vite 7.3.7): 0 advisories. A missing `.catch` in autosave scheduling.                                                                                                                                                                                                                                                       |
| —    | —       | Found while fixing S5: a child's cabinet, Chronicle poster and national page showed the parent's tournaments and international matches. `tournamentPart` gives each tournament to the career playing when it was held. `tests/tournament-part.test.ts`.                                                                                                       |

Verification: CI on the pull request (format, lint, typecheck, release check, build with bundle
budgets, three unit shards, two browser shards each in Chromium, Firefox and WebKit), then the
deploy run on `main`.

Note for local runs: the development Mac idle-sleeps, which makes long test runs time out
(965 s wall for 70 s of CPU); a pull request's CI is the check of record.

## Workstream A — Analytics (release 0.10.0, 25 October 2026)

Status: released ([#4](https://github.com/Lewandowskista/pitch-to-glory/pull/4)). Design, events and
dashboards: [ANALYTICS.md](ANALYTICS.md).

- A small client (2.9 KB gzip, loaded when idle) sending to PostHog EU through the platform
  adapter's new `send`; nothing loads or sends without a key or under automation.
- Two-tier consent: personless tier 1 on by default with an opt-out; tier 2 opt-in with an
  install id in device preferences. A per-event property allow-list.
- `/privacy`, a Privacy card in Settings and a one-time invitation after the first played match.
- CSP `connect-src` allows `https://eu.i.posthog.com`; CI builds with the repository variables,
  tagged `production` from `main` and `preview` on pull requests.
- PostHog project: client IP discarded, GeoIP transformation disabled. Three dashboards (balance,
  performance, engagement) created with `npm run analytics:dashboards`.
- Not yet instrumented: `pitch_fps` (no match-route headroom), save size in `continue_timed`,
  diagnostics-buffer errors (Phase 4.7), international `match_result`, the quick-start flag
  (Phase 6.1).
- Open for the owner: a data-retention period for the privacy page; a legal check of the privacy
  wording (D7); autocapture, session replay and surveys can be switched off in PostHog for tidiness
  (the client never loads the SDK, so they have no effect).

## Phase 2 — Foundations

Status: wave 1 (2.1, 2.2, 2.3, 2.8) merged into `release/1.0`; wave 2 (2.4, 2.5, 2.6, 2.7) next.
The combined branch passes 847 fast and 24 slow unit tests.

| Step | Finding | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | K1, K10 | A shared national test world (`tests/support/`): generated once per run, with a career and two played snapshots (12 weeks, a season) cached by engine hash. 60 test files use it; 42 direct generations stay legacy (match-engine tests, the explicit `legacy-compat` set, three cheap multi-season stand-ins). 20 of 22 browser journeys build national worlds. A `slow` Vitest project (`*.slow.test.ts`, golden saves) runs on `main`, nightly and before deploy; pull requests run `fast` (164 s wall against 207 s). Workers peak at about 4 GB. |
| 2.2  | K9, S8  | Five golden saves exported by 0.3.0 (national and legacy), 0.8.0 and 0.9.1, 12 MB brotli, each loaded, played to full time, advanced a week and round-tripped (`tests/golden-saves.test.ts`). Save schema 23 (no-op migration). `npm run check:save-shape` hashes every persisted type with the TypeScript compiler API and fails CI on an unbumped change.                                                                                                                                                                                           |
| 2.3  | —       | Every 1.0 target is a reported target in `scripts/targets.ts` with the phase that asserts it; baselines in BALANCING.md "1.0 targets". New `npm run drift` (25 seasons) and a nightly drift workflow (runs once on `main`). The phone profile now measures worker time (Chromium cannot throttle workers): a late save's Continue is about 17.9 s to saved when scaled, against 5 s.                                                                                                                                                                  |
| 2.8  | K3, P8  | MatchBody 299.8 → 242.0 KB gzip static (272.2 KB usable); the hub's main-thread load 408 → 288 KB. Dexie and the validators live only in the persistence worker (leases through the worker, Saves screen refreshed by BroadcastChannel); the pitch builds Pixi's WebGL renderer alone. `check-bundle.mjs` budgets each route's first-render dynamic imports too and warns at 285 KB (the hub warns at 287.9 KB).                                                                                                                                      |

Found during wave 1, for later phases:

- A semi-professional wage cannot carry the cheapest flat: buying it at a tier-6 start costs morale (Phase 7.3).
- Below tier 2, league awards follow the career's current league, so a mid-season move leaves the earlier league without its awards (Phase 7.1).
- The shared fixture's 17-year-old striker is his tier-6 club's best player and scores 34 league goals in season 1 (C17, Phase 5.2); his club plays a winger at centre-forward.
- `npm run test:update` fails locally with network-disconnected console errors, before and after wave 1.
