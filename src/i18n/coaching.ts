/** Coaching (Phase 5.2): advice from recent decisions and the season development goal. */
export const coachingText = {
  title: 'Coach’s advice',
  basis: {
    decisions: 'From your last {count} key decisions.',
    steady:
      'Nothing in your last {count} key decisions calls for special training, so here is a balanced plan for a {position}.',
    position:
      'Not enough key decisions yet ({count} so far), so here is a balanced plan for a {position}.',
    injury: 'You are injured: recovery sessions only, until you are fit.',
    recovery: 'Recover first; the rest is a balanced plan for a {position}.',
  },
  evidence: {
    decisions:
      '{family}: your {attribute} cost about {points} points of success chance a decision at this level ({attempts} decisions).',
    position: 'Part of a balanced plan for your position.',
    fatigue: 'Your fatigue is {fatigue}. A recovery session brings it down.',
    injury: 'Recovery sessions while you are out.',
  },
  families: {
    shooting: 'Shots',
    passing: 'Passes',
    dribbling: 'Dribbles',
    defending: 'Defensive decisions',
    goalkeeping: 'Saves and keeper decisions',
  },
  caveat: 'Advice follows a pattern, never a single moment: one missed chance proves nothing.',
  notes: {
    title: 'What training will not change',
    variance:
      '{family} worked {successes} of {attempts} times, where their chances suggested about {expected}. That was bad luck: the odds already counted your attributes.',
    choices:
      '{family}: your choices gave up about {regret} goals of expected value a decision against the best option ({attempts} decisions). Compare the chances shown before you choose.',
  },
  apply: 'Plan these sessions',
  already: 'Your saved plan already follows this advice.',
  applied: 'The sessions are in your plan below. Save it to use them from next week.',
  open: 'Plan training',
  tileFocus: 'Suggests: {focus}',
  tileOpen: 'See the advice',
  goal: {
    title: 'Season goal',
    offer: 'This season’s goal',
    why: {
      appearances: 'Chosen for your squad role: playing time comes first.',
      passing: 'Chosen for a midfielder: keep the ball moving.',
      defending: 'Chosen for a defender: win the ball back.',
      attribute: 'Chosen for your position: develop a key attribute.',
    },
    kinds: {
      appearances: 'Play {target} matches',
      passing: 'Complete {target} passes',
      defending: 'Win {target} tackles',
      attribute: 'Raise {attribute} by {target}',
    },
    progress: {
      appearances: '{value} of {target} matches',
      passing: '{value} of {target} passes',
      defending: '{value} of {target} tackles',
      attribute: '+{value} of +{target}',
    },
    accept: 'Take it on',
    decline: 'Not this season',
    declined: 'No goal this season. A new one is offered next season.',
    fixed: 'Accepted for {season}. It stays as it is until the season ends.',
    done: 'Done',
    last: 'Last season: {goal}, {result}.',
    completed: 'completed',
    missed: 'missed ({value} of {target})',
    none: 'Goals are offered while a season is in play.',
    waiting: 'A season goal is waiting for you.',
    label: 'Season goal progress',
  },
} as const;
