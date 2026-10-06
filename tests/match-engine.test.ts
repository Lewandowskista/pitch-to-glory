import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  validateMatchSession,
  type MatchSession,
} from '../src/engine/match';

const world = generateWorld('match-tests', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const setup = createMatchSetup(
  world,
  clubs[0]!.id,
  clubs[1]!.id,
  clubs[0]!.playerIds.find((id) => world.players[id]!.primaryPosition === 'ST')!,
  'match',
);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
function finish(session: MatchSession, action = 'pass') {
  while (session.state.match.status !== 'finished') {
    const s = session.state;
    session = applyMatchCommand(
      session,
      s.match.status === 'preview'
        ? { type: 'kickoff' }
        : s.match.status === 'halftime'
          ? { type: 'halftime', response: 'motivate' }
          : s.substitutionDecisionPending
            ? { type: 'substitution', response: 'accept' }
            : s.captainDecisionPending
              ? { type: 'captain', instruction: 'calm' }
              : s.currentMoment
                ? {
                    type: 'choose',
                    choiceId:
                      s.currentMoment.choices.find((c) => c.id === action)?.id ??
                      s.currentMoment.choices[0]!.id,
                  }
                : { type: 'advance' },
    );
  }
  return session;
}
describe('match engine', () => {
  it('draws decisions at the selected player and maps passes in the actual attacking direction', () => {
    let s = applyMatchCommand(createMatchSession(setup, tactics), { type: 'kickoff' });
    while (!s.state.currentMoment) s = applyMatchCommand(s, { type: 'advance' });
    const moment = s.state.currentMoment!;
    expect(moment.frame.ball).toEqual(
      moment.frame.players.find((player) => player.id === setup.selectedPlayerId)!.point,
    );
    s = applyMatchCommand(s, { type: 'choose', choiceId: 'pass' });
    const pass = s.state.match.events.find((event) => event.outcome?.input.momentId === moment.id)!;
    expect(pass.point).toEqual(moment.frame.ball);
    expect(pass.endPoint).toBeDefined();
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
      const result = finish(
        createMatchSession(candidate, tactics),
        i % 3 === 0 ? 'near' : i % 3 === 1 ? 'pass' : 'dribble',
      ).state;
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
    while (s.state.match.status !== 'halftime')
      s = applyMatchCommand(
        s,
        s.state.match.status === 'preview'
          ? { type: 'kickoff' }
          : s.state.currentMoment
            ? { type: 'choose', choiceId: 'pass' }
            : { type: 'advance' },
      );
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
    const s = finish(createMatchSession(chosen, tactics), 'near').state;
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
  });
  it('offers goalkeeper actions and preserves positional lineups', () => {
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
    while (!s.state.currentMoment) s = applyMatchCommand(s, { type: 'advance' });
    expect(s.state.currentMoment!.choices.map((c) => c.id)).toEqual([
      'hold',
      'parry',
      'rush',
      'distribute',
    ]);
    expect(finish(s, 'hold').state.report).not.toBeNull();
  });
  it('conserves shots, goals and player maps', () => {
    for (let i = 0; i < 50; i++) {
      const s = finish(
        createMatchSession({ ...setup, seed: `conserve-${i}` }, tactics),
        'near',
      ).state;
      expect(s.stats.homeShots).toBe(
        s.match.events.filter((e) => e.kind === 'shot' && e.teamId === setup.home.id).length,
      );
      expect(s.stats.awayShots).toBe(
        s.match.events.filter((e) => e.kind === 'shot' && e.teamId === setup.away.id).length,
      );
      expect(s.match.score[0]).toBeLessThanOrEqual(s.stats.homeShots);
      expect(s.match.events.filter((e) => e.kind === 'goal').length).toBe(
        s.match.score[0] + s.match.score[1],
      );
      expect(s.report!.passes.length).toBe(s.stats.passesAttempted);
    }
  });
  it('replays immutably after JSON roundtrip and rejects forged state', () => {
    const initial = createMatchSession(setup, tactics),
      before = JSON.stringify(initial);
    const final = finish(initial);
    expect(JSON.stringify(initial)).toBe(before);
    expect(validateMatchSession(JSON.parse(JSON.stringify(final)))).toEqual(final);
    const forged = JSON.parse(JSON.stringify(final));
    forged.state.match.score[0]++;
    expect(() => validateMatchSession(forged)).toThrow();
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
  it('makes displayed factors sum to probability', () => {
    let s = applyMatchCommand(createMatchSession(setup, tactics), { type: 'kickoff' });
    while (!s.state.currentMoment) s = applyMatchCommand(s, { type: 'advance' });
    for (const c of s.state.currentMoment!.choices)
      expect(c.factors.reduce((n, f) => n + f.contribution, 0)).toBeCloseTo(c.probability, 10);
  });
  it('rejects extra command fields', () =>
    expect(() =>
      applyMatchCommand(createMatchSession(setup, tactics), {
        type: 'kickoff',
        forged: true,
      } as never),
    ).toThrow());
});
