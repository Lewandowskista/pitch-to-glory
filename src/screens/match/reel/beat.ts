import type {
  ChoiceOutcome,
  DecisionOutcome,
  KeyMoment,
  ProbabilityFactor,
} from '../../../model/domain';
import { t } from '../../../i18n';
import { reelText as r } from '../../../i18n/reel';
import { matchFormat, matchLabel } from '../../../i18n/match';
import { chanceMeaning, type ChanceMeaning } from '../choices';

/*
 * The outcome beat (docs/EXPERIENCE-REDESIGN-1.0.md §1.4): a ✓ or ✗, a word for what happened
 * and one cause line with the displayed chance ("Keeper's reach beat your placement · 31%"),
 * inline on the pitch for about 1.4 s; then play moves on by itself. The full factors stay in
 * the report.
 */
export interface OutcomeBeat {
  success: boolean;
  title: string;
  cause: string;
  /** What screen readers hear. */
  announce: string;
}

const attributeName = (name: string) =>
  t.world.attributes[name as keyof typeof t.world.attributes] ?? name;

/** The factor that did most for (success) or against (failure) the chance. */
function decisive(factors: readonly ProbabilityFactor[], success: boolean) {
  let best: ProbabilityFactor | null = null;
  for (const factor of factors) {
    if (factor.labelKey === 'match.factor.base' || factor.labelKey === 'match.factor.limit')
      continue;
    const value = success ? factor.contribution : -factor.contribution;
    if (value > 0.004 && (!best || value > (success ? best.contribution : -best.contribution)))
      best = factor;
  }
  return best;
}

/**
 * The one-line reason from the factor that weighed most, as the chain's own cause picks it
 * (X1a `ChainStepResult.cause`), named in the player's terms: "Your finishing fell short".
 */
export function causeText(
  outcome: Pick<DecisionOutcome, 'success' | 'probability' | 'factors'>,
  attributes: readonly string[],
): string {
  const chance = Math.round(outcome.probability * 100);
  const factor = decisive(outcome.factors, outcome.success);
  const text = !factor
    ? outcome.success
      ? r.beat.noneUp
      : r.beat.noneDown
    : factor.labelKey === 'match.factor.attribute' && attributes[0]
      ? matchFormat(outcome.success ? r.beat.attributeUp : r.beat.attributeDown, {
          attribute: attributeName(attributes[0]).toLowerCase(),
        })
      : matchFormat(outcome.success ? r.beat.factorUp : r.beat.factorDown, {
          factor: matchLabel(factor.labelKey),
        });
  return matchFormat(r.beat.causeLine, { cause: text, chance });
}

/** A chain step's named outcome (X1a) in the beat's words: "Past him", "Saved", "Won it". */
const OUTCOME_MEANING: Partial<Record<ChoiceOutcome, ChanceMeaning>> = {
  goal: 'score',
  save: 'keepOut',
  pass: 'complete',
  combine: 'complete',
  beat: 'through',
  turn: 'through',
  run: 'through',
  stop: 'stop',
  press: 'first',
  cover: 'stop',
  'goal-side': 'stop',
};

/** The beat for a step's outcome. */
export function outcomeBeat(
  moment: Pick<KeyMoment, 'situationId' | 'choices'>,
  outcome: DecisionOutcome,
): OutcomeBeat {
  const choice = moment.choices.find((entry) => entry.id === outcome.input.choiceId);
  const meaning = choice?.outcome
    ? (OUTCOME_MEANING[choice.outcome] ?? 'success')
    : chanceMeaning(moment.situationId, outcome.input.choiceId);
  const title = (outcome.success ? r.beat.success : r.beat.failure)[meaning];
  const line = causeText(outcome, choice?.attributes ?? []);
  return {
    success: outcome.success,
    title,
    cause: line,
    announce: matchFormat(r.beat.announce, { title, cause: line }),
  };
}
