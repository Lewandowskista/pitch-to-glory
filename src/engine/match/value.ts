import type { DecisionChoice } from '../../model/domain';

/**
 * Expected goals for and against the selected team if this choice is made. On its own (no
 * catalogue imports), so the career screens that judge recorded choices stay small.
 */
export function expectedImpact(choice: DecisionChoice): {
  for: number;
  against: number;
  net: number;
} {
  const p = choice.probability,
    s = choice.stakes;
  const goalsFor = p * s.successGoal + (1 - p) * s.failureGoal;
  // A card's cost (match-22): a dismissal's share of a man down for the rest of the match.
  const goalsAgainst =
    p * s.successConcede + (1 - p) * s.failureConcede + (choice.booking?.cost ?? 0);
  return { for: goalsFor, against: goalsAgainst, net: goalsFor - goalsAgainst };
}
