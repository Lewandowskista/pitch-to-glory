# Milestone 8: national team, continental cups, awards, retirement, legacy, Chronicle and Moments

## Scope

AGENTS.md §5 (continental competitions), §8 (national team, awards, retirement) and §9: the Career Chronicle (1), the persistent world and legacy (2), the rival in awards (3), and Moments (7). Edit mode, accessibility pass, the tutorial and audio belong to milestone 9 and are not started.

## Design

**Continental cups (national worlds).**

- Two cups each season: the Champions Cup and the Shield, with names from `identities/continental.ts` (fictional or referenced, by identity version).
- Each cup has 32 clubs, qualified from the previous season's top-flight tables. Places per country are in `CONFIG.world.continental`: Champions Cup 6/6/6/5/5/4 for England/Spain/Italy/Germany/France/Portugal, then the Shield takes the next clubs. Reserve sides never qualify. A club relegated since the table was drawn still plays, as in real football. A brand-new world qualifies clubs by reputation.
- The group draw: four pots by reputation, eight groups of four, and clubs of one country kept apart. If 50 seeded attempts fail, the separation rule is relaxed.
- Six group matchdays (weeks 8–30). Then a round of 16 (group winners against the runners-up of a neighbouring group), quarter-finals, semi-finals and a one-off final at a neutral ground (weeks 38–55). Ties use the existing extra-time and penalties resolver.
- Group tables are derived from results, so there is no second standings record to keep in step.
- Playing in a continental cup adds 0.2 to scouting visibility.
- Legacy-format worlds keep their original rules and have no continental cups. National worlds saved before this milestone gain the cups from their next season.

**National team.**

- Six home nations (the world's countries, in their colours) and twenty guest nations, with real names in identity-version-2 worlds and fictional names otherwise.
- Three international windows per season, each with two matches. In every window, the career player's country names Under-19, Under-21 and senior squads of 23 (3 goalkeepers, 8 defenders, 7 midfielders, 5 attackers). Selection weighs ability, form and fame.
- The player is called up at the highest level they make. Their minutes, goals and assists come from their line and starting chance. Caps and goals add fame and XP and write Chronicle entries; a call-up arrives in the inbox.
- Tournaments every two years, between seasons: continental in years divisible by four, world in the others. Sixteen nations play four groups of four, then quarter-finals, semi-finals and a final. The player goes if they are in the senior squad. How far their nation got is recorded.

**Awards.**

- Awards follow the career, so the weekly cost stays bounded. Player of the month is awarded every five weeks in the career player's league, from rating, goals and assists over the month (at least two appearances).
- At season end, in that league: Golden Boot, league MVP, and Team of the Season (4-3-3 from season scores, at least ten appearances).
- Young Player of the Year (21 or under) is chosen among players of the career player's nationality.
- Club trophies won while at a club go into the player's cabinet.
- The Golden Ball has a world-wide shortlist of ten, drawn from top-division players plus the career player and the rival, so the two are always compared. Scores add bonuses for a league title, a top-four finish, the continental final or win, and an international tournament win.
- The Trophy cabinet has a ceremony screen. It reveals the shortlist from tenth upwards, then the winner on request, and states where the player and the rival finished. Because the ceremony lives in the URL, back closes it.
- World records (most goals in a season, most career goals, most Golden Balls) are kept and announced when broken.

**Retirement and legacy.**

- From age 32 the player can retire once the season is complete. At 40, the season rollover retires them.
- A legacy record keeps:
  - clubs, numbers, trophies, awards and records broken;
  - peak ability, fame, earnings and savings;
  - teammates;
  - a Hall of Fame score and rank among every player the world remembers (active, retired and archived).
- The retired player stays in `world.players` and is never pruned. The Chronicle, Moments, awards and trophies stay as well.
- The career's own records are cleared: agent, offers, relationships, inbox, media, sponsors, challenges, call-ups.
- A new career can start in the same world. Alternatively, the player's child can start, with the surname, nationality and colouring, +3 potential, 10% of the parent's fame (at most 30), and 10% of their savings. Each legacy has one child.
- When a club changes manager, a retired former teammate aged 34 or over may take the job (40% chance).

**Career Chronicle.**

- Dated entries are written as things happen: the start (or the start as someone's child), debut, first goal, hat-tricks, goal and appearance milestones, moves, long injuries, trophies, awards, call-ups, first caps and international goals, tournaments, finishing a season ahead of the rival, fame levels, records, moments and retirement.
- The Chronicle page reads as a biography grouped by season, with a season stat line. Each entry is illustrated with the player's portrait at that age, or the club crest for moves and trophies.
- "Export as image" draws a 1080×1350 poster (portrait, numbers, highlights) as SVG, then turns it into a PNG with a canvas. The PNG is shared through the Web Share API where it can share files, and downloaded otherwise.
- The Chronicle holds 600 entries per player. Routine entries go first, then the oldest; the start is always kept.

**Moments.**

- Late winners and equalisers (85th minute on), hat-tricks, goals in finals and long-odds finishes (20% or less) are saved from the player's matches, played or auto-played. At most two per match; the newest 40 are kept, and a Chronicle entry whose moment was dropped loses its link.
- A clip is three keyframes (before the strike, the strike and the ball in the net) of the ball and all 22 players, quantised to bytes and stored base64url: about 190 characters.
- A share link puts the clip, labels and match seed in the URL hash, so the replay at `/moment#…` works without a save, offline, and without sending anything to a server. The link is shared with the Web Share API, or copied. The replay page checks every field and shows an error for a damaged link.
- Replays interpolate the keyframes on an SVG pitch. Under reduced motion, the replay button steps through the keyframes instead.

**Persistence.**

- File schema 12 adds:
  - `Career.honours`;
  - `World.international` (nations, matches, tournaments);
  - `World.awardState` (season and month baselines);
  - continental cups in `World.competitions`;
  - the now-filled `nationalTeams`, `callUps`, `awards`, `records`, `legacies`, `moments` and `chronicle`.
- A schema 11 career migrates with empty honours, the nations and the award baselines.
- `honoursValidation.ts` checks every record:
  - clips decode;
  - award winners exist or are archived;
  - a legacy's child is a real player;
  - a world without a career may hold legacies.
- `nationalWorldSchema.ts` checks the continental draw, the 96 group fixtures, that each knockout field is a subset of the previous stage, and the winner.

**UI.**

- New routes: National team (`/career/national`), Trophies (`/career/trophies`, with `?ceremony=`), Chronicle (`/career/chronicle`), Moments (`/career/moments`), Legacy (`/career/legacy`), and the public replay (`/moment`).
- The career navigation is grouped into Career, Club, Off the pitch and Honours. The groups wrap on desktop and scroll on phones; arrow keys move across every link.
- The hub has an Honours card with trophies, awards, caps, and the retirement choice with a confirmation dialog.
- When a world has no career, the career pages show the last legacy and the two ways to continue. The new-career wizard accepts `?parent=` and shows who the player is the child of.
- The World screen lists continental cups, with "Group stage" as the label for the groups.

## Implementation checklist

- [x] Continental cups: qualification, draw, groups, knockouts, rollover and validation.
- [x] Pure honours engine (Chronicle, Moments, international, awards, retirement, week hooks, actions); hooks in the weekly step, the commit path, season end, rollover, moves, injuries, fame and the rival.
- [x] Schema 12, migration and validation.
- [x] National team, Trophies with ceremony, Chronicle with export, Moments with sharing, Legacy, public replay, hub card, wizard and empty states, grouped navigation, routes and i18n.
- [x] 19 honours unit tests and a three-browser honours journey with axe checks and phone-width checks.
- [x] Docs.

## Known limits

- Continental cups exist only in national worlds. Legacy-format worlds keep their original rules.
- International matches are simulated with a Poisson model from squad ratings, not played on Matchday. Tournaments are played between seasons.
- Clips hold three keyframes, so a replay sketches the goal's movement rather than replaying every pass.
- The exported poster uses the system sans-serif font, because an SVG drawn into a canvas cannot load the page's self-hosted fonts.
- Award shortlists rank players from season statistics; there are no voting juries.
