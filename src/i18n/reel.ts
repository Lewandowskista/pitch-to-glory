import { LOCALE, plurals, type Translations } from './locale';

/**
 * The highlights reel (release 1.0, phase X1b; docs/EXPERIENCE-REDESIGN-1.0.md §1.2–1.5): the
 * ticker between chains, the clips, the decision card and its outcome beat, the one-screen
 * pre-match, half-time, the Match log, Watch highlights and Simulate, and the report's moment
 * tiles. Word budgets: a decision card's options at most 20 words, its stakes header at most 12.
 */
const reelEn = {
  /** The one control while play is dead (Space). */
  skip: 'Skip to next moment',
  /** While a clip plays: a tap or Space jumps to its outcome. */
  skipClip: 'Skip to the outcome',
  /** Anticipation before a chain (1.2–1.5 s). */
  building: { attack: 'Chance building…', defence: 'Danger building…' },
  /** The ticker's region, for screen readers. */
  ticker: 'Match ticker',
  live: 'Live',
  waveTitle: 'Momentum · last 20 minutes',
  waveLabel:
    'Momentum over the last 20 minutes: {home} {homeShare}% of the pressure, {away} {awayShare}%.',
  addedBoard: '+{minutes}',
  addedBoardLabel: plurals({ one: '1 minute added', other: '{count} minutes added' }),
  /** Event chips that slide into the ticker. */
  chips: {
    shot: 'Shot',
    saved: 'Saved',
    blocked: 'Blocked',
    wide: 'Off target',
    woodwork: 'Woodwork',
    yellow: 'Booked',
    red: 'Sent off',
    sub: 'Sub',
    injury: 'Injured',
    goal: 'Goal',
  },
  chipLabel: '{minute} · {kind} · {name}',
  /** The live rating beside the scoreboard. */
  rating: 'Rating',
  ratingLabel: 'Your live rating {rating}',
  /** The Match log: the full commentary, in a sheet (Esc and Back close it). */
  log: 'Match log',
  logOpen: 'Open the match log',
  logClose: 'Close the match log',
  logLoading: 'Fetching the commentary…',
  logEmpty: 'The teams are ready. Kick-off.',
  stats: 'Match stats',
  /** The decision card's region (its copy is in reelCard.ts, loaded with the card). */
  cardRegion: 'Your decision',
  /** The outcome beat: ✓ or ✗, a word, and one cause line. */
  beat: {
    success: {
      score: 'Goal!',
      keepOut: 'Saved',
      complete: 'Found him',
      through: 'Past him',
      stop: 'Stopped',
      first: 'Won it',
      success: 'It came off',
    },
    failure: {
      score: 'No goal',
      keepOut: 'Beaten',
      complete: 'Cut out',
      through: 'Tackled',
      stop: 'Beaten',
      first: 'Lost it',
      success: 'It failed',
    },
    causeLine: '{cause} · {chance}%',
    attributeUp: 'Your {attribute} did it',
    attributeDown: 'Your {attribute} fell short',
    factorUp: '{factor} helped',
    factorDown: '{factor} beat you',
    noneUp: 'It came off',
    noneDown: 'Not this time',
    announce: '{title}. {cause}.',
  },
  goalClip: 'Goal clip',
  /** The clip region's name for screen readers. */
  clipLabel: 'Highlight: {players}.',
  you: 'YOU',
  /** Pre-match on one screen. */
  prematch: {
    title: 'Before kick-off',
    versus: 'v',
    form: 'Form',
    objective: 'Your objective',
    role: 'Your role',
    roleDefault: 'Manager’s pick',
    roleChange: 'Change role',
    drought: 'Coach: they’ll leave you more space today.',
    details: 'Details',
    detailsHint: 'Weather, line-ups, mentality and risk',
    kickoff: 'Kick off',
    watch: 'Watch highlights',
    watchHint: 'The reel in about a minute, decisions made for you.',
    simulate: 'Simulate',
    simulateHint: 'Straight to the report.',
    simulating: 'Simulating the match…',
    friendly: 'Friendly',
  },
  /** Watch highlights: the reel without decisions. */
  watching: 'Watching highlights',
  watchingNote: 'Your decisions are made for you.',
  takeOver: 'Play it myself',
  /** Half-time: one manager card with two answers, the manager's pick first. */
  halftime: {
    title: 'Half-time',
    pick: 'Manager’s pick',
    resume: 'Second half starts with your answer.',
  },
  /** The report's first screen. */
  report: {
    moments: 'Your moments',
    replay: 'Replay the {minute} clip',
    replaying: 'Replaying {minute}',
    close: 'Close the replay',
    none: 'No moments came your way this time.',
    outcomes: {
      goal: 'Goal',
      assist: 'Assist',
      chance: 'Chance',
      stop: 'Stopped',
      won: 'Won it',
      lost: 'Lost it',
      conceded: 'Conceded',
      foul: 'Foul',
      card: 'Booked',
    },
    tile: '{minute} · {outcome}',
    tileLabel: '{minute}, {outcome}: {steps}. Replay the clip.',
    ratingRoll: 'Your rating',
  },
  shortcuts: 'Space: skip to the next moment · 1–3: choose · Esc: close',
} as const;

export const reelText = ({ en: reelEn } satisfies Translations<typeof reelEn>)[LOCALE];
