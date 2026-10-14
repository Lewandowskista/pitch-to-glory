import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/engine/config';
import {
  attributeSummary,
  familiarityLevel,
  overallRating,
  playerAbility,
} from '../src/engine/strength';
import { generateWorld } from '../src/engine/world/generate';
import { careerText } from '../src/i18n/career';
import type { Attributes, KeeperAttributes } from '../src/model/domain';

const world = generateWorld('ratings-tests', { format: 'legacy' });
const players = Object.values(world.players);
const outfield = players.find((player) => player.primaryPosition !== 'GK')!;
const keeper = players.find((player) => player.primaryPosition === 'GK')!;

describe('overall rating', () => {
  it('is the rounded position-weighted ability for every player', () => {
    for (const player of players) {
      expect(overallRating(player)).toBe(Math.round(playerAbility(player)));
    }
  });
});

describe('attribute summary', () => {
  it('names only real attributes, outfield and goalkeeping', () => {
    const outfieldKeys = Object.keys(outfield.attributes) as (keyof Attributes)[];
    const keeperKeys = Object.keys(keeper.keeperAttributes) as (keyof KeeperAttributes)[];
    for (const keys of Object.values(CONFIG.ratings.axes.outfield)) {
      for (const key of keys) expect(outfieldKeys).toContain(key);
    }
    for (const keys of Object.values(CONFIG.ratings.axes.keeper)) {
      for (const key of keys) expect(keeperKeys).toContain(key);
    }
  });

  it('gives six labelled axes in range, with a keeper set for goalkeepers', () => {
    const field = attributeSummary(outfield);
    const keep = attributeSummary(keeper);
    expect(field.map((entry) => entry.axis)).toEqual(Object.keys(CONFIG.ratings.axes.outfield));
    expect(keep.map((entry) => entry.axis)).toEqual(Object.keys(CONFIG.ratings.axes.keeper));
    for (const entry of [...field, ...keep]) {
      expect(Number.isInteger(entry.value)).toBe(true);
      expect(entry.value).toBeGreaterThanOrEqual(1);
      expect(entry.value).toBeLessThanOrEqual(99);
      expect(careerText.profile.axes[entry.axis]).toBeTruthy();
      expect(careerText.profile.axesShort[entry.axis]).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  it('is the mean of each axis attributes', () => {
    const [pace] = attributeSummary(outfield);
    expect(pace).toEqual({
      axis: 'pace',
      value: Math.round((outfield.attributes.pace + outfield.attributes.acceleration) / 2),
    });
  });
});

describe('familiarity words', () => {
  it('follows the configured thresholds', () => {
    const { natural, accomplished } = CONFIG.ratings.familiarity;
    expect(familiarityLevel(100)).toBe('natural');
    expect(familiarityLevel(natural)).toBe('natural');
    expect(familiarityLevel(natural - 1)).toBe('accomplished');
    expect(familiarityLevel(accomplished)).toBe('accomplished');
    expect(familiarityLevel(accomplished - 1)).toBe('learning');
    expect(familiarityLevel(0)).toBe('learning');
  });
});
