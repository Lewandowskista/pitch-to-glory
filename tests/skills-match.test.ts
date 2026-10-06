import { describe, expect, it } from 'vitest';
import type { Player, Position } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import {
  buildChoices,
  expectedImpact,
  momentBudget,
  situationWeights,
  traitMultiplier,
  type DecisionContext,
} from '../src/engine/match/decisions';
import { SITUATIONS } from '../src/engine/match/situations';
import { applyMatchCommand, createMatchSession, createMatchSetup } from '../src/engine/match';
import { autoPlayCommand } from '../src/engine/career/matches';
import { generateWorld } from '../src/engine/world/generate';

const unlocking = SITUATIONS.flatMap((s) => s.choices)
  .map((c) => c.requiredTraitId)
  .filter((id): id is string => Boolean(id));
const KEYS = [
  'finishing',
  'passing',
  'dribbling',
  'firstTouch',
  'crossing',
  'heading',
  'tackling',
  'longShots',
  'setPieces',
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'jumping',
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
  'aggression',
];
const KEEPING = [
  'handling',
  'reflexes',
  'diving',
  'oneOnOnes',
  'kicking',
  'commandOfArea',
  'aerialReach',
];
function player(traits: string[]): DecisionContext['player'] {
  return {
    attributes: Object.fromEntries(KEYS.map((key) => [key, 60])) as Player['attributes'],
    keeperAttributes: Object.fromEntries(
      KEEPING.map((key) => [key, 60]),
    ) as Player['keeperAttributes'],
    traits,
    // Neutral morale, so skill effects are measured on their own.
    morale: CONFIG.career.social.matchMorale.neutral,
  };
}
function contexts(position: Position, traits: string[], importance = 1): DecisionContext[] {
  const weights = situationWeights(position, 'balanced');
  const [attack, defence] = CONFIG.match.shares[position];
  return weights.map(({ situation }) => ({
    player: player(traits),
    situation,
    budget: momentBudget(
      situation,
      weights,
      { attack, defence },
      { own: 1.45, opposition: 1.3 },
      10,
    ),
    matchLevel: 60,
    importance,
    fatigue: 0,
    tactics: { role: 'balanced', risk: 'balanced', mentality: 'balanced' },
    weather: 'clear',
    pitchCondition: 90,
    strengthGap: 0,
    opponents: { keeper: 60, defender: 60, attacker: 60 },
  }));
}

describe('skills in key moments', () => {
  it('offers skill-unlocked choices only to players with the skill, never beyond four choices', () => {
    for (const position of ['ST', 'CM', 'CB', 'GK'] as const)
      for (const context of contexts(position, [])) {
        const choices = buildChoices(context);
        expect(choices.some((c) => c.requiredTraitId)).toBe(false);
      }
    for (const situation of SITUATIONS) expect(situation.choices.length).toBeLessThanOrEqual(4);
    const unlocked = ['ST', 'CM', 'CB', 'GK'].flatMap((position) =>
      contexts(position as Position, unlocking).flatMap((c) => buildChoices(c)),
    );
    for (const id of unlocking) expect(unlocked.some((c) => c.requiredTraitId === id)).toBe(true);
  });
  it('makes unlocked choices a bounded advantage, never a weaker option', () => {
    for (const position of ['ST', 'LW', 'CM', 'CB', 'GK'] as const)
      for (const context of contexts(position, unlocking)) {
        const choices = buildChoices(context);
        const impacts = choices.map(expectedImpact);
        const mean = impacts.reduce((n, i) => n + i.net, 0) / impacts.length;
        const scale = context.budget.for + context.budget.against;
        for (const [index, choice] of choices.entries()) {
          if (!choice.requiredTraitId) continue;
          expect(impacts[index]!.net).toBeGreaterThanOrEqual(mean - 0.15 * scale);
          expect(impacts[index]!.net).toBeLessThanOrEqual(mean + 0.35 * scale);
        }
      }
  });
  it('boosts the choices a skill names and lifts every choice in big games', () => {
    const template = { id: 'long-shot', traitId: null };
    expect(traitMultiplier([], template, 1)).toBe(1);
    expect(traitMultiplier(['long-ranger'], template, 1)).toBe(
      CONFIG.match.decision.traitMultiplier,
    );
    expect(traitMultiplier(['big-game-player'], template, 1)).toBe(1);
    expect(traitMultiplier(['big-game-player'], template, 1.5)).toBe(
      CONFIG.match.decision.bigGameMultiplier,
    );
    const [plain, skilled] = [[], ['long-ranger']].map(
      (traits) =>
        buildChoices(contexts('ST', traits).find((c) => c.situation.id === 'edge-of-area')!).find(
          (c) => c.id === 'long-shot',
        )!.probability,
    );
    expect(skilled).toBeGreaterThan(plain!);
  });
  it('tags goals created by the selected player with the assist', () => {
    const world = generateWorld('assist-tags', { format: 'legacy' });
    const [home, away] = Object.values(world.clubs);
    const playmaker = home!.playerIds.find((id) => world.players[id]!.primaryPosition === 'CM')!;
    let assists = 0;
    let tagged = 0;
    for (let index = 0; index < 40; index++) {
      let session = createMatchSession(
        createMatchSetup(world, home!.id, away!.id, playmaker, `assist-${index}`),
        { role: 'balanced', risk: 'balanced', mentality: 'balanced' },
      );
      while (session.state.match.status !== 'finished')
        session = applyMatchCommand(session, autoPlayCommand(session));
      assists += session.state.stats.assists;
      tagged += session.state.match.events.filter(
        (e) => e.kind === 'goal' && e.assistId === playmaker,
      ).length;
    }
    expect(assists).toBeGreaterThan(0);
    expect(tagged).toBe(assists);
  });
});
