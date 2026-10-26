/**
 * Playing a match on each engine this build supports (docs/COMPATIBILITY.md): the current one
 * (`match-22`) and the previous one kept so sessions saved before the update finish
 * (`match-21`). A rule change of release 1.0 Phase 5 is gated on `rules22(setup)`, and must leave
 * the previous engine's play exactly as it was; these helpers make that cheap to check.
 */
import { brotliDecompressSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  applyMatchCommand,
  createMatchSession,
  MATCH_ENGINE_VERSION,
  PREVIOUS_MATCH_ENGINE,
  setupEngine,
  validateMatchSession,
  type MatchCommand,
  type MatchSession,
  type MatchSetup,
  type Tactics,
} from '../../src/engine/match';
import { autoPlayCommand } from '../../src/engine/career/matches';

export type Engine = typeof MATCH_ENGINE_VERSION | typeof PREVIOUS_MATCH_ENGINE;
/** The engines this build plays, current first. */
export const ENGINES: readonly Engine[] = [MATCH_ENGINE_VERSION, PREVIOUS_MATCH_ENGINE];

/** The same setup on an engine: the current one carries `rules22`, the previous one does not. */
export function onEngine(setup: MatchSetup, engine: Engine): MatchSetup {
  const copy = structuredClone(setup);
  if (engine === MATCH_ENGINE_VERSION) copy.rules22 = true;
  else delete copy.rules22;
  expect(setupEngine(copy)).toBe(engine);
  return copy;
}

/**
 * Plays a session to full time (with the headless player by default), checking that it stays
 * on its engine.
 */
export function playOut(
  session: MatchSession,
  command: (session: MatchSession) => MatchCommand = autoPlayCommand,
): MatchSession {
  const engine = session.engine;
  while (session.state.match.status !== 'finished') {
    session = applyMatchCommand(session, command(session));
    expect(session.engine).toBe(engine);
  }
  return session;
}

/** A session survives a save: a JSON round trip replays it byte-identically on its engine. */
export function expectReplays(session: MatchSession): MatchSession {
  const restored = validateMatchSession(JSON.parse(JSON.stringify(session)));
  expect(restored.engine).toBe(session.engine);
  expect(JSON.stringify(restored) === JSON.stringify(session), 'replays exactly').toBe(true);
  return restored;
}

/**
 * The same setup and tactics played on every engine, current first, each session checked to
 * replay exactly. Compare the results to see what the 1.0 rules change, or that they leave a
 * case alone.
 */
export function playOnEngines(
  setup: MatchSetup,
  tactics: Tactics,
  command?: (session: MatchSession) => MatchCommand,
): MatchSession[] {
  return ENGINES.map((engine) => {
    const session = playOut(createMatchSession(onEngine(setup, engine), tactics), command);
    expect(session.engine).toBe(engine);
    expectReplays(session);
    return session;
  });
}

/**
 * The match in progress a golden save holds (tests/fixtures/saves), exactly as the release
 * stored it. `v0.9.1-match.json.br` holds a match-21 session.
 */
export function goldenSession(file: string): MatchSession {
  const json = brotliDecompressSync(readFileSync(`tests/fixtures/saves/${file}`)).toString('utf8');
  const session = (JSON.parse(json) as { payload: { matchSession?: MatchSession } }).payload
    .matchSession;
  if (!session) throw new Error(`${file} holds no match in progress`);
  return session;
}
