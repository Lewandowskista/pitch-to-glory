/**
 * The compatibility policy (docs/COMPATIBILITY.md): the versions the page states are the live
 * ones, new worlds start on every current rule, an older save adopts the rules once when it is
 * loaded and keeps a match-21 session, and a session from an earlier engine restarts.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import * as match from '../src/engine/match';
import {
  applyMatchCommand,
  createMatchSession,
  CURRENT_SETUP_FLAGS,
  isCurrentSetup,
  MATCH_ENGINE_VERSION,
  OutdatedMatchSessionError,
  type MatchSession,
} from '../src/engine/match';
import { generateWorld } from '../src/engine/world/generate';
import { adoptCurrentRules, RULE_FLAGS } from '../src/engine/world/rules';
import { isLegacyWorld } from '../src/engine/world/legacy';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import { autoPlayCommand, careerMatchSetup, defaultTactics } from '../src/engine/career/matches';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';
import { nationalWorld, TEST_DRAFT } from './support/world';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The machine-readable table of docs/COMPATIBILITY.md: item → value. */
function statedVersions(): Map<string, string> {
  const page = readFileSync('docs/COMPATIBILITY.md', 'utf8');
  const start = page.indexOf('<!-- compatibility:versions -->');
  const end = page.indexOf('<!-- /compatibility:versions -->');
  expect(start, 'versions table').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const rows = new Map<string, string>();
  for (const line of page.slice(start, end).split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const value = /^`([^`]+)`$/.exec(cells[2] ?? '')?.[1];
    if (cells.length >= 4 && value !== undefined) rows.set(cells[1]!, value);
  }
  return rows;
}

describe('the stated versions', () => {
  it('match the code', () => {
    const previous = (match as Record<string, unknown>).PREVIOUS_MATCH_ENGINE;
    const live: Record<string, string> = {
      'Save schema': String(CONFIG.saves.schemaVersion),
      'Match engine': MATCH_ENGINE_VERSION,
      'Previous match engine': typeof previous === 'string' ? previous : 'none',
      'World development version': String(RULE_FLAGS.developmentVersion),
      'World selection version': String(RULE_FLAGS.selectionVersion),
      'World economy version': String(RULE_FLAGS.economyVersion),
      'World achievement record': String(RULE_FLAGS.achievements),
      'Career development rules': String(RULE_FLAGS.developmentRules),
      'World identity (national)': String(nationalWorld().identityVersion),
    };
    expect(Object.fromEntries(statedVersions())).toEqual(live);
    expect(RULE_FLAGS.selectionVersion).toBe(CONFIG.selection.version);
  });
});

describe('rule flags', () => {
  it('start new worlds and careers on every current rule, legacy worlds included', () => {
    const national = nationalWorld();
    const legacy = generateWorld('compatibility-legacy', { format: 'legacy' });
    expect(isLegacyWorld(legacy)).toBe(true);
    expect(legacy.identityVersion).toBeUndefined();
    for (const world of [national, legacy]) {
      expect(adoptCurrentRules(clone(world))).toEqual([]);
      const trial = trialOffers(world, 'country:0', 'compatibility')[0]!;
      const career = createCareer(world, TEST_DRAFT, trial.id, 'compatibility');
      expect(career.career!.developmentRules).toBe(RULE_FLAGS.developmentRules);
      expect(adoptCurrentRules(clone(career))).toEqual([]);
    }
  }, 120000);
});

describe('loading a save from before 1.0', () => {
  let career: World;
  let session: MatchSession;
  beforeAll(() => {
    // A legacy world: the oldest format still loaded, and the one that played the 4-3-3
    // engine before its next season start.
    const base = generateWorld('compatibility', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'compatibility')[0]!;
    career = createCareer(base, TEST_DRAFT, trial.id, 'compatibility');
    const setup = careerMatchSetup(career, nextCareerFixture(career)!);
    session = createMatchSession(setup, defaultTactics(career, setup));
    for (let step = 0; step < 30; step++)
      session = applyMatchCommand(session, autoPlayCommand(session));
  });
  /** The world as an earlier release saved it: on none of the newer rules, at schema 22. */
  function olderSave(matchSession: MatchSession): string {
    const world = clone(career);
    delete world.developmentVersion;
    delete world.selectionVersion;
    delete world.economyVersion;
    delete world.achievements;
    for (const player of Object.values(world.players)) delete player.hallOfFame;
    world.career!.developmentRules = 2;
    // The session's copies of the squads, as that release saved them with its world.
    const saved = clone(matchSession);
    for (const id of Object.keys(saved.setup.players))
      saved.setup.players[id] = clone(world.players[id]!);
    saved.setup.home = clone(world.clubs[saved.setup.home.id]!);
    saved.setup.away = clone(world.clubs[saved.setup.away.id]!);
    const save = createSave(1, 'Older', {
      kind: 'world',
      world,
      gallery: { seed: 'compatibility', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    return JSON.stringify({
      ...save,
      schemaVersion: 22,
      payload: { ...save.payload, matchSession: saved },
    });
  }

  it('adopts every rule once and resumes a match-21 session', () => {
    const loaded = parseSave(olderSave(session));
    expect(loaded.schemaVersion).toBe(CONFIG.saves.schemaVersion);
    expect(loaded.recovery).toBeUndefined();
    if (loaded.payload.kind !== 'world') throw new Error('Expected a world');
    const world = loaded.payload.world;
    expect(world).toMatchObject({
      developmentVersion: RULE_FLAGS.developmentVersion,
      selectionVersion: RULE_FLAGS.selectionVersion,
      economyVersion: RULE_FLAGS.economyVersion,
      achievements: { version: RULE_FLAGS.achievements, since: world.date.season },
    });
    expect(world.career!.developmentRules).toBe(RULE_FLAGS.developmentRules);
    expect(adoptCurrentRules(clone(world))).toEqual([]);
    // The session resumes where it was, with the adopted squads, and plays to the end.
    let resumed = loaded.payload.matchSession!;
    expect(resumed.engine).toBe(MATCH_ENGINE_VERSION);
    expect(resumed.commands).toEqual(session.commands);
    expect(resumed.state.match.score).toEqual(session.state.match.score);
    expect(resumed.state.match.events).toEqual(session.state.match.events);
    for (const id of Object.keys(resumed.setup.players))
      expect(resumed.setup.players[id]).toEqual(world.players[id]);
    while (resumed.state.match.status !== 'finished')
      resumed = applyMatchCommand(resumed, autoPlayCommand(resumed));
  }, 120000);

  it('restarts a session from an earlier engine from kick-off, on the current engine', () => {
    const older = clone(session);
    older.engine = 'match-20';
    delete older.setup.screening;
    expect(() => match.validateMatchSession(older)).toThrow(OutdatedMatchSessionError);
    const loaded = parseSave(olderSave(older));
    expect(loaded.recovery).toBe('match-discarded');
    if (loaded.payload.kind !== 'world') throw new Error('Expected a world');
    expect(loaded.payload.matchSession).toBeUndefined();
    const world = loaded.payload.world;
    const setup = careerMatchSetup(world, nextCareerFixture(world)!);
    expect(isCurrentSetup(setup)).toBe(true);
    expect(setup).toMatchObject(CURRENT_SETUP_FLAGS);
    expect(createMatchSession(setup, defaultTactics(world, setup)).engine).toBe(
      MATCH_ENGINE_VERSION,
    );
  }, 120000);

  it('refuses to start or replay a setup from an earlier engine', () => {
    for (const flag of Object.keys(CURRENT_SETUP_FLAGS) as (keyof typeof CURRENT_SETUP_FLAGS)[]) {
      const older = clone(session);
      delete older.setup[flag];
      expect(isCurrentSetup(older.setup), flag).toBe(false);
      expect(() => createMatchSession(older.setup, older.initialTactics)).toThrow(
        OutdatedMatchSessionError,
      );
      expect(() => match.validateMatchSession(older)).toThrow(OutdatedMatchSessionError);
    }
  });
});
