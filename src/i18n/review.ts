/** The end-of-season review on the hub. */
export const reviewText = {
  eyebrow: 'Season {season} review',
  title: 'Your season',
  grade: 'Season grade',
  gradeLabel: 'Grade {grade}',
  verdicts: {
    'A+': 'A season for the ages.',
    A: 'An outstanding season.',
    B: 'A strong season to build on.',
    C: 'A solid season, with more to give.',
    D: 'A difficult season.',
    E: 'A season to forget.',
  },
  outcomes: {
    champions: 'Champions!',
    promoted: 'Promoted!',
    relegated: 'Relegated',
  },
  outcomeBody: {
    champions: '{club} won the {league}.',
    promoted: '{club} go up after finishing {rank} in the {league}.',
    relegated: '{club} go down after finishing {rank} in the {league}.',
  },
  finish: '{club} finished {rank} of {of} in the {league}.',
  stats: {
    apps: 'Appearances',
    goals: 'Goals',
    assists: 'Assists',
    cleanSheets: 'Clean sheets',
    rating: 'Average rating',
  },
  change: '{sign}{value} on last season',
  share: 'You played {percent}% of the club’s matches.',
  honours: 'Honours',
  noHonours: 'No silverware this time.',
  rival: 'Against {rival}',
  /** Judged by the line's output: goals and assists, or clean sheets for the back line. */
  rivalVerdict: {
    goals: {
      ahead:
        'You finished ahead: {goals} goals and {assists} assists to {rivalGoals} and {rivalAssists}, rating {rating} to {rivalRating}.',
      behind:
        '{rival} had the better season: {rivalGoals} goals and {rivalAssists} assists to your {goals} and {assists}, rating {rivalRating} to {rating}.',
      level:
        'Neck and neck: {goals} goals and {assists} assists to {rivalGoals} and {rivalAssists}, rating {rating} to {rivalRating}.',
    },
    'clean-sheets': {
      ahead:
        'You finished ahead: {cleanSheets} clean sheets to {rivalCleanSheets}, rating {rating} to {rivalRating}.',
      behind:
        '{rival} had the better season: {rivalCleanSheets} clean sheets to your {cleanSheets}, rating {rivalRating} to {rating}.',
      level:
        'Neck and neck: {cleanSheets} clean sheets to {rivalCleanSheets}, rating {rating} to {rivalRating}.',
    },
  },
  ambitions: 'Ambitions reached',
  chronicle: 'Read the season in your Chronicle',
  cabinet: 'Trophy cabinet',
} as const;
