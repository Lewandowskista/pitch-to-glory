# Experience redesign for 1.0 — 26 October 2026

Status: **approved by the owner on 26 October 2026**, as written, with a vertical pitch in portrait, the drought director stated openly, and the express path (D15–D17 in the plan). It follows the owner's playtest on a phone
and the interview decisions D11–D14 in [RELEASE-1.0-PLAN.md](RELEASE-1.0-PLAN.md). It draws on a
game-design research brief (sources are cited in the conversation record and summarised here) and a
phone audit of `release/1.0` at 390 × 844 with a 4× slower CPU (evidence in the git-ignored
`artifacts/` and the session scratchpad). Once approved, it replaces the remaining parts of Phases
5–7 of the plan as described in "How this changes the plan".

## The problem, measured

| What the owner felt                    | What the phone audit measured on `release/1.0`                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Too many events, and they don't matter | 9.9 key moments a match (2–14). Only **11.7%** change the score; **49%** end with nothing visible (no shot, goal or card). The game's own "Best value" pick succeeded in 9 of 45 decisions.                     |
| The match view is cluttered and random | The pitch is 29% of the screen (356 × 246 px). 22 tokens of 17–20 px; **7.5 of 22 overlap** another on average; 4–7 name tags per decision camera, colliding. No visible lane, carrier or target.               |
| Too much reading and menus             | A decision panel is 1,025 px and 153 words (the third choice is below the fold); an outcome panel of 810 px follows every moment. The hub has 17 cards and 580 words; the report 6,000+ px. 26–28 taps a match. |
| Unclear what to do next                | Kick off leaves the match paused; a stale week-1 task still shows in week 3; 4–7 taps from the hub before the ball moves.                                                                                       |
| Progress feels invisible               | Level 2 after 5 matches (about 25 minutes). The report never shows an attribute or overall change; overall 25 → 26 is never mentioned; spending a point has no motion.                                          |
| Performance and feel                   | 60 fps during play, but hub ready in 3.9 s and Continue 5.1 s (scaled). Only 3 `:active` rules in the app: most taps give no press feedback. Long tasks of 430–465 ms at kick-off and report.                   |

Also found: after the app is reopened, Play matchday shows **last week's report** and re-opens the
level-up dialog ("+5 to spend" after spending them), and a new player's **first match can start on
the bench** with no moments at all.

## The experience we are building

Target feel: **EA FC Player Career** — your player is the star. Above all, **pride in growth** and
**a career story**.

1. **The 2–3 minute match** is a highlights reel. Dead play is a fast ticker (score, clock,
   momentum wave). Only your **4–6 decision chains** and the goals play, as slowed clips on a zoomed,
   clean pitch.
2. **Each chain** is 2–3 linked one-tap decisions in one phase of play (receive → beat your man →
   finish), with the stakes stated before the first tap and every outcome explained in one line.
3. **Every outcome is earned and honest**: displayed odds are the real odds. Bad luck is answered by
   better situations, stated openly, never by bending the dice.
4. **Tension follows a curve**: an early chance, a swing in the second half, and in a close game a
   climax chain at 82′–90+3′ ("Winner on the line").
5. **Peak, then growth**: the report opens on the score, your rating rolling up and your moment
   tiles; then a growth beat — XP fills, attributes tick, your player card moves.
6. **The 10-minute session** is three matchdays joined by a three-tap loop (Continue → Play → Kick
   off), at most one story card between matches, and natural stopping points.
7. **The hub is one decision**: Play or Simulate, at most two "Needs you" items and one growth strip.
8. **The season** runs in three chapters: a preseason promise, a mid-season twist, a finale.
9. **The career** is told through ten milestone scenes and a recurring cast of five people who
   remember what you did; your player card climbs Bronze → Silver → Gold → Elite → Icon.
10. **Ethical by construction**: no timers, streaks, energy or paid currency; celebrations are
    spent only on what was earned.

## 1. The match

### 1.1 Decision chains (engine)

`match-22` has not shipped, so chains are built **into `match-22`** (no new engine id);
`match-21` sessions keep finishing under their own rules.

- **A chain** is up to three steps in one phase of play: **read** (first touch, body shape,
  positioning — the 5.2 reads become this visible first step), **action** (beat your man, pass,
  carry, step in or hold), **finish** (placement, final ball, block, dive or smother). Each step's
  result changes the next step's options and odds, visibly. A failed step ends the chain with its
  declared consequence (they break 3 v 2, a corner, a booking).
- **Chains a match:** ST 5 (4–6), LW/RW/AM 5, CM 5, DM 4–5, LB/RB 4–5, CB 4, GK 4 (+ the
  shootout), off the bench 2–3. 60% have two steps, 40% three; the climax chain always has three.
  That is 10–14 one-tap decisions perceived as 4–6 moments.
- **At most 3 options a step**, 2 where the read is genuinely binary.
- **Same expected goals, fewer and bigger moments:** chains carry the player's share of team xG
  (attacking chains start at 0.15–0.25 xG); the 10,000-match distribution must hold.
- **An honest director:** a **hero beat** (play 60+ minutes → at least one high-value chain); a
  **close-game climax** (within one goal from 75′ → the last chain at 82′–90+3′, 30% in added
  time); a **drought director** (three matches without a positive chain → better starting
  situations next match, said on the pre-match card: "Coach: they'll leave you more space"). The
  displayed odds never change.
- **Defenders and keepers get heroics**: three-step last-ditch blocks, one-on-ones, penalties, and
  climax chains when protecting a lead.
- **"Best value" never sits on a long shot**: options are labelled by outcome band — _Likely_
  (≥ 65%), _Even_ (40–64%), _Long shot_ (< 40%) — and the value hint is folded into "Why?".

**Gates (asserted in the match profile, both seeds):** best-minus-worst ≥ 0.12 goals a chain and
≥ 0.6 goals a match; no option best in more than 60% of its step's instances; steps 1–2 with the
best option succeed 60–75%; finishing steps 30–50%; a chain ends positively 50–60% on average
(≥ 65% with best play, ≤ 35% with worst); 85–90% of matches have at least one positive chain;
rating mean 6.6–6.9 and spread 0.8–1.0; striker goal involvement about 0.55–0.75 a match; goals
per match, home advantage and upsets in their current bands.

### 1.2 The ticker between chains

- No pitch while play is dead. A scoreboard (marks, score, clock, added-time board), a **momentum
  wave** of the last 20 minutes (Sofascore-style) and **event chips** that slide in (shot, card,
  substitution, injury), at about 2–2.5 game minutes a second (about 40 s of ticker a match).
- **Anticipation before every chain** (1.2–1.5 s): the wave spikes, the crowd swells, "Chance
  building…" pulses.
- **Every goal is seen**: goals without the player play as a 3–4 s clip; other chances stay chips.
- One control: **Skip to next moment**. The 1×/2×/4× speeds go; the full commentary moves to a
  **Match log** tab.

### 1.3 Clips that read as football on a phone

- **A vertical pitch in portrait**, attacking upward; a camera framing about 35 × 30 m that follows
  the ball. Landscape and desktop keep the horizontal pitch.
- **A cast of at most 7** (you, your direct opponent, 1–2 teammates, 1–2 defenders, the keeper) as
  24–26 px tokens in high-contrast team fills; up to 4 context players as faint 16 px ghosts;
  everyone else hidden.
- **Labels:** a gold **YOU** always; the direct opponent's name on step 1 only (the matchup is the
  read); shirt numbers otherwise. No other name tags.
- **Choice arrows** only while deciding, numbered to match the buttons; an 8 px ball with a short
  trail; the shot path drawn on the outcome.
- **Timing:** lead-in 2–2.5 s, the decisive touch in 0.35–0.4× slow motion for 0.6 s, an 80–120 ms
  hitstop on the shot, outcome 1.2–1.5 s, settle 0.4 s. A chain takes 15–25 s with decisions. Tap
  to skip to the outcome.
- **The continuous 22-player playback is removed**, which also frees the Matchday bundle (295.9 of
  300 KB). The clip renderer reuses the tactical camera's cast and arrows, the replay frames and
  the highlight code, drawn in Pixi (not a per-frame React SVG).

### 1.4 The decision card and the outcome beat

- **Fits one screen with the clip**: a stakes header of at most 12 words (`88′ · 1–1 · Ball over
the top — winner on the line`), progress pips (● ○ ○), and per option: a verb of at most 3 words,
  one percentage naming its outcome ("Goal 34%"), the band, and the declared risk on failure ("If
  blocked: they break"). At most 20 words in total. "Why?" (tap or long-press) holds the factors.
- **The outcome is an inline beat**, not a panel: the clip plays, a ✓ or ✗ and one cause line
  ("Keeper's reach beat your placement · 31%"), then play moves on by itself.
- Taps are ignored for 300 ms when a new step replaces the card, so a fast tap never lands on the
  wrong option.

### 1.5 Before, during and after

- **Pre-match is one screen**: the opponent, form, a stakes line, **one** objective, a role chip
  with the manager's default, and **Kick off — which starts play**. Weather and line-ups sit behind
  "Details".
- **Half-time** is one manager card with two options (the default pre-selected); touchline
  interrupts (knocks, substitution responses, captain calls) at most one a match, inside the chain
  budget.
- **The first two fixtures never bench a new career**, and the first match always has a chance in
  the first 15 minutes.
- **Simulate** resolves chains from your Decisions and Composure (6.3); **Watch highlights** plays
  the same reel in about 60 s without decisions (also the simulation-only accessibility mode). The
  best chain of each match is saved to Moments.
- **Big matches** (finals, derbies, deciders): one extra chain, a walk-out sting, a louder crowd.

### 1.7 The chain interface (engine ↔ screen)

The engine (X1a) and the match screen (X1b) are built in parallel against this contract. Names
may be refined, but the shape and meaning may not change without updating this section.

```ts
// src/engine/match/types.ts — match-22 only (a match-21 session has none of these).
interface ChainState {
  id: string; // stable within the session, e.g. `${minute}-${index}`
  kind: 'attack' | 'defence' | 'set-piece' | 'keeper' | 'shootout';
  minute: number;
  addedTime?: number; // minutes into added time, when it falls there
  side: 0 | 1; // the side in possession when it starts
  steps: 2 | 3; // planned length
  step: number; // 0-based index of the current step
  stakes: { key: string; params: Record<string, string | number> }; // i18n header line
  prize?: number; // starting xG (attack) or danger (defence) for the stakes header
  climax?: boolean; // the close-game climax
  hero?: boolean; // the hero beat
  results: ChainStepResult[];
}
interface ChainStepResult {
  step: number;
  choiceId: string;
  probability: number; // as displayed
  success: boolean;
  cause: { key: string; params: Record<string, string | number> }; // the one-line reason
}
interface ChainSummary {
  id: string;
  kind: ChainState['kind'];
  minute: number;
  addedTime?: number;
  outcome: 'goal' | 'assist' | 'chance' | 'stop' | 'won' | 'lost' | 'conceded' | 'foul' | 'card';
  positive: boolean; // counts toward "a positive chain"
  results: ChainStepResult[];
}
interface ChainCast {
  you: Id;
  opponent?: Id; // the direct opponent, named on step 1
  teammates: Id[]; // 0–2
  defenders: Id[]; // 0–2
  keeper?: Id;
  ghosts: Id[]; // 0–4 context players, drawn faint
}
// MatchState gains:  chain: ChainState | null;  chains: ChainSummary[];
// KeyMoment (one step) gains:  chainId: string; step: number; steps: 2 | 3; cast: ChainCast;
// MatchEvent kinds gain 'chain-start' and 'chain-end' (with chainId; chain-end carries the outcome).
// Commands are unchanged: `choose` answers the current step; `advance` moves time.
// Each step's resolution emits its passage (keyframes) through the existing applyPassage, so the
// clip renderer draws a step from the same frames the replay uses, filtered to the cast.
```

### 1.6 The storyboard (striker, about 2:50, 12 taps)

| Time      | Beat                           | Taps |
| --------- | ------------------------------ | ---- |
| 0:00–0:10 | Pre-match, Kick off            | 1    |
| 0:14–0:22 | Ticker 1′–13′                  | 0    |
| 0:24–0:44 | Chain 1 (14′, 2 steps)         | 2    |
| 0:44–0:56 | Ticker; their goal (clip)      | 0    |
| 0:56–1:14 | Chain 2 (38′, defensive)       | 2    |
| 1:14–1:22 | Half-time card                 | 1    |
| 1:30–1:55 | Chain 3 (62′, 3 steps) — GOAL  | 3    |
| 2:05–2:30 | Chain 4, climax (88′, 3 steps) | 3    |
| 2:38–2:48 | Full time → report             | 0    |

## 2. Growth you can see

- **The player card is the hero object**: avatar, overall (OVR), position, club crest and a tier
  — Bronze < 55, Silver 55–69, Gold 70–79, Elite 80–87, Icon 88+ (calibrated so a typical career
  crosses a tier about every two seasons until its prime). It appears on the hub, the report, the
  profile and share cards, and changes visibly when it moves.
- **A growth beat after every match** (4–6 s, skippable): the XP bar fills, 1–3 attribute ticks
  with their source ("Finishing 62 → 63 · trained"), and the OVR or tier change when there is one.
  Attribute bars show **fractional progress** to the next point.
- **One "next milestone" line** always on the hub: "OVR 66 → 67: 340 XP", "Silver card at 55", "2
  goals to 10 this season", "4 to the club record".
- **Level-ups scaled to their meaning**: a toast for XP and levels; a sheet for points with
  **Coach's plan** pre-selected (one tap) or Customise; a full-screen ceremony only for an OVR
  change, a new tier, a new skill or a milestone, at most one a session. A **steeper XP curve**:
  early levels every 2–3 matches (level 2 after match 1), prime levels every 5–6.
- **Skills as identity**: the branches become named archetypes ("Poacher", "Playmaker",
  "Stopper", "Shot-stopper"…) with a rank; a clip labels the skill that unlocked an option.
- **Three goal layers instead of nine**: one match objective; the season contract (one manager
  target, one personal ambition); a career goals board with three pinned goals. Daily and weekly
  challenges retire (D5).
- **A season-end recap** of 30–45 s story cards: OVR then and now with the card flip, the best
  chain clip, three stats, the rival, the chapter title, next season's goal.
- **A squad status ladder** (Youth → Backup → Rotation → Key → Star → Captain → Legend) and "You at
  17 / you now" on the profile.

## 3. Your career story

- **A recurring cast of five** — manager, mentor (a veteran teammate), agent, a named journalist,
  a family member — plus the rival; procedural portraits; at most two lines and one appearance a
  week each.
- **Story cards**: a portrait, at most 25 words, two choices of at most 6 words each with
  consequence chips ("Manager trust ↑ · Fans ↓"). At most one between matches (about 8–12 a
  season). Press conferences become story cards; routine press is answered automatically.
- **Memory**: every choice writes a lasting fact, and at least 30% of story cards and headlines
  refer back to one ("You promised me ten goals in August. That's eleven.").
- **A season in three chapters**: the preseason promise; a twist at 40–60% of the season (a rival's
  move, a new manager, an injury scare, a contract year, losing your place); the finale (title
  race, relegation or cup final, as big matches). Chapter cards are also natural stopping points.
- **Ten milestone scenes**: debut, first goal, first start, promotion, first cap, first trophy,
  100 appearances, captaincy, the dream move, retirement — full-screen cards with Share, feeding
  the Chronicle.
- **The rival as a weekly foil**: one line on the hub when something changed; headlines compare
  you.

## 4. One next action, less reading

- **The hub's first screen has three blocks**: the **next match** (stakes line, **Play** and
  **Simulate**), **Needs you** (0–2 one-tap items, hidden when empty, stale items expire) and the
  **growth strip** (card, OVR, next milestone, season contract). Below: the story feed (last three
  items), the goals board, a five-row league snippet. At most 60 words on the first screen.
- **Five stable tabs on phones**: Home, Player (profile, skills, training, wardrobe), Story (feed
  merging inbox and media, Chronicle, Moments, trophies), Club (squad, table and fixtures,
  transfers with the agent, national team), More (lifestyle, settings, saves). The tab bar hides
  during a match.
- **Routine handled for you**: a default training plan applied automatically; routine press
  answered; declined offers in a weekly digest; weeks with no match and nothing needing you skipped
  by Continue into a three-line digest.
- **An express path**: when nothing needs you, the growth beat offers **Next match ▶** straight to
  the pre-match screen. Two to five taps from one match to the next.
- **"Previously…"** on opening the game: one line ("1–1 at Matlock, you scored. Next: Cup R3, Sat.")
  and Play.
- **Word budgets**: decision card 20, story card 40, report first screen 40, hub first screen 60.
- **Quick start and a debut that lands** (6.1, 6.2): the world builds in the background, the seed
  moves to Advanced, and match one ends in a level-up.

## 5. Feel and performance

- **Motion tokens** in the design tokens: press feedback (scale 0.96 within one frame), enter 220
  ms (fade and 8 px rise, emphasized-decelerate), exit 160 ms, bottom sheets on a spring, list
  stagger 30–40 ms, number count-ups (700–1,000 ms), XP bars by `scaleX` (800 ms), a level-up
  sequence (anticipation → burst → reveal → settle), and a goal sequence (hitstop → slow motion →
  net ripple → small camera shake → banner → confetti in team colours, drawn in Pixi).
- **Every tap answers within 16 ms visually and 100 ms in effect**; anything slower shows a
  skeleton; choices and point allocations are optimistic.
- **Sound**: a crowd swell before each chain, a tick on decisions, success and failure stings, a
  goal roar. **Haptics** on Android through the platform adapter (iOS web has none), with their own
  setting.
- **Reduced motion**: opacity only, at most 150 ms, no shake or slow motion; a clip becomes three
  stills with arrows.
- **Performance targets on a mid-range phone**: interaction to next paint p75 ≤ 200 ms; no long
  task over 50 ms during a clip; 60 fps clips; hub ready ≤ 3 s and Continue ≤ 3 s. Means: the clip
  renderer replaces continuous playback; the match chunk and Pixi are prefetched while the hub is
  idle; below-the-fold hub sections use `content-visibility`; long lists are virtualised; the hub
  renders from a cached summary while the world loads; no `backdrop-filter` or animated shadows on
  phones; the missing `pitch_fps` analytics event is added.

## 6. Ethics

No energy, wait timers, login rewards, losable streaks or paid currency; cosmetics earned through
play only; no guilt copy for returning players. Retention comes from story and growth: the
"Previously…" card, the next milestone, chapter cliffhangers.

## How this changes the plan

New phases replace the remaining work of Phases 5–7. Phase 8 (the world, in progress) and Phase 9
(launch) are unchanged.

| New phase                   | Contents                                                                                                                                                                                                     | Replaces or absorbs                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **X1 The match, rebuilt**   | 1.1–1.6: chains and the director in `match-22`, the ticker, the clip renderer (vertical pitch, cast of 7), the decision card and outcome beat, pre-match and half-time, Simulate and Watch highlights, gates | The rest of Phase 5; 6.3 (simulate a match)     |
| **X2 Growth you can see**   | Section 2                                                                                                                                                                                                    | 7.2 (goals, status), 7.4 (skills)               |
| **X3 Your career story**    | Section 3                                                                                                                                                                                                    | 7.5 (story content), 6.7 (press)                |
| **X4 One next action**      | Section 4                                                                                                                                                                                                    | 6.1, 6.2, 6.4, 6.5, 6.6, 6.9                    |
| **X5 Feel and performance** | Section 5, plus the bundle and load-time work                                                                                                                                                                | The planned budget step; Phase 3's open targets |
| 7.1 Fair honours, 7.3 Money | As planned; 7.1 becomes a dependency of X1 (highlight-based chances raise the player's goal involvement, which feeds awards and the Hall of Fame)                                                            | —                                               |

**Order:** X1 and X5's performance groundwork first (the match is the core loop and frees the
bundle), then X4 with X2 (the loop between matches), then X3, with 7.1 alongside X1. The two bugs
found by the audit (stale report and repeated level-up after reopening; a benched first match) are
fixed in X1 and X4.

**Spec changes in AGENTS.md** (owner decisions): key moments become 4–6 decision chains (was 6–15
single moments); the live match shows a highlights reel with a ticker and a "Skip to next moment"
control (was a continuous pitch with 1×/2×/4× speeds); the commentary feed becomes a Match log.

**Validation:** PostHog measures match duration (target 150–180 s), decision time (median 4–6 s),
skip rates, session length and matchdays a session; 5–8 newcomer playtests include the recall
question "name a moment from your last match".

## Risks

1. **Fewer moments make each one weigh more**, luck included: keep 5.3's par and asymmetric credit,
   assert the rating spread, and credit successful steps even when the finish fails.
2. **The director must stay honest**: it changes situations, never odds; it is documented and
   announced. If it feels rigged in playtests, it is switched off — the hero beat alone suffices.
3. **Highlight bias inflates the player's numbers** (goals, assists → awards, Hall of Fame): 7.1's
   per-line, tier-weighted normalisation becomes a dependency; re-run the 10,000-match and career
   gates.
4. **Realism versus pace**: a 2–3 minute match cannot show build-up, so the 2 s lead-in, a coherent
   cast and the vertical camera carry it. Prototype on a phone before tuning numbers.
5. **Decision time**: three steps of three options could exceed 8 s; enforce the word caps and use
   two options where possible.
