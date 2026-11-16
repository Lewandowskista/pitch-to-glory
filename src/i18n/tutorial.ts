import { LOCALE, type Translations } from './locale';
/** Tutorial copy (milestone 9): the first career week and the first match. */
const tutorialTextEn = {
  label: 'Tutorial',
  progress: 'Step {step} of {total}',
  next: 'Next',
  back: 'Back',
  done: 'Got it',
  skip: 'Skip tutorial',
  waiting: 'Do this to continue.',
  week: {
    'next-match': {
      title: 'Your first fixture',
      body: 'This card shows your next match. Continuing simulates the whole world, week by week, until your club plays.',
    },
    priorities: {
      title: 'What needs you',
      body: 'Anything waiting for you appears here, most urgent first: recovery, your match, then offers and press questions before they lapse, then unspent points. The calendar shows the whole season.',
    },
    'player-card': {
      title: 'Your footballer',
      body: 'Level, XP and unspent points live here. Matches earn XP, and every level brings attribute and skill points to spend.',
    },
    training: {
      title: 'Training',
      body: 'Plan three sessions a week and choose an intensity. Harder training grows you faster but tires you and risks injury.',
    },
    'career-nav': {
      title: 'Everything else',
      body: 'Your career has five sections: Overview, Player, Club, Life and History. Each opens with tabs for its pages, always in the same place. Arrow keys move along them.',
    },
    inbox: {
      title: 'Messages',
      body: 'Offers, selection news, call-ups and awards arrive in your inbox. New messages show a count on the Inbox tab.',
    },
    continue: {
      title: 'Ready for your debut?',
      body: 'This button takes you to your first matchday. The tour picks up again when the match starts.',
    },
  },
  match: {
    tactics: {
      title: 'Before kick-off',
      body: 'Your role is the manager’s pick; change it here. Risk and mentality sit under Details. They shape the moments you get and how the odds lean.',
    },
    kickoff: {
      title: 'Kick off',
      body: 'Kick off starts play. Watch highlights plays the reel with your decisions made for you; Simulate goes straight to the report.',
    },
    controls: {
      title: 'The ticker',
      body: 'Dead play runs by as a ticker: the score, the clock and the momentum wave. Your moments and every goal play as short clips. Space or "Skip to next moment" jumps ahead.',
    },
    live: {
      title: 'Follow the game',
      body: 'The score, the clock, the momentum wave and your live rating update as play goes on. The full commentary is in the Match log.',
    },
    decision: {
      title: 'A key moment',
      body: 'Play stops for your decision. Each choice names its outcome and its real chance, and what a failure costs. "Why?" shows the attributes, traits and fatigue behind it. Press 1–3 or tap to choose.',
    },
    outcome: {
      title: 'Every result is explained',
      body: 'A ✓ or ✗ on the pitch says what decided it, with the chance it had. Play then moves on by itself; the full factors are in your report.',
    },
  },
} as const;
export const tutorialText = ({ en: tutorialTextEn } satisfies Translations<typeof tutorialTextEn>)[
  LOCALE
];
