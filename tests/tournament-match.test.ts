import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { autoPlayCommand, defaultTactics } from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession, validateMatchSession } from '../src/engine/match';
import { advanceTournament, openTournament } from '../src/engine/career/honours/international';
import {
  commitTournamentMatch,
  nationSquad,
  tournamentMatchSetup,
} from '../src/engine/career/honours/nationalMatch';
import { playerAbility } from '../src/engine/strength';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Review phase 3, step 3.2: the career player plays their nation's tournament matches in the
 * match engine, the two nations as its sides.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let season: World;
beforeAll(() => {
  const base = generateWorld('tournament-match', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'tournament-match')[0]!;
  season = createCareer(
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
      foot: 'right',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'tournament-match',
  );
  while (season.phase !== 'complete')
    season = advanceCareerWeek(season, { inPlace: true, autoPlay: true }).world;
}, 300000);

/** The 2028 tournament with the career player named, stopped at their first match. */
const atFirstMatch = () => {
  const world = clone(season);
  const live = openTournament(world, 2028)!;
  live.inSquad = true;
  live.starts = true;
  const { pending } = advanceTournament(world);
  return { world, live, fixture: pending! };
};
describe('tournament matches in the match engine', () => {
  it('fields both nations as full sides, the career player among their own', () => {
    const { world, live, fixture } = atFirstMatch();
    const setup = tournamentMatchSetup(world, fixture);
    expect(setup.neutral).toBe(true);
    expect(setup.fixture!.competitionId).toBe(live.id);
    expect(setup.home.id).toBe(fixture.homeId);
    const own = setup.players[world.career!.playerId]!;
    expect(own.clubId).toBe(live.careerNationId);
    for (const side of [setup.home, setup.away]) {
      expect(side.playerIds.length).toBeGreaterThanOrEqual(23);
      expect(
        side.playerIds.filter((id) => setup.players[id]!.primaryPosition === 'GK').length,
      ).toBeGreaterThanOrEqual(1);
    }
    // The same squads on a second look: drawn from the seed, not the moment.
    expect(tournamentMatchSetup(clone(world), fixture)).toEqual(setup);
    expect(() =>
      validateMatchSession(createMatchSession(setup, defaultTactics(world, setup))),
    ).not.toThrow();
  });

  it('completes a guest nation at about its rating', () => {
    const { world } = atFirstMatch();
    for (const nation of world.international!.nations.filter((n) => !n.countryId).slice(0, 4)) {
      const squad = nationSquad(world, nation, 'tournament:2028');
      const best = (['GK', 'CB', 'CM', 'ST'] as const).map((position) =>
        Math.max(
          ...squad
            .filter((player) => player.primaryPosition === position)
            .map((player) => playerAbility(player)),
        ),
      );
      const average = best.reduce((sum, value) => sum + value, 0) / best.length;
      expect(Math.abs(average - nation.rating)).toBeLessThan(12);
    }
  });

  it('records the played match once, with the career player’s part', () => {
    const { world, live, fixture } = atFirstMatch();
    const before = world.career!.honours.caps.senior;
    const setup = tournamentMatchSetup(world, fixture);
    let session = createMatchSession(setup, defaultTactics(world, setup));
    while (session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    const xp = world.career!.xp;
    const outcome = commitTournamentMatch(world, session);
    const match = world.international!.matches.find(
      (entry) => entry.id === outcome.internationalMatchId,
    )!;
    expect(match.score).toEqual(session.state.match.score);
    expect(match.career!.rating).toBe(session.state.report!.rating);
    expect(fixture.matchId).toBe(match.id);
    expect(world.career!.honours.caps.senior).toBe(before + 1);
    // The report's outcome: own side first, the XP granted once.
    const own = fixture.homeId === live.careerNationId ? 0 : 1;
    expect(outcome.record.score).toEqual([match.score[own], match.score[1 - own]]);
    expect(outcome.record.xp).toBeGreaterThan(0);
    expect(world.career!.xp).toBe(xp + outcome.record.xp);
    expect(world.career!.matches.some((entry) => entry.fixtureId === fixture.id)).toBe(false);
    expect(() => commitTournamentMatch(world, session)).toThrow();
    expect(world.career!.xp).toBe(xp + outcome.record.xp);
    expect(world.international!.matches.filter((entry) => entry.id === match.id)).toHaveLength(1);
    // The tournament plays on to the next matchday.
    expect(advanceTournament(world).pending?.round).toBe(2);
    expect(live.round).toBe(2);
    const copy = clone(world);
    copy.international!.live!.year = copy.date.season + 1;
    expect(() => validateWorld(copy)).not.toThrow();
  }, 120000);

  it('refuses a setup for a match that is not the career player’s', () => {
    const { world, live, fixture } = atFirstMatch();
    const other = live.fixtures.find((entry) => entry.round === 1 && entry !== fixture)!;
    expect(() => tournamentMatchSetup(world, other)).toThrow();
  });
});
