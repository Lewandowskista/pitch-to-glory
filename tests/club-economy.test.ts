import { beforeAll, describe, expect, it } from 'vitest';
import type { Club, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { economyCosts, usualWages } from '../src/engine/world/economy';
import { clubSupport } from '../src/engine/career/training';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 4, step 4.4: club balances can go into debt, the wage budget is what a club
 * earns for wages, and a club paying more than that is under strain.
 */
const E = CONFIG.world.background.economy;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
let world: World;
beforeAll(() => {
  world = generateWorld('club-economy', { format: 'legacy' });
}, 120000);

const wagesOf = (w: World, club: Club) =>
  club.playerIds.reduce((sum, id) => sum + w.contracts[w.players[id]!.contractId!]!.weeklyWage, 0);
/** The club's wages raised to `share` of what it earns. */
function payroll(w: World, club: Club, share: number): void {
  const net = club.finances.weeklyIncome - club.finances.weeklyCosts;
  const factor = (net * share) / wagesOf(w, club);
  for (const id of club.playerIds) {
    const contract = w.contracts[w.players[id]!.contractId!]!;
    contract.weeklyWage = Math.round(contract.weeklyWage * factor);
  }
}

describe('the club economy', () => {
  it('starts new worlds on it, with running costs set from what peers pay', () => {
    expect(world.economyVersion).toBe(1);
    const usual = usualWages(world);
    for (const club of Object.values(world.clubs).filter((c) => world.leagues[c.leagueId]))
      expect(club.finances.weeklyCosts).toBe(
        economyCosts(usual.get(club.id)!, club.finances.weeklyIncome),
      );
    // The typical club spends the configured share of what it earns on wages.
    const shares = Object.values(world.clubs)
      .filter((c) => world.leagues[c.leagueId])
      .map((c) => wagesOf(world, c) / (c.finances.weeklyIncome - c.finances.weeklyCosts))
      .sort((a, b) => a - b);
    expect(shares[Math.floor(shares.length / 2)]!).toBeCloseTo(E.wageShare, 1);
  });

  it('budgets wages from earnings, and strains a club that pays more', () => {
    const w = clone(world);
    const club = Object.values(w.clubs).find((c) => w.leagues[c.leagueId])!;
    payroll(w, club, 1.2);
    simulateWeek(w, { inPlace: true });
    const after = w.clubs[club.id]!;
    expect(after.finances.wageBudget).toBe(
      after.finances.weeklyIncome - after.finances.weeklyCosts,
    );
    expect(after.finances.strain).toBe('stretched');
    expect(clubSupport(after)).toBe(E.support.stretched);
    // Paying less than it earns: healthy again, and full support.
    payroll(w, after, 0.8);
    simulateWeek(w, { inPlace: true });
    expect(w.clubs[club.id]!.finances.strain).toBeUndefined();
    expect(clubSupport(w.clubs[club.id]!)).toBe(1);
  }, 120000);

  it('lets a club run into debt, to a floor, and saves it', () => {
    const w = clone(world);
    const club = Object.values(w.clubs).find((c) => w.leagues[c.leagueId])!;
    club.finances.balance = 1000;
    payroll(w, club, 1.5);
    simulateWeek(w, { inPlace: true });
    const after = w.clubs[club.id]!;
    expect(after.finances.balance).toBeLessThan(0);
    expect(after.finances.strain).toBe('debt');
    expect(after.finances.transferBudget).toBe(0);
    // A debt takes from the wage budget.
    expect(after.finances.wageBudget).toBeLessThan(
      after.finances.weeklyIncome - after.finances.weeklyCosts,
    );
    after.finances.balance = -10 * E.debtFloorWeeks * after.finances.weeklyIncome;
    simulateWeek(w, { inPlace: true });
    expect(w.clubs[club.id]!.finances.balance).toBe(
      -E.debtFloorWeeks * w.clubs[club.id]!.finances.weeklyIncome,
    );
    expect(() => validateWorld(clone(w))).not.toThrow();
  }, 120000);

  it('keeps worlds from before it on the old rules until a season starts', () => {
    const w = clone(world);
    delete w.economyVersion;
    const club = Object.values(w.clubs).find((c) => w.leagues[c.leagueId])!;
    club.finances.balance = 1000;
    const budget = club.finances.wageBudget;
    payroll(w, club, 1.5);
    simulateWeek(w, { inPlace: true });
    expect(w.clubs[club.id]!.finances.balance).toBe(0);
    expect(w.clubs[club.id]!.finances.wageBudget).toBeGreaterThanOrEqual(budget);
    expect(w.clubs[club.id]!.finances.strain).toBeUndefined();
    while (w.phase === 'active') simulateWeek(w, { inPlace: true });
    const next = startNextSeason(w);
    expect(next.economyVersion).toBe(1);
    const usual = usualWages(next);
    const any = Object.values(next.clubs).find((c) => next.leagues[c.leagueId])!;
    expect(any.finances.weeklyCosts).toBe(
      economyCosts(usual.get(any.id)!, any.finances.weeklyIncome),
    );
  }, 300000);
});
