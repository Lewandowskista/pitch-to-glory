import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { CONFIG } from '../src/engine/config';
import {
  applyMatchCommand,
  buildChoices,
  createMatchSession,
  createMatchSetup,
  expectedImpact,
  momentBudget,
  rolesForPosition,
  situationWeights,
  validateMatchSession,
  OutdatedMatchSessionError,
  MATCH_ENGINE_VERSION,
  type DecisionContext,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { SITUATIONS } from '../src/engine/match';
import { hasMatchLabel } from '../src/i18n/match';
import type { Player, Position } from '../src/model/domain';

const world = generateWorld('match-tests', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const selectedAt = (position: Position, seed = 'match') =>
  createMatchSetup(
    world,
    clubs[0]!.id,
    clubs[1]!.id,
    clubs[0]!.playerIds.find((id) => world.players[id]!.primaryPosition === position)!,
    seed,
  );
const setup = selectedAt('ST');
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
type Policy = number | ((choices: { id: string }[]) => string);
function step(session: MatchSession, policy: Policy = 0): MatchSession {
  const s = session.state;
  const moment = s.currentMoment;
  return applyMatchCommand(
    session,
    s.match.status === 'preview'
      ? { type: 'kickoff' }
      : s.match.status === 'halftime'
        ? { type: 'halftime', response: 'motivate' }
        : s.substitutionDecisionPending
          ? { type: 'substitution', response: 'accept' }
          : s.captainDecisionPending
            ? { type: 'captain', instruction: 'calm' }
            : moment
              ? {
                  type: 'choose',
                  choiceId:
                    typeof policy === 'number'
                      ? moment.choices[Math.min(policy, moment.choices.length - 1)]!.id
                      : policy(moment.choices),
                }
              : { type: 'advance' },
  );
}
function finish(session: MatchSession, policy: Policy = 0) {
  while (session.state.match.status !== 'finished') session = step(session, policy);
  return session;
}
function untilMoment(session: MatchSession, situationId?: string) {
  let s = session;
  while (
    s.state.match.status !== 'finished' &&
    !(s.state.currentMoment && (!situationId || s.state.currentMoment.situationId === situationId))
  )
    s = step(s);
  return s;
}
/** Every footballer in both squads rated 60, so the match level is exactly 60. */
function levelled(source: MatchSetup, value = 60): MatchSetup {
  const copy = structuredClone(source);
  for (const player of Object.values(copy.players)) {
    for (const key of Object.keys(player.attributes) as (keyof Player['attributes'])[])
      player.attributes[key] = value;
    for (const key of Object.keys(player.keeperAttributes) as (keyof Player['keeperAttributes'])[])
      player.keeperAttributes[key] = value;
    player.fatigue = 0;
    player.form = 60;
  }
  return copy;
}
function uniform(value: number): DecisionContext['player'] {
  const player = structuredClone(setup.players[setup.selectedPlayerId]!);
  for (const key of Object.keys(player.attributes) as (keyof Player['attributes'])[])
    player.attributes[key] = value;
  for (const key of Object.keys(player.keeperAttributes) as (keyof Player['keeperAttributes'])[])
    player.keeperAttributes[key] = value;
  player.traits = [];
  return player;
}
/** Neutral analytic context: reference conditions, equal teams and a 60-rated opponent. */
function contexts(position: Position, value = 60): DecisionContext[] {
  const weights = situationWeights(position, 'balanced');
  const [attack, defence] = CONFIG.match.shares[position];
  return weights.map(({ situation }) => ({
    player: uniform(value),
    situation,
    budget: momentBudget(
      situation,
      weights,
      { attack, defence },
      { own: 1.45, opposition: 1.3 },
      10,
    ),
    matchLevel: 60,
    fatigue: 0,
    tactics: { role: 'balanced', risk: 'balanced', mentality: 'balanced' },
    weather: 'clear',
    pitchCondition: 90,
    strengthGap: 0,
    opponents: { keeper: 60, defender: 60, attacker: 60 },
  }));
}
const sideOf = (s: MatchSetup) => (s.players[s.selectedPlayerId]!.clubId === s.home.id ? 0 : 1);

describe('match engine', () => {
  it('draws decisions at the selected player and maps passes in the actual attacking direction', () => {
    let s = untilMoment(applyMatchCommand(createMatchSession(setup, tactics), { type: 'kickoff' }));
    const moment = s.state.currentMoment!;
    expect(moment.frame.ball).toEqual(
      moment.frame.players.find((player) => player.id === setup.selectedPlayerId)!.point,
    );
    s = applyMatchCommand(s, { type: 'choose', choiceId: moment.choices[0]!.id });
    const action = s.state.match.events.find((e) => e.outcome?.input.momentId === moment.id)!;
    expect(action.point).toEqual(moment.frame.ball);
    expect(action.endPoint).toBeDefined();
    const final = finish(s).state;
    expect(final.report!.passes.every((pass) => pass.from.x >= 0 && pass.to.x <= 100)).toBe(true);
  });
  it('calibrates 10,000 complete matches including reputation-gap upsets', () => {
    let goals = 0,
      homeGoals = 0,
      awayGoals = 0,
      homeWins = 0,
      awayWins = 0,
      closeUpsets = 0,
      wideUpsets = 0,
      draws = 0;
    for (let i = 0; i < 10000; i++) {
      const gap = i < 6000 ? 0 : i < 8000 ? 15 : 45;
      const candidate = {
        ...setup,
        seed: `distribution-${i}`,
        home: { ...setup.home, reputation: 50 + gap / 2 },
        away: { ...setup.away, reputation: 50 - gap / 2 },
      };
      const result = finish(createMatchSession(candidate, tactics), i % 3).state;
      const [h, a] = result.match.score;
      goals += h + a;
      if (i < 6000) {
        homeGoals += h;
        awayGoals += a;
        homeWins += Number(h > a);
        awayWins += Number(a > h);
        draws += Number(h === a);
      } else if (i < 8000) closeUpsets += Number(a > h);
      else wideUpsets += Number(a > h);
    }
    const distribution = {
      goalsPerMatch: goals / 10000,
      homeGoals: homeGoals / 6000,
      awayGoals: awayGoals / 6000,
      homeWin: homeWins / 6000,
      awayWin: awayWins / 6000,
      draw: draws / 6000,
      closeUpset: closeUpsets / 2000,
      wideUpset: wideUpsets / 2000,
    };
    process.stdout.write(`Match distribution: ${JSON.stringify(distribution)}\n`);
    expect(goals / 10000).toBeGreaterThan(2.5);
    expect(goals / 10000).toBeLessThan(2.9);
    expect(homeGoals).toBeGreaterThan(awayGoals);
    expect(homeWins).toBeGreaterThan(awayWins);
    expect(draws / 6000).toBeGreaterThan(0.18);
    expect(draws / 6000).toBeLessThan(0.35);
    expect(closeUpsets / 2000).toBeGreaterThan(0.15);
    expect(closeUpsets / 2000).toBeLessThan(0.36);
    expect(wideUpsets / 2000).toBeGreaterThan(0.03);
    expect(wideUpsets / 2000).toBeLessThan(0.2);
    expect(wideUpsets).toBeLessThan(closeUpsets);
  }, 60000);
  it('retains half-time recovery and requires captain instruction', () => {
    const chosen = structuredClone(setup);
    chosen.players[chosen.selectedPlayerId]!.attributes.leadership = 99;
    let s = createMatchSession(chosen, tactics);
    while (s.state.match.status !== 'halftime') s = step(s);
    const fatigue = s.state.stats.fatigue;
    s = applyMatchCommand(s, { type: 'halftime', response: 'motivate' });
    expect(s.state.stats.fatigue).toBeCloseTo(Math.max(0, fatigue - 8));
    expect(() => applyMatchCommand(s, { type: 'advance' })).toThrow();
    s = applyMatchCommand(s, { type: 'captain', instruction: 'calm' });
    s = applyMatchCommand(s, { type: 'advance' });
    expect(s.state.stats.fatigue).toBeLessThan(fatigue - 7);
  });
  it('removes substituted player from pitch, later actions and scoring', () => {
    const chosen = structuredClone(setup);
    chosen.players[chosen.selectedPlayerId]!.fatigue = 95;
    const s = finish(createMatchSession(chosen, tactics)).state;
    const substitution = s.match.events.find((e) => e.kind === 'substitution')!;
    expect(substitution).toBeDefined();
    expect(s.selectedPlayerMinutes).toBe(65);
    expect(
      s.frames
        .filter((f) => f.timeMs >= substitution.minute * 60000)
        .every((f) => !f.players.some((p) => p.id === chosen.selectedPlayerId)),
    ).toBe(true);
    expect(
      s.match.events.filter(
        (e) => e.minute > substitution.minute && e.playerId === chosen.selectedPlayerId,
      ),
    ).toHaveLength(0);
    // The replacement plays the same position when the bench has one.
    const initial = createMatchSession(chosen, tactics).state.match.home.starterIds;
    const incoming = s.match.home.starterIds.find((id) => !initial.includes(id))!;
    expect(chosen.players[incoming]!.primaryPosition).toBe('ST');
  });
  it('offers goalkeeper situations and preserves positional lineups', () => {
    const chosen = {
      ...setup,
      selectedPlayerId: setup.home.playerIds.find(
        (id) => setup.players[id]!.primaryPosition === 'GK',
      )!,
    };
    let s = applyMatchCommand(createMatchSession(chosen, tactics), { type: 'kickoff' });
    expect(s.state.match.home.starterIds.map((id) => setup.players[id]!.primaryPosition)).toEqual([
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'CM',
      'DM',
      'CM',
      'LW',
      'ST',
      'RW',
    ]);
    s = untilMoment(s);
    expect(['shot-incoming', 'one-on-one', 'cross-ball', 'distribution']).toContain(
      s.state.currentMoment!.situationId,
    );
    expect(finish(s).state.report).not.toBeNull();
  });
  it('conserves shots, goals and player maps', () => {
    for (let i = 0; i < 40; i++) {
      for (const position of ['ST', 'GK'] as const) {
        const s = finish(
          createMatchSession(selectedAt(position, `conserve-${i}`), tactics),
          i % 4,
        ).state;
        expect(s.stats.homeShots).toBe(
          s.match.events.filter((e) => e.kind === 'shot' && e.teamId === setup.home.id).length,
        );
        expect(s.stats.awayShots).toBe(
          s.match.events.filter((e) => e.kind === 'shot' && e.teamId === setup.away.id).length,
        );
        expect(s.match.score[0]).toBeLessThanOrEqual(s.stats.homeShots);
        expect(s.match.score[1]).toBeLessThanOrEqual(s.stats.awayShots);
        expect(s.match.events.filter((e) => e.kind === 'goal').length).toBe(
          s.match.score[0] + s.match.score[1],
        );
        expect(s.report!.passes.length).toBe(s.stats.passesAttempted);
      }
    }
  });
  it('replays immutably after JSON roundtrip and rejects forged state', () => {
    const initial = createMatchSession(setup, tactics),
      before = JSON.stringify(initial);
    const final = finish(initial, 1);
    expect(JSON.stringify(initial)).toBe(before);
    expect(validateMatchSession(JSON.parse(JSON.stringify(final)))).toEqual(final);
    const forged = JSON.parse(JSON.stringify(final));
    forged.state.match.score[0]++;
    expect(() => validateMatchSession(forged)).toThrow('deterministic replay');
  });
  it('rejects non-finite or unavailable setup players', () => {
    const bad = structuredClone(setup);
    bad.players[bad.selectedPlayerId]!.attributes.finishing = NaN;
    expect(() => createMatchSession(bad, tactics)).toThrow();
    const injured = structuredClone(setup);
    injured.players[injured.selectedPlayerId]!.injuryId = 'injury';
    expect(() => createMatchSession(injured, tactics)).toThrow();
  });
  it('rejects non-JSON state forgery and missing required attributes', () => {
    const s = createMatchSession(setup, tactics);
    const bad = structuredClone(s);
    bad.state.currentMoment = NaN as never;
    expect(() => validateMatchSession(bad)).toThrow();
    const player = structuredClone(setup);
    delete (
      player.players[player.selectedPlayerId]!.attributes as Partial<
        (typeof player.players)[string]['attributes']
      >
    ).stamina;
    expect(() => createMatchSession(player, tactics)).toThrow();
  });
  it('makes displayed factors sum to every probability in a full match', () => {
    for (const position of ['ST', 'CB', 'GK'] as const) {
      const final = finish(
        createMatchSession(selectedAt(position, `factors-${position}`), tactics),
        2,
      );
      for (const moment of final.state.match.keyMoments)
        for (const c of moment.choices) {
          expect(c.factors.reduce((n, f) => n + f.contribution, 0)).toBeCloseTo(c.probability, 10);
          expect(Math.round(c.probability * 1e6) / 1e6).toBe(c.probability);
          expect(c.factors.map((f) => f.source)).toEqual(
            expect.arrayContaining(['attribute', 'trait', 'defender', 'fatigue']),
          );
        }
      const report = final.state.report!;
      expect(report.ratingFactors.reduce((n, f) => n + f.contribution, 0)).toBeCloseTo(
        report.rating,
        9,
      );
    }
  });
  it('rejects extra command fields', () =>
    expect(() =>
      applyMatchCommand(createMatchSession(setup, tactics), {
        type: 'kickoff',
        forged: true,
      } as never),
    ).toThrow());
});

describe('decision fairness', () => {
  const profiles = ['ST', 'LW', 'CM', 'CB', 'GK'] as const;
  it('gives a 60-rated player choices of equal expected goal impact in every situation', () => {
    for (const position of profiles)
      for (const context of contexts(position)) {
        const impacts = buildChoices(context).map(expectedImpact);
        const mean = impacts.reduce((n, i) => n + i.net, 0) / impacts.length;
        const scale = context.budget.for + context.budget.against;
        for (const impact of impacts) {
          expect(
            Math.abs(impact.net - mean),
            `${position} ${context.situation.id}`,
          ).toBeLessThanOrEqual(0.15 * scale);
          // Defending never concedes more than the background expectation it replaces.
          expect(impact.against).toBeLessThanOrEqual(context.budget.against + 1e-5);
        }
        if (context.situation.choices.every((c) => c.opponent === 'attacker'))
          for (const impact of impacts) expect(impact.against).toBeLessThan(context.budget.against);
      }
  });
  it('shows football-plausible box-chance shot probabilities', () => {
    const at = (value: number) =>
      buildChoices(contexts('ST', value).find((c) => c.situation.id === 'box-chance')!).filter(
        (c) => c.stakes.successGoal === 1,
      );
    for (const shot of at(40)) expect(shot.probability).toBeGreaterThanOrEqual(0.07);
    for (const shot of at(60)) {
      expect(shot.probability).toBeGreaterThan(0.1);
      expect(shot.probability).toBeLessThan(0.22);
    }
    for (const shot of at(80)) expect(shot.probability).toBeLessThanOrEqual(0.3);
  });
  it('raises success probability and goal value with the governing attributes', () => {
    for (const position of profiles) {
      const low = contexts(position, 40),
        high = contexts(position, 80);
      low.forEach((context, index) => {
        const weak = buildChoices(context),
          strong = buildChoices(high[index]!);
        weak.forEach((choice, i) => {
          const label = `${position} ${context.situation.id} ${choice.id}`;
          expect(strong[i]!.probability, label).toBeGreaterThan(choice.probability);
          expect(expectedImpact(strong[i]!).net, label).toBeGreaterThan(expectedImpact(choice).net);
        });
      });
    }
  });
  it('keeps team goals within a narrow band whichever choice a 60-rated player always makes', () => {
    const rows: Record<string, number[][]> = {};
    for (const position of ['ST', 'CB', 'GK'] as const) {
      const base = levelled(selectedAt(position));
      const side = sideOf(base);
      rows[position] = [0, 1, 2, 3].map((policy) => {
        let goalsFor = 0,
          goalsAgainst = 0;
        for (let i = 0; i < 250; i++) {
          const score = finish(
            createMatchSession({ ...base, seed: `policy-${i}` }, tactics),
            policy,
          ).state.match.score;
          goalsFor += score[side]!;
          goalsAgainst += score[1 - side]!;
        }
        return [goalsFor / 250, goalsAgainst / 250];
      });
      for (const column of [0, 1]) {
        const values = rows[position]!.map((row) => row[column]!);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        for (const value of values) expect(Math.abs(value - mean) / mean).toBeLessThan(0.12);
      }
    }
    process.stdout.write(`Policy goals [for, against] by choice index: ${JSON.stringify(rows)}\n`);
  }, 60000);
});

describe('match edge cases', () => {
  it('derives each choice roll from its own stream', () => {
    const s = untilMoment(
      applyMatchCommand(createMatchSession(setup, tactics), { type: 'kickoff' }),
    );
    const rolls = s.state.currentMoment!.choices.map((choice) => {
      const next = applyMatchCommand(s, { type: 'choose', choiceId: choice.id });
      return next.state.match.events.find((e) => e.outcome?.input.choiceId === choice.id)!.outcome!
        .roll;
    });
    expect(new Set(rolls).size).toBe(rolls.length);
  });
  it('never triggers a substitution at full time and rejects late substitution answers', () => {
    let s = applyMatchCommand(createMatchSession(setup, tactics), { type: 'kickoff' });
    while (s.state.match.minute < 89 || s.state.match.status !== 'live') s = step(s);
    const tired = structuredClone(s);
    tired.state.stats.fatigue = 99;
    const final = applyMatchCommand(tired, { type: 'advance' });
    expect(final.state.match.status).toBe('finished');
    expect(final.state.substituted).toBe(false);
    expect(final.state.match.events.some((e) => e.kind === 'substitution')).toBe(false);
    const forged = structuredClone(final);
    forged.state.substitutionDecisionPending = true;
    expect(() => applyMatchCommand(forged, { type: 'substitution', response: 'accept' })).toThrow();
  });
  it('substitutes on fatigue only, not on the starting fitness value', () => {
    const chosen = structuredClone(setup);
    chosen.players[chosen.selectedPlayerId]!.fitness = 49;
    chosen.players[chosen.selectedPlayerId]!.fatigue = 0;
    const s = finish(createMatchSession(chosen, tactics)).state;
    expect(s.substituted).toBe(false);
    expect(s.selectedPlayerMinutes).toBe(90);
  });
  it('moves mentality one step with captain instructions', () => {
    const chosen = structuredClone(setup);
    chosen.players[chosen.selectedPlayerId]!.attributes.leadership = 99;
    for (const [start, instruction, expected] of [
      ['balanced', 'push', 'attacking'],
      ['balanced', 'calm', 'defensive'],
      ['defensive', 'calm', 'defensive'],
      ['attacking', 'push', 'attacking'],
      ['attacking', 'calm', 'balanced'],
    ] as const) {
      let s = createMatchSession(chosen, { ...tactics, mentality: start });
      while (s.state.match.status !== 'halftime') s = step(s);
      s = applyMatchCommand(s, { type: 'halftime', response: 'motivate' });
      const before = s.state.expectedGoals;
      s = applyMatchCommand(s, { type: 'captain', instruction });
      expect(s.state.match.tactics.mentality).toBe(expected);
      if (start !== expected)
        expect(s.state.expectedGoals[0]! > before[0]!).toBe(instruction === 'push');
    }
  });
  it('changes to a different role from the position list at half-time and validates roles', () => {
    for (const position of ['ST', 'LW', 'CB', 'GK'] as const) {
      const chosen = selectedAt(position);
      const player = chosen.players[chosen.selectedPlayerId]!;
      for (const role of rolesForPosition(player.primaryPosition)) {
        let s = createMatchSession(chosen, { ...tactics, role });
        while (s.state.match.status !== 'halftime') s = step(s);
        s = applyMatchCommand(s, { type: 'halftime', response: 'role' });
        expect(rolesForPosition(player.primaryPosition)).toContain(s.state.match.tactics.role);
        expect(s.state.match.tactics.role).not.toBe(role);
      }
    }
    expect(() =>
      createMatchSession(selectedAt('CB'), { ...tactics, role: 'cut-inside' }),
    ).toThrow();
    expect(() => createMatchSession(selectedAt('GK'), { ...tactics, role: 'sweeper' })).toThrow();
    expect(() =>
      createMatchSession(selectedAt('ST'), { ...tactics, role: 'hug-touchline' }),
    ).toThrow();
  });
  it('logs keeper saves and only records shots that happen', () => {
    const keeper = selectedAt('GK');
    let saves = 0,
      distributions = 0;
    for (let i = 0; i < 12; i++) {
      let s = applyMatchCommand(createMatchSession({ ...keeper, seed: `keeper-${i}` }, tactics), {
        type: 'kickoff',
      });
      while (s.state.match.status !== 'finished') {
        const moment = s.state.currentMoment;
        if (!moment) {
          s = step(s);
          continue;
        }
        const count = s.state.match.events.length;
        s = applyMatchCommand(s, { type: 'choose', choiceId: moment.choices[0]!.id });
        const added = s.state.match.events.slice(count);
        const action = added.find((e) => e.outcome?.input.momentId === moment.id)!;
        if (moment.situationId === 'distribution') {
          distributions++;
          expect(action.kind).toBe('pass');
          expect(added.some((e) => e.kind === 'save')).toBe(false);
        } else {
          expect(action.kind).toBe('save');
          if (moment.situationId === 'shot-incoming') {
            saves += Number(action.outcome!.success);
            expect(added[0]!.kind).toBe('shot');
          }
          const stakes = moment.choices[0]!.stakes;
          if (action.outcome!.success && stakes.successConcede === 0 && stakes.failureConcede < 1) {
            // A claimed cross or smothered one-on-one never becomes an opponent shot.
            expect(added[0]).toBe(action);
            expect(added.some((e) => e.commentaryKey.startsWith('match.commentary.counter'))).toBe(
              false,
            );
          }
        }
      }
    }
    expect(saves).toBeGreaterThan(0);
    expect(distributions).toBeGreaterThan(0);
  });
  it('derives possession from strength and momentum from recent events', () => {
    const strong = structuredClone(setup);
    strong.home.reputation = 95;
    strong.away.reputation = 20;
    const even = createMatchSession(setup, tactics).state.stats.homePossession;
    expect(createMatchSession(strong, tactics).state.stats.homePossession).toBeGreaterThan(
      even + 10,
    );
    const s = finish(createMatchSession(setup, tactics), 1);
    const shotMinute = s.state.match.events.find((e) => e.kind === 'shot')!.minute;
    let replay = applyMatchCommand(createMatchSession(setup, tactics), { type: 'kickoff' });
    const values: number[] = [];
    while (replay.state.match.status !== 'finished') {
      replay = step(replay, 1);
      values.push(replay.state.match.momentum);
    }
    expect(new Set(values).size).toBeGreaterThan(5);
    expect(shotMinute).toBeGreaterThan(0);
  });
  it('applies pitch and weather conditions as a displayed factor', () => {
    const context = contexts('ST').find((c) => c.situation.id === 'box-chance')!;
    const good = buildChoices(context).find((c) => c.id === 'take-on')!;
    const poor = buildChoices({ ...context, pitchCondition: 40, weather: 'rain' }).find(
      (c) => c.id === 'take-on',
    )!;
    expect(poor.probability).toBeLessThan(good.probability);
    expect(
      poor.factors.find((f) => f.labelKey === 'match.factor.conditions')!.contribution,
    ).toBeLessThan(0);
  });
  it('has copy for every situation, choice, factor and commentary line the engine emits', () => {
    const keys = new Set<string>();
    for (const situation of SITUATIONS) {
      keys.add(`match.situation.${situation.id}`);
      for (const choice of situation.choices) {
        keys.add(`match.choice.${choice.id}`);
        for (const result of ['success', 'failure'])
          for (let variant = 0; variant < CONFIG.match.commentaryVariants; variant++)
            keys.add(`match.commentary.${choice.commentary}.${result}.${variant}`);
      }
    }
    for (const position of ['ST', 'LW', 'CM', 'CB', 'GK'] as const)
      for (const policy of [0, 1, 2]) {
        const s = finish(
          createMatchSession(selectedAt(position, `copy-${policy}`), tactics),
          policy,
        ).state;
        for (const e of s.match.events) keys.add(e.commentaryKey);
        for (const moment of s.match.keyMoments)
          for (const c of moment.choices) for (const f of c.factors) keys.add(f.labelKey);
        for (const f of s.report!.ratingFactors) keys.add(f.labelKey);
      }
    expect([...keys].filter((key) => !hasMatchLabel(key))).toEqual([]);
  });
  it('rejects outdated or missing engine versions before replaying', () => {
    const session = finish(createMatchSession(setup, tactics));
    expect(session.engine).toBe(MATCH_ENGINE_VERSION);
    const outdated = JSON.parse(JSON.stringify(session));
    outdated.engine = 'match-3';
    outdated.commands = [{ type: 'unknown' }];
    expect(() => validateMatchSession(outdated)).toThrow(OutdatedMatchSessionError);
    const missing = JSON.parse(JSON.stringify(session));
    delete missing.engine;
    expect(() => validateMatchSession(missing)).toThrow(OutdatedMatchSessionError);
  });
});
