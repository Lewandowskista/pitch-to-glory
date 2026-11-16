import type { World } from '../src/model/domain';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchSession,
} from '../src/engine/match';
import { autoPlayCommand } from '../src/engine/career/matches';

/**
 * A friendly in `world`, played by the engine up to the minute before a goal is scored in
 * ordinary play (a minute passage, not a key moment): pressing Play then shows that goal.
 * Searches clubs and seeds deterministically, so every browser gets the same session.
 */
export function sessionBeforeGoal(world: World, position = 'ST'): MatchSession {
  const clubs = Object.values(world.clubs);
  for (let attempt = 0; attempt < 40; attempt++) {
    const home = clubs[attempt % clubs.length]!;
    const away = clubs.find((club) => club.leagueId === home.leagueId && club.id !== home.id);
    const player = home.playerIds.find(
      (id) => world.players[id]?.primaryPosition === position && !world.players[id]?.injuryId,
    );
    if (!away || !player) continue;
    let session: MatchSession;
    try {
      session = createMatchSession(
        createMatchSetup(world, home.id, away.id, player, `goal-pace:${attempt}`),
        { role: 'balanced', risk: 'balanced', mentality: 'balanced' },
      );
    } catch {
      continue;
    }
    while (session.state.match.status !== 'finished') {
      const command = autoPlayCommand(session);
      const next = applyMatchCommand(session, command);
      const scored =
        next.state.match.score[0] + next.state.match.score[1] >
        session.state.match.score[0] + session.state.match.score[1];
      if (
        scored &&
        command.type === 'advance' &&
        next.state.motion.kind === 'minute' &&
        next.state.match.status === 'live' &&
        // Late enough that the opening minutes' commentary is there, early enough to be quick.
        session.state.match.minute >= 3
      )
        return session;
      session = next;
    }
  }
  throw new Error('No goal in ordinary play found for the match fixture');
}
