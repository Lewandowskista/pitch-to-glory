import type { DecisionChoice } from '../../model/domain';
import { SITUATIONS, type ChoiceEvent } from '../../engine/match/situations';
import type { matchText } from '../../i18n/match';

export type ChoiceQuality = 'safe' | 'good' | 'risky';
/**
 * How a choice's chance reads at a glance, from the chance alone (review U5); the pill writes
 * it, the colour only repeats it. An owned trait that helps has its own chip.
 */
export function choiceQuality(choice: DecisionChoice): ChoiceQuality {
  if (choice.probability >= 0.65) return 'safe';
  if (choice.probability >= 0.45) return 'good';
  return 'risky';
}

export type ChanceMeaning = keyof typeof matchText.ui.chanceMeans;
const EVENT_MEANING = {
  shot: 'score',
  pass: 'complete',
  dribble: 'through',
  tackle: 'stop',
  save: 'first',
} as const satisfies Record<ChoiceEvent, ChanceMeaning>;
/**
 * What a choice's chance is the chance of ("4% to score", "74% to complete"), from its
 * template in the situation catalogue: a direct shot scores, a direct save keeps the ball out,
 * and anything else succeeds as its kind of action.
 */
export function chanceMeaning(situationId: string, choiceId: string): ChanceMeaning {
  const template = SITUATIONS.find((situation) => situation.id === situationId)?.choices.find(
    (choice) => choice.id === choiceId,
  );
  if (!template) return 'success';
  if (template.direct === 'for') return 'score';
  if (template.direct === 'against') return 'keepOut';
  return EVENT_MEANING[template.event];
}
