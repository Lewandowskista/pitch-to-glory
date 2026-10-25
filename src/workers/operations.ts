import { continueStops, pendingDecisions } from '../engine/career/pending';
import { generateWorld } from '../engine/world/generate';
import { startNextSeason } from '../engine/world/simulate';
import { advanceCareerWeek } from '../engine/career/season';
import { commitCareerMatch } from '../engine/career/matches';
import { advanceTournament } from '../engine/career/honours/international';
import { commitTournamentMatch, commitWindowMatch } from '../engine/career/honours/nationalMatch';
import { createCareer } from '../engine/career/create';
import type { WorldOperations } from './run';

/**
 * What the world worker runs for each job, kept apart from the worker's message handling so
 * tests (the golden saves) can commit a match and simulate a week exactly as the game does.
 */
export const worldOperations: WorldOperations = {
  generate: generateWorld,
  // The worker owns its copy, and each checkpoint is fully posted before the next week.
  week: (world, autoPlay) => advanceCareerWeek(world, { inPlace: true, autoPlay }),
  nextSeason: (world) => startNextSeason(world, { inPlace: true }),
  // A tournament or window match (review phase 3; 0.9.0) is recorded in the international
  // state.
  commit: (world, session) => {
    const id = session.setup.fixture?.id;
    const international = world.international;
    return {
      world,
      outcome: international?.live?.fixtures.some((fixture) => fixture.id === id)
        ? commitTournamentMatch(world, session)
        : international?.window?.fixtures.some((fixture) => fixture.id === id)
          ? commitWindowMatch(world, session)
          : commitCareerMatch(world, session),
    };
  },
  tournament: (world, simulateCareer) => ({
    world,
    pendingFixtureId: advanceTournament(world, { simulateCareer }).pending?.id ?? null,
  }),
  createCareer: (world, seed, draft, clubId) => createCareer(world, draft, clubId, seed),
  pending: (world) => pendingDecisions(world).map((item) => item.id),
  continueStops,
};
