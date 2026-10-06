# Milestone 4: the career player

## Scope

AGENTS.md §6 and milestone 4: career creation, attributes, match XP, level-ups with attribute allocation, weekly training, a skill tree of about 40 traits, and the ageing curve. Goalkeepers are fully supported. Scheduled fixtures of the career player's club are played interactively and committed exactly once. Contracts, agents, transfers, media, relationships, fame systems and retirement belong to later milestones and are not started.

## Design

**Career record.**

- `World.career` holds the career: player id, archetype, level, XP, attribute and skill points, unlocked skills, training plan and progress, injury, revealed hidden attributes, and a compact per-match history.
- The player is an ordinary entry in `world.players` and their club's squad, so background fixtures, tables, statistics and squad views work unchanged.
- Keeping the career inside `World` lets the simulation worker apply training, ageing and recovery each week without a second transfer channel.
- Unlocked skills are mirrored into `player.traits`, which the match engine already reads by exact id.

**Creation.**

- A wizard chooses name, appearance (every avatar layer), nationality (six countries), primary position including goalkeeper, preferred foot, age 16–18 and a starting archetype. Archetypes set the starting attribute profile, potential band and first unlocked skill.
- The player then picks one of three trial offers from semi-professional clubs at the bottom simulated tier of their chosen country, matching AGENTS.md §1.
- A career starts in a newly generated world (seeded) or in the currently loaded world if it has no career yet.

**Single commit path.**

- When the career player's club has an unplayed fixture in the current week and the player is available, advancing the world stops at that matchday.
- The fixture is played with the interactive engine. Its setup carries the real fixture id, neutral venue and competition.
- At full time `commitCareerMatch` writes the result once: score, scorers, standings, appearances, minutes, clean sheets, form and fatigue, plus the career XP and progress.
- Knockout fixtures, and deciding legs of ties level on aggregate, resolve extra time and penalties with the background rules from a seeded stream.
- The background resolver only plays fixtures without a result, so a committed fixture is never resolved twice.
- An injured player misses the match, and the fixture is simulated normally without XP.
- Season simulation can auto-play career fixtures through the same engine and commit path, using a headless decision policy.

**XP and levels.**

- Base match XP comes from the existing report: minutes, rating, goals, assists and objectives.
- The career multiplies it by opposition strength, relative to the player's own club, and match importance: league, cup, playoff, final.
- Level thresholds grow geometrically. Each level grants attribute points; skill points arrive on a slower cadence.

**Soft caps.**

- Raising an attribute costs 1 point below its age-adjusted cap, 2 within five points above it, and 3 beyond. 99 is the hard maximum.
- The cap is the player's potential, plus any positional emphasis, scaled by that attribute category's age curve. A 17-year-old cannot max out physical attributes immediately.
- Physical attributes cost one extra point from age 29.

**Training.**

- The weekly plan has three sessions, each with a focus: an attribute group, one attribute, or a position to learn. Intensity is low, normal or high, and an optional extra session with a mentor (the best teammate for that focus) is available.
- Sessions add fractional progress to attributes, subject to the same soft caps, and familiarity for positions. They also cost fatigue.
- High intensity raises gains, fatigue and injury risk. Injuries have realistic types and durations, a recovery choice (rush back with re-injury risk, or full rehab) and a rare career-threatening tail.

**Skill tree.**

- About 40 skills across branches: finishing, creativity, dribbling, defending, physical, mental and leadership, set pieces, and goalkeeping.
- Each skill has prerequisites, a point cost, small attribute bonuses and a trait id used by the match engine. Some unlock new key-moment choices through `requiredTraitId`.

**Ageing and development** (career and AI):

- Each attribute category follows an age curve. Physical attributes peak around 24–27, with pace and acceleration declining first. Technical attributes peak around 26–30. Mental attributes keep rising into the early thirties. Goalkeeping attributes peak later.
- AI players develop toward an attribute target: their peak profile (potential, positional emphasis and a stable per-attribute offset derived from the player id) scaled by the curve. Generation places players on the same curve, so the world starts at equilibrium and no longer drifts upward.
- Older worlds are recalibrated once: each player's potential is re-estimated from current ability and age.
- The career player does not develop automatically. Ageing still lowers attributes that sit above their age-adjusted cap.

**Lifecycle exclusion.** The AI lifecycle never retires, releases, trims, exchanges or re-contracts the career player. Their contract runs until milestone 5.

**Persistence.** File schema 7 adds optional `World.career` and `World.developmentVersion`. Validation covers every career field, the injury link and the skill catalogue. Saving a world with a pending unplayed career fixture is allowed. A match session is cleared once committed, so a finished career match never sits beside a world that already contains its result.

**UI** (new screens use Tailwind utilities and the shared tokens):

- Career wizard (`/career/new`).
- Career hub (`/career`): next match, player card, season stats, form and fitness, training summary, last result.
- Profile with attribute allocation and history (`/career/profile`).
- Skill tree (`/career/skills`).
- Training (`/career/training`).
- Matchday plays career fixtures and its report shows granted XP with an animated level-up.
- Everything is keyboard operable and localized, and the existing friendly mode remains for worlds without a career.

## Implementation checklist

- [x] Ageing curves, attribute targets, AI development rewrite, generation on-curve, one-time recalibration; drift test over several seasons.
- [x] Career types, archetypes, skill catalogue, creation, XP/levels, allocation costs, skills, training, injuries; unit tests.
- [x] Commit path, extra time/penalties, auto-play policy, week hooks, lifecycle exclusion, worker stop-at-matchday and auto-play; double-count and conservation tests.
- [x] Schema 7 validation and migrations; save/load/export tests.
- [x] Screens, routing, navigation, i18n, accessibility; three-browser Playwright career journey.
- [x] Docs: architecture, balancing, decisions, verification, README, handoff.
