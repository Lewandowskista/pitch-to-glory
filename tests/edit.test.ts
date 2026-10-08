import { beforeAll, describe, expect, it } from 'vitest';
import type { Club, Hex, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek } from '../src/engine/world/simulate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import {
  chooseMatchKits,
  colourDifference,
  kitsClash,
  safeDifference,
} from '../src/engine/assets/clash';
import {
  applyEditAction,
  applyEditPack,
  exportEdits,
  nextCrest,
  parseEditPack,
} from '../src/engine/world/edits';
import {
  createSave,
  DEFAULT_SETTINGS,
  migrateSave,
  parseSave,
  validateSettings,
} from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';
import { validateNationalWorld } from '../src/persistence/nationalWorldSchema';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const kit = (color: Hex) => ({
  pattern: 'solid' as const,
  colors: [color, '#ffffff', '#000000'] as [Hex, Hex, Hex],
  collar: 0,
  trim: 0,
  sponsor: 0,
});
const club = (home: Hex, away: Hex, third: Hex): Pick<Club, 'kits'> => ({
  kits: { home: kit(home), away: kit(away), third: kit(third) },
});

let world: World;
beforeAll(() => {
  world = generateWorld('edit-tests', { format: 'legacy' });
});

describe('colour-blind-safe kit clash detection', () => {
  it('finds red and green alike for red-green colour blindness, not for typical vision', () => {
    expect(colourDifference('#bb3436', '#23714e')).toBeGreaterThan(60);
    expect(colourDifference('#bb3436', '#23714e', 'protanopia')).toBeLessThan(15);
    const worst = safeDifference('#bb3436', '#23714e');
    expect(worst.vision).toBe('protanopia');
    expect(kitsClash(kit('#bb3436'), kit('#23714e'))).toBe(true);
    expect(kitsClash(kit('#bb3436'), kit('#f9f5e9'))).toBe(false);
  });

  it('finds blue and teal alike for tritanopia', () => {
    expect(safeDifference('#286bc0', '#15788b')).toMatchObject({ vision: 'tritanopia' });
    expect(safeDifference('#286bc0', '#15788b').difference).toBeLessThan(
      CONFIG.accessibility.kitClash,
    );
  });

  it('picks the first away kit that is distinct for every viewer', () => {
    const home = club('#bb3436', '#f9f5e9', '#253444');
    expect(chooseMatchKits(home, club('#23714e', '#f9f5e9', '#19386d'))).toMatchObject({
      awayChoice: 'away',
      clash: false,
    });
    // Away green clashes with red for red-green colour blindness: wear the third kit.
    expect(chooseMatchKits(home, club('#2a2a2a', '#23714e', '#f6f2e7'))).toMatchObject({
      awayChoice: 'third',
      clash: false,
    });
    // Nothing is distinct: the most distinct kit, flagged so the pitch adds a marker.
    const tight = chooseMatchKits(home, club('#b33a3a', '#c23030', '#a83838'));
    expect(tight.clash).toBe(true);
    expect(['away', 'third', 'home']).toContain(tight.awayChoice);
  });

  it('gives every generated club a home kit distinct from at least one of its other kits', () => {
    const unsafe = Object.values(world.clubs).filter(
      (c) => kitsClash(c.kits.home, c.kits.away) && kitsClash(c.kits.home, c.kits.third),
    );
    expect(unsafe.length / Object.keys(world.clubs).length).toBeLessThan(0.05);
  });
});

describe('edit mode', () => {
  const [clubId, leagueId, playerId] = ['club:0:0', 'league:0:1', 'player:0:0:0'];

  it('renames clubs, leagues and players, keeping originals for reverting', () => {
    const original = world.clubs[clubId]!.name;
    let edited = applyEditAction(world, {
      type: 'rename-club',
      id: clubId,
      name: '  Red   Lions ',
    });
    edited = applyEditAction(edited, { type: 'rename-league', id: leagueId, name: 'Premier' });
    edited = applyEditAction(edited, { type: 'rename-player', id: playerId, name: 'Sam Kerr' });
    expect(edited.clubs[clubId]!.name).toBe('Red Lions');
    expect(edited.leagues[leagueId]!.name).toBe('Premier');
    expect(edited.players[playerId]!.name).toBe('Sam Kerr');
    expect(edited.edits!.clubs[clubId]).toMatchObject({
      name: 'Red Lions',
      original: { name: original },
    });
    // The input is untouched and unrelated records are shared, not copied.
    expect(world.clubs[clubId]!.name).toBe(original);
    expect(world.edits).toBeUndefined();
    expect(edited.fixtures).toBe(world.fixtures);
    expect(edited.clubs['club:0:1']).toBe(world.clubs['club:0:1']);
    valid(edited);
    let reverted = applyEditAction(edited, { type: 'revert-club', id: clubId });
    reverted = applyEditAction(reverted, { type: 'revert-league', id: leagueId });
    reverted = applyEditAction(reverted, { type: 'revert-player', id: playerId });
    expect(reverted.clubs[clubId]).toEqual(world.clubs[clubId]);
    expect(reverted.edits).toBeUndefined();
    // Renaming back to the original removes the edit too.
    const back = applyEditAction(
      applyEditAction(world, { type: 'rename-league', id: leagueId, name: 'X' }),
      { type: 'rename-league', id: leagueId, name: world.leagues[leagueId]!.name },
    );
    expect(back.edits).toBeUndefined();
  });

  it('rejects empty, overlong and malformed values', () => {
    expect(() =>
      applyEditAction(world, { type: 'rename-club', id: clubId, name: '   ' }),
    ).toThrow();
    expect(() =>
      applyEditAction(world, { type: 'rename-club', id: clubId, name: 'x'.repeat(41) }),
    ).toThrow();
    expect(() =>
      applyEditAction(world, {
        type: 'recolour-club',
        id: clubId,
        colors: ['#12345', '#ffffff', '#000000'] as never,
      }),
    ).toThrow();
    expect(() =>
      applyEditAction(world, { type: 'rename-club', id: 'club:none', name: 'A' }),
    ).toThrow();
  });

  it('recolours the crest and rotates the colours through the kits', () => {
    const edited = applyEditAction(world, {
      type: 'recolour-club',
      id: clubId,
      colors: ['#AA0000', '#00aa00', '#0000aa'],
    });
    const c = edited.clubs[clubId]!;
    expect(c.crest.colors).toEqual(['#aa0000', '#00aa00', '#0000aa']);
    expect(c.kits.home.colors).toEqual(['#aa0000', '#00aa00', '#0000aa']);
    expect(c.kits.away.colors).toEqual(['#0000aa', '#aa0000', '#00aa00']);
    expect(c.kits.third.colors).toEqual(['#00aa00', '#0000aa', '#aa0000']);
    expect(c.kits.home.pattern).toBe(world.clubs[clubId]!.kits.home.pattern);
    valid(edited);
  });

  it('draws a different, reproducible crest', () => {
    const before = world.clubs[clubId]!.crest;
    const next = nextCrest(world, world.clubs[clubId]!);
    expect(next.shape === before.shape && next.symbol === before.symbol).toBe(false);
    expect(nextCrest(world, world.clubs[clubId]!)).toEqual(next);
    const edited = applyEditAction(world, { type: 'regenerate-crest', id: clubId });
    expect(edited.clubs[clubId]!.crest).toMatchObject(next);
    expect(edited.clubs[clubId]!.crest.colors).toEqual(before.colors);
  });

  it('keeps record and legacy names in step with a renamed player', () => {
    const w = clone(world);
    w.records = [
      {
        id: 'record:season-goals',
        kind: 'season-goals',
        playerId,
        playerName: 'Old',
        value: 30,
        date: w.date,
      },
    ];
    const edited = applyEditAction(w, { type: 'rename-player', id: playerId, name: 'New Name' });
    expect(edited.records[0]!.playerName).toBe('New Name');
    expect(w.records[0]!.playerName).toBe('Old');
  });

  it('exports a pack and applies it to the same world and to another with the same clubs', () => {
    let edited = applyEditAction(world, { type: 'rename-club', id: clubId, name: 'Red Lions' });
    edited = applyEditAction(edited, {
      type: 'recolour-club',
      id: clubId,
      colors: ['#aa0000', '#00aa00', '#0000aa'],
    });
    edited = applyEditAction(edited, { type: 'regenerate-crest', id: clubId });
    edited = applyEditAction(edited, { type: 'rename-player', id: playerId, name: 'Sam Kerr' });
    const pack = parseEditPack(JSON.parse(JSON.stringify(exportEdits(edited))));
    expect(pack.clubs).toHaveLength(1);
    const same = applyEditPack(world, pack);
    expect(same).toMatchObject({ applied: 2, skipped: 0 });
    expect(same.world.clubs[clubId]).toEqual(edited.clubs[clubId]);
    expect(same.world.players[playerId]!.name).toBe('Sam Kerr');
    valid(same.world);
    // Another world: the club matches by its original name wherever it is; the player does not.
    const other = clone(world);
    const moved = other.clubs[clubId]!;
    other.clubs[clubId] = { ...other.clubs['club:0:1']!, id: clubId };
    other.clubs['club:0:1'] = { ...moved, id: 'club:0:1' };
    other.players[playerId] = { ...other.players[playerId]!, name: 'Someone Else' };
    const applied = applyEditPack(other, pack);
    expect(applied.skipped).toBe(1);
    expect(applied.world.clubs['club:0:1']!.name).toBe('Red Lions');
    expect(applied.world.clubs[clubId]!.name).toBe(other.clubs[clubId]!.name);
  });

  it('rejects malformed packs', () => {
    const pack = exportEdits(
      applyEditAction(world, { type: 'rename-club', id: clubId, name: 'A' }),
    );
    expect(() => parseEditPack({ ...pack, format: 'other' })).toThrow();
    expect(() => parseEditPack({ ...pack, clubs: [{ id: clubId, original: 'X' }] })).toThrow();
    expect(() =>
      parseEditPack({
        ...pack,
        clubs: [{ id: clubId, original: 'X', crest: { shape: 99, symbol: 0 } }],
      }),
    ).toThrow();
    expect(() =>
      parseEditPack({ ...pack, players: [{ id: playerId, original: 'X', name: '' }] }),
    ).toThrow();
    expect(() => parseEditPack('nonsense')).toThrow();
  });

  it('validates saved edits and rejects forged ones', () => {
    const edited = applyEditAction(world, { type: 'rename-club', id: clubId, name: 'Red Lions' });
    const forge = (change: (w: World) => void) => {
      const w = clone(edited);
      change(w);
      return () => validateWorld(w);
    };
    expect(forge(() => undefined)).not.toThrow();
    expect(forge((w) => (w.edits!.clubs['club:none'] = w.edits!.clubs[clubId]!))).toThrow();
    expect(forge((w) => (w.edits!.clubs[clubId]!.name = ''))).toThrow();
    expect(forge((w) => (w.edits!.leagues[leagueId] = { name: 'A', original: 'A' }))).toThrow();
    expect(
      forge((w) => delete (w.edits!.clubs[clubId] as Partial<{ original: unknown }>).original),
    ).toThrow();
  });

  it('keeps edits through simulated weeks in a national world and a career', () => {
    const national = generateWorld('edit-national');
    const id = Object.keys(national.clubs)[0]!;
    let edited = applyEditAction(national, { type: 'rename-club', id, name: 'Renamed FC' });
    edited = simulateWeek(edited);
    expect(edited.clubs[id]!.name).toBe('Renamed FC');
    expect(() => validateNationalWorld(clone(edited))).not.toThrow();
    const trial = trialOffers(world, 'country:0', 'edit-career')[0]!;
    const career = createCareer(
      applyEditAction(world, { type: 'rename-club', id: trial.id, name: 'My Club' }),
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
        position: 'ST',
        foot: 'left',
        age: 17,
        archetype: 'finisher',
      },
      trial.id,
      'edit-career',
    );
    expect(career.clubs[trial.id]!.name).toBe('My Club');
    valid(career);
  }, 120000);
});

describe('settings and saves', () => {
  it('fills audio and tutorial defaults for older preferences and validates them', () => {
    const old = {
      theme: 'dark',
      fontScale: 1.1,
      reducedMotion: true,
      backupReminder: true,
      simulationOnly: false,
    };
    expect(validateSettings(old)).toEqual({
      ...old,
      audio: DEFAULT_SETTINGS.audio,
      tutorial: { week: false, match: false },
    });
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, master: 2 } }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, tutorial: { week: 'yes', match: false } }),
    ).toThrow();
  });

  it('round-trips an edited world and migrates a schema-12 save', () => {
    const edited = applyEditAction(world, {
      type: 'rename-club',
      id: 'club:0:0',
      name: 'Red Lions',
    });
    const payload = {
      kind: 'world' as const,
      world: edited,
      gallery: { seed: 'e', generation: 0 },
      settings: {
        ...DEFAULT_SETTINGS,
        audio: { muted: true, master: 0.5, effects: 0.4, crowd: 0 },
      },
    };
    const save = createSave(1, 'Edited', payload);
    expect(save.schemaVersion).toBe(15);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const oldSettings = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).filter(([key]) => key !== 'audio' && key !== 'tutorial'),
    );
    const migrated = migrateSave({
      ...save,
      schemaVersion: 12,
      payload: { ...payload, world, settings: oldSettings },
    });
    expect(migrated.schemaVersion).toBe(15);
    expect(migrated.payload.settings).toEqual(DEFAULT_SETTINGS);
  });
});
