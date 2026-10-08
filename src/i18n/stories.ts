/** Story arcs (Phase 6): the manager's development promise. */
export const storiesText = {
  promise: {
    title: 'The manager’s challenge',
    milestone: {
      appearances: 'Play {target} matches in six weeks',
      passing: 'Complete {target} passes in six weeks',
      defending: 'Win {target} tackles in six weeks',
      attribute: 'Raise {attribute} by {target} in six weeks',
    },
    offered:
      '{manager} has seen your season goal and wants to push you: meet this milestone and you earn more of their trust. Miss it and it costs a little.',
    respond: 'Answer by the end of week {week}.',
    accept: 'Accept the challenge',
    decline: 'Not now',
    active: 'Running until the end of week {week}.',
    progress: '{value} of {target}',
    progressLabel: 'Challenge progress',
    weeksLeft: 'Weeks left, this one included: {weeks}',
    achieved: 'Met in week {week}. {manager} trusts you more for it.',
    missed: 'Missed: {value} of {target} by week {week}. {manager} expected more.',
    cancelled: {
      declined: 'You turned the challenge down. No harm done.',
      expired: 'The offer lapsed unanswered. No harm done.',
      transfer: 'Called off when you moved clubs. No harm done.',
      manager: 'Called off when the manager left. No harm done.',
      injury: 'Called off because of your injury. No harm done.',
      retirement: 'Called off by your retirement.',
      season: 'Closed at the end of the season.',
    },
    none: 'Accept a season goal and the manager may set you a six-week challenge towards it.',
    noRoom: 'No challenge this season: too few weeks remain for one.',
  },
  messages: {
    'promise-offer': {
      subject: '{manager} sets you a challenge',
      body: 'The manager has a six-week milestone towards your season goal (target {target}). Accept or turn it down on the Club page.',
    },
    'promise-achieved': {
      subject: 'Challenge met',
      body: '{manager} saw you reach {progress} of {target}. Their trust in you grows.',
    },
    'promise-missed': {
      subject: 'Challenge missed',
      body: 'You reached {progress} of {target}. {manager} is a little disappointed.',
    },
    'promise-cancelled': {
      subject: 'Challenge called off',
      body: 'The challenge no longer applies. Nothing is held against you.',
    },
  },
} as const;
