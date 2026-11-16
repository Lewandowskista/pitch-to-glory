import type { DecisionChoice } from '../../model/domain';
import type { ChoiceEvent } from '../../engine/match/situations';
import { templateOf } from '../../engine/match/situations22';
import { expectedImpact } from '../../engine/match/value';
import { CONFIG } from '../../engine/config';
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
  const template = templateOf(situationId, choiceId);
  if (!template) return 'success';
  if (template.direct === 'for') return 'score';
  if (template.direct === 'against') return 'keepOut';
  return EVENT_MEANING[template.event];
}

export type ChoiceValue = 'best' | 'even' | 'costly';
/** A choice's expected goal swing (the engine's `expectedImpact`) against the best on offer. */
export interface ChoiceWorth {
  value: ChoiceValue;
  /** Expected goals for and against the player's side, and their difference. */
  for: number;
  against: number;
  net: number;
  /** The best expected goal swing among the moment's choices. */
  best: number;
}
/**
 * How each choice's expected value compares (review M14): the chance alone does not say which
 * choice is worth most, since a likely pass can be worth less than an unlikely shot. Thresholds
 * are `CONFIG.match.valueHint`; the values are the ones the engine's auto-play and coaching use.
 */
export function choiceWorth(choices: readonly DecisionChoice[]): Map<string, ChoiceWorth> {
  const { tie, costly } = CONFIG.match.valueHint;
  const { even } = CONFIG.match.chains.bands;
  const impacts = choices.map((choice) => ({ id: choice.id, ...expectedImpact(choice) }));
  const best = Math.max(...impacts.map((impact) => impact.net));
  const worst = Math.min(...impacts.map((impact) => impact.net));
  return new Map(
    impacts.map(({ id, ...impact }) => {
      const gap = best - impact.net;
      // A long shot (below the even band, X1a) is never marked best value.
      const long = (choices.find((choice) => choice.id === id)?.probability ?? 0) < even;
      const value: ChoiceValue =
        best - worst < tie
          ? 'even'
          : gap <= tie
            ? long
              ? 'even'
              : 'best'
            : gap >= costly
              ? 'costly'
              : 'even';
      return [id, { value, ...impact, best }];
    }),
  );
}
