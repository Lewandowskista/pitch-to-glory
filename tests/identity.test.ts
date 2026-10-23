import { describe, expect, it } from 'vitest';
import type { Player, Position } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import { SKILL_BY_ID, SYSTEMIC_SKILLS } from '../src/engine/career/catalogue';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  engineFor,
  EXTRA_TIME_MATCH_ENGINE,
  MATCH_ENGINE_VERSION,
  SITUATION_BY_ID,
  validateMatchSession,
  type MatchSetup,
} from '../src/engine/match';
import {
  buildChoices,
  footFor,
  momentBudget,
  situationWeights,
  type DecisionContext,
} from '../src/engine/match/decisions';

/**
 * Review phase 4, steps 4.1 and 4.2 (engine match-19): the opposition's style shapes the
 * moments and their odds, and the weaker foot costs odds unless the player is two-footed.
 */
const F = CONFIG.match.foot;
const S = CONFIG.match.styles;
const world = generateWorld('identity-tests', { format: 'legacy' });
const clubs = Object.values(world.clubs);

function context(
  situationId: string,
  extra: Partial<DecisionContext> = {},
  position: Position = 'CM',
): DecisionContext {
  const situation = SITUATION_BY_ID[situationId]!;
  const weights = situationWeights(position, 'balanced');
  const club = clubs[0]!;
  const player = structuredClone(world.players[club.playerIds[5]!]!) as Player;
  for (const key of Object.keys(player.attributes) as (keyof Player['attributes'])[])
    player.attributes[key] = 60;
  player.traits = [];
  return {
    player,
    situation,
    budget: momentBudget(
      situation,
      weights,
      { attack: 0.2, defence: 0.2 },
      { own: 1.4, opposition: 1.3 },
      10,
    ),
    matchLevel: 60,
    importance: 1,
    fatigue: 0,
    tactics: { role: 'balanced', risk: 'balanced', mentality: 'balanced' },
    weather: 'clear',
    pitchCondition: 90,
    strengthGap: 0,
    opponents: { keeper: 60, defender: 60, attacker: 60 },
    momentum: 50,
    talkOdds: 1,
    teammateFinishing: 60,
    consistencyShift: 0,
    chemistry: 60,
    latest: true,
    stackImpact: true,
    ...extra,
  };
}
const choice = (ctx: DecisionContext, id: string) => buildChoices(ctx).find((c) => c.id === id)!;

describe('the preferred foot', () => {
  it('uses the outside foot at the near post and the inside foot at the far post', () => {
    const right = { strong: 'right' as const, flank: 'left' as const, twoFooted: false };
    // On the left, a near-post shot is with the left foot: the weaker one.
    expect(footFor('near-post', right)).toEqual({ side: 'left', weak: true, multiplier: F.weak });
    // The far post is with the inside (right) foot: cutting in onto the stronger one.
    expect(footFor('far-post', right)).toEqual({
      side: 'right',
      weak: false,
      multiplier: F.inside,
    });
    // On the right flank the near post suits a right-footer.
    expect(footFor('near-post', { ...right, flank: 'right' })).toEqual({
      side: 'right',
      weak: false,
      multiplier: 1,
    });
    // Two-footed, or both feet, never weak; the middle and footless choices have no foot.
    expect(footFor('near-post', { ...right, twoFooted: true })!.weak).toBe(false);
    expect(footFor('near-post', { ...right, strong: 'both' })!.weak).toBe(false);
    expect(footFor('near-post', { ...right, flank: 'centre' })).toBeNull();
    expect(footFor('take-on', right)).toBeNull();
  });

  it('shows the weaker foot as a named factor and on the choice', () => {
    const base = choice(context('box-chance'), 'near-post');
    const weak = choice(
      context('box-chance', { foot: { strong: 'right', flank: 'left', twoFooted: false } }),
      'near-post',
    );
    expect(weak.foot).toEqual({ side: 'left', weak: true });
    expect(weak.probability).toBeLessThan(base.probability);
    const factor = weak.factors.find((f) => f.labelKey === 'match.factor.foot.weak')!;
    expect(factor.contribution).toBeLessThan(0);
    // Factors still sum to the probability.
    expect(weak.factors.reduce((sum, f) => sum + f.contribution, 0)).toBeCloseTo(
      weak.probability,
      5,
    );
    // Two-footed: no factor, the same odds as without a foot.
    const able = choice(
      context('box-chance', { foot: { strong: 'right', flank: 'left', twoFooted: true } }),
      'near-post',
    );
    expect(able.probability).toBe(base.probability);
  });

  it('is a skill: Two-Footed', () => {
    expect(SKILL_BY_ID['two-footed']).toBeDefined();
    expect(SYSTEMIC_SKILLS['two-footed']).toBe('foot');
  });
});

describe('the opposition’s style', () => {
  it('brings pressure moments against a press and range against a deep block', () => {
    const share = (style: string | undefined, id: string) => {
      const weights = situationWeights('CM', 'balanced', { opponentStyle: style });
      const total = weights.reduce((sum, w) => sum + w.weight, 0);
      return weights.find((w) => w.situation.id === id)!.weight / total;
    };
    expect(share('press', 'build-out')).toBeGreaterThan(share(undefined, 'build-out'));
    expect(share('counter', 'edge-of-area')).toBeGreaterThan(share(undefined, 'edge-of-area'));
    expect(share('counter', 'box-chance')).toBeLessThan(share(undefined, 'box-chance'));
    expect(share('balanced', 'build-out')).toBeCloseTo(share(undefined, 'build-out'), 10);
  });

  it('names its effect on the choices it bears on', () => {
    const press = context('build-out', { opponentStyle: 'press' }, 'CB');
    const short = choice(press, 'short-pass');
    expect(short.factors.some((f) => f.labelKey === 'match.factor.style.press')).toBe(true);
    expect(short.probability).toBeLessThan(
      choice(context('build-out', {}, 'CB'), 'short-pass').probability,
    );
    const clear = choice(press, 'clear-long');
    expect(clear.probability).toBeGreaterThan(
      choice(context('build-out', {}, 'CB'), 'clear-long').probability,
    );
  });

  it('costs half as much after a week studying the opponent', () => {
    const plain = choice(context('build-out', { opponentStyle: 'press' }, 'CB'), 'short-pass');
    const studied = choice(
      context('build-out', { opponentStyle: 'press', prepared: true }, 'CB'),
      'short-pass',
    );
    const neutral = choice(context('build-out', {}, 'CB'), 'short-pass');
    expect(studied.probability).toBeGreaterThan(plain.probability);
    expect(studied.probability).toBeLessThan(neutral.probability);
    // What the style gives is not doubled by studying it.
    const escape = choice(
      context('build-out', { opponentStyle: 'press', prepared: true }, 'CB'),
      'clear-long',
    );
    const unstudied = choice(context('build-out', { opponentStyle: 'press' }, 'CB'), 'clear-long');
    expect(escape.probability).toBe(unstudied.probability);
  });

  it('every style multiplier names a real situation and choice', () => {
    for (const style of Object.values(S)) {
      for (const id of Object.keys(style.situations)) expect(SITUATION_BY_ID[id]).toBeDefined();
      for (const id of Object.keys(style.choices))
        expect(Object.values(SITUATION_BY_ID).some((s) => s.choices.some((c) => c.id === id))).toBe(
          true,
        );
    }
  });
});

describe('engine match-19', () => {
  const [home, away] = [clubs[0]!, clubs[1]!];
  const selected =
    home.playerIds.find((id) => world.players[id]!.primaryPosition === 'LW') ??
    home.playerIds.find((id) => world.players[id]!.primaryPosition !== 'GK')!;
  const play = (setup: MatchSetup) => {
    let session = createMatchSession(setup, {
      role: 'balanced',
      risk: 'balanced',
      mentality: 'balanced',
    });
    while (session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    return session;
  };

  it('is played by new setups, and setups without it keep match-18', () => {
    const setup = createMatchSetup(world, home.id, away.id, selected, 'identity:1');
    expect(setup.identity).toBe(true);
    expect(engineFor(setup)).toBe(MATCH_ENGINE_VERSION);
    const older = structuredClone(setup);
    delete older.defending;
    delete older.identity;
    expect(engineFor(older)).toBe(EXTRA_TIME_MATCH_ENGINE);
  });

  it('plays, replays and validates a whole match', () => {
    const setup = createMatchSetup(world, home.id, away.id, selected, 'identity:2');
    const session = play(setup);
    expect(session.engine).toBe(MATCH_ENGINE_VERSION);
    expect(() => validateMatchSession(JSON.parse(JSON.stringify(session)))).not.toThrow();
    // Every factor shown has copy (checked for every key in tests/match-engine.test.ts).
    const keys = session.state.match.keyMoments.flatMap((m) =>
      m.choices.flatMap((c) => c.factors.map((f) => f.labelKey)),
    );
    expect(keys.length).toBeGreaterThan(0);
  }, 120000);
});

describe('studying the opponent in training', () => {
  it('marks the next match prepared and builds nothing', async () => {
    const { createCareer, trialOffers } = await import('../src/engine/career/create');
    const { careerMatchSetup } = await import('../src/engine/career/matches');
    const { nextCareerFixture } = await import('../src/engine/career/fixtures');
    const { focusAttributes, validFocus } = await import('../src/engine/career/training');
    const trial = trialOffers(world, 'country:0', 'identity-tests')[0]!;
    const career = createCareer(
      world,
      {
        name: 'Robin Vale',
        avatar: {
          face: 1,
          skin: 2,
          hair: 3,
          hairColor: 4,
          facialHair: 0,
          eyebrows: 1,
          eyes: 2,
          accessory: 3,
        },
        nationalityId: 'country:0',
        position: 'LW',
        foot: 'right',
        age: 17,
        archetype: 'finisher',
      },
      trial.id,
      'identity-tests',
    );
    const player = career.players[career.career!.playerId]!;
    expect(validFocus(player, 'opponent')).toBe(true);
    expect(focusAttributes(player, 'opponent')).toEqual([]);
    const fixture = nextCareerFixture(career)!;
    expect(careerMatchSetup(career, fixture).prepared).toBeUndefined();
    career.career!.training.sessions[0]!.focus = 'opponent';
    expect(careerMatchSetup(career, fixture).prepared).toBe(true);
  }, 120000);
});
