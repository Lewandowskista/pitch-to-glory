import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  SITUATION_BY_ID,
  type MatchSession,
} from '../src/engine/match';
import type { KeyMoment, MatchEvent, Position } from '../src/model/domain';
import {
  camWindow,
  choiceArrows,
  focusFrames,
  momentCamera,
  replayIds,
  selectedAttacksRight,
  toCam,
  zoneOf,
} from '../src/screens/match/cam';
import { buildFeed } from '../src/screens/match/feed';

/**
 * The tactical camera (redesign phase 5b) derives who it shows from a key moment's frame until
 * the engine names the cast (phase 6): these tests pin that derivation on real moments.
 */
const world = generateWorld('match-cam', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;

/** Every key moment of a match for a player in a position, with the session it opened in. */
function moments(position: Position, seed: string) {
  const [home, away] = clubs as [(typeof clubs)[number], (typeof clubs)[number]];
  const id =
    home.playerIds.find((pid) => world.players[pid]!.primaryPosition === position) ??
    home.playerIds[0]!;
  let session: MatchSession = createMatchSession(
    createMatchSetup(world, home.id, away.id, id, seed),
    tactics,
  );
  const found: { session: MatchSession; moment: KeyMoment }[] = [];
  for (let turn = 0; turn < 400 && session.state.match.status !== 'finished'; turn++) {
    if (session.state.currentMoment) found.push({ session, moment: session.state.currentMoment });
    session = applyMatchCommand(session, autoPlayCommand(session));
  }
  return { found, final: session };
}

describe('tactical camera geometry', () => {
  it('turns the pitch so the selected team attacks north, in metres', () => {
    expect(toCam({ x: 100, y: 50 }, true)).toEqual({ x: 34, y: 0 });
    expect(toCam({ x: 0, y: 50 }, false)).toEqual({ x: 34, y: 0 });
    // Your left stays on the left: attacking right, a small y is your left touchline.
    expect(toCam({ x: 50, y: 0 }, true).x).toBe(0);
    expect(toCam({ x: 50, y: 0 }, false).x).toBe(68);
  });
  it('frames the third between the ball and the player', () => {
    expect(zoneOf({ x: 34, y: 10 }, { x: 34, y: 20 })).toBe('final');
    expect(zoneOf({ x: 34, y: 50 }, undefined)).toBe('middle');
    expect(zoneOf({ x: 34, y: 90 }, { x: 34, y: 80 })).toBe('defensive');
    const final = camWindow('final');
    expect(final.viewBox).toBe('-20 -42 720 422');
    expect(camWindow('middle').top).toBeGreaterThan(final.top);
    // Phones crop wider (shorter) windows around the same third.
    expect(camWindow('final', 1.9).bottom - camWindow('final', 1.9).top).toBeLessThan(
      final.bottom - final.top,
    );
  });
});

describe('the derived cast', () => {
  const striker = moments('ST', 'cam-striker');
  const keeper = moments('GK', 'cam-keeper');
  it('finds key moments to frame', () => {
    expect(striker.found.length).toBeGreaterThan(3);
    expect(keeper.found.length).toBeGreaterThan(1);
  });
  it('shows you, nearby opponents, the keeper that matters and teammates on the right side', () => {
    for (const { session, moment } of [...striker.found, ...keeper.found]) {
      const { setup } = session;
      const camera = momentCamera(setup, moment);
      const own = new Set(
        (setup.home.playerIds.includes(setup.selectedPlayerId) ? setup.home : setup.away).playerIds,
      );
      expect(camera.cast[0]).toEqual({ id: setup.selectedPlayerId, role: 'you', own: true });
      expect(new Set(camera.cast.map((member) => member.id)).size).toBe(camera.cast.length);
      expect(camera.cast.length).toBeLessThanOrEqual(8);
      expect(camera.cast.filter((member) => member.role === 'press').length).toBeLessThanOrEqual(1);
      for (const member of camera.cast) expect(own.has(member.id)).toBe(member.own);
      for (const member of camera.cast.filter((m) => m.role === 'keeper')) {
        expect(setup.players[member.id]!.primaryPosition).toBe('GK');
        // The opposing keeper in the final third, your own in the defensive third.
        expect(member.own).toBe(camera.window.zone === 'defensive');
      }
      // Every member stands in the frame being shown.
      const ids = new Set(moment.frame.players.map((player) => player.id));
      for (const member of camera.cast) expect(ids.has(member.id)).toBe(true);
      expect(camera.attacksRight).toBe(selectedAttacksRight(setup, moment.minute));
    }
  });
  it('draws arrows only for shots with a known aim, the near post nearer the shooter', () => {
    for (const { session, moment } of striker.found) {
      const camera = momentCamera(session.setup, moment);
      const you = toCam(
        moment.frame.players.find((p) => p.id === session.setup.selectedPlayerId)!.point,
        camera.attacksRight,
      );
      const arrows = choiceArrows(moment, you);
      const situation = SITUATION_BY_ID[moment.situationId]!;
      for (const arrow of arrows) {
        const choice = moment.choices[arrow.number - 1]!;
        const template = situation.choices.find((c) => c.id === choice.id)!;
        expect(template.direct).toBe('for');
        expect(template.target).toBeDefined();
        expect(arrow.to.y).toBeLessThan(1);
        if (arrow.post === 'near') {
          const far = arrows.find((other) => other.post === 'far');
          if (far) expect(Math.abs(arrow.to.x - you.x)).toBeLessThan(Math.abs(far.to.x - you.x));
        }
      }
    }
  });
  it('replays a decision from its focus, with everyone who touched the ball', () => {
    const outcome = striker.found
      .map(({ session }) => applyMatchCommand(session, autoPlayCommand(session)))
      .find((next) => next.state.motion.kind === 'outcome' && next.state.motion.focus);
    expect(outcome).toBeDefined();
    const motion = outcome!.state.motion;
    const frames = focusFrames(motion);
    expect(frames.length).toBe(motion.focus!.end - motion.focus!.start + 1);
    const ids = replayIds(frames);
    for (const id of ids) expect(outcome!.setup.players[id]).toBeDefined();
    expect(focusFrames({ frames: motion.frames })).toBe(motion.frames);
  });
});

describe('the commentary feed adapter', () => {
  const event = (id: string, minute: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({
    id,
    minute,
    kind: 'pass',
    playerId: 'p',
    teamId: 'home',
    point: { x: 50, y: 50 },
    commentaryKey: id,
    outcome: null,
    ...extra,
  });
  const outcome = (momentId: string) => ({
    input: { momentId, choiceId: 'pass' },
    success: true,
    roll: 0.2,
    probability: 0.6,
    factors: [],
  });
  it('lists events newest first, marks key moments and goals, not routine passes', () => {
    const rows = buildFeed(
      [
        event('a', 1, { outcome: outcome('routine:1') }),
        event('b', 5, { outcome: outcome('moment-1') }),
        event('c', 5, { kind: 'goal' }),
      ],
      (e) => e.commentaryKey,
      () => 'Subject',
    );
    expect(rows.map((row) => [row.id, row.kind])).toEqual([
      ['c', 'goal'],
      ['b', 'moment'],
      ['a', 'play'],
    ]);
  });
  it('slots narration before the event it builds to, and loose lines by minute', () => {
    const rows = buildFeed(
      [event('a', 2), event('b', 7)],
      (e) => e.commentaryKey,
      () => undefined,
      [
        { id: 'n1', minute: 7, text: 'Cross from the left', eventId: 'b' },
        { id: 'n2', minute: 4, text: 'Recycled at the back' },
        { id: 'n3', minute: 9, text: 'Late pressure' },
      ],
    );
    expect(rows.map((row) => row.id)).toEqual(['line:n3', 'b', 'line:n1', 'line:n2', 'a']);
    expect(rows.find((row) => row.id === 'line:n1')).toMatchObject({
      kind: 'line',
      text: 'Cross from the left',
    });
  });
});
