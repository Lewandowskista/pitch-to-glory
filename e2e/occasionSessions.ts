import type { World } from '../src/model/domain';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { autoPlayCommand } from '../src/engine/career/matches';

/**
 * Friendlies in a world, played by the engine up to an occasion of a match-22 session (release
 * 1.0 step 5.4), so a browser test opens the match exactly there. Each searches clubs and seeds
 * deterministically, so every browser gets the same session.
 */
type Options = Parameters<typeof createMatchSetup>[5];

function sessions(
  world: World,
  position: string,
  options: Options,
  tag: string,
): Generator<MatchSession> {
  const clubs = Object.values(world.clubs);
  return (function* () {
    for (let attempt = 0; attempt < 120; attempt++) {
      const home = clubs[attempt % clubs.length]!;
      const away = clubs.find((club) => club.leagueId === home.leagueId && club.id !== home.id);
      const player = home.playerIds.find(
        (id) => world.players[id]?.primaryPosition === position && !world.players[id]?.injuryId,
      );
      if (!away || !player) continue;
      let setup: MatchSetup;
      try {
        setup = createMatchSetup(world, home.id, away.id, player, `${tag}:${attempt}`, options);
      } catch {
        continue;
      }
      yield createMatchSession(setup, {
        role: 'balanced',
        risk: 'balanced',
        mentality: 'balanced',
      });
    }
  })();
}

/** Play `session` with the headless player until `until` holds; null at full time. */
function playTo(
  session: MatchSession,
  until: (session: MatchSession) => boolean,
): MatchSession | null {
  while (session.state.match.status !== 'finished') {
    if (until(session)) return session;
    session = applyMatchCommand(session, autoPlayCommand(session));
  }
  return null;
}

function find(
  world: World,
  position: string,
  options: Options,
  tag: string,
  until: (session: MatchSession) => boolean,
  /** The whole match, played on from the found point, must also satisfy this. */
  later: (finished: MatchSession) => boolean = () => true,
): MatchSession {
  for (const start of sessions(world, position, options, tag)) {
    const found = playTo(start, until);
    if (!found) continue;
    let rest = found;
    while (rest.state.match.status !== 'finished')
      rest = applyMatchCommand(rest, autoPlayCommand(rest));
    if (later(rest)) return found;
  }
  throw new Error(`No session found for ${tag}`);
}

/** At half-time, on the pitch, with roles to ask for. */
export const sessionAtHalfTime = (world: World) =>
  find(world, 'RW', {}, 'occasion-ht', (s) => s.state.match.status === 'halftime');

/** The 45th minute played and the added-time board up: the next minute is 45+1. */
export const sessionAtBoard = (world: World) =>
  find(
    world,
    'ST',
    {},
    'occasion-board',
    (s) =>
      s.state.match.status === 'live' &&
      s.state.match.minute === 45 &&
      !s.state.added &&
      (s.state.stoppage?.length ?? 0) === 1 &&
      !s.state.captainDecisionPending,
  );

/** A knock that asks "play on or come off". */
export const sessionAtKnock = (world: World) =>
  find(world, 'ST', { injury: { factor: 20 } }, 'occasion-knock', (s) =>
    Boolean(s.state.injuryDecisionPending),
  );

/** On the bench just before the manager looks to it, and brought on later. */
export const sessionOnBench = (world: World) =>
  find(
    world,
    'ST',
    { bench: 'key' },
    'occasion-bench',
    (s) => s.state.match.status === 'live' && s.state.match.minute === 52,
    (finished) => finished.state.bench?.on !== undefined,
  );

/** A level knockout's shootout at the player's own kick, or (as keeper) the first save. */
export const sessionAtShootoutKick = (world: World, keeper: boolean) =>
  find(
    world,
    keeper ? 'GK' : 'ST',
    { fixture: { id: 'occasion-cup', competitionId: 'cup', importance: 1.5, shootoutLead: 0 } },
    `occasion-shootout-${keeper ? 'gk' : 'st'}`,
    (s) =>
      s.state.match.status === 'decision' &&
      s.state.currentMoment?.follows === 'shootout' &&
      (s.state.penaltyShootout?.kicks.length ?? 0) > 0,
  );
