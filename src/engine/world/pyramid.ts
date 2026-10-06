import type { World } from '../../model/domain';
import { advanceFrance, advancePortugal } from './france-portugal';
import { resolvePostseasonTie } from './postseason';
import { rankStandings } from './ranking';
import { advanceEngland, advanceSpain } from './england-spain';
import { advanceGermany } from './germany';
import { advanceItaly } from './italy';
import { finalizeNationalMovements } from './movement';

export function advanceNationalPyramid(world: World): void {
  for (const tie of Object.values(world.pyramid!.ties))
    if (tie.status === 'active') resolvePostseasonTie(world, tie);
  for (const phase of Object.values(world.pyramid!.phases)) {
    phase.standings = rankStandings(world, phase.standings);
    if (phase.fixtureIds.every((id) => world.results[id])) phase.status = 'complete';
  }
  if (
    world.pyramid!.stage === 'regular' &&
    (Object.keys(world.pyramid!.phases).length || Object.keys(world.pyramid!.ties).length)
  )
    world.pyramid!.stage = 'postseason';
  for (const country of Object.values(world.countries)) {
    const key = `${country.id}:resolved`;
    if (world.pyramid!.completedSteps.includes(key)) continue;
    const complete =
      country.counterpart === 'France'
        ? advanceFrance(world, country.id)
        : country.counterpart === 'Portugal'
          ? advancePortugal(world, country.id)
          : country.counterpart === 'England'
            ? advanceEngland(world, country.id)
            : country.counterpart === 'Spain'
              ? advanceSpain(world, country.id)
              : country.counterpart === 'Germany'
                ? advanceGermany(world, country.id)
                : advanceItaly(world, country.id);
    if (complete) world.pyramid!.completedSteps.push(key);
  }
  if (
    world.pyramid!.stage !== 'resolved' &&
    Object.values(world.countries).every((country) =>
      world.pyramid!.completedSteps.includes(`${country.id}:resolved`),
    )
  ) {
    finalizeNationalMovements(world);
    world.pyramid!.stage = 'resolved';
  }
}
