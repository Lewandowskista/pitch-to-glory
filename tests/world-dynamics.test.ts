import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import {
  generateWorld,
  foreignChance,
  generatedPotential,
  triangularAge,
} from '../src/engine/world/generate';
import {
  lifecycleWeeks,
  reputationBand,
  simulateWeek,
  startNextSeason,
} from '../src/engine/world/simulate';
import { aiTransferWindow } from '../src/engine/world/transfers';
import { selectLineup } from '../src/engine/selection/lineup';
import { clubFormation } from '../src/engine/selection/world';
import { getSeasonWeeks } from '../src/engine/world/calendar';
import { playerAbility } from '../src/engine/strength';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Balance pass C (docs/GAME-DESIGN-REVIEW.md): a world that moves. Reputation follows results,
 * clubs buy and sell for fees, elevens rotate, AI players get injured, managers are sacked on
 * a hazard, and generation produces a believable spread of ages, nationalities and talent.
 */
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const national = generateWorld('dynamics-tests');

describe('generation', () => {
  it('draws ages around the mid-twenties and feet mostly one-sided', () => {
    const rng = createRng('ages');
    const ages = Array.from({ length: 4000 }, () => triangularAge(rng));
    const [low, high] = CONFIG.world.generation.adultAge;
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(low);
    expect(Math.max(...ages)).toBeLessThanOrEqual(high);
    const share = (from: number, to: number) =>
      ages.filter((age) => age >= from && age <= to).length / ages.length;
    expect(share(23, 28)).toBeGreaterThan(share(31, 36));
    expect(share(33, 36)).toBeLessThan(0.1);
    const feet = Object.values(national.players).map((player) => player.foot);
    expect(feet.filter((foot) => foot === 'both').length / feet.length).toBeLessThan(0.1);
  });
  it('signs more foreigners at bigger clubs and lets giants draw rarer talent', () => {
    expect(foreignChance(10)).toBeCloseTo(CONFIG.world.generation.foreignShare.base, 5);
    expect(foreignChance(90)).toBeGreaterThan(0.5);
    expect(foreignChance(65)).toBeGreaterThan(foreignChance(40));
    const sample = (reputation: number, age: number) => {
      const rng = createRng(`talent:${reputation}:${age}`);
      const values = Array.from({ length: 3000 }, () => generatedPotential(reputation, age, rng));
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    // The same club: a right-skewed draw at a giant, a plain one at a small club.
    const G = CONFIG.world.generation;
    expect(sample(95, 25)).toBeGreaterThan(95 * G.peakReputationWeight + G.peakBase + 2);
    expect(Math.abs(sample(30, 25) - (30 * G.peakReputationWeight + G.peakBase))).toBeLessThan(1);
    // Academy intakes vary more but sit on the same scale.
    expect(Math.abs(sample(60, 17) - sample(60, 25))).toBeLessThan(2);
  });
});

describe('a season that moves the world', () => {
  // One full national season, shared by the tests below (about twenty seconds).
  let world = clone(national);
  const reputationBefore = new Map(
    Object.values(world.clubs).map((club) => [club.id, club.reputation]),
  );
  let transfers = 0;
  let sackings = 0;
  let injuredMidSeason = 0;
  while (world.phase === 'active') {
    world = simulateWeek(world, { inPlace: true, allowCareerFixture: true });
    if (world.date.week === 30)
      injuredMidSeason = Object.values(world.players).filter((player) => player.injuryId).length;
  }
  for (const event of world.events) {
    if (event.kind === 'transfer' && Number(event.params.fee) > 0) transfers++;
    if (event.kind === 'manager-change') sackings++;
  }

  it('moves reputation by the finish and keeps every club within its band margin', () => {
    const moved = Object.values(world.clubs).filter(
      (club) => club.reputation !== reputationBefore.get(club.id),
    );
    expect(moved.length).toBeGreaterThan(100);
    const R = CONFIG.world.background.reputation;
    for (const league of Object.values(world.leagues)) {
      const table = world.history.at(-1)!.tables[league.id]!;
      const top = world.clubs[table[0]!.clubId]!;
      const bottom = world.clubs[table.at(-1)!.clubId]!;
      const topDelta = top.reputation - reputationBefore.get(top.id)!;
      const bottomDelta = bottom.reputation - reputationBefore.get(bottom.id)!;
      expect(topDelta).toBeGreaterThanOrEqual(bottomDelta);
      for (const club of [top, bottom]) {
        expect(Math.abs(club.reputation - reputationBefore.get(club.id)!)).toBeLessThanOrEqual(
          R.maximumChange + R.championsWinner,
        );
      }
    }
    // Clubs that stay in their tier keep within its band margin.
    const stayed = Object.values(world.clubs).filter(
      (club) =>
        !world.history.at(-1)!.movements.some((movement) => movement.clubId === club.id) &&
        world.leagues[club.leagueId],
    );
    expect(stayed.length).toBeGreaterThan(500);
    for (const club of stayed) {
      const [floor, ceiling] = reputationBand(world.leagues[club.leagueId]!.tier);
      const before = reputationBefore.get(club.id)!;
      if (before >= floor - R.bandMargin && before <= ceiling + R.bandMargin) {
        expect(club.reputation).toBeGreaterThanOrEqual(floor - R.bandMargin);
        expect(club.reputation).toBeLessThanOrEqual(ceiling + R.bandMargin);
      }
    }
  });
  it('buys and sells for fees that move between the clubs, upward in reputation', () => {
    expect(transfers).toBeGreaterThan(300);
    const paid = world.events.filter(
      (event) => event.kind === 'transfer' && Number(event.params.fee) > 0,
    );
    for (const event of paid.slice(0, 50)) {
      const [playerId, fromId, toId] = event.entityIds;
      // Reputations as they stood during the season, before the season-end update.
      expect(reputationBefore.get(toId!)!).toBeGreaterThan(reputationBefore.get(fromId!)!);
      expect(world.players[playerId!]!.id).toBe(playerId);
    }
  });
  it('sacks managers on a hazard, with a grace period for the new one', () => {
    expect(sackings).toBeGreaterThan(30);
    expect(sackings).toBeLessThan(300);
    const appointed = Object.values(world.managers).filter((manager) => manager.appointed);
    expect(appointed.length).toBeGreaterThan(0);
    // No club sacked two managers within the cooldown.
    const changes = world.events.filter((event) => event.kind === 'manager-change');
    const byClub = new Map<string, number[]>();
    for (const change of changes) {
      const weeks = byClub.get(change.entityIds[0]!) ?? [];
      weeks.push(change.date.week);
      byClub.set(change.entityIds[0]!, weeks);
    }
    for (const weeks of byClub.values())
      for (let index = 1; index < weeks.length; index++)
        expect(weeks[index]! - weeks[index - 1]!).toBeGreaterThanOrEqual(
          CONFIG.world.background.sacking.cooldownWeeks,
        );
  });
  it('injures AI players for a spell that runs down, and keeps the save valid', () => {
    expect(injuredMidSeason).toBeGreaterThan(100);
    for (const player of Object.values(world.players))
      if (player.injuryId && player.id !== world.career?.playerId)
        expect(player.injuryWeeks).toBeGreaterThanOrEqual(1);
    expect(() => validateWorld(clone(world))).not.toThrow();
    const next = startNextSeason(world);
    expect(() => validateWorld(clone(next))).not.toThrow();
  });
  it('keeps the tiers at their level', () => {
    const means = (w: World) =>
      [1, 2, 3].map((tier) => {
        const values = Object.values(w.leagues)
          .filter((league) => league.tier === tier)
          .flatMap((league) => league.clubIds.flatMap((id) => w.clubs[id]!.playerIds))
          .map((id) => playerAbility(w.players[id]!));
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      });
    const before = means(national);
    const after = means(world);
    before.forEach((value, index) => expect(Math.abs(value - after[index]!)).toBeLessThan(4));
  });
});

describe('rotation and lifecycle weeks', () => {
  it('rotates a background eleven by a fixture-seeded jitter, deterministically', () => {
    const club = Object.values(national.clubs).find((c) => c.playerIds.length >= 20)!;
    const formation = clubFormation(national, club);
    const plain = selectLineup(club.playerIds, national.players, formation);
    const a = selectLineup(club.playerIds, national.players, formation, {
      seed: 'f1',
      rotation: 8,
    });
    const b = selectLineup(club.playerIds, national.players, formation, {
      seed: 'f1',
      rotation: 8,
    });
    const c = selectLineup(club.playerIds, national.players, formation, {
      seed: 'f2',
      rotation: 8,
    });
    expect(a.starterIds).toEqual(b.starterIds);
    const differs = (x: string[], y: string[]) => x.some((id, index) => id !== y[index]);
    expect(differs(a.starterIds, plain.starterIds) || differs(c.starterIds, plain.starterIds)).toBe(
      true,
    );
    expect(new Set(a.starterIds).size).toBe(11);
  });
  it('derives the transfer and intake weeks from the season length', () => {
    const weeks = lifecycleWeeks(national);
    const season = getSeasonWeeks(national);
    expect(weeks.intake).toBe(Math.round(CONFIG.world.lifecycleFractions.intake * season));
    expect(weeks.transfer).toHaveLength(4);
    expect(Math.max(...weeks.transfer)).toBeLessThan(season);
    const legacy = generateWorld('legacy-weeks', { format: 'legacy' });
    expect(lifecycleWeeks(legacy)).toEqual({
      transfer: [...CONFIG.world.transferWeeks],
      intake: CONFIG.world.intakeWeek,
    });
  });
  it('runs no market in a world from before the pyramid', () => {
    const legacy = generateWorld('legacy-market', { format: 'legacy' });
    expect(aiTransferWindow(legacy, createRng('x'))).toBe(0);
  });
});
