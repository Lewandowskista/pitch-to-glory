/** Tutorial copy (milestone 9): the first career week and the first match. */
export const tutorialText = {
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
      body: 'Your profile, skills, club life, transfers, lifestyle and honours are all here. Arrow keys move along the bar.',
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
      body: 'Choose your role, risk level and mentality. They shape the situations you will face and how the odds lean.',
    },
    kickoff: {
      title: 'Kick off',
      body: 'Start the match when you are ready.',
    },
    controls: {
      title: 'Controlling the match',
      body: 'Space plays or pauses. 1×, 2× and 4× change the speed, and "Next key moment" jumps straight to your next decision.',
    },
    live: {
      title: 'Follow the game',
      body: 'Commentary, the score, momentum and your live rating update as play goes on. Play the match to reach your first key moment.',
    },
    decision: {
      title: 'A key moment',
      body: 'Play stops for your decisions. Each choice shows its chance of success; open "Why this choice?" to see the attributes, traits and fatigue behind it. Press 1–4 or click to choose.',
    },
    outcome: {
      title: 'Every result is explained',
      body: 'You see the roll against the chance, and every factor that moved it. Learn from it for the next moment.',
    },
  },
} as const;
