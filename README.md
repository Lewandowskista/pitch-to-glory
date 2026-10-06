# Pitch to Glory

Milestones 1–4: a web-first football career simulator with deterministic SVG art, a persistent football world and interactive friendly matches. Generate six real countries with source-based national pyramids: 52 league groups, 959 initial clubs and 21,098 players. Clubs and competitions are fictional parodies of their real counterparts (Munich Reds, English Premier Division), and lower-tier clubs live in real towns. Follow domestic cups, regional groups, promotion/survival playoffs and complete seasons in a Web Worker, with squads that retire, renew, release and sign free agents over many seasons. Play a footballer from your world through pre-match tactics, situation-based key moments, half-time and a detailed performance report. Create a young footballer, start at a semi-professional trial club and build a career: play your club's fixtures, earn XP, level up, spend attribute points against age-adjusted soft caps, unlock skills from a 49-skill tree, plan weekly training and manage injuries while the world's players develop and age on realistic curves. Existing compact worlds retain their original rules.

## Run locally

Node.js 22.19+ (Node 24 recommended and used for verification):

```sh
npm ci
npm run dev
```

Open the URL Vite prints (normally http://127.0.0.1:5173). On Windows PowerShell with blocked script shims, use `npm.cmd` and `npx.cmd`.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Browser tests start the production preview on port 4173. Close unrelated servers using that port before running. For manual production/offline review: `npm run preview`; PWA registration runs only in production. Offline use requires one connected visit. All route chunks, workers and locally bundled WOFF2 fonts are precached.

`npm run audit` checks Lighthouse mobile performance/accessibility on all six entry screens plus the desktop title screen, using port 4180. Run it after browser tests stop so measurements are not distorted by concurrent workloads. Reports go to `artifacts/`. `node scripts/capture.mjs` captures desktop/mobile screens from a preview on port 4173; pass another base URL as its first argument if needed. `node scripts/inspect-pwa.mjs` checks Chrome installability.

## Use

- Clubhouse: title screen with "Start a career" / "Continue career" and direct gallery links.
- Career: the wizard (`/career/new`) chooses name, nationality, age 16–18, foot, every avatar layer, position (including goalkeeper) and archetype. It then builds a new world (or uses a loaded one), offers three semi-professional trial clubs, and can save straight into a slot.
- The hub (`/career`) shows your next match, level and XP, unspent points, condition, injury recovery choices, last result, season stats, league position and last week's training. "Continue to next matchday" simulates the world in the worker until your club plays; season simulation asks whether to auto-play your matches.
- Profile (`/career/profile`) allocates attribute points (costs rise at the soft cap), shows positions, revealed hidden attributes and match history. Skills (`/career/skills`) unlocks skills with prerequisites and minimum levels. Training (`/career/training`) sets three weekly sessions, their intensity and an optional mentor session.
- Career matches are played on Matchday and recorded once at full time. The report shows the XP granted and an animated level-up.
- World: enter a seed to generate the complete football world. Choose a country/division/regional group, browse standings/fixtures/cup/postseason/history and select club or player rows to inspect their full generated data. Advance a week, finish a season, cancel a job, or apply promotion/relegation by starting the next season.
- Matchday (worlds without a career): choose clubs, a footballer (including goalkeepers), and a seed. Set personal tactics, kick off, then play/pause at 1×/2×/4× or skip to the next decision. Each key moment is a situation for your position (box chance, build-up, defending an attack, shot incoming, distribution and more) with 2–4 choices. Review each choice's probability, the attributes it uses, what is at stake if it works or fails, and its contributing factors. Respond to the manager, substitutions and captain prompts; finish with a rating, objectives, heat/pass/shot maps and calculated performance rewards. Friendlies preserve league standings and player progression. Save the world in a slot to resume the match after refresh.
- Gallery: 15 crests, 45 kits and 24 age portraits. Apply a text seed to reproduce a collection; reseed to generate another.
- Save collections: store the current world or gallery in one of three slots. Loaded worlds autosave after each week and match; match checkpoints and ordinary edits autosave too. Export/import compact JSON backups up to 128 MiB. File schema v8 migrates v1–v7 saves while keeping older worlds on their original rules. Match sessions are validated by deterministic command replay; a session from an older match engine is discarded on load with an explanation, and the world is kept. A damaged or newer slot is reported on its own card without affecting the other slots. Request persistent browser storage to reduce eviction.
- Save a world before closing the browser. Its URL then includes the slot so refresh restores it with the selected competition view. Creating another world keeps the previous slot intact. At season end, the optional backup reminder links to export controls.
- Settings: system/light/dark theme, 85–130% font scale, reduced motion and simulation-only match presentation. Preferences persist on this device independently of saves.
- Keyboard: Tab and Enter for controls, Space to play/pause matches, 1–4 to choose a key-moment action, arrows for navigation/tabs/choices, Escape to close/back, `?` for the shortcut guide. Confirmation dialogs support browser back. Matches pause when the tab becomes hidden and require explicit playback to resume.
- Two tabs can view summaries, but only one owns a slot. A conflict offers export of the unsaved local snapshot and confirmed reload; if the slot disappeared, recovery detaches it while retaining the in-memory collection.

## Delivery

`dist/` is a static SPA. `netlify.toml` configures build and deep-link fallback. The GitHub workflow checks types, lint, unit tests, build and all three browser engines. It deploys main only when `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` are configured in the production environment. Nothing has been published by this task.

SVG-only icons pass Chrome installability checks. Physical Safari installation/offline behaviour remains release-device verification. Windows WebKit's test driver blocks offline navigation/module loading before service-worker handling; its test checks actual cached shell, route and simulation-worker responses offline. Chromium and Firefox also run full offline navigation and world simulation. See verification for the latest recorded checks; expanded-world performance and browser results must be assessed separately from the earlier compact-world runs.

See [architecture](docs/ARCHITECTURE.md), [national rules and adaptations](docs/REALISM.md), [match implementation](docs/MILESTONE-3.md), [decisions](docs/DECISIONS.md), [balancing](docs/BALANCING.md), [verification](docs/VERIFICATION.md), and [asset provenance](ASSETS.md).

## Next milestone

For a complete document index, current implementation state and a ready-to-use Claude Code continuation prompt, see [the implementation handoff](docs/HANDOFF.md).

Milestone 5 adds contracts, agents, transfers, loans, scouting interest and negotiations. No input is required unless you want to change the existing specification.
