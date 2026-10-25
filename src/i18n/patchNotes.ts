/**
 * Player-facing patch notes: the one source of truth for the What's new screen and
 * CHANGELOG.md (`npm run changelog`). Newest first. Every deploy of `main` is a release, and
 * `npm run check:release` fails unless `package.json`'s version is the first entry here
 * (docs/RELEASING.md).
 *
 * Write for players: what they will see or feel, in British English. No code names, internal
 * milestone or phase numbers, or file names. Sections are optional, but never empty.
 */
export interface ReleaseNotes {
  /** Semver `major.minor.patch`. */
  version: string;
  /** Release date, ISO `YYYY-MM-DD`. */
  date: string;
  /** A short name for the release. */
  title: string;
  /** One sentence. */
  summary: string;
  new?: readonly string[];
  improved?: readonly string[];
  fixed?: readonly string[];
}

export const RELEASE_SECTIONS = ['new', 'improved', 'fixed'] as const;
export type ReleaseSection = (typeof RELEASE_SECTIONS)[number];

export const PATCH_NOTES: readonly ReleaseNotes[] = [
  {
    version: '0.10.0',
    date: '2026-10-25',
    title: 'Help shape the game',
    summary:
      'Anonymous play statistics now help balance and speed up the game, and after your first match you can choose to share more. Settings and a new Privacy page put you in charge.',
    new: [
      'After your first match you can choose to share how you play over time, to help shape the game. It stays off unless you say yes, and you can change your mind in Settings.',
      'A new Privacy page explains in plain words what the game shares, what it never shares, and how to switch it off.',
      'Settings has a Privacy card with a switch for each kind of sharing.',
    ],
    improved: [
      'Anonymous play statistics, such as how key moments turn out and how fast Continue runs, now help us balance and speed up the game. They are never linked to you, and you can turn them off in Settings.',
    ],
  },
  {
    version: '0.9.1',
    date: '2026-10-25',
    title: 'Safe hands',
    summary:
      'Saves that can no longer be lost to a changed clock, a recovery copy for any save that won’t load, tournaments that always crown a winner, and clearer key moments.',
    new: [
      'A save that won’t load can now be downloaded as a recovery copy, from its slot or before you delete or replace it.',
    ],
    improved: [
      'Key-moment choices are now rated on their chance alone, show a skill that helps as its own tag, and say what each percentage means, such as “4% to score”.',
      'The live scoreboard keeps club names whole, shortening long ones or showing the club’s initials, and the match status no longer covers the away side.',
      'Inbox messages now link to where they are settled: dressing-room stories to your hub, selection news to Club life, and plain news has no button.',
      'Keyboard focus shows a gold ring on the green panels, so you can always see where you are.',
      'The season review compares keepers and defenders with their rival on clean sheets, and everyone else on goals and assists.',
    ],
    fixed: [
      'A save could become unreadable after your device’s clock was changed. It no longer can, and saves already affected load again.',
      'A drawn international knockout now always goes to penalties, even if you were substituted or sent off, so every tournament crowns a winner.',
      'Retiring during a summer tournament no longer hands your squad place, matches or caps to your next player or your child.',
      'Your child’s trophy cabinet, Chronicle and national team page no longer show their parent’s tournaments and international matches as their own.',
      'You can now name your child exactly after their retired parent.',
      'Agreeing a free transfer now closes contract talks at your club, and signing a new contract cancels a free move you had agreed.',
      '“Late winner” and “late equaliser” headlines now appear only when your late goal decided the match.',
      'If the save system fails to start, the game now says your changes were not saved instead of failing silently.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-25',
    title: 'Pull on the shirt',
    summary:
      'Play your country’s qualifiers and friendlies yourself, keep your best international goals, and find a defensive midfielder’s and a keeper’s choices counting for more.',
    new: [
      'Play your international matches yourself: turn it on from the National team page, and when you start for the senior side its qualifiers and friendlies wait for you on matchday. Play them, or have the rest of the window simulated with you in it.',
      'National sides now have their own playing styles, as clubs do, so each opponent asks something different of you.',
      'Goals, saves and assists in your international matches are saved as Moments, and the Chronicle links to them.',
    ],
    improved: [
      'As a defensive midfielder, more of the opposition’s chances now come down to your key moments, so screening well keeps more goals out.',
      'As a keeper, your shot-stopping attributes count for more in your saves, so a strong keeper makes the difference more often.',
      'Your career hub, Matchday and late-career saves load noticeably faster, especially on phones.',
      'When a tournament is under way, the World screen offers to play it first and asks before simulating it.',
      'Matches already in progress when you update finish under the rules they started with.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-24',
    title: 'Defending that decides',
    summary:
      'At the back, your choices now decide more of the goals your team concedes, and your defending attributes count for more in them.',
    improved: [
      'Playing as a keeper, centre-back, full-back or defensive midfielder, more of the opposition’s chances come down to your key moments, and fewer are settled around you. Choosing well keeps more goals out; choosing badly lets more in.',
      'Your defending attributes count for more in tackles, interceptions, blocks and saves, so a strong defender reads the game better than a weak one.',
      'Matches already in progress when you update finish under the rules they started with.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-23',
    title: 'A career with a memory',
    summary:
      'Continue never lets a decision slip by, the football world remembers what you did, and every season starts with a briefing and an ambition of your own.',
    new: [
      'Continue stops for any decision that arrives or falls due: a transfer offer, a press question, the manager’s challenge, a story or a sponsor, so nothing lapses while you are not looking.',
      'Have routine press questions answered for you in a tone you choose. Questions about moves, rivals and your place always wait for you.',
      'The football world remembers: criticising your manager, asking to leave or missing a challenge limits how far they will trust you; declaring your loyalty makes the club keener to renew; your history counts towards the captaincy. The club page shows what is remembered and what it changes.',
      'Youngsters you mentor carry into your legacy, and may come back as managers in the world that follows.',
      'A preseason briefing each season: what the manager expects, the competition for your place, your development target, and an ambition for the season that is judged at its end.',
      'From 31, one late-career step a season: accept a smaller role, retrain for a new position, mentor the youngsters, or look for a club closer to home.',
      'Challenges that need match minutes say so, and while you are injured or out of the side you can swap one for a goal you can still reach.',
    ],
    improved: [
      'Stories now rest for a season or two before the same kind comes round again.',
      'The hub’s preview says which decision Continue will stop for.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-23',
    title: 'Choices with a cost',
    summary:
      'Opponents with a style of their own, a stronger foot, an ambition that wants something, weekly commitments that compete for your time, and clubs that can run short of money.',
    new: [
      'Every opponent plays a style. A pressing side puts you under pressure on the ball, a deep block crowds the box and leaves space at the edge, a passing side makes you defend, a direct side fights in the air. The briefing explains the matchup, and the odds show it as a named factor.',
      'Study the next opponent: a training session that halves what their style takes from your choices.',
      'Your stronger foot matters. A shot, cross or carry with your weaker foot costs odds, cutting inside onto your stronger foot helps, and each choice shows the foot it uses.',
      'Two-Footed, a new dribbling skill: no weaker foot.',
      'Once your ambition is revealed it becomes a stated wish (top-division football by 24, regular football, or roots at one club) that lifts or lowers your morale.',
      'Weekly commitments: up to three things outside training each week, from mentoring a youngster and sponsor appearances to community work, a team social, family time and extra rest. They repeat with your plan, and Suggest a week fills them for you.',
      'New sponsor deals ask for sponsor appearances.',
      'Your staff each offer two specialities to choose between: a physio for prevention or recovery, a nutritionist for recovery or endurance, a coach for development or extra sessions, an analyst for decision coaching or scouting.',
      'Clubs can run short of money. A club paying more than it earns signs no one, renews fewer players, offers less, is slower to renew your contract and gives weaker training support; the club page says so when it is yours.',
    ],
    improved: ['A match missed through a ban no longer counts against your playing time.'],
    fixed: [
      'A goalkeeper could run the ball upfield on the pitch when the teammates a move begins with had been sent off.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-22',
    title: 'The big occasions',
    summary:
      'Play extra time, take your own penalty, lead your nation through qualifying and play its tournament matches yourself, and get credit wherever you play on the pitch.',
    new: [
      'A level knockout tie now plays on into extra time on the pitch, with key moments of its own, and the shootout is settled in the match.',
      'Tournaments between seasons are played match by match. When you are in the squad, your nation’s matches wait for you: play them yourself or have them simulated.',
      'Qualifying: in the season before each tournament, nations play home and away in groups for a place in it, and your own nation can miss out. Called up to the senior side, you play its qualifiers.',
      'The National page shows your nation’s qualifying group, what each place means and its six matches.',
      'Sixteen more nations take part in qualifying.',
      'New Moments: assists, great saves, penalty saves, goal-line clearances and the save or kick that wins a shootout.',
      'New Chronicle landmarks: your first clean sheet and first assist and their milestones, and qualifying for a tournament or missing it.',
    ],
    improved: [
      'Keepers and defenders are compared with their rival by clean sheets, in the press and in the rivalry, rather than by goals.',
      'Tournament matches show their stage and importance and count towards your XP like any big match.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-21',
    title: 'One player, one job',
    summary:
      'Your match role follows the position you are actually played in, skills add up, the coach stops blaming bad luck, and you can see where your development comes from.',
    new: [
      'Transfer talks show the position you would play, your fit there, who is ahead of you and how often you can expect to start.',
      'The skill tree shows, choice by choice, what a skill adds to the skills you already have.',
      'Your profile shows where this season’s development came from: playing, training, points and skills, and what age took away.',
    ],
    improved: [
      'Fielded out of position, your role choices, objectives, involvement and half-time options follow the position you actually play.',
      'Squad role promises follow the competition for your place in the manager’s formation.',
      'Several skills covering the same likely choice now add up, instead of only the first counting.',
      'Training now shapes your player: the attributes your sessions focus on also grow faster from playing, and the rest a little slower. This starts with your next season.',
      'The coach recommends training only where your attributes hold you back, notes when other choices would have been better, and calls a run of misses at good odds what it is: bad luck.',
      'The post-match report loads in the background while you play, so the match screen opens faster.',
    ],
    fixed: ['A match could fail to start when a shot came before the opening kick-off.'],
  },
  {
    version: '0.3.0',
    date: '2026-10-20',
    title: 'Careers on your terms',
    summary:
      'A late career you shape with fitness, contract decisions that are always yours, and one fair Hall of Fame for every player and position.',
    new: [
      'Longevity: from your mid-thirties your attributes fall faster each season. Fitness skills, conditioning work and built-up stamina and strength push that back.',
      'Evergreen, a new physical skill that delays your late-career decline.',
      'A Longevity panel on your profile shows when decline will speed up and what is holding it off.',
      'When your contract runs out, interested clubs open talks and you choose. Agree nothing and you stay on a one-season deal, which the game confirms first.',
      'Contracts and contract talks now show the club’s option to keep you one more season.',
    ],
    improved: [
      'The Hall of Fame scores every player by the same rules: club numbers weighted by level, clean sheets for keepers and defenders, trophies, awards and caps.',
      'Season awards are given in every top-two-tier league, and young player of the year in every country.',
      'Players in other teams now win trophies and caps that count towards their Hall of Fame standing.',
      'Playing time now drives your development: a run on the bench slows your growth, while injuries and breaks do not count against you.',
      'Retirement is your choice until 38. Decline no longer ends a career by itself; the hub tells you when it is speeding up.',
    ],
    fixed: [
      'Your contract running out could move you to another club without your agreement.',
      'The shared Chronicle poster showed only a few caps for players with many internationals.',
      'A holiday or family time could fail to update your morale and rest on every screen.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-16',
    title: 'The redesign',
    summary:
      'A new look for every screen, new art for players and clubs, a richer live match that frames every key moment, and red cards with suspensions.',
    new: [
      'A new look for every screen in light and dark, with new navigation: a sidebar on wide screens, and a tab bar with a More sheet on phones.',
      'New player portraits dressed in your club’s kit, and a full-body figure in the Wardrobe.',
      'Redrawn club crests with divisions and founding years, and kits with named collars, the club badge and sponsor names.',
      'Real squad numbers: every player keeps a number at their club, shown on the pitch, in line-ups and on profiles.',
      'Logical build-up play on the live pitch: wing play, overlaps, switches of play, through balls, counter-attacks and cut-backs.',
      'Commentary that narrates the move as it is drawn, naming the passer, the receiver and the flank.',
      'A tactical camera that frames each key moment, names the players involved and marks your options on the pitch.',
      'New match stats: expected goals (xG), shots on target, key passes and a rating graph, with new heat, pass and shot maps.',
      '“Track the runner”, a new choice when you are defending an attack.',
      'A pass in a key moment now goes to the teammate you saw on the pitch.',
      'Your match objectives are previewed on the hub before matchday.',
      'Yellow cards, substitutions made by the managers, and a bench of seven.',
      'Second yellows and straight red cards: a player sent off leaves their side a man short and visibly weaker.',
      'Get sent off yourself and your match is over: the rest plays out without you, and it shows in your rating, XP, fame and the manager’s mood.',
      'Suspensions: a red card or a run of yellows bans you, and AI players, from the next matches in that competition. The hub, calendar and inbox tell you for how long.',
      'Tackles and other defending choices show their booking risk, or red card risk once you are on a yellow, with a breakdown of why.',
      'Your profile keeps a disciplinary record of yellow and red cards, by season and across your career.',
      'Weather intensity and pitch condition, each with its own effect on your choices.',
      'The manager’s plan for you on the hub before each match.',
      'Your live Hall of Fame rank while your career is still going.',
      'Inbox messages show who sent them and the week to answer by.',
      'The rival’s press replies appear in your rivalry timeline.',
      'Your debut, first goal, injuries and rivalry appear in the world feed.',
      'Each celebration counts its big-match uses.',
      'Moments replays show the whole move, with names and squad numbers.',
      'New illustrations for trophies, flags, weather, celebrations and lifestyle items, and a stadium in your club’s colours.',
    ],
    improved: [
      'Harder shot objectives for attackers: five shots for a striker and three for other attackers.',
      'One overall rating everywhere, and a radar of six key attributes on player profiles.',
      'Position familiarity is described in words: Natural, Accomplished or Learning.',
      'Fixtures show real calendar dates.',
      'The skill tree is drawn as branches, with each skill joined to the ones it needs.',
      'Save cards and the sidebar show your player’s portrait.',
      'Backup reminders can be switched off in Settings.',
      'On phones, the hub keeps your next match’s main button in the first view.',
      'Your saved careers carry over. A match left unfinished before this update restarts from kick-off.',
    ],
    fixed: [
      'Your agent’s read in contract talks no longer says “a week” twice.',
      'Player ratings in the club view now match the ratings shown everywhere else.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-07',
    title: 'Kick-off',
    summary:
      'The first public release: create a teenage footballer and take them from semi-professional football to the Golden Ball, free in your browser.',
    new: [
      'Create a footballer aged 16 to 18: their look, name, nationality, position, preferred foot and starting style. You can play as a goalkeeper too.',
      'Earn experience from every match, spend attribute points against soft caps set by age and potential, and unlock traits on a skill tree that change what happens on the pitch.',
      'Plan each week’s training, learn new positions, and look after your fitness, morale and form. Injuries need a recovery plan.',
      'Matches play out on a 2D pitch with speed controls, live commentary, momentum and your live rating.',
      'Six to fifteen key moments a match, each with two to four choices that show their chance of success and explain why they worked or failed.',
      'Pre-match objectives and role choices, half-time talks with the manager, captain’s calls, and a full report with heatmap, pass map, shot map and a newspaper headline.',
      'A living world of six countries: England, France, Spain, Germany, Italy and Portugal, with league pyramids based on the real ones, regional groups and promotion playoffs.',
      'Every club has its own crest, kits, stadium, manager and culture. Each week the whole world plays on: results, transfers, sackings, retirements and youth intakes.',
      'Domestic cups and two continental cups with group stages and knockouts.',
      'Edit mode: rename and recolour clubs, leagues and players, redraw crests, and share your edits as a file.',
      'Contracts with role promises, bonuses and clauses, and agents who bring offers and take a cut.',
      'Clubs scout you over several weeks. Negotiate transfers step by step with counter-offers, go out on loan or hand in a transfer request.',
      'Press conferences and interviews whose answers move your fame, the manager’s trust and the mood of the dressing room.',
      'A social feed, teammate relationships, dressing-room groups, club culture fit and a rival from your generation tracked against you.',
      'Fame levels, sponsorship deals, cars, homes and investments.',
      'A wardrobe of boots, socks and armbands, signature celebrations performed on the pitch, and daily and weekly challenges with cosmetic rewards.',
      'National team call-ups from under-19 and under-21 level to the senior side, with an international tournament every two years.',
      'Monthly and season awards, records, a trophy cabinet and the Golden Ball ceremony.',
      'Retire when you choose and see your Legacy and Hall of Fame ranking, then start again in the same world or as your player’s child.',
      'The Career Chronicle writes your career as a biography you can export as an image, and Moments keeps your best plays as replays you can share by link.',
      'Text size, reduced motion, light and dark themes, full keyboard play with shortcuts, screen-reader labels and a colour-blind-safe kit clash check.',
      'A simulation-only mode for players who just want to make the decisions, and a short guided tour in your first week and first match.',
      'Install the game as an app and play offline after your first visit, with a prompt when an update is ready.',
      'Three save slots with autosave, save export and import, a backup reminder each season, and protection against one save being open in two tabs.',
    ],
  },
];
