import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import {
  applyMatchCommand,
  attacksRightAt,
  createMatchSession,
  createMatchSetup,
  span,
  validateMatchSession,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { autoPlayCommand } from '../src/engine/career/matches';
import { captureMoments } from '../src/engine/career/honours/moments';
import { decodeClip } from '../src/engine/career/honours/clip';
import type { Position, ReplayFrame } from '../src/model/domain';

const world = generateWorld('match-tests', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 4);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const DEFENSIVE = [
  'defend-attack',
  'shot-incoming',
  'one-on-one',
  'cross-ball',
  'offside-line',
  'goal-line',
  'penalty-save',
];
/** Sprint limit used by the engine (units per ms) plus rounding slack. */
const RUN = 0.0085;

function setupAt(position: Position, seed: string, home = 0, away = 1): MatchSetup {
  const club = clubs[home]!;
  return createMatchSetup(
    world,
    club.id,
    clubs[away]!.id,
    club.playerIds.find((id) => world.players[id]!.primaryPosition === position)!,
    seed,
  );
}
/** Play a match with the headless policy, recording every passage of play. */
function play(setup: MatchSetup) {
  let session = createMatchSession(setup, tactics);
  const passages: { kind: string; frames: ReplayFrame[]; minute: number; session: MatchSession }[] =
    [];
  while (session.state.match.status !== 'finished') {
    const before = session.state.motion;
    session = applyMatchCommand(session, autoPlayCommand(session));
    if (session.state.motion !== before)
      passages.push({
        kind: session.state.motion.kind,
        frames: session.state.motion.frames,
        minute: session.state.match.minute,
        session,
      });
  }
  return { session, passages };
}
const POSITIONS: Position[] = ['ST', 'CB', 'GK', 'LW', 'CM', 'RB'];
const matches = POSITIONS.flatMap((position, p) =>
  [0, 1, 2].map((i) => play(setupAt(position, `motion-${position}-${i}`, p % 2, 2 + (i % 2)))),
);
// Sides come from the rosters: a substituted player leaves the lineup but not their team.
const homeIds = (session: MatchSession) => new Set(session.setup.home.playerIds);
const depth = (side: number, minute: number, x: number) =>
  attacksRightAt(side, minute) ? x : 100 - x;

describe('match motion', { timeout: 60000 }, () => {
  it('continues each passage from the frame shown before it', () => {
    for (const { passages, session } of matches) {
      let shown = session.state.frames[0]!;
      for (const passage of passages) {
        const first = passage.frames[0]!;
        expect(first.ball).toEqual(shown.ball);
        for (const player of first.players) {
          const before = shown.players.find((p) => p.id === player.id);
          // A substitute appears where the replaced player stood.
          if (before) expect(player.point).toEqual(before.point);
        }
        shown = passage.frames[passage.frames.length - 1]!;
      }
    }
  });

  it('never moves a player faster than a sprint or the ball faster than a shot', () => {
    for (const { passages } of matches)
      for (const { frames } of passages)
        for (let k = 1; k < frames.length; k++) {
          const a = frames[k - 1]!,
            b = frames[k]!;
          if (b.ballMotion === 'reset') continue;
          const dt = b.timeMs - a.timeMs;
          expect(dt).toBeGreaterThan(0);
          for (const player of b.players) {
            const before = a.players.find((p) => p.id === player.id);
            if (before)
              expect(span(before.point, player.point)).toBeLessThanOrEqual(1.3 + dt * RUN);
          }
          // Shots are the fastest balls: 250 ms + 28 ms per unit.
          expect(span(a.ball, b.ball)).toBeLessThanOrEqual(dt / 28 + 0.3);
        }
  });

  it('keeps the ball at the feet of its carrier and every token on the pitch', () => {
    for (const { passages } of matches)
      for (const { frames } of passages)
        for (const frame of frames) {
          if (frame.carrierId) {
            const carrier = frame.players.find((p) => p.id === frame.carrierId)!;
            expect(carrier.point).toEqual(frame.ball);
          }
          for (const { point } of frame.players) {
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(100);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(100);
          }
          expect(frame.ball.x).toBeGreaterThanOrEqual(-5);
          expect(frame.ball.x).toBeLessThanOrEqual(105);
          expect(frame.ball.y).toBeGreaterThanOrEqual(0);
          expect(frame.ball.y).toBeLessThanOrEqual(100);
        }
  });

  it('scores every goal from a shooting position into the correct net, then kicks off', () => {
    let goals = 0;
    for (const { session, passages } of matches) {
      const home = homeIds(session);
      for (const goal of session.state.match.events.filter((e) => e.kind === 'goal')) {
        goals++;
        const side = goal.teamId === session.setup.home.id ? 0 : 1;
        const end = depth(side, goal.minute, goal.endPoint!.x);
        expect(end).toBeGreaterThan(100);
        const y = attacksRightAt(side, goal.minute) ? goal.endPoint!.y : 100 - goal.endPoint!.y;
        expect(y).toBeGreaterThan(44.6);
        expect(y).toBeLessThan(55.4);
        expect(depth(side, goal.minute, goal.point.x)).toBeGreaterThan(60);
        // The scorer had the ball at the point of the strike.
        const index = passages.findIndex(
          (p) =>
            p.minute === goal.minute &&
            p.frames.some((f) => f.carrierId === goal.playerId && f.ball.x === goal.point.x),
        );
        expect(index).toBeGreaterThanOrEqual(0);
        // Play restarts from the centre spot with the conceding team on the ball and
        // everyone in their own half.
        const kickoff = passages
          .slice(index)
          .flatMap((p) => p.frames.map((frame) => ({ frame, minute: p.minute })))
          .find(({ frame }) => frame.ball.x === 50 && frame.ball.y === 50 && frame.carrierId);
        if (!kickoff) continue; // final whistle before the restart
        const kicker = kickoff.frame.carrierId!;
        expect(home.has(kicker)).toBe(side === 1);
        for (const player of kickoff.frame.players) {
          const playerSide = home.has(player.id) ? 0 : 1;
          expect(depth(playerSide, kickoff.minute, player.point.x)).toBeLessThanOrEqual(50.5);
        }
      }
    }
    expect(goals).toBeGreaterThan(20);
  });

  it('kicks off in the next passage after every goal celebration', () => {
    let restarts = 0;
    for (const { passages } of matches)
      for (const [index, passage] of passages.entries()) {
        if (passage.session.state.play.restart !== 'goal') continue;
        const next = passages[index + 1];
        if (!next) continue; // final whistle during the celebration
        restarts++;
        // Even a quiet minute restarts play: the ball goes back to the centre spot.
        expect(
          next.frames.some(
            (frame) => frame.ball.x === 50 && frame.ball.y === 50 && frame.carrierId,
          ),
          `minute ${next.minute} (${next.kind}) after the goal in minute ${passage.minute}`,
        ).toBe(true);
        expect(next.session.state.play.restart).not.toBe('goal');
      }
    expect(restarts).toBeGreaterThan(20);
  });

  it('switches ends at half-time and keeps each keeper in front of their own goal', () => {
    for (const { passages, session } of matches) {
      const homeKeeper = session.state.match.home.starterIds[0]!;
      const awayKeeper = session.state.match.away.starterIds[0]!;
      for (const { frames, minute } of passages)
        for (const frame of frames.slice(1)) {
          const home = frame.players.find((p) => p.id === homeKeeper)!.point.x;
          const away = frame.players.find((p) => p.id === awayKeeper)!.point.x;
          expect(depth(0, minute, home)).toBeLessThan(25);
          expect(depth(1, minute, away)).toBeLessThan(25);
        }
      const restart = passages.find((p) => p.minute === 46)!;
      expect(restart.frames[1]!.ballMotion).toBe('reset');
      expect(homeIds(session).has(restart.frames[1]!.carrierId!)).toBe(false);
    }
  });

  it('plays passes to onside teammates', () => {
    let passes = 0,
      offside = 0;
    for (const { passages, session } of matches) {
      const home = homeIds(session);
      for (const { frames, minute } of passages)
        for (let k = 1; k < frames.length; k++) {
          const from = frames[k - 1]!,
            to = frames[k]!;
          if (!from.carrierId || !to.carrierId || to.ballMotion === 'carry') continue;
          const side = home.has(from.carrierId) ? 0 : 1;
          if (home.has(to.carrierId) !== (side === 0) || from.carrierId === to.carrierId) continue;
          passes++;
          const defenders = from.players
            .filter((p) => home.has(p.id) !== (side === 0))
            .map((p) => depth(side, minute, p.point.x))
            .sort((a, b) => b - a);
          const line = Math.max(50, defenders[1]!, depth(side, minute, from.ball.x));
          const receiver = from.players.find((p) => p.id === to.carrierId)!;
          if (depth(side, minute, receiver.point.x) > line + 2) offside++;
        }
    }
    expect(passes).toBeGreaterThan(1000);
    expect(offside / passes).toBeLessThan(0.01);
  });

  it('sets key moments around the selected player and the opponents in the duel', () => {
    let scenes = 0;
    for (const { session } of matches) {
      const own = homeIds(session).has(session.setup.selectedPlayerId);
      for (const moment of session.state.match.keyMoments) {
        scenes++;
        const frame = moment.frame;
        const selected = frame.players.find((p) => p.id === session.setup.selectedPlayerId)!;
        if (!DEFENSIVE.includes(moment.situationId)) {
          expect(frame.carrierId).toBe(session.setup.selectedPlayerId);
          expect(frame.ball).toEqual(selected.point);
        } else {
          // An opponent has the ball and is running at the selected player's goal.
          expect(homeIds(session).has(frame.carrierId!)).toBe(!own);
          expect(span(frame.ball, selected.point)).toBeLessThan(
            moment.situationId === 'defend-attack' ? 8 : 30,
          );
        }
        // The decision is drawn on the side of the pitch the player defends or attacks.
        const side = own ? 0 : 1;
        const d = depth(side, moment.minute, selected.point.x);
        if (['box-chance', 'edge-of-area', 'aerial-chance'].includes(moment.situationId))
          expect(d).toBeGreaterThan(65);
        if (
          ['shot-incoming', 'one-on-one', 'cross-ball', 'distribution'].includes(moment.situationId)
        )
          expect(d).toBeLessThan(15);
      }
    }
    expect(scenes).toBeGreaterThan(100);
  });

  it('holds the ball longer for the side with more possession', () => {
    // A strong home side against a weak away side.
    const strong = structuredClone(setupAt('CB', 'motion-possession'));
    strong.home.reputation = 95;
    strong.away.reputation = 25;
    let homeFrames = 0,
      carried = 0,
      possession = 0;
    for (let i = 0; i < 6; i++) {
      const { session, passages } = play({ ...strong, seed: `possession-${i}` });
      const home = homeIds(session);
      possession += session.state.stats.homePossession;
      for (const { frames } of passages)
        for (const frame of frames.slice(1))
          if (frame.carrierId) {
            carried++;
            if (home.has(frame.carrierId)) homeFrames++;
          }
    }
    expect(possession / 6).toBeGreaterThan(55);
    expect(homeFrames / carried).toBeGreaterThan(0.55);
  });

  it('replays motion exactly and cuts Moments clips from the goal build-up', () => {
    const { session } = matches.find(({ session }) =>
      session.state.highlights.some((h) => h.frames.length > 3),
    )!;
    expect(validateMatchSession(JSON.parse(JSON.stringify(session)))).toBeDefined();
    const highlight = session.state.highlights[0]!;
    expect(highlight.frames.length).toBeLessThanOrEqual(12);
    const scorer = session.setup.selectedPlayerId;
    // The highlight shows the selected player striking the ball.
    expect(highlight.frames.some((frame) => frame.carrierId === scorer)).toBe(true);
    const copy = structuredClone(world);
    // Only the fields Moments reads; a final (importance 1.5) saves every goal.
    copy.career = { playerId: scorer, market: { sequence: 0 } } as unknown as NonNullable<
      typeof copy.career
    >;
    copy.moments = [];
    captureMoments(copy, session, 1.5);
    expect(copy.moments.length).toBeGreaterThan(0);
    expect(decodeClip(copy.moments[0]!.clip).frames).toHaveLength(highlight.frames.length);
  });
});
