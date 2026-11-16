import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  rolePosition,
  rolesForPosition,
  MATCH_ENGINE_VERSION,
  PREVIOUS_MATCH_ENGINE,
  type MatchCommand,
  type MatchSession,
  type MatchSetup,
  type Tactics,
} from '../src/engine/match';
import type { Position } from '../src/model/domain';
import { onEngine, type Engine } from './support/engines';

/**
 * Outcome snapshot (redesign step M0). Plays 200 seeded matches across eight positions, with
 * varied roles, tactics, fixtures (friendlies, league games, and cup ties with captaincy and
 * shootouts) and choice policies, and hashes everything the outcome layer decides: the score,
 * every event (kind, team, player, minute, commentary, assist and decision outcome), every key
 * moment's choices and their probabilities, the existing live statistics and the report's
 * rating, XP, fame and objectives. Pitch points, end points, keyframes and any choreography or
 * bookkeeping field are excluded.
 *
 * Narrative-only engine steps must keep these hashes byte-identical. A step that is meant to
 * change outcomes (a re-gate step) updates them deliberately, together with the 10,000-match
 * gate, and keeps the previous engine's table while that engine is supported
 * (docs/COMPATIBILITY.md). Run with `SNAPSHOT_PRINT=1` to print the current values.
 *
 * The engine history behind these values (match-15 to match-21) is in `MATCH_ENGINE_VERSION`'s
 * comment in src/engine/match/types.ts and in docs/MATCH-BALANCING.md.
 *
 * The 1.0 compatibility cut (docs/RELEASE-1.0-PLAN.md step 2.4) removed the engines before
 * match-21 and their tables (match-15 to match-20). Two of every five samples played the
 * pre-formation and slot-only paths; they now play the current engine, so the table was
 * re-recorded on the code before the cut, and the cut left it byte-identical.
 *
 * Release 1.0 Phase 5 plays the same samples on both engines: `EXPECTED` on match-22 (setups
 * with `rules22`) and `PREVIOUS` on match-21 (the same setups without it). Each 1.0 rule change
 * re-records `EXPECTED` deliberately and must leave `PREVIOUS` byte-identical: that is the
 * proof that sessions saved before the update still replay. Until the first rule landed the two
 * engines played identically; step 5.5 (commentary) changed lines but not results, and step 5.3
 * (ratings and statistics) the results: the third test checks that every table differs.
 */
const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'ST'];
const PER_POSITION = 25;
/**
 * The previous engine (match-21): a defensive midfielder's moments carry more of the
 * opposition's goals, and a keeper's saves lean harder on their attributes. Never re-recorded
 * while match-21 is kept: a change here means a 1.0 rule leaked into saved sessions.
 */
const PREVIOUS: Record<string, { hash: string; goals: number; moments: number }> = {
  GK: { hash: '061b7390d0cefae6128dc1bb', goals: 63, moments: 214 },
  CB: { hash: 'cec58987ce402aefd11309b9', goals: 61, moments: 231 },
  LB: { hash: 'fd856c40a8b80b27659e4dd2', goals: 49, moments: 228 },
  DM: { hash: '1ec5c6846207d7f6927d4fd6', goals: 60, moments: 207 },
  CM: { hash: 'cae6cb90f9f2329cd6f41c2b', goals: 66, moments: 250 },
  AM: { hash: 'f15966d4279057bbb603c8ce', goals: 72, moments: 268 },
  RW: { hash: 'bfa8dd4c0ca82fe35af84bd0', goals: 54, moments: 312 },
  ST: { hash: '4b53ae123c0f69d798d2944a', goals: 68, moments: 311 },
};
/**
 * Every match-21 sample's whole session (its state, keyframes and narration included, not only
 * the outcomes above) hashed together: a saved match-21 session replays only if all of it is
 * unchanged, so this must never move while match-21 is kept.
 */
const PREVIOUS_SESSIONS = '3f20bccd556199d645310c63';
/**
 * The current engine (match-22). Step 5.3: ratings measured against each moment's par, with a
 * soft limit; XP and fame on the compressed scale; possession from style, home advantage, the
 * game plan and the score; more background shots, and every missed shot a result (the woodwork
 * among them), with real shares on target; on top of step 5.5's commentary. Step 5.4: added
 * time, the bench, in-match injuries, keepers' cards, the shootout and the touchline. Step 5.2:
 * reads of the play, new situations, skill mechanics and the shares through the player. X1a:
 * decision chains (moments are chain steps), the director, one objective and one interrupt.
 */
const EXPECTED: Record<string, { hash: string; goals: number; moments: number }> = {
  GK: { hash: 'd7f0e785d61586f350955fe9', goals: 49, moments: 216 },
  CB: { hash: '621c373f903aa59124e5d8a3', goals: 78, moments: 205 },
  LB: { hash: 'c30cc1720dcf4c6c87b981f5', goals: 58, moments: 238 },
  DM: { hash: '488a65857fb9694006496464', goals: 63, moments: 252 },
  CM: { hash: '7bb1a966365f5af24cbf0d37', goals: 66, moments: 229 },
  AM: { hash: '52768c53e207794e633c61bc', goals: 67, moments: 234 },
  RW: { hash: 'd65b3f3fab2723b00e61d1a7', goals: 64, moments: 250 },
  ST: { hash: '915c71095191afe0464cab31', goals: 73, moments: 247 },
};

const world = generateWorld('match-outcome-snapshot', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 4);
/** Stats that existed before the redesign; later bookkeeping fields are not part of outcomes. */
const STAT_KEYS = [
  'homeShots',
  'awayShots',
  'homePossession',
  'passesAttempted',
  'passesCompleted',
  'tackles',
  'saves',
  'goals',
  'assists',
  'shots',
  'errors',
  'rating',
  'fatigue',
] as const;

function setupFor(position: Position, index: number): MatchSetup {
  const pair = index % 4 < 2 ? [clubs[0]!, clubs[1]!] : [clubs[2]!, clubs[3]!];
  const [home, away] = index % 2 ? [pair[1]!, pair[0]!] : [pair[0]!, pair[1]!];
  const club = pair[0]!;
  const ids = club.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
  const selected = ids[Math.floor(index / 4) % ids.length]!;
  const variant = index % 5;
  return createMatchSetup(
    world,
    home.id,
    away.id,
    selected,
    `snapshot:${position}:${index}`,
    variant === 4
      ? {
          fixture: {
            id: `fixture:${position}:${index}`,
            competitionId: 'cup',
            importance: 1.5,
            shootoutLead: 0,
          },
          chemistry: 75,
          captain: true,
        }
      : variant === 3
        ? {
            fixture: { id: `fixture:${position}:${index}`, competitionId: 'league', importance: 1 },
          }
        : {},
  );
}
/** Tactics for the job the setup gives the player: the starting slot from match-17. */
function tacticsFor(setup: MatchSetup, index: number): Tactics {
  const roles = rolesForPosition(rolePosition(setup));
  return {
    role: roles[index % roles.length]!,
    risk: (['balanced', 'low', 'high'] as const)[index % 3]!,
    mentality: (['balanced', 'attacking', 'defensive'] as const)[Math.floor(index / 3) % 3]!,
  };
}
/** Deterministic policies: the headless player, a cycling index, or always the last choice. */
function command(session: MatchSession, index: number): MatchCommand {
  const s = session.state;
  if (s.match.status === 'halftime')
    return { type: 'halftime', response: (['motivate', 'role', 'complain'] as const)[index % 3]! };
  if (s.substitutionDecisionPending)
    return { type: 'substitution', response: index % 2 ? 'encourage' : 'accept' };
  if (s.captainDecisionPending)
    return { type: 'captain', instruction: index % 2 ? 'push' : 'calm' };
  const moment = s.currentMoment;
  if (moment && index % 4 >= 2) {
    const choices = moment.choices;
    const pick =
      index % 4 === 2 ? (index + s.match.keyMoments.length) % choices.length : choices.length - 1;
    return { type: 'choose', choiceId: choices[pick]!.id };
  }
  return autoPlayCommand(session);
}
function play(setup: MatchSetup, tactics: Tactics, index: number): MatchSession {
  let session = createMatchSession(setup, tactics);
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, command(session, index));
  return session;
}
/** Everything the outcome layer decides, without points, frames or bookkeeping fields. */
function outcomes(session: MatchSession): unknown {
  const s = session.state,
    m = s.match;
  const report = s.report!;
  return {
    // The engine's version string is not an outcome (each table checks its engine itself); the
    // constant keeps the recorded hashes comparable across engines.
    engine: 'current',
    score: m.score,
    momentum: m.momentum,
    weather: m.weather,
    lineups: [m.home.starterIds, m.away.starterIds],
    events: m.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      teamId: e.teamId,
      playerId: e.playerId,
      minute: e.minute,
      commentaryKey: e.commentaryKey,
      commentaryParams: e.commentaryParams ?? null,
      assistId: e.assistId ?? null,
      outcome: e.outcome,
    })),
    keyMoments: m.keyMoments.map((k) => ({
      id: k.id,
      minute: k.minute,
      situationId: k.situationId,
      situationKey: k.situationKey,
      situationParams: k.situationParams ?? null,
      pressureKey: k.pressureKey ?? null,
      follows: k.follows ?? null,
      budget: k.budget,
      choices: k.choices.map((c) => ({
        id: c.id,
        probability: c.probability,
        factors: c.factors,
        stakes: c.stakes,
      })),
    })),
    stats: STAT_KEYS.map((key) => s.stats[key]),
    ratingParts: s.ratingParts,
    expectedGoals: s.expectedGoals,
    shares: s.shares,
    minutes: s.selectedPlayerMinutes,
    substituted: s.substituted,
    trust: s.managerTrustDelta,
    shootout: s.shootout ?? null,
    copy: [s.headlineKey, s.headlineParams ?? null, s.managerReactionKey, s.fanReactionKey],
    report: {
      rating: report.rating,
      ratingFactors: report.ratingFactors,
      xp: report.xp,
      fameDelta: report.fameDelta,
      objectives: report.objectives,
      headlineId: report.headlineId,
      passes: report.passes.map((p) => p.success),
      shots: report.shots.map((p) => p.goal),
    },
  };
}

function snapshot(engine: Engine) {
  const found: Record<string, { hash: string; goals: number; moments: number }> = {};
  // Everything a saved session replays, but the engine's name and the flag that selects it.
  const sessions = createHash('sha256');
  for (const position of POSITIONS) {
    const hash = createHash('sha256');
    let goals = 0,
      moments = 0;
    for (let index = 0; index < PER_POSITION; index++) {
      const setup = onEngine(setupFor(position, index), engine);
      const session = play(setup, tacticsFor(setup, index), index);
      expect(session.engine).toBe(engine);
      hash.update(JSON.stringify(outcomes(session)));
      sessions.update(JSON.stringify([session.initialTactics, session.commands, session.state]));
      goals += session.state.match.score[0] + session.state.match.score[1];
      moments += session.state.match.keyMoments.length;
    }
    found[position] = { hash: hash.digest('hex').slice(0, 24), goals, moments };
  }
  const whole = sessions.digest('hex').slice(0, 24);
  if (process.env.SNAPSHOT_PRINT) console.log(engine, whole, JSON.stringify(found, null, 2));
  return { outcomes: found, sessions: whole };
}

describe('match outcome snapshot', { timeout: 300000 }, () => {
  const found = new Map<Engine, ReturnType<typeof snapshot>>();
  beforeAll(() => {
    for (const engine of [MATCH_ENGINE_VERSION, PREVIOUS_MATCH_ENGINE] as const)
      found.set(engine, snapshot(engine));
  }, 300000);
  it('keeps every outcome byte-identical per seed', () => {
    expect(found.get(MATCH_ENGINE_VERSION)!.outcomes).toEqual(EXPECTED);
  });
  it('keeps the previous engine (match-21) byte-identical, so saved sessions replay', () => {
    expect(found.get(PREVIOUS_MATCH_ENGINE)!.outcomes).toEqual(PREVIOUS);
    expect(found.get(PREVIOUS_MATCH_ENGINE)!.sessions).toBe(PREVIOUS_SESSIONS);
  });
  it('plays the 1.0 rules on match-22 only', () => {
    // Every position's outcomes move under match-22 (its ratings at least), and the sessions do.
    for (const position of POSITIONS)
      expect(EXPECTED[position]!.hash, position).not.toBe(PREVIOUS[position]!.hash);
    expect(found.get(MATCH_ENGINE_VERSION)!.sessions).not.toBe(PREVIOUS_SESSIONS);
  });
});
