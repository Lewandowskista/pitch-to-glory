import { describe, expect, it } from 'vitest';
import type { Position, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import { autoPlayCommand, careerMatchSetup, defaultTactics } from '../src/engine/career/matches';
import { previewObjectives } from '../src/engine/career/objectives';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  DISCIPLINE_MATCH_ENGINE,
  engineFor,
  MATCH_ENGINE_VERSION,
  rolePosition,
  rolesForPosition,
  slotPosition,
  type MatchSetup,
} from '../src/engine/match';
import { objectivesFor } from '../src/engine/match/objectives';
import { isRoleFor } from '../src/engine/match/roles';
import { deservedRole, prospectSelection, slotCompetition } from '../src/engine/career/market';
import { selectLineup } from '../src/engine/selection/lineup';
import { clubFormation, usesFormations } from '../src/engine/selection/world';

/**
 * One job per match (review phase 2, step 2.1): a player fielded away from their primary
 * position gets the role choices, objectives, involvement and half-time change of the slot
 * they play, on the current engine. Earlier engines keep the primary position.
 */
const world = generateWorld('effective-role', { format: 'legacy' });
const [home, away] = Object.values(world.clubs);
const winger = home!.playerIds
  .map((id) => world.players[id]!)
  .find((player) => player.primaryPosition === 'RW' || player.primaryPosition === 'LW')!;

/** A right or left winger in a 3-5-2, which has no wingers. */
function wingerInThreeFiveTwo(): MatchSetup {
  const setup = createMatchSetup(world, home!.id, away!.id, winger.id, 'effective-role');
  setup.formations = ['3-5-2', setup.formations![1]];
  return setup;
}

describe('effective match role', () => {
  it('gives a winger in a formation without wingers the slot they play', () => {
    const setup = wingerInThreeFiveTwo();
    expect(engineFor(setup)).toBe(MATCH_ENGINE_VERSION);
    const position = rolePosition(setup);
    expect(position).toBe(slotPosition(winger, '3-5-2'));
    expect(['RW', 'LW']).not.toContain(position);
    // Role choices are the slot's: a winger's role is refused, the slot's accepted.
    const wingRole = rolesForPosition(winger.primaryPosition)[0]!;
    if (!isRoleFor(position, wingRole))
      expect(() =>
        createMatchSession(setup, { role: wingRole, risk: 'balanced', mentality: 'balanced' }),
      ).toThrow();
    const role = rolesForPosition(position)[0]!;
    const session = createMatchSession(setup, {
      role,
      risk: 'balanced',
      mentality: 'balanced',
    });
    // Objectives and involvement follow the slot.
    expect(session.state.match.objectives).toEqual(objectivesFor(setup.seed, winger, position));
    const primary = createMatchSession(
      { ...setup, formations: ['4-3-3', setup.formations![1]] },
      { role: wingRole, risk: 'balanced', mentality: 'balanced' },
    );
    expect(session.state.shares).not.toEqual(primary.state.shares);
  });

  it('changes role at half-time within the slot’s roles', () => {
    const setup = wingerInThreeFiveTwo();
    const position = rolePosition(setup);
    let session = createMatchSession(setup, {
      role: rolesForPosition(position)[0]!,
      risk: 'balanced',
      mentality: 'balanced',
    });
    while (session.state.match.status !== 'halftime' && session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    expect(session.state.match.status).toBe('halftime');
    const after = applyMatchCommand(session, { type: 'halftime', response: 'role' });
    expect(isRoleFor(position, after.state.match.tactics.role)).toBe(true);
  });

  it('keeps the primary position on the earlier engine', () => {
    const setup = wingerInThreeFiveTwo();
    delete setup.roleSlot;
    expect(engineFor(setup)).toBe(DISCIPLINE_MATCH_ENGINE);
    expect(rolePosition(setup)).toBe(winger.primaryPosition);
    const session = createMatchSession(setup, {
      role: rolesForPosition(winger.primaryPosition)[0]!,
      risk: 'balanced',
      mentality: 'balanced',
    });
    expect(session.state.match.objectives).toEqual(objectivesFor(setup.seed, winger));
  });

  it('previews on the hub exactly the objectives kickoff sets', () => {
    const base = generateWorld('effective-role-career', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'effective-role-career')[0]!;
    const draft: CareerDraft = {
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
      position: 'AM',
      foot: 'left',
      age: 17,
      archetype: 'playmaker',
    };
    const career: World = createCareer(base, draft, trial.id, 'effective-role-career');
    const fixture = nextCareerFixture(career)!;
    const setup = careerMatchSetup(career, fixture);
    const session = createMatchSession(setup, defaultTactics(career, setup));
    expect(previewObjectives(career, fixture)).toEqual(session.state.match.objectives);
    const position: Position = rolePosition(setup);
    expect(isRoleFor(position, defaultTactics(career, setup).role)).toBe(true);
  });
});

describe('role promises under the manager’s formation', () => {
  const club = home!;
  const starters = () => {
    const formation = clubFormation(world, club);
    return selectLineup(club.playerIds, world.players, formation).starterIds;
  };

  it('promises a starter a key role, and judges an injured starter as fit', () => {
    expect(usesFormations(world)).toBe(true);
    const starter =
      world.players[starters().find((id) => world.players[id]!.primaryPosition !== 'GK')!]!;
    expect(slotCompetition(world, club, starter).inTeam).toBe(true);
    expect(deservedRole(world, club, starter)).toBe('key');
    const injured: World = {
      ...world,
      players: { ...world.players, [starter.id]: { ...starter, injuryId: 'injury:test' } },
    };
    expect(deservedRole(injured, club, injured.players[starter.id]!)).toBe('key');
  });

  it('promises by the competition for the slot, not a 4-3-3 line count', () => {
    for (const id of club.playerIds) {
      const player = world.players[id]!;
      const competition = slotCompetition(world, club, player);
      const role = deservedRole(world, club, player);
      if (competition.inTeam) expect(role).toBe('key');
      else if (competition.placesOutside <= 1) expect(role).toBe('rotation');
      else expect(['backup', 'youth']).toContain(role);
    }
  });

  it('shows what a move means for minutes, by the selection formula', () => {
    const player = world.players[starters()[5]!]!;
    const buyer = away!;
    const prospect = prospectSelection(world, buyer, player, 'rotation');
    expect(prospect.competition).toEqual(slotCompetition(world, buyer, player));
    expect(prospect.probability).toBeGreaterThan(0);
    expect(prospect.probability).toBeLessThanOrEqual(1);
    // A key-player promise never lowers the chance.
    expect(prospectSelection(world, buyer, player, 'key').probability).toBeGreaterThanOrEqual(
      prospect.probability,
    );
  });
});
