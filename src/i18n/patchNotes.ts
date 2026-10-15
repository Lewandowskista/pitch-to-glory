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
