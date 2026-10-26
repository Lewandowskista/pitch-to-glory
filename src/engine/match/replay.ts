/**
 * Checking a saved session: it must come from an engine this build plays, and replaying its
 * setup, tactics and command log must reproduce it exactly. The shape validators are in
 * validation.ts.
 */
import { setupEngine, type MatchSession } from './types';
import { validateSetup, validateJson } from './validation';
import { createMatchSession, OutdatedMatchSessionError } from './setup';
import { applyMatchCommand } from './commands';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function validateMatchSession(value: unknown): MatchSession {
  validateJson(value);
  if (!value || typeof value !== 'object') throw new Error('Invalid match session');
  const session = value as MatchSession;
  // Sessions from another engine cannot replay; callers discard them and keep the world. A
  // session replays on the engine its setup plays on (the current one, or the previous one
  // without `rules22`), and must say so. One without the bookkeeping (match-14) or the
  // narration is from before them, whatever it claims.
  if (
    !session.setup ||
    typeof session.setup !== 'object' ||
    !setupEngine(session.setup) ||
    session.engine !== setupEngine(session.setup) ||
    !Array.isArray(session.state?.stats?.xg) ||
    !Array.isArray(session.state?.narration)
  )
    throw new OutdatedMatchSessionError(session.engine);
  if (
    session.version !== 1 ||
    !session.setup ||
    session.setup.version !== 1 ||
    !Array.isArray(session.commands) ||
    session.commands.length > 400 ||
    !session.state ||
    typeof session.setup.seed !== 'string' ||
    !session.setup.seed ||
    session.setup.seed.length > 256 ||
    typeof session.setup.neutral !== 'boolean' ||
    !Number.isSafeInteger(session.setup.season)
  )
    throw new Error('Invalid match session');
  validateSetup(session.setup);
  let replay = createMatchSession(session.setup, session.initialTactics);
  for (const command of session.commands) replay = applyMatchCommand(replay, command);
  if (canonical(replay) !== canonical(session))
    throw new Error('Match session differs from deterministic replay');
  return replay;
}
