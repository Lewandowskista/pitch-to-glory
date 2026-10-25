import { describe, expect, it } from 'vitest';
import type { DecisionChoice } from '../src/model/domain';
import { SITUATIONS } from '../src/engine/match/situations';
import { matchText } from '../src/i18n/match';
import { chanceMeaning, choiceQuality } from '../src/screens/match/choices';

const choice = (probability: number, traitId: string | null = null) =>
  ({ id: 'near-post', probability, traitId }) as DecisionChoice;

describe('key-moment choice labels (review U5)', () => {
  it('bands the quality on the chance alone, whatever traits help', () => {
    // A 4% shot the player's own trait helps was once labelled "Strong".
    expect(choiceQuality(choice(0.04, 'finesse-shot'))).toBe('risky');
    expect(choiceQuality(choice(0.44))).toBe('risky');
    expect(choiceQuality(choice(0.45))).toBe('good');
    expect(choiceQuality(choice(0.65, 'finesse-shot'))).toBe('safe');
  });

  it('says what each chance is a chance of', () => {
    const cases: [string, string, string][] = [
      ['box-chance', 'near-post', 'to score'],
      ['penalty', 'penalty-chip', 'to score'],
      ['box-chance', 'square-pass', 'to complete'],
      ['build-up', 'carry-forward', 'to get through'],
      ['defend-attack', 'tackle', 'to stop the attack'],
      ['goal-line', 'goal-line-clear', 'to keep it out'],
      ['shot-incoming', 'parry', 'to keep it out'],
      ['cross-ball', 'claim', 'to get there first'],
    ];
    for (const [situation, id, text] of cases)
      expect(matchText.ui.chanceMeans[chanceMeaning(situation, id)], id).toBe(text);
  });

  it('knows every choice in the catalogue, and falls back for one it does not', () => {
    for (const situation of SITUATIONS)
      for (const template of situation.choices)
        expect(chanceMeaning(situation.id, template.id), template.id).not.toBe('success');
    expect(chanceMeaning('box-chance', 'unknown')).toBe('success');
  });
});
