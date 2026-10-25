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
  isUntrained,
  ATTRIBUTE_KEYS,
  KEEPER_KEYS,
  type AnyAttribute,
} from '../src/engine/ageing';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { generateWorld } from '../src/engine/world/generate';
import { adoptCurrentRules } from '../src/engine/world/rules';
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
  it('develops exactly as attributeTarget says while its inputs change (target memo)', () => {
    // The pre-1.0 weekly step, which worked out every target afresh: developWeek's once-a-season
    // memo (review P5) must match it draw for draw as age, potential and position change.
    const D = CONFIG.world.development;
    const reference = (player: Player, age: number, rng: ReturnType<typeof createRng>) => {
      const professionalism = D.professionalismBase + player.hidden.professionalism / 100;
      const step = (values: Record<string, number>, key: AnyAttribute) => {
        if (isUntrained(player.primaryPosition, key)) return;
        const gap = attributeTarget(player, key, age) - values[key]!;
        if (!gap) return;
        const rate = gap > 0 ? D.growthPerSeason * professionalism : D.declinePerSeason;
        if (rng.next() < Math.min(0.9, (Math.abs(gap) * rate) / 60))
          values[key] = Math.max(1, Math.min(99, Math.round(values[key]! + Math.sign(gap))));
      };
      for (const key of ATTRIBUTE_KEYS) step(player.attributes, key);
      for (const key of KEEPER_KEYS) step(player.keeperAttributes, key);
    };
    const start = {
      ...profile,
      attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 40])),
      keeperAttributes: Object.fromEntries(KEEPER_KEYS.map((key) => [key, 10])),
      hidden: { professionalism: 55 },
    } as unknown as Player;
    const memoised = structuredClone(start);
    const plain = structuredClone(start);
    const [a, b] = [createRng('memo'), createRng('memo')];
    const changes: Record<number, (player: Player) => void> = {
      20: (player) => (player.potential = 82),
      45: (player) => (player.primaryPosition = 'CB'),
      70: (player) => (player.primaryPosition = 'GK'),
      95: (player) => (player.potential = 55),
    };
    for (let week = 0; week < 120; week++) {
      changes[week]?.(memoised);
      changes[week]?.(plain);
      const age = 18 + Math.floor(week / 12);
      developWeek(memoised, age, 60, a);
      reference(plain, age, b);
      expect(memoised.attributes).toEqual(plain.attributes);
      expect(memoised.keeperAttributes).toEqual(plain.keeperAttributes);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
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
  // Four seasons of a compact world, a cheap proxy; the national world's drift gate over many
  // seasons is a release-1.0 target (docs/RELEASE-1.0-PLAN.md, step 2.3).
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
  it('legacy-compat: recalibrates worlds saved before development version 2 once, on load', () => {
    const world = generateWorld('old-world', { format: 'legacy' });
    delete world.developmentVersion;
    const player = Object.values(world.players)[3]!;
    player.potential = 99;
    expect(adoptCurrentRules(world)).toEqual(['developmentVersion']);
    expect(world.developmentVersion).toBe(2);
    expect(world.players[player.id]!.potential).toBeLessThan(99);
    const recalibrated = JSON.stringify(world);
    expect(adoptCurrentRules(world)).toEqual([]);
    expect(JSON.stringify(world)).toBe(recalibrated);
  });
});
