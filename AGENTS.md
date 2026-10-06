# Project: "Pitch to Glory" — Football Career Simulator (Web-first, Android later)

You are building a complete, polished, shippable web game, not a prototype. Every screen must
be finished, styled, and functional. No placeholder text like "TODO" or "Coming soon" in the
UI. Work in milestones (see bottom), keep the app runnable after every milestone, and write
tests for all simulation logic.

The browser is the primary platform. Design, build, test, and polish for desktop and mobile
browsers first. An Android port via Capacitor happens only in the final milestone and must
never drive architecture or layout decisions.

## 1. Concept
The player creates a young footballer (age 16–18) who starts in a low-tier semi-professional
league and tries to build a legendary career. Matches are presented as a visual 2D simulation
with tactical and decision-based input, not real-time control. Performance drives XP,
attributes, skills, fame, transfer interest, and the story of the career. The career ends at
retirement, after which the player gets a Legacy summary and can start a new career in the
same persistent world, optionally as the child of their previous player.

## 2. Tech stack (mandatory)
- TypeScript (strict), React 18, Vite, React Router (real URL per screen)
- State: Zustand with slices; simulation logic in a pure, framework-free `src/engine/` folder
  with no browser or React dependencies, so it runs in Web Workers and tests unchanged
- Match renderer: PixiJS (2D top-down pitch), lazy-loaded, 60fps on a mid-range laptop and
  phone browser
- Styling: Tailwind CSS utilities for all new UI, sharing a single design-token file (colors,
  spacing, radii, typography, shadows) with the existing component CSS. Screens built before
  milestone 4 keep their component classes until a later milestone substantially reworks them;
  new screens use utilities, with small component classes only where utilities become unwieldy
- Animation: Framer Motion for UI transitions
- Persistence: IndexedDB via Dexie, with versioned save schema and migrations; 3 save slots;
  autosave after every match and every in-game week
- Audio: Howler.js. Generate UI sounds and crowd ambience procedurally with Web Audio, or use
  only CC0 assets (document the source of each in ASSETS.md)
- Testing: Vitest for the engine, Playwright for critical UI flows (run in Chromium, Firefox,
  and WebKit)
- PWA: installable, works offline after first visit
- All randomness goes through a seedable RNG (e.g. a mulberry32 implementation) so careers are
  reproducible and bugs can be replayed from a seed
- Platform abstraction: all platform-specific features (file save/share, haptics, back
  handling, wake lock, notifications, storage persistence) go through a `src/platform/`
  adapter interface. Implement the web adapter first. The Android adapter is added only in the
  final milestone. No Capacitor imports anywhere outside `src/platform/`, and no Capacitor
  installed until then.

## 3. Web-first requirements
- Layout: desktop/landscape is the primary layout and must use the extra width well
  (multi-column hub, match view side by side with commentary and stats, persistent sidebar).
  The narrow/mobile browser layout must be equally complete, not a squeezed desktop.
- Input: full mouse and keyboard support. Keyboard shortcuts for common actions (Space:
  play/pause match, 1–4: pick key-moment choice, arrow keys: navigate tabs/lists, Esc:
  back/close dialogs, ?: show shortcut list). Hover states and tooltips on desktop;
  equivalent tap/long-press interactions on touch screens.
- Routing: browser back/forward works on every screen; refreshing the page restores the
  current screen; dialogs and modals close with back.
- Load performance: initial JS bundle under 300 KB gzipped, code-split by route, match
  renderer and heavy screens lazy-loaded. Time to interactive under 3 s on a mid-range phone
  on 4G.
- Saves: request `navigator.storage.persist()` and explain to the player why. Because browsers
  can clear storage, provide save export/import as a file plus an optional reminder to back up
  once per in-game season. Detect the game being open in two tabs and lock each save to one tab
  (BroadcastChannel or Web Locks API).
- Audio: respect browser autoplay rules; start audio only after the first user interaction.
- Browser support: latest Chrome, Firefox, Safari (macOS and iOS), and Edge. Test Safari
  specifically for IndexedDB, Web Worker, and audio quirks.
- Deployment: static build deployable to any static host. Include a config for Cloudflare
  Pages or Netlify, and a GitHub Actions workflow that runs typecheck, lint, tests, and deploys.
- Title screen doubles as a landing page: attractive, fast, with Open Graph and Twitter card
  tags so shared links look good.
- Offline: service worker caching so the game works offline after the first visit, with an
  in-game "Update available" prompt when a new version is deployed.

## 4. Art direction: clean flat vector / cartoon
- All visual assets are SVG, generated in code or authored as SVG files in `src/assets/`.
  No external image downloads or hotlinking.
- Procedural player avatars built from layered parts: face shape, skin tone, hair style and
  color, facial hair, eyebrows, eyes, accessories (headband, tape, earrings). At least 8
  options per part. Avatars visibly age through the career (hairline, wrinkles, gray hair).
- Procedural club crests: shape templates (shield, circle, roundel, banner) x symbols
  (animals, stars, towers, waves, crossed objects) x 2–3 club colors. At least 15 shapes and
  30 symbols, so every club looks distinct.
- Procedural kits: base patterns (solid, stripes, hoops, halves, sash, chevron, pinstripe,
  gradient) plus collar styles, sleeve trims, and sponsor block. Home/away/third per club.
- Visual identity: bold colors, rounded cards, chunky readable typography (self-host the fonts,
  e.g. Inter + a display font like Bebas Neue), subtle shadows, satisfying micro-animations on
  every reward.
- Dark and light theme, following the system setting by default.

## 5. World generation
- Fictional world with 6 countries, with pyramids explicitly based on documented real national
  counterparts. Implement every regional group and promotion/relegation playoff in the first
  four real tiers. Extend a pyramid below tier four where needed for a semi-professional start
  (notably England). League sizes, match counts, movement places, playoff brackets and
  country-appropriate club/player/city naming must follow the chosen counterpart and a named
  reference season; do not use one uniform eight-club/two-up/two-down model. Keep fictional
  identities unless the user selects real names. Record sources, exceptions and adaptations in
  `docs/REALISM.md`. Existing saves retain their original rules when the world format changes.
  Include domestic cups and continental competitions (a top-tier
  "Champions" cup and a second-tier cup) with group + knockout format.
- Every club has: name, city, crest, kits, stadium (name, capacity), reputation, finances,
  wage budget, youth focus, playing style, club culture traits (e.g. "Develops youth",
  "Win-now", "Fan-owned"), and a manager with personality and preferred formation.
- Every AI player has full attributes, potential, personality, age, contract, and develops or
  declines over time. The world is fully simulated each week in a Web Worker: other matches,
  transfers, manager sackings, retirements, and youth intakes.
- Edit mode: users can rename clubs, leagues, and players, change colors, and regenerate
  crests. Export/import edits as a JSON file (download and file picker in the browser, via the
  platform adapter).

## 6. The career player
Attributes (1–99), grouped: Technical (finishing, passing, dribbling, first touch, crossing,
heading, tackling, long shots, set pieces), Physical (pace, acceleration, stamina, strength,
agility, jumping), Mental (vision, composure, positioning, decisions, work rate, leadership,
aggression). Goalkeepers have their own set; the player can choose to be a keeper.

Hidden attributes revealed over time: injury proneness, big-match temperament, consistency,
professionalism, ambition.

Positions: primary plus secondary positions with familiarity levels; new positions can be
learned through training and playing time.

Progression:
- Match XP based on rating, minutes, goals/assists/clean sheets, key decisions, opposition
  strength, and match importance.
- Level-ups give attribute points to distribute, with soft caps based on potential and age.
- Skill tree with ~40 traits across branches (e.g. "Finesse Shot", "Engine", "Aerial Threat",
  "Captain's Voice", "Big Game Player", "Set-Piece Specialist", "Ball Winner", "Trickster").
  Traits change simulation outcomes and unlock new decision options in matches.
- Training: weekly schedule with focus areas, intensity (higher gains vs injury/fatigue risk),
  and optional extra sessions with a mentor.
- Ageing curve: peak 26–30 depending on attributes; pace declines first; experience can
  compensate (mental attributes keep rising).

## 7. Match experience (core loop, must feel great)
- Pre-match: lineup reveal, opponent preview, weather and pitch condition, the manager's
  instructions for you, personal objectives for the match (e.g. "Score", "Complete 85% of
  passes").
- Personal tactical choices before kickoff: role within your position (e.g. Winger: "Hug the
  touchline" / "Cut inside" / "Track back"), risk level, mentality.
- Live match: 2D top-down pitch rendered with PixiJS, players as flat circular tokens in kit
  colors, ball movement and animated highlights. Speed controls (1x, 2x, 4x, skip to next key
  moment). Live commentary feed, scoreline, clock, momentum bar, live player rating. On wide
  screens, pitch, commentary, and live stats are visible together.
- Key moments (6–15 per match depending on role, minutes, and form): the sim pauses and
  presents a situation drawn on the pitch with 2–4 choices (e.g. shoot near post / far post /
  square pass / take on defender), selectable by click, tap, or number key. Each choice shows a
  quality hint based on attributes and traits. Outcomes are resolved by the engine with
  transparent probabilities, then animated.
- Mid-match: talk to the manager at half-time (ask to change role, complain, motivate team),
  respond to substitutions, make captain decisions if captain.
- Post-match: rating breakdown, heatmap, pass map, shot map, XP earned with animated level-up,
  fame change, objective results, manager and fan reactions, generated newspaper headline.
- The match engine must be deterministic for a given seed, produce realistic score
  distributions, and be validated by tests that simulate 10,000 matches and assert realistic
  averages (goals per game ~2.5–2.9, home advantage, upset frequency by reputation gap).
- If the tab is hidden mid-match, pause the match automatically.

## 8. Career and off-pitch systems
- Contracts: wage, length, squad role promise (Key Player / Rotation / Backup / Youth),
  bonuses (appearance, goal, clean sheet), release clause, sell-on clause, loyalty bonus.
- Agent: hire agents with different traits (aggressive negotiator, well-connected, cheap).
  Agents bring offers, push for moves, and take a cut.
- Transfers and loans: interest from clubs grows with performances and visibility (league
  level, continental matches, national team). Clubs scout you over several weeks; you see a
  "Scouting Interest" list. Multi-step negotiation with counteroffers. You can hand in a
  transfer request, which affects relationships.
- Relationships: manager trust, teammate chemistry (individual relationships with key
  teammates), fan affection per club, and a rival player in your generation whose career runs
  in parallel and is tracked against yours.
- Media: press conferences and interviews with choices that affect fame, manager trust, and
  dressing-room mood. Social media feed with posts from fans, journalists, and the rival.
- Fame and lifestyle: fame level unlocks sponsorship deals with obligations, celebrations,
  boots, kit customizations (sleeves, socks, captain armband style), hairstyles, and lifestyle
  purchases (car, house, investments) that affect morale and finances.
- Celebrations: unlockable and performed after goals in the match view as a short animated
  token celebration plus a commentary line. Using your signature celebration in big moments
  increases fame.
- National team: call-ups based on form and reputation, youth levels (U19, U21) then senior,
  international tournaments every 2 years (alternating continental and world).
- Injuries: types with realistic durations, recovery choices (rush back faster with
  re-injury risk vs full rehab); career-threatening injuries are rare but possible.
- Morale and form tracked weekly and shown clearly.
- Awards: player of the month, team of the season, golden boot, young player of the year,
  league MVP, and a global "Golden Ball" with a ceremony screen.
- Retirement: choose when to retire (forced by age/decline at some point); Legacy screen with
  career timeline, trophies, stats, records broken, and Hall of Fame ranking.

## 9. Differentiating features (implement all)
1. Career Chronicle: an auto-generated, illustrated timeline of the career that reads like a
   biography, built from events (debut, first goal, transfers, injuries, trophies, rivalry
   moments). Exportable as an image and shareable via the Web Share API where supported, with
   download as fallback.
2. Persistent world and legacy: after retirement, the world continues. Start a new career in
   the same world (former teammates may now be managers), or play as your player's child with
   a small inherited bonus and a famous surname.
3. Rival system: a generated rival of similar age and position who is compared to you in
   media, transfers, and awards.
4. Dressing-room dynamics: cliques, leaders, and how your behavior affects them.
5. Decision transparency: every key-moment choice shows why it succeeded or failed (attribute
   check, trait bonus, defender quality, fatigue), so the game teaches its own systems.
6. Club culture fit: thriving depends on whether your personality and style suit the club,
   not only stats.
7. "Moments" collection: memorable plays (wonder goals, last-minute winners) saved as
   replayable 2D clips, shareable as a link that replays the clip from its seed.
8. Daily and weekly challenges with cosmetic rewards (no pay-to-win).
9. Accessibility: font scaling, color-blind-safe kit clash detection, reduced motion mode,
   full keyboard operability, screen-reader labels on all controls, and a simulation-only
   mode for players who just want to make decisions.

## 10. UX and screens
Title/landing screen, Main menu, New career wizard (appearance, name, nationality, position,
preferred foot, starting archetype), Hub (next match, inbox, calendar, quick stats), Inbox,
Calendar, Squad, League tables and fixtures, Player profile with attributes and history, Skill
tree, Training, Transfers and contracts, Agent, Media/social feed, Wardrobe and celebrations,
Lifestyle, Trophy cabinet, Chronicle, Settings, Edit mode, Save slots.

Navigation: persistent sidebar on wide screens, bottom tab bar on narrow screens. Every action
responds in under 100 ms; heavy simulation (season sim of all leagues) runs in a Web Worker
with a progress indicator and never freezes the UI.

## 11. Quality bar
- No console errors, no unhandled promise rejections
- Lighthouse performance > 90 on desktop and > 85 on mobile; accessibility > 95
- Playwright critical flows pass in Chromium, Firefox, and WebKit
- Save/load round-trip tests; save migration tests; export/import tests
- Balancing documented in `docs/BALANCING.md` with all formulas and tunable constants in one
  config file
- Onboarding: a short interactive tutorial during the first match and first week
- Localization-ready: all strings in i18n files (English first)

## 12. Milestones (stop and summarize after each)
1. Project scaffolding, design system, routing, procedural crest/kit/avatar generators with a
   gallery screen to review them, seedable RNG, save system (including export/import and tab
   lock), platform adapter interface with web implementation, CI workflow.
2. World generation, leagues, fixtures, standings, full-season simulation in a Web Worker.
3. Match engine (headless) with statistical tests, then the PixiJS match viewer, commentary,
   key moments, keyboard controls, and post-match screens.
4. Career player: attributes, XP, level-up, training, skill tree, ageing.
5. Contracts, agents, transfers, loans, scouting interest, negotiations.
6. Media, social feed, relationships, rival, dressing room, morale/form.
7. Fame, sponsorships, lifestyle, wardrobe, celebrations, challenges.
8. National team, continental cups, awards, retirement, legacy, Chronicle, Moments sharing.
9. Edit mode, accessibility pass, tutorial, audio, polish pass on every screen.
10. Web release: deployment pipeline, PWA and offline polish, update prompt, performance and
    bundle audit, cross-browser test pass, landing screen and share tags.
11. Android port: install Capacitor, Android platform adapters (haptics, hardware back button,
    share sheet, file access, status bar), icons, splash screen, touch and performance pass on
    real devices, release build instructions in docs/ANDROID.md.

Start with Milestone 1. Before coding, write `docs/ARCHITECTURE.md` describing the folder
structure, data model (TypeScript types for all entities), the platform adapter interface,
and how the engine, store, UI, and Web Workers interact. Then implement.
