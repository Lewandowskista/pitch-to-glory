import type { Fixture, World } from '../../model/domain';
import { CONFIG } from '../config';
import { careerSelection } from './market/rules';

const C = CONFIG.career;

/**
 * The earliest unplayed fixture of the career player's club this week that they will play:
 * fit, registered and picked by the manager.
 */
export function pendingCareerFixture(world: World): Fixture | null {
  const career = world.career;
  if (!career || world.phase === 'complete') return null;
  const player = world.players[career.playerId];
  if (!player?.clubId || player.injuryId) return null;
  const clubId = player.clubId;
  return (
    Object.values(world.fixtures)
      .filter(
        (fixture) =>
          fixture.date.season === world.date.season &&
          fixture.date.week === world.date.week &&
          (fixture.homeId === clubId || fixture.awayId === clubId) &&
          !world.results[fixture.id],
      )
      .sort((a, b) => a.date.day - b.date.day || (a.id < b.id ? -1 : 1))
      .find((fixture) => careerSelection(world, fixture).selected) ?? null
  );
}
/** The next fixture of the career player's club from this week on (for the hub). */
export function nextCareerFixture(world: World): Fixture | null {
  const career = world.career;
  if (!career) return null;
  const clubId = world.players[career.playerId]?.clubId;
  if (!clubId) return null;
  return (
    Object.values(world.fixtures)
      .filter(
        (f) =>
          (f.homeId === clubId || f.awayId === clubId) &&
          !world.results[f.id] &&
          f.date.season === world.date.season &&
          f.date.week >= world.date.week,
      )
      .sort(
        (a, b) => a.date.week - b.date.week || a.date.day - b.date.day || (a.id < b.id ? -1 : 1),
      )[0] ?? null
  );
}

export type FixtureKind = 'league' | 'phase' | 'cup' | 'tie' | 'final';
export function fixtureKind(world: World, fixture: Fixture): FixtureKind {
  if (fixture.tieId) {
    const tie = world.pyramid?.ties[fixture.tieId];
    return tie?.neutral || tie?.id.endsWith('-final') ? 'final' : 'tie';
  }
  if (fixture.phaseId) return 'phase';
  const cup = world.competitions[fixture.competitionId];
  if (cup && (cup.kind === 'champions' || cup.kind === 'continental')) {
    const index = cup.stages.findIndex((s) => s.fixtureIds.includes(fixture.id));
    if (index <= 0) return 'cup';
    return cup.stages[index]!.groups[0]!.length === 2 ? 'final' : 'tie';
  }
  if (cup) {
    const stage = cup.stages.find((s) => s.fixtureIds.includes(fixture.id));
    return stage && stage.groups[0]!.length === 2 ? 'final' : 'cup';
  }
  return 'league';
}
export function fixtureImportance(world: World, fixture: Fixture): number {
  return C.importance[fixtureKind(world, fixture)];
}
