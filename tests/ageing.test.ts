import { describe, expect, it } from 'vitest';
import type { Player, World } from '../src/model/domain';
import {
  ageCurve,
  attributeTarget,
  developWeek,
  generateAttributes,
  peakValue,
  profileOffset,
  recalibratePotential,
  ATTRIBUTE_KEYS,
} from '../src/engine/ageing';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { playerAbility } from '../src/engine/strength';

const profile = { id: 'player:test', primaryPosition: 'ST' as const, potential: 70 };

describe('ageing curves', () => {
  it('peaks pace first, technique later and mental attributes last', () => {
    expect(ageCurve('pace', 24)).toBe(1);
    expect(ageCurve('pace', 30)).toBeLessThan(ageCurve('technical', 30));
    expect(ageCurve('technical', 30)).toBeLessThanOrEqual(ageCurve('mental', 30));
    expect(ageCurve('mental', 33)).toBe(1);
    expect(ageCurve('physical', 17)).toBeLessThan(ageCurve('physical', 22));
    // Interpolation is continuous and clamped at the ends.
    expect(ageCurve('pace', 10)).toBe(ageCurve('pace', 16));
    expect(ageCurve('pace', 60)).toBe(ageCurve('pace', 40));
    expect(ageCurve('technical', 25)).toBeCloseTo((0.96 + 1) / 2, 5);
  });
  it('gives every player a stable, distinct attribute profile', () => {
    expect(profileOffset('a', 'finishing')).toBe(profileOffset('a', 'finishing'));
    const offsets = ATTRIBUTE_KEYS.map((key) => profileOffset('a', key));
    expect(new Set(offsets).size).toBeGreaterThan(5);
    expect(peakValue(profile, 'finishing')).toBeGreaterThan(
      peakValue({ ...profile, primaryPosition: 'CB' }, 'finishing'),
    );
    expect(attributeTarget(profile, 'pace', 34)).toBeLessThan(attributeTarget(profile, 'pace', 25));
  });
  it('generates attributes on the curve and develops toward the target', () => {
    const { attributes } = generateAttributes(profile, 18, createRng('gen'));
    for (const key of ATTRIBUTE_KEYS)
      expect(Math.abs(attributes[key] - attributeTarget(profile, key, 18))).toBeLessThanOrEqual(2);
    const player = {
      ...profile,
      attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 20])),
      keeperAttributes: {
        handling: 5,
        reflexes: 5,
        diving: 5,
        oneOnOnes: 5,
        kicking: 5,
        commandOfArea: 5,
        aerialReach: 5,
      },
      hidden: { professionalism: 60 },
    } as unknown as Player;
    const rng = createRng('develop');
    for (let week = 0; week < 120; week++) developWeek(player, 24, 60, rng);
    expect(playerAbility(player)).toBeGreaterThan(50);
    for (let week = 0; week < 240; week++) developWeek(player, 36, 60, rng);
    expect(player.attributes.pace).toBeLessThan(attributeTarget(profile, 'pace', 24));
  });
  it('recalibrates an old-style potential to the implied peak ability', () => {
    const player = {
      id: 'old',
      primaryPosition: 'CM',
      potential: 95,
      attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 50])),
      keeperAttributes: {},
    } as unknown as Player;
    const potential = recalibratePotential(player, 26);
    expect(potential).toBeGreaterThan(45);
    expect(potential).toBeLessThan(56);
  });
});

describe('world equilibrium', () => {
  it('keeps tier ability stable over several seasons instead of drifting upward', () => {
    const tierMean = (world: World) => {
      const totals = new Map<number, number[]>();
      for (const club of Object.values(world.clubs)) {
        const tier = world.leagues[club.leagueId]!.tier;
        const values = club.playerIds.map((id) => playerAbility(world.players[id]!));
        totals.set(tier, [...(totals.get(tier) ?? []), ...values]);
      }
      return [...totals.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, values]) => values.reduce((sum, v) => sum + v, 0) / values.length);
    };
    let world = generateWorld('equilibrium', { format: 'legacy' });
    expect(world.developmentVersion).toBe(2);
    const start = tierMean(world);
    for (let season = 0; season < 4; season++) {
      while (world.phase === 'active') world = simulateWeek(world, { inPlace: true });
      world = startNextSeason(world, { inPlace: true });
    }
    const end = tierMean(world);
    for (const [index, value] of end.entries())
      expect(Math.abs(value - start[index]!)).toBeLessThan(4);
  }, 120000);
  it('recalibrates worlds saved before development version 2 once', () => {
    const world = generateWorld('old-world', { format: 'legacy' });
    delete world.developmentVersion;
    const player = Object.values(world.players)[3]!;
    player.potential = 99;
    const next = simulateWeek(world);
    expect(next.developmentVersion).toBe(2);
    expect(next.players[player.id]!.potential).toBeLessThan(99);
  });
});
