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
import type { KeyMoment, Position } from '../src/model/domain';
import { momentCamera, toCam } from '../src/screens/match/cam';

/**
 * Key-moment cast and choice targets (engine match-15, redesign step M4): the engine names who
 * is involved in a moment and where each choice goes, and the outcome follows the target.
 */
const world = generateWorld('match-cast', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;

function moments(position: Position, seed: string, policy?: (moment: KeyMoment) => string) {
  const [home, away] = clubs as [(typeof clubs)[number], (typeof clubs)[number]];
  const id =
    home.playerIds.find((pid) => world.players[pid]!.primaryPosition === position) ??
    home.playerIds[0]!;
  let session: MatchSession = createMatchSession(
    createMatchSetup(world, home.id, away.id, id, seed),
    tactics,
  );
  const found: { session: MatchSession; moment: KeyMoment; next: MatchSession }[] = [];
  for (let turn = 0; turn < 400 && session.state.match.status !== 'finished'; turn++) {
    const moment = session.state.currentMoment;
    const command =
      moment && policy
        ? { type: 'choose' as const, choiceId: policy(moment) }
        : autoPlayCommand(session);
    const next = applyMatchCommand(session, command);
    if (moment) found.push({ session, moment, next });
    session = next;
  }
  return found;
}

const sideIds = (session: MatchSession) => {
  const setup = session.setup;
  const own = setup.home.playerIds.includes(setup.selectedPlayerId) ? setup.home : setup.away;
  return new Set(own.playerIds);
};

describe('key-moment cast (match-15)', () => {
  const all = (['ST', 'LW', 'CM', 'CB', 'LB', 'GK'] as const).flatMap((position) =>
    [0, 1, 2].flatMap((n) => moments(position, `cast-${position}-${n}`)),
  );
  it('names every moment’s cast, on the pitch and on the right side', () => {
    expect(all.length).toBeGreaterThan(60);
    for (const { session, moment } of all) {
      const cast = moment.cast!;
      expect(cast, moment.situationId).toBeDefined();
      expect(moment.zone).toMatch(/^(def|mid|final)$/);
      expect(cast.selected).toBe(session.setup.selectedPlayerId);
      const own = sideIds(session);
      const onPitch = new Set(moment.frame.players.map((p) => p.id));
      const ids = [
        cast.selected,
        cast.presser,
        cast.keeper,
        cast.runner,
        cast.crosser,
        ...cast.cover,
        ...cast.free,
      ].filter((id): id is string => Boolean(id));
      for (const id of ids) expect(onPitch.has(id), `${moment.situationId} ${id}`).toBe(true);
      const attacking = SITUATION_BY_ID[moment.situationId]!.phase !== 'defence';
      if (cast.presser) expect(own.has(cast.presser)).toBe(false);
      if (cast.keeper) {
        expect(session.setup.players[cast.keeper]!.primaryPosition).toBe('GK');
        expect(own.has(cast.keeper)).toBe(!attacking);
      }
      for (const id of cast.free) expect(own.has(id)).toBe(true);
      for (const id of cast.cover) expect(own.has(id)).toBe(!attacking);
      if (cast.runner) expect(own.has(cast.runner)).toBe(attacking);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('gives choices targets that point the right way', () => {
    for (const { session, moment } of all) {
      const own = sideIds(session);
      for (const choice of moment.choices) {
        const target = choice.target;
        if (!target) continue;
        if (target.kind === 'teammate') {
          expect(own.has(target.playerId)).toBe(true);
          expect(target.playerId).not.toBe(session.setup.selectedPlayerId);
          const at = moment.frame.players.find((p) => p.id === target.playerId)!.point;
          expect(target.point).toEqual(at);
        } else if (target.kind === 'runner') {
          expect(moment.frame.players.some((p) => p.id === target.playerId)).toBe(true);
        } else if (target.kind === 'goal') {
          const camera = momentCamera(session.setup, moment);
          // The goal the selected team attacks is at the top of the camera.
          expect(toCam(target.point, camera.attacksRight).y).toBeLessThan(1);
        }
      }
      // Every pass-type choice names its receiver.
      const situation = SITUATION_BY_ID[moment.situationId]!;
      for (const choice of moment.choices) {
        const template = situation.choices.find((c) => c.id === choice.id)!;
        if (template.event === 'pass') expect(choice.target?.kind).toBe('teammate');
        if (template.direct === 'for') expect(choice.target?.kind).toBe('goal');
      }
    }
  });
  it('puts the near post nearer the shooter than the far post', () => {
    for (const { session, moment } of all) {
      const near = moment.choices.find((c) => c.id === 'near-post')?.target;
      const far = moment.choices.find((c) => c.id === 'far-post')?.target;
      if (near?.kind !== 'goal' || far?.kind !== 'goal') continue;
      const you = moment.frame.players.find((p) => p.id === session.setup.selectedPlayerId)!.point;
      expect(Math.abs(near.point.y - you.y)).toBeLessThan(Math.abs(far.point.y - you.y));
    }
  });
  it('plays a teammate pass to the receiver its target named', () => {
    let checked = 0;
    for (const position of ['CM', 'ST', 'LW', 'CB', 'GK'] as const)
      for (let n = 0; n < 6; n++) {
        // Always pick a pass when one is offered.
        const found = moments(position, `receiver-${position}-${n}`, (moment) => {
          const pass = moment.choices.find((c) => c.target?.kind === 'teammate');
          return (pass ?? moment.choices[0]!).id;
        });
        for (const { moment, next } of found) {
          const choice = moment.choices.find((c) => c.target?.kind === 'teammate');
          if (!choice || choice.target?.kind !== 'teammate') continue;
          const action = next.state.match.events.find(
            (e) => e.outcome?.input.momentId === moment.id,
          )!;
          if (!action.outcome!.success) continue;
          expect(action.receiverId, `${moment.situationId} ${choice.id}`).toBe(
            choice.target.playerId,
          );
          // A chance it creates falls to the same teammate.
          const events = next.state.match.events;
          const shot = events[events.indexOf(action) + 1];
          if (shot?.kind === 'shot' && shot.commentaryKey.startsWith('match.commentary.chance'))
            expect(shot.playerId).toBe(choice.target.playerId);
          checked++;
        }
      }
    expect(checked).toBeGreaterThan(20);
  });
  it('replays the cast and targets byte for byte', () => {
    const { next } = all.at(-1)!;
    expect(JSON.parse(JSON.stringify(next.state.match.keyMoments))).toEqual(
      next.state.match.keyMoments,
    );
  });
});

describe('the engine cast on the camera', () => {
  it('labels the cast and draws an arrow for every targeted choice', () => {
    for (const { session, moment } of moments('ST', 'cast-camera')) {
      const camera = momentCamera(session.setup, moment);
      expect(camera.cast[0]).toEqual({
        id: session.setup.selectedPlayerId,
        role: 'you',
        own: true,
      });
      const roles = new Set(camera.cast.map((m) => m.role));
      if (moment.cast!.presser) expect(roles.has('press')).toBe(true);
      const targeted = moment.choices.filter((c) => c.target).length;
      expect(camera.arrows.length).toBe(targeted);
    }
  });
});
