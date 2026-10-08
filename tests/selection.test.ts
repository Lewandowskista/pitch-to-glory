import { beforeAll, describe, expect, it } from 'vitest';
import type { Player, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { nextCareerFixture, pendingCareerFixture } from '../src/engine/career/fixtures';
import { autoPlayCommand, careerMatchSetup, defaultTactics } from '../src/engine/career/matches';
import { careerSelection, slotCompetition } from '../src/engine/career/market';
import { applyMatchCommand, createMatchSession, validateMatchSession } from '../src/engine/match';
import {
  engineFor,
  LEGACY_MATCH_ENGINE,
  MATCH_ENGINE_VERSION,
  PREVIOUS_MATCH_ENGINE,
} from '../src/engine/match/types';
import { SITUATION_BY_ID } from '../src/engine/match/situations';
import {
  FORMATION_SLOTS,
  FORMATIONS,
  formationOf,
  type Formation,
} from '../src/engine/selection/formations';
import { effectiveAbility, selectLineup, slotFit } from '../src/engine/selection/lineup';
import { clubFormation, usesFormations } from '../src/engine/selection/world';
import { playerAbility } from '../src/engine/strength';
import { validateWorld } from '../src/persistence/worldSchema';

/** Phase 5.1: one formation-aware selection for background, career and interactive matches. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let world: World;
beforeAll(() => {
  const base = generateWorld('selection-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'selection-tests')[0]!;
  world = createCareer(
    base,
    {
      name: 'Robin Vale',
      avatar: {
        face: 1,
        skin: 2,
        hair: 3,
        hairColor: 4,
        facialHair: 0,
        eyebrows: 1,
        eyes: 2,
        accessory: 3,
      },
      nationalityId: 'country:0',
      position: 'ST',
      foot: 'left',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'selection-tests',
  );
});
const careerPlayer = (source: World) => source.players[source.career!.playerId]!;
const careerClub = (source: World) => source.clubs[careerPlayer(source).clubId!]!;
const setAll = (player: Player, value: number) => {
  for (const key of Object.keys(player.attributes))
    (player.attributes as Record<string, number>)[key] = value;
  for (const key of Object.keys(player.keeperAttributes))
    (player.keeperAttributes as Record<string, number>)[key] = value;
};

describe('formations', () => {
  it('field a selected player with no fit anywhere in their own line, not at centre-back', () => {
    const players = clone(world.players);
    const club = careerClub(world);
    const winger = club.playerIds
      .map((id) => players[id]!)
      .find((p) => p.primaryPosition !== 'GK')!;
    winger.primaryPosition = 'RW';
    winger.secondaryPositions = [];
    const choice = selectLineup(club.playerIds, players, '3-5-2', { selected: winger.id });
    const index = choice.starterIds.indexOf(winger.id);
    expect(FORMATION_SLOTS['3-5-2'][index]!.line).toBe('attack');
  });
  it('give every formation eleven slots: one keeper first, then outfield posts', () => {
    for (const formation of FORMATIONS) {
      const slots = FORMATION_SLOTS[formation];
      expect(slots).toHaveLength(11);
      expect(slots[0]!.position).toBe('GK');
      expect(slots.slice(1).every((slot) => slot.position !== 'GK')).toBe(true);
      expect(slots.filter((slot) => slot.line === 'defence').length).toBe(
        Number(formation.split('-')[0]),
      );
      // Each shape stays on the pitch and widens out of possession no further than in it.
      for (const slot of slots)
        for (const [d, w] of [slot.in, slot.out]) {
          expect(d).toBeGreaterThan(0);
          expect(w).toBeGreaterThan(0);
          expect(w).toBeLessThan(100);
        }
    }
    expect(formationOf('5-4-1')).toBe('4-3-3');
    expect(formationOf('3-5-2')).toBe('3-5-2');
  });
});

describe('selection', () => {
  it('picks eleven unique, available players with one keeper, for every formation', () => {
    const club = careerClub(world);
    const source = clone(world);
    const [injured, retired] = club.playerIds.filter(
      (id) => id !== source.career!.playerId && source.players[id]!.primaryPosition !== 'GK',
    );
    source.players[injured!]!.injuryId = 'injury:test';
    source.players[retired!]!.retired = true;
    for (const formation of FORMATIONS) {
      const lineup = selectLineup(club.playerIds, source.players, formation);
      expect(lineup.formation).toBe(formation);
      expect(lineup.starterIds).toHaveLength(11);
      expect(new Set(lineup.starterIds).size).toBe(11);
      expect(
        lineup.starterIds.filter((id) => source.players[id]!.primaryPosition === 'GK'),
      ).toEqual([lineup.starterIds[0]]);
      expect(lineup.starterIds).not.toContain(injured);
      expect(lineup.starterIds).not.toContain(retired);
      expect(lineup.slots).toEqual(FORMATION_SLOTS[formation].map((slot) => slot.position));
      expect([...lineup.starterIds, ...lineup.benchIds].sort()).toEqual(
        club.playerIds.filter((id) => id !== injured && id !== retired).sort(),
      );
    }
  });

  it('breaks ties deterministically and does not depend on squad order', () => {
    const club = careerClub(world);
    const source = clone(world);
    // Two identical wingers: the lower id plays.
    const wingers = club.playerIds.filter((id) => source.players[id]!.primaryPosition === 'LW');
    for (const id of club.playerIds) setAll(source.players[id]!, 50);
    const lineup = selectLineup(club.playerIds, source.players, '4-3-3');
    const reversed = selectLineup([...club.playerIds].reverse(), source.players, '4-3-3');
    expect(reversed.starterIds).toEqual(lineup.starterIds);
    if (wingers.length > 1) expect(lineup.starterIds[8]).toBe([...wingers].sort()[0]);
  });

  it('values a player in a slot by positional fit, so specialists and familiar players win', () => {
    const player = clone(careerPlayer(world));
    setAll(player, 70);
    player.secondaryPositions = [{ position: 'LW', familiarity: 50 }];
    expect(slotFit(player, 'ST')).toBe(100);
    expect(slotFit(player, 'LW')).toBe(50);
    expect(slotFit(player, 'CB')).toBe(0);
    expect(effectiveAbility(player, 'ST')).toBe(playerAbility(player));
    expect(effectiveAbility(player, 'LW')).toBeCloseTo(70 * 0.9);
    expect(effectiveAbility(player, 'CB')).toBeCloseTo(70 * 0.8);
  });

  it('places a selected player in their best slot and never moves a keeper outfield', () => {
    const club = careerClub(world);
    const id = careerPlayer(world).id;
    for (const formation of FORMATIONS) {
      const lineup = selectLineup(club.playerIds, world.players, formation, { selected: id });
      const index = lineup.starterIds.indexOf(id);
      expect(index).toBeGreaterThan(0);
      expect(slotFit(world.players[id]!, lineup.slots[index]!)).toBeGreaterThan(0);
      expect(world.players[lineup.starterIds[0]!]!.primaryPosition).toBe('GK');
      expect(
        lineup.starterIds.slice(1).some((other) => world.players[other]!.primaryPosition === 'GK'),
      ).toBe(false);
    }
    const keeper = club.playerIds.find(
      (other) =>
        world.players[other]!.primaryPosition === 'GK' &&
        other !== selectLineup(club.playerIds, world.players, '4-3-3').starterIds[0],
    );
    if (keeper) {
      const lineup = selectLineup(club.playerIds, world.players, '4-3-3', { selected: keeper });
      expect(lineup.starterIds[0]).toBe(keeper);
    }
  });
});

describe('career selection', () => {
  it('learning a suitable secondary position can win a place in the eleven', () => {
    const source = clone(world);
    const club = careerClub(source);
    source.managers[club.managerId]!.preferredFormation = '4-3-3';
    const player = careerPlayer(source);
    // Everyone else in the eleven is far better, except the left winger.
    const without = selectLineup(club.playerIds, source.players, '4-3-3', {
      exclude: [player.id],
    });
    const winger = without.starterIds[8]!;
    for (const id of without.starterIds) if (id !== winger) setAll(source.players[id]!, 99);
    const incumbent = effectiveAbility(source.players[winger]!, 'LW');
    setAll(player, incumbent / 0.9);
    player.secondaryPositions = [{ position: 'LW', familiarity: 0 }];
    const fixture = nextCareerFixture(source)!;
    const before = careerSelection(source, fixture);
    expect(before.competition.inTeam).toBe(false);
    expect(before.competition.placesOutside).toBeGreaterThan(0);
    player.secondaryPositions = [{ position: 'LW', familiarity: 95 }];
    const after = careerSelection(source, fixture);
    expect(after.competition).toMatchObject({ inTeam: true, position: 'LW', fit: 95 });
    expect(after.probability).toBeGreaterThan(before.probability);
  });

  it('explains the chance with the same numbers it adds up', () => {
    const fixture = nextCareerFixture(world)!;
    const selection = careerSelection(world, fixture);
    const total = selection.reasons.reduce((sum, reason) => sum + (reason.contribution ?? 0), 0);
    expect(total).toBeCloseTo(selection.probability, 10);
    expect(selection.reasons.map((reason) => reason.kind).slice(0, 5)).toEqual([
      'role',
      'competition',
      'form',
      'trust',
      'fatigue',
    ]);
    // Deterministic for the fixture.
    expect(careerSelection(world, fixture)).toEqual(selection);
  });

  it('keeps line-based competition until a world adopts formations at the new season', () => {
    const before: World = clone(world);
    delete before.selectionVersion;
    expect(usesFormations(before)).toBe(false);
    const competition = slotCompetition(before, careerClub(before), careerPlayer(before));
    expect(competition.formation).toBeNull();
    expect(competition.position).toBe(careerPlayer(before).primaryPosition);
    let season = before;
    while (season.phase === 'active')
      season = advanceCareerWeek(season, { inPlace: true, autoPlay: true }).world;
    expect(season.selectionVersion).toBeUndefined();
    const next = startNextSeason(season);
    expect(next.selectionVersion).toBe(1);
    expect(slotCompetition(next, careerClub(next), careerPlayer(next)).formation).toBe(
      clubFormation(next, careerClub(next)),
    );
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);
});

describe('interactive matches', () => {
  const pending = () => {
    let source = clone(world);
    for (let guard = 0; guard < 8 && !pendingCareerFixture(source); guard++)
      source = advanceCareerWeek(source, { inPlace: true, autoPlay: true }).world;
    return source;
  };

  it('field the managers’ formations, and the pitch takes their shape', () => {
    const source = pending();
    const setup = careerMatchSetup(source, pendingCareerFixture(source)!);
    expect(setup.formations).toEqual([
      clubFormation(source, source.clubs[setup.home.id]!),
      clubFormation(source, source.clubs[setup.away.id]!),
    ]);
    const shaped = { ...setup, formations: ['3-5-2', '4-4-2'] as [Formation, Formation] };
    let session = createMatchSession(shaped, defaultTactics(source));
    expect(session.engine).toBe(MATCH_ENGINE_VERSION);
    expect(session.state.match.home.formation).toBe('3-5-2');
    expect(session.state.match.away.formation).toBe('4-4-2');
    session = applyMatchCommand(session, { type: 'kickoff' });
    const frame = session.state.frames[1] ?? session.state.frames[0]!;
    // Home attacks right in the first half: y is width from their left.
    const y = (index: number) => frame.players[index]!.point.y;
    expect(y(4)).toBeLessThan(30); // left wing-back
    expect(y(8)).toBeGreaterThan(70); // right wing-back
    // Three centre-backs between them.
    for (const index of [1, 2, 3]) {
      expect(y(index)).toBeGreaterThan(y(4));
      expect(y(index)).toBeLessThan(y(8));
    }
    // A saved session replays exactly.
    expect(validateMatchSession(clone(session))).toEqual(session);
  });

  it('draw key moments for the slot played, at a stated cost in an unfamiliar one', () => {
    const source = pending();
    const setup = careerMatchSetup(source, pendingCareerFixture(source)!);
    expect(setup.slotMoments).toBe(true);
    const id = setup.selectedPlayerId;
    const primary = setup.players[id]!.primaryPosition;
    const play = (slotted: boolean) => {
      let session = createMatchSession(setup, defaultTactics(source));
      expect(session.engine).toBe(MATCH_ENGINE_VERSION);
      if (slotted) {
        // Field the striker at centre-back, a slot they know a little.
        const team = session.state.match[setup.home.id === careerClub(source).id ? 'home' : 'away'];
        const slots = FORMATION_SLOTS[team.formation as Formation];
        const from = team.starterIds.indexOf(id);
        const to = slots.findIndex((slot) => slot.position === 'CB');
        [team.starterIds[from], team.starterIds[to]] = [
          team.starterIds[to]!,
          team.starterIds[from]!,
        ];
        session.setup.players[id]!.secondaryPositions = [{ position: 'CB', familiarity: 40 }];
      }
      const moments = new Map<string, { situationId: string; penalised: boolean }>();
      while (session.state.match.status !== 'finished') {
        const moment = session.state.currentMoment;
        if (moment && !moments.has(moment.id))
          moments.set(moment.id, {
            situationId: moment.situationId,
            penalised: moment.choices.every((choice) =>
              choice.factors.some(
                (f) => f.labelKey === 'match.factor.position' && f.contribution < 0,
              ),
            ),
          });
        session = applyMatchCommand(session, autoPlayCommand(session));
      }
      return [...moments.values()];
    };
    const own = play(false);
    expect(own.length).toBeGreaterThan(0);
    for (const moment of own) {
      expect(SITUATION_BY_ID[moment.situationId]!.positions[primary] ?? 0).toBeGreaterThan(0);
      expect(moment.penalised).toBe(false);
    }
    const slotted = play(true);
    expect(slotted.length).toBeGreaterThan(0);
    for (const moment of slotted) {
      expect(SITUATION_BY_ID[moment.situationId]!.positions.CB ?? 0).toBeGreaterThan(0);
      expect(moment.penalised).toBe(true);
    }
    // At least one moment a striker would never face in their own position.
    expect(slotted.some((m) => !(SITUATION_BY_ID[m.situationId]!.positions[primary] ?? 0))).toBe(
      true,
    );
  }, 120000);

  it('replay match-10 sessions, saved before slot-aware moments, as they were', () => {
    const source = pending();
    const setup = careerMatchSetup(source, pendingCareerFixture(source)!);
    delete setup.slotMoments;
    expect(engineFor(setup)).toBe(PREVIOUS_MATCH_ENGINE);
    let session = createMatchSession(setup, defaultTactics(source));
    expect(session.engine).toBe(PREVIOUS_MATCH_ENGINE);
    session = applyMatchCommand(session, { type: 'kickoff' });
    expect(validateMatchSession(clone(session))).toEqual(session);
    // Neither engine can be claimed for the other's setup.
    expect(() =>
      validateMatchSession({ ...clone(session), engine: MATCH_ENGINE_VERSION }),
    ).toThrow();
  });

  it('replay sessions from before formations with their 4-3-3', () => {
    const source = pending();
    delete source.selectionVersion;
    const setup = careerMatchSetup(source, pendingCareerFixture(source)!);
    expect(setup.formations).toBeUndefined();
    expect(engineFor(setup)).toBe(LEGACY_MATCH_ENGINE);
    let session = createMatchSession(setup, defaultTactics(source));
    expect(session.engine).toBe(LEGACY_MATCH_ENGINE);
    expect(session.state.match.home.formation).toBe('4-3-3');
    session = applyMatchCommand(session, { type: 'kickoff' });
    expect(validateMatchSession(clone(session))).toEqual(session);
    // A legacy session cannot claim formations, and a new one cannot claim the old engine.
    expect(() =>
      validateMatchSession({ ...clone(session), engine: MATCH_ENGINE_VERSION }),
    ).toThrow();
  });
});
