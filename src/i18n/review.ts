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
  rivalAhead:
    'You finished ahead: {goals} goals to {rivalGoals}, rating {rating} to {rivalRating}.',
  rivalBehind:
    '{rival} had the better season: goals {rivalGoals} to your {goals}, rating {rivalRating} to {rating}.',
  rivalLevel: 'Neck and neck: level on goals, rating {rating} to {rivalRating}.',
  ambitions: 'Ambitions reached',
  chronicle: 'Read the season in your Chronicle',
  cabinet: 'Trophy cabinet',
} as const;
