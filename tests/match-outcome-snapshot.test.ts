import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  rolesForPosition,
  MATCH_ENGINE_VERSION,
  type MatchCommand,
  type MatchSession,
  type MatchSetup,
  type Tactics,
} from '../src/engine/match';
import type { Position } from '../src/model/domain';

/**
 * Outcome snapshot (redesign step M0). Plays 200 seeded matches across eight positions, with
 * varied roles, tactics, engines (the legacy 4-3-3, slot moments, the current engine with
 * fixtures, captaincy and shootouts) and choice policies, and hashes everything the outcome
 * layer decides: the score, every event (kind, team, player, minute, commentary, assist and
 * decision outcome), every key moment's choices and their probabilities, the existing live
 * statistics and the report's rating, XP, fame and objectives. Pitch points, end points,
 * keyframes and any choreography or bookkeeping field are excluded.
 *
 * Narrative-only engine steps must keep these hashes byte-identical. A step that is meant to
 * change outcomes (a re-gate step) updates them deliberately, together with the 10,000-match
 * gate. Run with `SNAPSHOT_PRINT=1` to print the current values.
 */
const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'ST'];
const PER_POSITION = 25;
const EXPECTED: Record<string, { hash: string; goals: number; moments: number }> = {
  GK: { hash: '1f56879c0b29369ffec1b611', goals: 63, moments: 214 },
  CB: { hash: 'f27f6446d2e6f177cc252e1a', goals: 64, moments: 228 },
  LB: { hash: 'a315c70a04b760ca1c4a9bc6', goals: 52, moments: 241 },
  DM: { hash: 'ae7d47f60e1513ec154e8cba', goals: 57, moments: 209 },
  CM: { hash: '27d3b1c656b604f9a0430abd', goals: 73, moments: 242 },
  AM: { hash: '22acb2d29c359ab1eb0c4e0b', goals: 71, moments: 277 },
  RW: { hash: '340a7c0a8fb140504b7d008e', goals: 55, moments: 296 },
  ST: { hash: '9353f3a431d709a98fc680e4', goals: 70, moments: 302 },
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
  const setup = createMatchSetup(
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
  if (variant === 0) {
    // The legacy 4-3-3 path (worlds before formations).
    delete setup.formations;
    delete setup.slotMoments;
    delete setup.dramaMoments;
    delete setup.occasions;
  } else if (variant === 1) {
    // Slot-aware moments without the drama and occasions passes.
    delete setup.dramaMoments;
    delete setup.occasions;
  }
  return setup;
}
function tacticsFor(position: Position, index: number): Tactics {
  const roles = rolesForPosition(position);
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
    // The engine path by its rules; the current engine's version string is not an outcome.
    engine: session.engine === MATCH_ENGINE_VERSION ? 'current' : session.engine,
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

describe('match outcome snapshot', { timeout: 300000 }, () => {
  it('keeps every outcome byte-identical per seed', () => {
    const found: Record<string, { hash: string; goals: number; moments: number }> = {};
    for (const position of POSITIONS) {
      const hash = createHash('sha256');
      let goals = 0,
        moments = 0;
      for (let index = 0; index < PER_POSITION; index++) {
        const session = play(setupFor(position, index), tacticsFor(position, index), index);
        hash.update(JSON.stringify(outcomes(session)));
        goals += session.state.match.score[0] + session.state.match.score[1];
        moments += session.state.match.keyMoments.length;
      }
      found[position] = { hash: hash.digest('hex').slice(0, 24), goals, moments };
    }
    if (process.env.SNAPSHOT_PRINT) console.log(JSON.stringify(found, null, 2));
    expect(found).toEqual(EXPECTED);
  });
});
