# Analytics

Product analytics for balance, performance and engagement (decision D4, Workstream A of the
[1.0 plan](RELEASE-1.0-PLAN.md)). Events go to **PostHog EU** through a small client of our own
(no PostHog SDK), under **two tiers of consent**. The player-facing explanation is the privacy
page (`/privacy`, `src/i18n/privacy.ts`); this document is the engineering contract.

## Consent model

| Tier                            | Default          | Identifier                                                                                             | Person profiles                       | What it is for                                                  |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------- |
| 1. Anonymous statistics         | On, with opt-out | A random id made per page load and held only in memory; nothing is stored to recognise the device      | No (`$process_person_profile: false`) | Performance, errors, match and balance statistics, funnel steps |
| 2. Share how you play over time | Off, opt-in      | A random install id stored through the platform adapter (`ptg-analytics` in `localStorage` on the web) | Yes                                   | Retention and engagement over time                              |

- Tier 2 includes tier 1: turning tier 1 off withdraws tier 2, and opting in to tier 2 turns tier 1
  on (`updateConsent` in `src/analytics/consent.ts`).
- **Withdrawing tier 2 deletes the install id.** Consenting again creates a new one, so a
  withdrawn history is never re-linked. Tier-1 events sent before an opt-in are never aliased to
  the new person.
- Consent is a device setting. It lives in the adapter's preferences under the `analytics` scope,
  never in `Settings` and never in a save, so an exported save carries none of it.
- **The invitation.** After the first finished career match on a device, if tier 1 is on, tier 2
  is off and the invitation has not been answered, the app shell shows one non-blocking card
  ("Help shape the game"). It waits for every other prompt (update, offline, errors) and never
  appears over a key moment's choices. Answering either way, or changing the switch in Settings,
  records `prompted` and it never returns on that device. It does not take focus; it is a
  labelled region announced politely, Escape inside it means "Not now", and it follows the
  reduced-motion setting through `MotionConfig`.
- Settings has a **Privacy** card with both switches; in a build without analytics it says so
  instead. Both the card and the invitation link to `/privacy`.

## When analytics is off entirely

- **No key.** `VITE_POSTHOG_KEY` is read at build time. Without it (forks, local builds without
  `.env.local`, the custom-domain release journey), `track` is a no-op, the client is never
  downloaded, no request is made and no invitation is shown.
- **Automation.** When `navigator.webdriver` is true (Playwright, Lighthouse runs driven by
  automation), analytics is off whatever the build's key. A browser test can turn it on by setting
  `window.__ptgAnalyticsTest = { key, host?, environment?, flushMs? }` in an init script; the
  override is honoured only under automation, so it can never change a player's browser.
- **Tier 1 off.** The client drops every event and forgets anything queued.

## Architecture

```
src/analytics/
  index.ts     always loaded (~0.4 KB gzip): track(), startAnalytics(), the invitation signal
  config.ts    build-time configuration, the test override, tunable constants (ANALYTICS)
  events.ts    the event catalogue and its property allow-list
  consent.ts   the two tiers, stored through the platform adapter; useAnalyticsConsent()
  client.ts    queue, allow-list filter, batching, retries, the PostHog payload
  runtime.ts   lazily loaded: starts the client, common properties, page lifecycle events
  observe.ts   lazily loaded: events derived from store updates and committed results
```

- `main.tsx` calls `startAnalytics()` after the first render. It registers `error` and
  `unhandledrejection` listeners and, once the page has loaded, waits for an idle moment
  (`requestIdleCallback` with a 5 s timeout; 2 s after load in Safari) before importing
  `runtime.ts`. Until then `track()` only appends to an in-memory backlog (at most 100 events).
  Nothing of the client is on the critical path or in the match route's static imports.
- **Network goes through the platform adapter** (`platform.send(url, body, hiding)`, never
  rejects). The web adapter POSTs with `fetch(…, { keepalive: true })` and
  `Content-Type: application/json`; when that fails while the page is being hidden it hands the
  body to `navigator.sendBeacon` (as `text/plain`). The Android adapter can replace it later.
- **Batching.** One request per batch of up to 50 events to `${host}/batch/`, as
  `{ api_key, batch: [{ event, properties, timestamp }] }`. A flush happens 30 s after the first
  queued event, as soon as 20 are waiting, and when the page is hidden (`visibilitychange`,
  `pagehide`). The queue holds at most 100 events and drops the oldest. A failed batch is retried
  once, at the next scheduled flush, and then dropped: failures are silent and never storm.
- **The engine stays pure.** Every event is derived on the main thread from what the game has
  already committed: store updates (`useAppStore.subscribe`), world job transitions, the finished
  match kept for its report (`careerResult`), and a few UI handlers. A loaded save is never
  mistaken for play: an update where `change === savedChange` only becomes the new baseline.
- **CSP.** `connect-src` in `public/_headers` allows `https://eu.i.posthog.com`. If
  `VITE_POSTHOG_HOST` is ever set to another host (a reverse proxy), add it there too, or the
  browser blocks every request.
- **CI.** The deployable build in `.github/workflows/ci.yml` receives `VITE_POSTHOG_KEY` and
  `VITE_POSTHOG_HOST` from repository variables and `VITE_ANALYTICS_ENV` from the trigger
  (`production` for pushes to `main`, `preview` for pull requests, `ci` otherwise). Browser tests
  run against that build with analytics off (automation), except `e2e/analytics.spec.ts`, which
  turns it on with a dummy key and answers the batch endpoint itself.

### Bundle cost

Measured on the 0.9.1 build (`node scripts/check-bundle.mjs` and the build manifest):

| Part                                                               | gzip                    |
| ------------------------------------------------------------------ | ----------------------- |
| Entry (stub, adapter `send`, consent wiring, route tracking, copy) | +0.8 KB (105.8 → 106.6) |
| Client (`runtime` chunk: client, allow-list, lifecycle)            | 2.9 KB, idle-loaded     |
| Configuration and consent (shared with Settings)                   | 1.0 KB, idle-loaded     |
| Observer (events from play)                                        | 2.7 KB, idle-loaded     |
| Invitation                                                         | 0.9 KB, on demand       |
| Privacy page                                                       | 0.4 KB + 1.4 KB copy    |

## The allow-list rule

**An event may carry only the properties listed for it in `src/analytics/events.ts`, as ids,
enums, flags and bucketed numbers.** Never a typed name (player, club or edit-mode names), a seed,
save contents, free text, a file name or anything else that identifies a person. Players, clubs
and nations appear only as positions, tiers and coarse codes; money and Hall of Fame points only
as power-of-ten bands.

It is enforced three times:

1. **Types.** `track(event, props)` only accepts the event's listed keys.
2. **At runtime.** The client keeps only listed keys whose values are booleans, finite numbers
   (rounded to three decimals) or strings of at most 64 characters from `[A-Za-z0-9_.:/+-]` (so
   anything with a space, such as a name, is dropped). The only text property, an error's
   `message`, is scrubbed: URLs, paths, e-mail addresses and quoted text become placeholders,
   digits become `#`, and it is cut to 120 characters. No stack is ever sent.
3. **In tests.** `tests/analytics.test.ts` checks every event's keys and that nothing listed is
   dropped from events derived from a real career, a played match, a season and a retirement;
   `e2e/analytics.spec.ts` checks every event that leaves a real browser after a first match.

Adding an event: add it to `EVENTS`, emit it from main-thread code, add it to the catalogue below
and to a dashboard query if it answers a question, and keep the test green.

## Common properties

Set by the client on every event (`COMMON_PROPERTIES`):

| Property                  | Value                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `distinct_id`             | Tier 1: the page load's random id. Tier 2: the install id                              |
| `$process_person_profile` | `false` (tier 1) or `true` (tier 2)                                                    |
| `$lib`                    | `ptg`                                                                                  |
| `app_version`             | `APP_VERSION`                                                                          |
| `schema`                  | The save schema version (`CONFIG.saves.schemaVersion`)                                 |
| `engine`                  | The match engine of the match in hand (the finished match or the live session), if any |
| `world_format`            | `legacy` or `national-v1` when a world is loaded                                       |
| `environment`             | `production`, `preview`, `ci` or `development`                                         |
| `device_class`            | `low` (≤ 2 cores or ≤ 2 GB), `high` (≥ 8 cores and ≥ 8 GB or unknown), else `mid`      |
| `cores`                   | `hardwareConcurrency` bucketed to 2, 4, 8 or 16                                        |
| `memory`                  | `deviceMemory` where the browser reports it (already coarse), capped at 8              |
| `viewport`                | Width bucket: `xs` < 480, `sm` < 768, `md` < 1024, `lg` < 1440, `xl`                   |
| `input`                   | `touch` (coarse pointer) or `pointer`                                                  |
| `route`                   | The current route pattern (see `route_viewed`)                                         |

## Event catalogue

All events are sent under tier 1 (personless) and, with tier-2 consent, with the install id.
"Derived" means read from committed state on the main thread.

### Funnel

| Event              | When                                                          | Properties                                                                          |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `landing_viewed`   | The landing page is shown                                     | `initial` (the visit began there)                                                   |
| `wizard_step`      | Each new-career wizard step shown                             | `step` (`identity`, `appearance`, `position`, `world`, `trial`, `confirm`), `index` |
| `world_built`      | A world generation job finishes                               | `ms`                                                                                |
| `career_created`   | Derived: the create-career job's world arrives                | `position`, `archetype`, `nation` (counterpart country or `other`), `tier`, `child` |
| `first_key_moment` | Derived: the first key moment of a career's first match opens | `situation`, `position`, `session_s` (seconds since the page loaded)                |
| `match_finished`   | Derived: each new career match record                         | `count` (running, up to the history limit), `played` (false: simulated)             |
| `season_finished`  | Derived: the world's season completes with a career           | `season_index` (1 = the career's first)                                             |

### Balance

| Event            | When                                                       | Properties                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key_moment`     | Derived: each decision of a finished, committed match      | `situation`, `position`, `choice`, `chance` (stated probability), `success`, `chosen_ev`, `best_ev` (expected goal difference of the choice and of the best offered), `options`, `minute`                                                      |
| `match_result`   | Derived: each new career match record                      | `tier`, `competition` (`league`, `cup`, `champions`, `continental`, `international`, `other`), `position`, `minutes`, `rating`, `goals`, `assists`, `decisions`, `goals_for`, `goals_against`, `result`, `home`, `sim_only`, `played`          |
| `level_up`       | Derived: the career level rises                            | `level`, `age`                                                                                                                                                                                                                                 |
| `skill_unlocked` | Derived: a skill appears in the career                     | `skill` (id), `level`, `age`                                                                                                                                                                                                                   |
| `season_summary` | Derived: with `season_finished`                            | `season_index`, `position`, `age`, `tier`, `club_reputation` (nearest 5), `level`, `fame_band` (fame level), `wealth_band` and `hof_band` (power-of-ten bands of cash and Hall of Fame points), `awards`, `apps`, `goals`, `assists`, `rating` |
| `transfer`       | Derived: a new transfer, pre-contract, loan or loan return | `kind`, `from_tier`, `to_tier`, `age`, `fee_band`                                                                                                                                                                                              |
| `retired`        | Derived: the career becomes a legacy                       | `position`, `age`, `seasons`, `hof_band` (`top10`, `top50`, `top100`, `top500`, `other`)                                                                                                                                                       |

### Performance

| Event              | When                                                        | Properties                                                                                                                                   |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_loaded`       | The client starts                                           | `ttfb_ms`, `dcl_ms`, `load_ms`, `fcp_ms` (navigation and paint timing), `idle_ms` (when the client could start: a time-to-interactive proxy) |
| `continue_timed`   | A Continue (`simulate-to-match`) job ends                   | `weeks`, `matchday_ms`, `saved_ms` (until the autosave after it), `outcome` (the job's notice, `error` or `save-error`)                      |
| `season_simulated` | A season simulation job ends                                | `ms`, `weeks`, `outcome`                                                                                                                     |
| `save_failed`      | The save status turns to error                              | `kind` (`storage`, `large`, `locked`, `conflict`, `invalid`, `future`, `busy`)                                                               |
| `error`            | An uncaught error or unhandled rejection (10 per page load) | `kind` (`error`, `unhandledrejection`), `message` (scrubbed)                                                                                 |

### Engagement

| Event             | When                                                    | Properties                                                        |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| `session_started` | The client starts, or the tab is shown again            | `resumed`                                                         |
| `session_ended`   | The tab is hidden or the page is left                   | `seconds`, `screens` (distinct routes)                            |
| `route_viewed`    | Each route change                                       | `route` (the route pattern, `other` for unknown; never the query) |
| `press_answered`  | A press or interview question answered                  | `kind`, `answer` (tone)                                           |
| `story_resolved`  | Derived: a story resolves (by the player or the week)   | `story` (kind), `choice`                                          |
| `sponsor_decided` | A sponsorship accepted or declined                      | `accepted`, `category`                                            |
| `shared`          | A Moment link shared or copied; a Chronicle image saved | `what` (`moment`, `chronicle`), `method`                          |
| `export_done`     | A save, the edits or an unsaved world exported          | `what` (`save`, `edits`, `unsaved`)                               |
| `setting_changed` | A setting changed (once it settles, 1.5 s)              | `setting` (the setting's name, never its value)                   |
| `consent_prompt`  | The invitation answered                                 | `answer` (`accept`, `decline`)                                    |

### Not yet instrumented

- `pitch_fps`: the Pixi ticker lives in the match renderer, and the match route has no bundle
  headroom until Phase 2.8 moves code off it.
- Save size in `continue_timed`: the main thread never learns the size of an autosave; it needs
  the persistence worker to report it (Phase 3).
- `error` from the diagnostics ring buffer (Phase 4.7): today only uncaught errors are sent.
- International (tournament and window) matches: their decisions are sent as `key_moment`, but
  they have no `match_result`, as they are not club match records.
- A quick start in the wizard does not exist yet, so `wizard_step` has no `quick` flag.

## Dashboards

Three dashboards, defined by the HogQL queries below. `npm run analytics:dashboards` creates or
updates them in the PostHog project from this file: every `### … dashboard` heading is a
dashboard, every `####` heading under it an insight, and the `sql` block after it the insight's
query. Run it locally only, with `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` in the
environment or `.env.local` (never committed); it refuses to run in CI. Pass `--dry-run` to print
what it would do.

Every query reads production events from the last 30 days unless it says otherwise.

### Balance dashboard

#### Stated and realised success by situation and choice

The chance a choice showed against how often it worked. A gap means the odds mislead.

```sql
SELECT
  properties.situation AS situation,
  properties.choice AS choice,
  count() AS decisions,
  round(avg(toFloat(properties.chance)), 3) AS stated,
  round(avg(if(toString(properties.success) = 'true', 1, 0)), 3) AS realised,
  round(realised - stated, 3) AS gap
FROM events
WHERE event = 'key_moment'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY situation, choice
HAVING decisions >= 30
ORDER BY abs(gap) DESC
LIMIT 200
```

#### Pick rates and best-choice share

How often each choice is taken in its situation, and how often a pick of it was the best expected
value on offer. A choice picked almost always, and almost always best, is dominant.

```sql
SELECT
  situation,
  choice,
  picks,
  round(picks / sum(picks) OVER (PARTITION BY situation), 3) AS pick_rate,
  best_share
FROM (
  SELECT
    properties.situation AS situation,
    properties.choice AS choice,
    count() AS picks,
    round(avg(if(toFloat(properties.chosen_ev) >= toFloat(properties.best_ev) - 0.0001, 1, 0)), 3) AS best_share
  FROM events
  WHERE event = 'key_moment'
    AND properties.environment = 'production'
    AND timestamp > now() - INTERVAL 30 DAY
  GROUP BY situation, choice
)
ORDER BY situation, pick_rate DESC
LIMIT 500
```

#### Expected goals given up by choices, per position

Live counterpart of the "choices matter" gate: the expected goal difference players leave on the
table per match, by position.

```sql
SELECT
  properties.position AS position,
  count() AS decisions,
  round(avg(toFloat(properties.best_ev) - toFloat(properties.chosen_ev)), 4) AS regret_per_decision,
  round(avg(if(toFloat(properties.chosen_ev) >= toFloat(properties.best_ev) - 0.0001, 1, 0)), 3) AS best_taken
FROM events
WHERE event = 'key_moment'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY position
ORDER BY position
```

#### Rating distribution by position

Played matches only. Compare with the ratings gate: mean 6.5–6.9, standard deviation 0.7–1.0,
at most 3% at 9.0+ and at most 3% at 5.0 or less.

```sql
SELECT
  properties.position AS position,
  count() AS matches,
  round(avg(toFloat(properties.rating)), 2) AS mean,
  round(stddevPop(toFloat(properties.rating)), 2) AS sd,
  round(countIf(toFloat(properties.rating) >= 9) / count(), 3) AS share_9_plus,
  round(countIf(toFloat(properties.rating) <= 5) / count(), 3) AS share_5_or_less
FROM events
WHERE event = 'match_result'
  AND toString(properties.played) = 'true'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY position
ORDER BY position
```

#### Goals per match by tier

```sql
SELECT
  properties.tier AS tier,
  count() AS matches,
  round(avg(toFloat(properties.goals_for) + toFloat(properties.goals_against)), 2) AS goals_per_match,
  round(avg(if(toString(properties.home) = 'true', toFloat(properties.goals_for) - toFloat(properties.goals_against), toFloat(properties.goals_against) - toFloat(properties.goals_for))), 2) AS home_margin
FROM events
WHERE event = 'match_result'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY tier
ORDER BY tier
```

#### Level, fame and wealth by age

```sql
SELECT
  toInt(properties.age) AS age,
  count() AS seasons,
  round(avg(toFloat(properties.level)), 1) AS level,
  round(avg(toFloat(properties.fame_band)), 2) AS fame_level,
  round(quantile(0.5)(toFloat(properties.wealth_band)), 0) AS median_wealth_band,
  round(countIf(toFloat(properties.fame_band) >= 10) / count(), 3) AS share_fame_10
FROM events
WHERE event = 'season_summary'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 90 DAY
GROUP BY age
ORDER BY age
```

#### Hall of Fame rank by position

```sql
SELECT
  properties.position AS position,
  properties.hof_band AS rank_band,
  count() AS careers,
  round(avg(toFloat(properties.age)), 1) AS retirement_age
FROM events
WHERE event = 'retired'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 180 DAY
GROUP BY position, rank_band
ORDER BY position, rank_band
```

### Performance dashboard

#### Continue time by device class

```sql
SELECT
  properties.device_class AS device_class,
  count() AS runs,
  round(quantile(0.5)(toFloat(properties.matchday_ms))) AS matchday_p50,
  round(quantile(0.95)(toFloat(properties.matchday_ms))) AS matchday_p95,
  round(quantile(0.5)(toFloat(properties.saved_ms))) AS saved_p50,
  round(quantile(0.95)(toFloat(properties.saved_ms))) AS saved_p95,
  round(avg(toFloat(properties.weeks)), 1) AS weeks
FROM events
WHERE event = 'continue_timed'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY device_class
ORDER BY device_class
```

#### Load time by device class and viewport

```sql
SELECT
  properties.device_class AS device_class,
  properties.viewport AS viewport,
  count() AS loads,
  round(quantile(0.5)(toFloat(properties.fcp_ms))) AS fcp_p50,
  round(quantile(0.95)(toFloat(properties.fcp_ms))) AS fcp_p95,
  round(quantile(0.5)(toFloat(properties.dcl_ms))) AS dcl_p50,
  round(quantile(0.95)(toFloat(properties.idle_ms))) AS idle_p95
FROM events
WHERE event = 'app_loaded'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY device_class, viewport
ORDER BY device_class, viewport
```

#### Season simulation time by device class

```sql
SELECT
  properties.device_class AS device_class,
  count() AS runs,
  round(quantile(0.5)(toFloat(properties.ms))) AS p50,
  round(quantile(0.95)(toFloat(properties.ms))) AS p95
FROM events
WHERE event = 'season_simulated'
  AND properties.outcome != 'cancelled'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY device_class
ORDER BY device_class
```

#### Errors by version

```sql
SELECT
  properties.app_version AS version,
  properties.kind AS kind,
  properties.message AS message,
  count() AS errors
FROM events
WHERE event = 'error'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY version, kind, message
ORDER BY errors DESC
LIMIT 100
```

#### Save failures by version

```sql
SELECT
  properties.app_version AS version,
  properties.kind AS kind,
  count() AS failures
FROM events
WHERE event = 'save_failed'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY version, kind
ORDER BY failures DESC
```

### Engagement dashboard

#### First-session funnel by week

Event counts per step, which works for personless (tier-1) events: the landing page, the first
key moment, the fifth match and the end of the first season.

```sql
SELECT
  toStartOfWeek(timestamp) AS week,
  countIf(event = 'landing_viewed') AS landing,
  countIf(event = 'career_created') AS careers,
  countIf(event = 'first_key_moment') AS first_key_moment,
  countIf(event = 'match_finished' AND toInt(properties.count) = 5) AS match_five,
  countIf(event = 'season_finished' AND toInt(properties.season_index) = 1) AS season_one,
  round(quantile(0.5)(if(event = 'first_key_moment', toFloat(properties.session_s), NULL))) AS seconds_to_first_moment
FROM events
WHERE event IN ('landing_viewed', 'career_created', 'first_key_moment', 'match_finished', 'season_finished')
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 90 DAY
GROUP BY week
ORDER BY week
```

#### Retention of opted-in players (D1, D7, D30)

Tier-2 players only: the share of each weekly cohort that played again exactly one, seven and
thirty days after their first day.

```sql
SELECT
  cohort,
  count() AS players,
  round(avg(if(has(days, addDays(first_day, 1)), 1, 0)), 3) AS d1,
  round(avg(if(has(days, addDays(first_day, 7)), 1, 0)), 3) AS d7,
  round(avg(if(has(days, addDays(first_day, 30)), 1, 0)), 3) AS d30
FROM (
  SELECT
    distinct_id,
    min(toDate(timestamp)) AS first_day,
    toStartOfWeek(min(toDate(timestamp))) AS cohort,
    groupUniqArray(toDate(timestamp)) AS days
  FROM events
  WHERE event = 'session_started'
    AND toString(properties.$process_person_profile) = 'true'
    AND properties.environment = 'production'
    AND timestamp > now() - INTERVAL 120 DAY
  GROUP BY distinct_id
)
GROUP BY cohort
ORDER BY cohort
```

#### Session length

```sql
SELECT
  toStartOfWeek(timestamp) AS week,
  properties.device_class AS device_class,
  count() AS sessions,
  round(quantile(0.5)(toFloat(properties.seconds))) AS median_seconds,
  round(quantile(0.9)(toFloat(properties.seconds))) AS p90_seconds,
  round(avg(toFloat(properties.screens)), 1) AS screens
FROM events
WHERE event = 'session_ended'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 90 DAY
GROUP BY week, device_class
ORDER BY week, device_class
```

#### Feature use

```sql
SELECT
  toStartOfWeek(timestamp) AS week,
  event,
  count() AS uses
FROM events
WHERE event IN ('press_answered', 'story_resolved', 'sponsor_decided', 'shared', 'export_done', 'setting_changed', 'consent_prompt')
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 90 DAY
GROUP BY week, event
ORDER BY week, event
```

#### Play or simulate

```sql
SELECT
  toStartOfWeek(timestamp) AS week,
  count() AS matches,
  round(countIf(toString(properties.played) = 'true') / count(), 3) AS played_share,
  round(countIf(toString(properties.sim_only) = 'true') / count(), 3) AS simulation_only_share
FROM events
WHERE event = 'match_result'
  AND properties.environment = 'production'
  AND timestamp > now() - INTERVAL 90 DAY
GROUP BY week
ORDER BY week
```

## Balance gates and live data

How each [2.3 gate](RELEASE-1.0-PLAN.md#23-gates-that-encode-the-10-targets--m) compares with what
players do. The headless gates stay the definition; live data shows whether real play agrees.

| Gate                     | Live query                                       | Notes                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Choices matter           | Expected goals given up by choices, per position | Regret per decision × decisions per match (`match_result.decisions`) estimates the goals a match leaves to choices; the gate asks perfect vs worst ≥ 0.30.                                             |
| No dominant choice       | Pick rates and best-choice share                 | Live data shows which choice is taken and whether it was the best on offer, not which choice was best in every instance; a choice with a high pick rate and a best share near 1 is the one to inspect. |
| Ratings                  | Rating distribution by position                  | Directly comparable: mean, standard deviation and both tails per position.                                                                                                                             |
| Match statistics         | Goals per match by tier                          | Goals and home margin from the player's matches. Shots, shots on target and possession are not sent; they need match-statistics events (Phase 5).                                                      |
| Honours fairness         | Hall of Fame rank by position                    | Rank band of retired careers by position. Golden Ball winners by line are not sent.                                                                                                                    |
| Prime years              | Level, fame and wealth by age                    | `share_fame_10` by age shows when players reach fame level 10. Fan affection is not sent.                                                                                                              |
| Economy                  | Level, fame and wealth by age                    | Median wealth band by age (power-of-ten bands, so only coarse).                                                                                                                                        |
| World drift (25 seasons) | None                                             | World-level measures are headless only; no world statistics are sent.                                                                                                                                  |
| Save size                | None                                             | The save size is not known on the main thread yet (see "Not yet instrumented").                                                                                                                        |

## PostHog project settings

Set once in the PostHog project (EU):

- **Discard client IP data** (Project settings → IP data capture): the privacy page says the IP
  address is not stored.
- **Personless events** are on by default for `$process_person_profile: false`; nothing to
  enable, but do not turn on "always create person profiles".
- **Data retention**: choose and record a retention period; the privacy page should name it
  once decided.
- **Session replay, autocapture, surveys and heatmaps** stay off; this client never sends them.
