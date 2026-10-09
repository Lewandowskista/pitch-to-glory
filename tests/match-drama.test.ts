import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { CONFIG } from '../src/engine/config';
import { autoPlayCommand } from '../src/engine/career/matches';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  engineFor,
  situationWeights,
  validateMatchSession,
  MATCH_ENGINE_VERSION,
  SITUATIONS,
  SLOT_MATCH_ENGINE,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { HEADLINE_KINDS, HEADLINE_VARIANTS } from '../src/engine/match/headlines';
import { hasMatchLabel, matchFormat, matchLabel, situationText } from '../src/i18n/match';
import type { Position } from '../src/model/domain';

/**
 * Key moments that follow the game (engine match-12): late moments in close games, set pieces
 * and last-ditch situations, framings that name the people in them, and a headline that tells
 * the story of the match.
 */
const world = generateWorld('match-drama', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const G = CONFIG.match.drama;
function setupFor(position: Position, seed: string, index = 0): MatchSetup {
  const [home, away] = index % 2 ? [clubs[1]!, clubs[0]!] : [clubs[0]!, clubs[1]!];
  const club = index % 2 ? clubs[1]! : clubs[0]!;
  const ids = club.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
  return createMatchSetup(world, home.id, away.id, ids[Math.floor(index / 2) % ids.length]!, seed);
}
function play(session: MatchSession): MatchSession {
  let s = session;
  while (s.state.match.status !== 'finished') s = applyMatchCommand(s, autoPlayCommand(s));
  return s;
}
const ownSide = (session: MatchSession) =>
  session.setup.players[session.setup.selectedPlayerId]!.clubId === session.setup.home.id ? 0 : 1;
const DRAMA = SITUATIONS.filter((situation) => situation.drama).map((situation) => situation.id);

describe('key moments that follow the game', () => {
  const played = (['ST', 'AM', 'CB', 'GK'] as Position[]).flatMap((position) =>
    Array.from({ length: 60 }, (_, index) => {
      const setup = setupFor(position, `drama:${position}:${index}`, index);
      const legacy = structuredClone(setup);
      delete legacy.dramaMoments;
      return {
        position,
        drama: play(createMatchSession(setup, tactics)),
        before: play(createMatchSession(legacy, tactics)),
      };
    }),
  );

  it('replay sessions saved before as they were, without the new situations', () => {
    const setup = setupFor('ST', 'drama:replay');
    expect(setup.dramaMoments).toBe(true);
    expect(engineFor(setup)).toBe(MATCH_ENGINE_VERSION);
    const legacy = structuredClone(setup);
    delete legacy.dramaMoments;
    expect(engineFor(legacy)).toBe(SLOT_MATCH_ENGINE);
    let session = createMatchSession(legacy, tactics);
    expect(session.engine).toBe(SLOT_MATCH_ENGINE);
    session = applyMatchCommand(session, { type: 'kickoff' });
    expect(validateMatchSession(structuredClone(session))).toEqual(session);
    expect(() =>
      validateMatchSession({ ...structuredClone(session), engine: MATCH_ENGINE_VERSION }),
    ).toThrow();
    for (const { before } of played) {
      for (const moment of before.state.match.keyMoments) {
        expect(DRAMA).not.toContain(moment.situationId);
        expect(moment.situationKey).toBe(`match.situation.${moment.situationId}`);
      }
      expect(validateMatchSession(structuredClone(before))).toEqual(before);
    }
    for (const { drama } of played.slice(0, 20))
      expect(validateMatchSession(structuredClone(drama))).toEqual(drama);
  });

  it('keep the last moment for the closing minutes when the game is close', () => {
    let close = 0,
      lateWhenClose = 0;
    for (const { drama } of played) {
      const s = drama.state;
      if (s.substituted) continue;
      const moments = s.match.keyMoments;
      const last = moments[moments.length - 1]!;
      // The score when the deciding minute was reached.
      const goals = s.match.events.filter(
        (e) => e.kind === 'goal' && e.minute < G.lateDecisionMinute,
      );
      const own = ownSide(drama);
      const ownTeam = own === 0 ? drama.setup.home.id : drama.setup.away.id;
      const margin = goals.reduce((sum, e) => sum + (e.teamId === ownTeam ? 1 : -1), 0);
      if (Math.abs(margin) <= G.closeMargin) {
        close++;
        if (last.minute >= G.lateMinutes[0]) lateWhenClose++;
      } else expect(last.minute).toBe(G.routineLateMinute);
      // The rest are spread through the match and never collide.
      expect(new Set(moments.map((m) => m.minute)).size).toBe(moments.length);
    }
    expect(close).toBeGreaterThan(100);
    expect(lateWhenClose).toBe(close);
  });

  it('weight attacking moments when chasing and defending ones when protecting a lead', () => {
    const at = (margin: number) =>
      situationWeights('CB', 'balanced', { drama: true, state: { minute: 75, margin } });
    const share = (weights: ReturnType<typeof at>, phase: 'attack' | 'defence') =>
      weights.filter((w) => w.situation.phase === phase).reduce((sum, w) => sum + w.weight, 0) /
      weights.reduce((sum, w) => sum + w.weight, 0);
    expect(share(at(-1), 'attack')).toBeGreaterThan(share(at(0), 'attack'));
    expect(share(at(1), 'defence')).toBeGreaterThan(share(at(0), 'defence'));
    // Early in the game the score does not tilt anything.
    const early = situationWeights('CB', 'balanced', {
      drama: true,
      state: { minute: 30, margin: -2 },
    });
    expect(early).toEqual(at(0));
    // Without the drama engine the pool is the one sessions saved before used.
    expect(situationWeights('ST', 'balanced').some((w) => w.situation.drama)).toBe(false);
  });

  it('keep the goals a match expects, wherever they now come from', () => {
    const mean = (key: 'drama' | 'before') =>
      played.reduce((sum, entry) => {
        const score = entry[key].state.match.score;
        return sum + score[0] + score[1];
      }, 0) / played.length;
    expect(Math.abs(mean('drama') - mean('before'))).toBeLessThan(0.25);
    expect(mean('drama')).toBeGreaterThan(2.2);
    expect(mean('drama')).toBeLessThan(3.2);
  });

  it('offer set pieces and last-ditch moments with stated odds that come true', () => {
    const seen: Record<string, { n: number; stated: number; actual: number }> = {};
    for (const { drama } of played)
      for (const moment of drama.state.match.keyMoments) {
        if (!DRAMA.includes(moment.situationId)) continue;
        const outcome = drama.state.match.events.find(
          (e) => e.outcome?.input.momentId === moment.id,
        )?.outcome;
        if (!outcome) continue;
        const entry = (seen[moment.situationId] ??= { n: 0, stated: 0, actual: 0 });
        entry.n++;
        entry.stated += outcome.probability;
        entry.actual += outcome.success ? 1 : 0;
      }
    expect(Object.keys(seen)).toEqual(expect.arrayContaining(['offside-line', 'free-kick']));
    let n = 0,
      stated = 0,
      actual = 0;
    for (const entry of Object.values(seen)) {
      n += entry.n;
      stated += entry.stated;
      actual += entry.actual;
    }
    expect(Math.abs(stated / n - actual / n)).toBeLessThan(0.08);
  });

  it('make a penalty a big chance and a penalty save a rare one', () => {
    const penalty = SITUATIONS.find((s) => s.id === 'penalty')!;
    const save = SITUATIONS.find((s) => s.id === 'penalty-save')!;
    const probabilities = (id: string, position: Position) => {
      const values: number[] = [];
      for (let index = 0; values.length < 6 && index < 400; index++) {
        let session = createMatchSession(setupFor(position, `pen:${id}:${index}`, index), tactics);
        while (session.state.match.status !== 'finished') {
          const moment = session.state.currentMoment;
          if (moment?.situationId === id) {
            values.push(Math.max(...moment.choices.map((c) => c.probability)));
            break;
          }
          session = applyMatchCommand(session, autoPlayCommand(session));
        }
      }
      return values;
    };
    const taken = probabilities(penalty.id, 'ST');
    const faced = probabilities(save.id, 'GK');
    expect(taken.length).toBeGreaterThan(0);
    expect(faced.length).toBeGreaterThan(0);
    for (const p of taken) expect(p).toBeGreaterThan(0.5);
    for (const p of faced) expect(p).toBeLessThan(0.45);
  }, 60000);

  it('frame each moment with the people in it, and every line has its copy', () => {
    for (const { drama } of played)
      for (const moment of drama.state.match.keyMoments) {
        expect(moment.situationKey).toMatch(/\.\d$/);
        expect(hasMatchLabel(moment.situationKey)).toBe(true);
        const text = situationText(moment);
        expect(text).not.toMatch(/[{}]/);
        if (moment.pressureKey) {
          expect(hasMatchLabel(moment.pressureKey)).toBe(true);
          expect(moment.minute).toBeGreaterThanOrEqual(G.lateDecisionMinute);
        }
      }
    for (const situation of SITUATIONS)
      for (let variant = 0; variant < G.situationVariants; variant++)
        expect(hasMatchLabel(`match.situation.${situation.id}.${variant}`)).toBe(true);
    for (const kind of ['level', 'ahead', 'behind'])
      expect(hasMatchLabel(`match.pressure.${kind}`)).toBe(true);
    for (const kind of ['late-equaliser', 'late-winner'])
      for (let variant = 0; variant < CONFIG.match.commentaryVariants; variant++)
        expect(hasMatchLabel(`match.commentary.${kind}.${variant}`)).toBe(true);
  });

  it('write a headline and reactions that match the result', () => {
    for (const kind of HEADLINE_KINDS)
      for (let variant = 0; variant < HEADLINE_VARIANTS; variant++)
        expect(hasMatchLabel(`match.headline.${kind}.${variant}`)).toBe(true);
    for (const who of ['manager', 'fans'])
      for (const result of ['win', 'draw', 'loss'])
        for (const performance of ['star', 'solid', 'poor'])
          expect(hasMatchLabel(`match.reaction.${who}.${result}.${performance}`)).toBe(true);
    const losing = ['scorer-loss', 'thrashed', 'nightmare', 'strong-loss', 'loss'];
    const winning = ['late-winner', 'scorer-win', 'rout', 'strong-win', 'win'];
    const kinds = new Set<string>();
    for (const { drama } of played) {
      const s = drama.state;
      const own = ownSide(drama);
      const margin = s.match.score[own]! - s.match.score[1 - own]!;
      const kind = s.headlineKey.split('.')[2]!;
      kinds.add(kind);
      if (losing.includes(kind)) expect(margin).toBeLessThan(0);
      if (winning.includes(kind)) expect(margin).toBeGreaterThan(0);
      const result = margin > 0 ? 'win' : margin < 0 ? 'loss' : 'draw';
      expect(s.managerReactionKey.split('.')[3]).toBe(result);
      expect(s.fanReactionKey.split('.')[3]).toBe(result);
      const text = matchFormat(matchLabel(s.report!.headlineId), s.report!.headlineParams ?? {});
      expect(text).not.toMatch(/[{}]/);
      expect(s.report!.headlineParams?.player).toBe(
        drama.setup.players[drama.setup.selectedPlayerId]!.name,
      );
    }
    // Over a few hundred matches the stories differ.
    expect(kinds.size).toBeGreaterThanOrEqual(8);
  });
});
