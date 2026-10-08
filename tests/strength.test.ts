import { describe, expect, it } from 'vitest';
import { lineupAbility } from '../src/engine/selection/lineup';
import { clubLineup } from '../src/engine/selection/world';
import { CONFIG } from '../src/engine/config';
import { createRng, type Rng } from '../src/engine/rng';
import {
  expectedGoals,
  playerAbility,
  selectStartingPlayers,
  teamStrength,
  strengthFromAbility,
} from '../src/engine/strength';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek } from '../src/engine/world/simulate';
import type { Club, World } from '../src/model/domain';

const world = generateWorld('strength-tests', { format: 'legacy' });
const squad = (source: World, club: Club) => club.playerIds.map((id) => source.players[id]!);
// Same Poisson sampler as the background resolver.
function poisson(rng: Rng, mean: number): number {
  const stop = Math.exp(-mean);
  let product = 1;
  let count = 0;
  do {
    product *= rng.next();
    count++;
  } while (product > stop && count <= CONFIG.world.maxGoals);
  return Math.min(CONFIG.world.maxGoals, count - 1);
}

describe('shared strength model', () => {
  it('averages outfield or goalkeeping attributes', () => {
    for (const player of Object.values(world.players).slice(0, 50)) {
      const values = Object.values(
        player.primaryPosition === 'GK' ? player.keeperAttributes : player.attributes,
      );
      expect(playerAbility(player)).toBeCloseTo(
        values.reduce((a, b) => a + b, 0) / values.length,
        12,
      );
    }
  });
  it('selects a goalkeeper, four defenders, three midfielders and three attackers by ability', () => {
    for (const club of Object.values(world.clubs).slice(0, 20)) {
      const starters = selectStartingPlayers(squad(world, club));
      expect(starters).toHaveLength(11);
      expect(starters[0]!.primaryPosition).toBe('GK');
      expect(starters.filter((p) => p.primaryPosition === 'GK')).toHaveLength(1);
      const keepers = squad(world, club).filter((p) => p.primaryPosition === 'GK');
      expect(playerAbility(starters[0]!)).toBe(Math.max(...keepers.map(playerAbility)));
      const defenders = starters.filter((p) => ['CB', 'LB', 'RB'].includes(p.primaryPosition));
      expect(defenders.length).toBeGreaterThanOrEqual(4);
      expect(new Set(starters.map((p) => p.id)).size).toBe(11);
    }
    const retired = structuredClone(squad(world, Object.values(world.clubs)[0]!));
    retired.forEach((p) => (p.retired = p.primaryPosition === 'ST'));
    expect(selectStartingPlayers(retired).some((p) => p.retired)).toBe(false);
  });
  it('implements the documented strength and expected-goal formulas', () => {
    const club = Object.values(world.clubs)[0]!;
    const starters = selectStartingPlayers(squad(world, club));
    const mean = starters.reduce((n, p) => n + playerAbility(p), 0) / starters.length;
    const B = CONFIG.world.background;
    expect(teamStrength(club.reputation, starters)).toBe(
      club.reputation * B.reputationWeight + mean * B.squadWeight,
    );
    const [home, away] = expectedGoals(70, 60, false);
    expect(home).toBeCloseTo(
      CONFIG.world.baseGoals + CONFIG.world.homeAdvantage + 10 * CONFIG.world.strengthScale,
      12,
    );
    expect(away).toBeCloseTo(
      CONFIG.world.baseGoals - CONFIG.world.homeAdvantage - 10 * CONFIG.world.strengthScale,
      12,
    );
    const [neutralHome, neutralAway] = expectedGoals(60, 60, true);
    expect(neutralHome).toBe(neutralAway);
    expect(expectedGoals(10, 200, false)[0]).toBe(B.minimumGoals);
  });
  const fixturesOf = (source: World, next: World) =>
    Object.values(source.fixtures).filter(
      (f) =>
        f.date.season === source.date.season &&
        f.date.week === source.date.week &&
        !f.tieId &&
        next.results[f.id],
    );
  it('reproduces the background resolver scores on generated clubs', () => {
    // Formation-aware: each manager's eleven, each starter valued in their slot.
    expect(world.selectionVersion).toBe(1);
    const next = simulateWeek(world);
    const fixtures = fixturesOf(world, next);
    expect(fixtures.length).toBeGreaterThan(20);
    const strength = (club: Club) =>
      strengthFromAbility(club.reputation, lineupAbility(clubLineup(world, club)!, world.players));
    for (const fixture of fixtures) {
      const [lambdaHome, lambdaAway] = expectedGoals(
        strength(world.clubs[fixture.homeId]!),
        strength(world.clubs[fixture.awayId]!),
        !!fixture.neutral,
      );
      const rng = createRng(`${world.seed}:result:${fixture.id}`);
      expect(next.results[fixture.id]!.score).toEqual([
        poisson(rng, lambdaHome),
        poisson(rng, lambdaAway),
      ]);
    }
  });
  it('keeps the line-based eleven in a world saved before formations', () => {
    const before: World = { ...world, selectionVersion: undefined };
    const next = simulateWeek(before);
    const fixtures = fixturesOf(before, next);
    expect(fixtures.length).toBeGreaterThan(20);
    for (const fixture of fixtures) {
      const home = world.clubs[fixture.homeId]!,
        away = world.clubs[fixture.awayId]!;
      const [lambdaHome, lambdaAway] = expectedGoals(
        teamStrength(home.reputation, selectStartingPlayers(squad(world, home))),
        teamStrength(away.reputation, selectStartingPlayers(squad(world, away))),
        !!fixture.neutral,
      );
      const rng = createRng(`${world.seed}:result:${fixture.id}`);
      expect(next.results[fixture.id]!.score).toEqual([
        poisson(rng, lambdaHome),
        poisson(rng, lambdaAway),
      ]);
    }
  });
});
