import type { MatchCommand, MatchSession } from '../engine/match/types';
import { SaveError } from './errors';

/**
 * A match in progress as a slot stores it (docs/RELEASE-1.0-PLAN.md step 3.5): the setup, the
 * opening tactics and the player's commands, which replay deterministically to the full state,
 * plus a little progress that is derived and never trusted. A minute checkpoint sends and
 * stores this (about the size of the setup) instead of the whole state, which grows to hundreds
 * of kilobytes by full time, and is checked only for shape; a load or an import replays it.
 *
 * Sessions stored before 1.0 keep their state; they are read as they are and checked by replay
 * as before. Light: the UI thread compacts a session without loading the match engine.
 */
export type StoredMatchSession = Omit<MatchSession, 'state'> & {
  progress: { minute: number; status: string; score: [number, number] };
};

export function compactSession(session: MatchSession | StoredMatchSession): StoredMatchSession {
  if (!('state' in session)) return session;
  const { state, ...rest } = session;
  return {
    ...rest,
    progress: {
      minute: state.match.minute,
      status: state.match.status,
      score: [state.match.score[0], state.match.score[1]],
    },
  };
}

const COMMANDS: Record<MatchCommand['type'], (command: Record<string, unknown>) => boolean> = {
  kickoff: () => true,
  advance: () => true,
  choose: (command) => typeof command.choiceId === 'string' && command.choiceId.length <= 200,
  halftime: (command) => ['motivate', 'role', 'complain'].includes(command.response as string),
  substitution: (command) => ['accept', 'encourage'].includes(command.response as string),
  captain: (command) => ['push', 'calm'].includes(command.instruction as string),
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * A stored session's shape, checked on write (cheaply: no replay). Whether it replays is checked
 * when the slot is loaded or exported, where a session that does not is discarded with a notice
 * and the world is kept.
 */
export function storedSession(value: unknown): StoredMatchSession {
  const invalid = () => new SaveError('invalid');
  if (!isRecord(value)) throw invalid();
  const session = compactSession(value as unknown as MatchSession | StoredMatchSession);
  const setup = session.setup as unknown;
  if (
    session.version !== 1 ||
    typeof session.engine !== 'string' ||
    session.engine.length > 80 ||
    !isRecord(setup) ||
    setup.version !== 1 ||
    typeof setup.seed !== 'string' ||
    !setup.seed ||
    setup.seed.length > 256 ||
    typeof setup.neutral !== 'boolean' ||
    !Number.isSafeInteger(setup.season) ||
    !isRecord(session.initialTactics) ||
    !Array.isArray(session.commands) ||
    session.commands.length > 240 ||
    !isRecord(session.progress)
  )
    throw invalid();
  for (const command of session.commands as unknown[]) {
    if (
      !isRecord(command) ||
      typeof command.type !== 'string' ||
      !Object.hasOwn(COMMANDS, command.type)
    )
      throw invalid();
    if (!COMMANDS[command.type as MatchCommand['type']](command)) throw invalid();
  }
  return session;
}
