# Milestone 3: deterministic match experience

## Design and scope

The approved AGENTS.md match specification is the design authority. Build the pure headless engine first, then the lazy PixiJS viewer and matchday UI. Existing saved worlds supply clubs, lineups and a selected footballer. Until milestone 4 creates a career player, this is a friendly match: reports calculate earned XP/fame but do not grant career progression or change league standings. The UI explains the friendly context.

Use a serializable compact match setup containing two club snapshots, their available players, seed, season and selected player ID. A versioned session stores the setup and ordered commands. Engine state is immutable and deterministic; elapsed wall-clock time never enters sporting randomness. Commands advance one simulated minute, select a moment choice or finish half-time. Save validators replay the command log and compare the resulting state, rejecting forged outcomes. Existing saves without a match remain valid.

On wide screens show the pitch beside live commentary and statistics. On narrow screens stack the score, pitch, choices, controls and commentary. Before kickoff show teams, weather, pitch, instructions, objectives and personal role/risk/mentality choices. Play supports pause, 1x/2x/4x and skip to the next decision. At 45 minutes require a manager response. Substitute the selected player when fitness demands it; make captain choices when selected as captain. After 90 minutes show rating factors, heat/pass/shot maps, objectives, XP/fame calculations, reactions and a generated headline. All copy is localized.

PixiJS only draws engine positions; it never resolves outcomes. Use reusable Graphics/tokens, interpolate in the renderer ticker, clean up asynchronous initialization, resize and context loss, respect reduced motion, and offer a complete simulation-only mode. Visibility changes pause playback and never auto-resume. Keyboard supports Space, 1–4 and arrow choice navigation; existing Escape/back/help behavior remains.

## Implementation sequence

- [x] Add pure match setup/session/command types, lineup selection, position frames and calibrated minute engine.
- [x] Verify replay/serialization, keeper and outfield moments, transparent factors, substitutions/half-time, conserved score/event/report data and 10,000-match distributions (2.5–2.9 goals, home advantage, reputation-gap upsets).
- [x] Add PixiJS dependency and a lazy renderer with lifecycle and accessible simulation fallback.
- [x] Build localized pre-match/live/post-match routes and keyboard/visibility controls with responsive styling.
- [x] Integrate a match store slice, autosave checkpoints, saved-session restoration and strict import validation. Prevent world changes during an unfinished match.
- [x] Add three-browser critical match journeys including refresh/resume, keyboard choices, half-time, report and simulation-only mode.
- [x] Run typecheck, lint, formatting, all unit/browser tests and production bundle checks; inspect desktop/mobile themes and document formulas, decisions and measured limitations.

Engine, renderer and UI are separate implementation domains with independent file ownership. No Git repository exists; do not fabricate commits or worktrees. Stop before milestone 4.
