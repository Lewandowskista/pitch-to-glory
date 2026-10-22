import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  rolePosition,
  rolesForPosition,
  MATCH_ENGINE_VERSION,
  OCCASIONS_MATCH_ENGINE,
  DISCIPLINE_MATCH_ENGINE,
  ROLE_MATCH_ENGINE,
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
 *
 * Re-gated in redesign phase 6 (engine match-15), one step at a time; the earlier engine
 * paths (variants 0 and 1) were checked byte-identical against match-14 at every step:
 * - M4 cast and targets: a pass reaches the teammate named before the choice (the receiver is
 *   drawn on its own stream instead of the decision stream), so every later roll in a decision
 *   shifts.
 * - M5 Track the runner: a fourth choice when defending an attack, so the policies that pick
 *   by index (and the headless player, who now weighs it) choose differently for players who
 *   defend (CB, LB, DM, and CM and AM in midfield slots); GK, RW and ST are unchanged.
 * - Objectives stream (decision 3): objectives leave the preview stream for their own, so the
 *   preview stream's later draws (the consistency shift and the weather) move for every match.
 * - M7 cards and substitutions: bookings add events (ids and commentary variants move, no roll
 *   does) and the managers' changes and the bench of seven change line-ups and who scores.
 * - M8 weather and pitch: the combined conditions factor splits into a weather factor (scaled
 *   by the new intensity) and a pitch factor, so choice factors and probabilities change.
 * - Shot objectives: the targets rise to five shots for a striker and three for other attackers
 *   (the profile read 76% completion against its 75% ceiling); only the objectives, and so the
 *   AM, RW and ST hashes, change. Goals and moments are untouched.
 *
 * Re-gated in the discipline phase (engine match-16, decision 5). The match-15 path is kept as
 * its own engine (setups with `occasions` but no `discipline`), and its hashes (`MATCH_15`) are
 * checked byte-identical on every run, alongside the earlier paths of variants 0 and 1:
 * - Full discipline: the cosmetic bookings leave `${seed}:discipline:${minute}` for
 *   `${seed}:cards:${minute}`, drawn at the start of the minute (three draws a side), with
 *   second yellows and straight reds. A dismissal parks the player off the pitch, takes them
 *   out of finishers, opponents, receivers and the managers' changes, and recalculates both
 *   sides' expected goals, possession and team odds, so every later roll can land differently.
 * - The career player's own dismissal ends their moments and their share of the attack and
 *   defence; their cards add a `discipline` rating part, and the headline and reactions follow.
 * - Booking risk: failed defending choices roll for a card on `${seed}:booking:...`, which
 *   never moves a decision roll; the outcome records the roll (`outcome.booking`).
 * Goals moved by at most three in a position (GK 63 → 61, DM 58 → 61, RW 53 → 54) and moments
 * by at most four (LB 238 → 234, RW 294 → 293), from dismissals and the moments they end.
 */
const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'ST'];
const PER_POSITION = 25;
/**
 * The match-15 path (setups without `discipline`): every hash recorded at the end of phase 6,
 * held byte-identical by the discipline phase.
 */
const MATCH_15: Record<string, { hash: string; goals: number; moments: number }> = {
  GK: { hash: '004f2120207ee97fc7dadc43', goals: 63, moments: 214 },
  CB: { hash: 'f598c70b8e585f4c3df20aa8', goals: 62, moments: 231 },
  LB: { hash: 'c79dbf303b9cce13a59fd9f2', goals: 51, moments: 238 },
  DM: { hash: '38a1e53575534e61081111c5', goals: 58, moments: 207 },
  CM: { hash: '1965a808123a8e4e960ea515', goals: 76, moments: 242 },
  AM: { hash: '838af718612b298a0c3af003', goals: 74, moments: 277 },
  RW: { hash: '6832eff46902c10b0fcfdf7a', goals: 53, moments: 294 },
  ST: { hash: '16c89f360f61c603d4bd76f2', goals: 71, moments: 301 },
};
/** The current engine (match-16, full discipline). */
/**
 * The current engine (match-18). Only players who start away from their primary position
 * differ from match-16 (here the AM and CM samples): their role, objectives and involvement
 * follow the slot (match-17). No sample plays extra time, so match-18 matches match-17 here;
 * tests/match-drama.test.ts covers extra time.
 */
const EXPECTED: Record<string, { hash: string; goals: number; moments: number }> = {
  GK: { hash: '6782a66059b5c58a160b2809', goals: 61, moments: 214 },
  CB: { hash: '01246285b1223dc007d2afbf', goals: 62, moments: 231 },
  LB: { hash: 'c8c9e7ab04ae4331827154b3', goals: 51, moments: 234 },
  DM: { hash: 'ed5cd8ec8e9d3303e757e596', goals: 61, moments: 207 },
  CM: { hash: '60a4a740f8cfd9510c84dbc3', goals: 72, moments: 242 },
  AM: { hash: '2b62ae7e41db27afbe26c5ef', goals: 73, moments: 266 },
  RW: { hash: '7d02b929574bfc69064a0c60', goals: 54, moments: 293 },
  ST: { hash: 'f6fa6d790df559145438e97f', goals: 71, moments: 301 },
};
/** The match-17 path (no playable extra time), unchanged by match-18. */
const MATCH_17: Record<string, { hash: string; goals: number; moments: number }> = {
  GK: { hash: '6782a66059b5c58a160b2809', goals: 61, moments: 214 },
  CB: { hash: '01246285b1223dc007d2afbf', goals: 62, moments: 231 },
  LB: { hash: 'c8c9e7ab04ae4331827154b3', goals: 51, moments: 234 },
  DM: { hash: 'ed5cd8ec8e9d3303e757e596', goals: 61, moments: 207 },
  CM: { hash: '60a4a740f8cfd9510c84dbc3', goals: 72, moments: 242 },
  AM: { hash: '2b62ae7e41db27afbe26c5ef', goals: 73, moments: 266 },
  RW: { hash: '7d02b929574bfc69064a0c60', goals: 54, moments: 293 },
  ST: { hash: 'f6fa6d790df559145438e97f', goals: 71, moments: 301 },
};
/** The match-16 path (no effective role), unchanged by match-17. */
const MATCH_16: Record<string, { hash: string; goals: number; moments: number }> = {
  GK: { hash: '6782a66059b5c58a160b2809', goals: 61, moments: 214 },
  CB: { hash: '01246285b1223dc007d2afbf', goals: 62, moments: 231 },
  LB: { hash: 'c8c9e7ab04ae4331827154b3', goals: 51, moments: 234 },
  DM: { hash: 'ed5cd8ec8e9d3303e757e596', goals: 61, moments: 207 },
  CM: { hash: '9b91c1224a3e4d3f87011baf', goals: 76, moments: 242 },
  AM: { hash: '436df8b4d6fe401b2f904292', goals: 74, moments: 277 },
  RW: { hash: '7d02b929574bfc69064a0c60', goals: 54, moments: 293 },
  ST: { hash: 'f6fa6d790df559145438e97f', goals: 71, moments: 301 },
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

type Path = 'current' | 'match-17' | 'match-16' | 'match-15';
function setupFor(position: Position, index: number, path: Path = 'current'): MatchSetup {
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
  // Variants 0 and 1 never carry discipline or the effective role; the match-15 run plays the
  // rest without either, the match-16 run without the effective role.
  if (path === 'match-15' || variant < 2) delete setup.discipline;
  if ((path !== 'current' && path !== 'match-17') || variant < 2) delete setup.roleSlot;
  if (path !== 'current' || variant < 2) delete setup.extraTimePlay;
  return setup;
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
function outcomes(session: MatchSession, current = MATCH_ENGINE_VERSION): unknown {
  const s = session.state,
    m = s.match;
  const report = s.report!;
  return {
    // The engine path by its rules; the current engine's version string is not an outcome.
    engine: session.engine === current ? 'current' : session.engine,
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

function snapshot(path: Path) {
  const found: Record<string, { hash: string; goals: number; moments: number }> = {};
  for (const position of POSITIONS) {
    const hash = createHash('sha256');
    let goals = 0,
      moments = 0;
    for (let index = 0; index < PER_POSITION; index++) {
      const setup = setupFor(position, index, path);
      const session = play(setup, tacticsFor(setup, index), index);
      const current =
        path === 'match-15'
          ? OCCASIONS_MATCH_ENGINE
          : path === 'match-16'
            ? DISCIPLINE_MATCH_ENGINE
            : path === 'match-17'
              ? ROLE_MATCH_ENGINE
              : MATCH_ENGINE_VERSION;
      hash.update(JSON.stringify(outcomes(session, current)));
      goals += session.state.match.score[0] + session.state.match.score[1];
      moments += session.state.match.keyMoments.length;
    }
    found[position] = { hash: hash.digest('hex').slice(0, 24), goals, moments };
  }
  if (process.env.SNAPSHOT_PRINT) console.log(JSON.stringify(found, null, 2));
  return found;
}

describe('match outcome snapshot', { timeout: 300000 }, () => {
  it('keeps every outcome byte-identical per seed', () => {
    expect(snapshot('current')).toEqual(EXPECTED);
  });
  it('keeps the match-17 path (the kick at full time) byte-identical', () => {
    expect(snapshot('match-17')).toEqual(MATCH_17);
  });
  it('keeps the match-16 path (primary-position roles) byte-identical', () => {
    expect(snapshot('match-16')).toEqual(MATCH_16);
  });
  it('keeps the match-15 path (cosmetic cards) byte-identical', () => {
    expect(snapshot('match-15')).toEqual(MATCH_15);
  });
});
