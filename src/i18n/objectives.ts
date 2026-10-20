import type { Objective } from '../model/domain';

/**
 * The match objectives as the hub previews them before matchday (engine match-15, decision 3):
 * short enough for one line on the next-match card.
 */
export const objectiveText = {
  heading: 'Your objectives',
  ifPicked: 'Your objectives, if you are picked',
  listLabel: 'Match objectives',
  short: {
    goals: 'Score a goal',
    assists: 'Create a goal',
    passing: 'Complete {target}% of passes',
    'clean-sheet': 'Keep a clean sheet',
    rating: 'Rate {target} or better',
    tackles: 'Win {target} tackles',
    saves: 'Make {target} saves',
    shots: 'Take {target} shots',
  } satisfies Record<Objective['kind'], string>,
};
