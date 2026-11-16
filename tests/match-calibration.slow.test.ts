import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchSession,
} from '../src/engine/match';
import type { Position } from '../src/model/domain';

/**
 * The match engine's statistical gate (AGENTS.md section 7): 10,000 complete matches. The match
 * engine works on a setup of two squads, whatever the world's format, so a compact world is a
 * cheap source of clubs here.
 */
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
          : s.injuryDecisionPending
            ? { type: 'injury', response: 'play-on' }
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

describe('match calibration', () => {
  // Every match also choreographs its motion (about 4 ms), so the gate needs a larger budget.
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
  }, 360000);
});
