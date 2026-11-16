/**
 * A finished match's decisions as coaching samples (Phase 5.2; coaching.ts), apart from the
 * coaching advice: reading them needs the key-moment catalogues, which the hub's advice does not.
 */
import type { DecisionFamily, DecisionSample } from '../../model/domain';
import { templateOf } from '../match/situations22';
import { expectedImpact } from '../match/value';
import type { MatchSession } from '../match/types';

/** The decisions a finished match's selected player made: kind, outcome, odds, attributes. */
export function matchDecisions(
  session: MatchSession,
  date: { season: number; week: number },
): DecisionSample[] {
  const match = session.state.match;
  const samples: DecisionSample[] = [];
  const seen = new Set<string>();
  for (const event of match.events) {
    const outcome = event.outcome;
    if (!outcome || seen.has(outcome.input.momentId)) continue;
    seen.add(outcome.input.momentId);
    const moment = match.keyMoments.find((entry) => entry.id === outcome.input.momentId);
    const choice = moment?.choices.find((entry) => entry.id === outcome.input.choiceId);
    // Either catalogue's (match-22's situations, skill mechanics and chain lead-in steps too).
    const template = moment ? templateOf(moment.situationId, outcome.input.choiceId) : undefined;
    if (!moment || !choice || !template) continue;
    // What the attributes did to the chosen odds, and what a better choice would have been worth.
    const attributeEffect =
      choice.factors.find((factor) => factor.labelKey === 'match.factor.attribute')?.contribution ??
      0;
    const best = Math.max(...moment.choices.map((entry) => expectedImpact(entry).net));
    samples.push({
      season: date.season,
      week: date.week,
      family: template.family as DecisionFamily,
      success: outcome.success,
      probability: Math.round(outcome.probability * 1000) / 1000,
      attributes: choice.attributes.slice(0, 3),
      // `+ 0` turns a rounded −0 into 0, which a save writes and reads back unchanged.
      attributeEffect: Math.round(attributeEffect * 1000) / 1000 + 0,
      regret: Math.round(Math.max(0, best - expectedImpact(choice).net) * 1e4) / 1e4,
    });
  }
  return samples;
}
