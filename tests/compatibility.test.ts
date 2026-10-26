/**
 * The compatibility policy (docs/COMPATIBILITY.md): the versions the page states are the live
 * ones, new worlds start on every current rule, an older save adopts the rules once when it is
 * loaded and keeps a match-21 session, which finishes on the previous engine, new matches play
 * match-22, and a session from an earlier engine restarts.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import * as match from '../src/engine/match';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  CURRENT_SETUP_FLAGS,
  isCurrentSetup,
  MATCH_ENGINE_VERSION,
  OutdatedMatchSessionError,
  PREVIOUS_MATCH_ENGINE,
  PREVIOUS_SETUP_FLAGS,
  rules22,
  setupEngine,
  type MatchSession,
} from '../src/engine/match';
import { generateWorld } from '../src/engine/world/generate';
import { ownKeeperAttributes } from '../src/engine/keeping';
import { adoptCurrentRules, RULE_FLAGS } from '../src/engine/world/rules';
import { isLegacyWorld } from '../src/engine/world/legacy';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import { autoPlayCommand, careerMatchSetup, defaultTactics } from '../src/engine/career/matches';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';
import { nationalWorld, TEST_DRAFT } from './support/world';
import { expectReplays, goldenSession, onEngine, playOnEngines, playOut } from './support/engines';

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
    // Releases before 1.0 stored every player's goalkeeping, untrained or not.
    for (const player of Object.values(world.players)) ownKeeperAttributes(player);
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

  it('adopts every rule once and resumes a match-22 session', () => {
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
    // Retention drops the derivable goalkeeping, in the world and in the session's copies.
    const players = Object.values(world.players);
    expect(players.filter((p) => p.primaryPosition !== 'GK' && p.keeperAttributes)).toEqual([]);
    expect(players.filter((p) => p.primaryPosition === 'GK' && !p.keeperAttributes)).toEqual([]);
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
    for (const flag of Object.keys(PREVIOUS_SETUP_FLAGS) as (keyof typeof PREVIOUS_SETUP_FLAGS)[]) {
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

describe('the previous match engine (match-21)', () => {
  it('resumes the 0.9.1 golden session exactly and finishes it on its own rules', () => {
    const stored = goldenSession('v0.9.1-match.json.br');
    expect(stored.engine).toBe(PREVIOUS_MATCH_ENGINE);
    expect(stored.setup.rules22).toBeUndefined();
    expect(setupEngine(stored.setup)).toBe(PREVIOUS_MATCH_ENGINE);
    expect(rules22(stored.setup)).toBe(false);
    // Validation replays it from its setup and command log and compares the whole session.
    const resumed = expectReplays(stored);
    expect(resumed.state.match.minute).toBe(stored.state.match.minute);
    const finished = playOut(resumed);
    expect(finished.engine).toBe(PREVIOUS_MATCH_ENGINE);
    expectReplays(finished);
  }, 120000);

  it('starts every new setup on match-22', () => {
    const world = generateWorld('compatibility-engines', { format: 'legacy' });
    const [home, away] = Object.values(world.clubs);
    const setup = createMatchSetup(world, home!.id, away!.id, home!.playerIds[3]!, 'engines');
    expect(setup).toMatchObject(CURRENT_SETUP_FLAGS);
    expect(rules22(setup)).toBe(true);
    expect(setupEngine(setup)).toBe(MATCH_ENGINE_VERSION);
    const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
    const session = createMatchSession(setup, tactics);
    expect(session.engine).toBe(MATCH_ENGINE_VERSION);
    // The same setup without the flag plays the previous engine, on its own rules: step 5.5
    // changed the lines the events log, step 5.3 the ratings and statistics (and so results).
    const [current, previous] = playOnEngines(setup, tactics);
    expect(current!.engine).toBe(MATCH_ENGINE_VERSION);
    expect(previous!.engine).toBe(PREVIOUS_MATCH_ENGINE);
    expect(current!.state.stats.woodwork).toBeDefined();
    expect(previous!.state.stats.woodwork).toBeUndefined();
    expect(previous!.state.ratingParts.par).toBeUndefined();
    expect(previous!.state.report!.ratingFactors[0]!.contribution).toBe(CONFIG.match.rating.base);
    expect(current!.state.report!.ratingFactors[0]!.contribution).toBe(CONFIG.match.rating22.base);
  }, 120000);

  it('replays a session only on the engine its setup plays', () => {
    const world = generateWorld('compatibility-engines', { format: 'legacy' });
    const [home, away] = Object.values(world.clubs);
    const setup = createMatchSetup(world, home!.id, away!.id, home!.playerIds[3]!, 'mismatch');
    const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
    for (const engine of [MATCH_ENGINE_VERSION, PREVIOUS_MATCH_ENGINE] as const) {
      let session = createMatchSession(onEngine(setup, engine), tactics);
      for (let step = 0; step < 20; step++)
        session = applyMatchCommand(session, autoPlayCommand(session));
      expectReplays(session);
      // A session that claims the other engine, or whose setup gained or lost the flag, is
      // outdated: it is discarded on load rather than replayed under other rules.
      const relabelled = clone(session);
      relabelled.engine =
        engine === MATCH_ENGINE_VERSION ? PREVIOUS_MATCH_ENGINE : MATCH_ENGINE_VERSION;
      expect(() => match.validateMatchSession(relabelled)).toThrow(OutdatedMatchSessionError);
      const reflagged = clone(session);
      if (engine === MATCH_ENGINE_VERSION) delete reflagged.setup.rules22;
      else reflagged.setup.rules22 = true;
      expect(() => match.validateMatchSession(reflagged)).toThrow(OutdatedMatchSessionError);
    }
  }, 120000);
});
