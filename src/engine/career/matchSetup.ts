import type { Fixture, Tactics, World } from '../../model/domain';
import { createMatchSetup, rolePosition, type MatchSetup } from '../match';
import { rolesForPosition } from '../match/roles';
import { isKnockoutFixture } from '../world/continental';
import { suspendedFor } from '../world/discipline';
import { chemistry } from './social/dressing';
import { assetEffects } from './lifestyle/catalogue';
import { fixtureImportance } from './fixtures';
import { careerMatchSeed } from './objectives';

/*
 * The setup of a career match, kept apart from the commit path (matches.ts), so the match
 * screen builds a fixture's setup without bundling the world simulation it never runs.
 */

/** Match setup for a scheduled fixture, seeded by the fixture so a replay is identical. */
export function careerMatchSetup(world: World, fixture: Fixture): MatchSetup {
  return createMatchSetup(
    world,
    fixture.homeId,
    fixture.awayId,
    world.career!.playerId,
    careerMatchSeed(world, fixture),
    {
      neutral: Boolean(fixture.neutral),
      fixture: {
        id: fixture.id,
        competitionId: fixture.competitionId,
        importance: fixtureImportance(world, fixture),
        ...shootoutLeadOf(world, fixture),
      },
      chemistry: Math.round(chemistry(world)),
      captain: world.career!.captaincy?.clubId === world.players[world.career!.playerId]!.clubId,
      // A week's training spent on the opponent softens their style (match-19).
      // So does a scouting analyst, every match (review phase 4).
      prepared:
        world.career!.training.sessions.some((session) => session.focus === 'opponent') ||
        assetEffects(world.career!.style?.assets ?? []).scouting,
      // Players banned in this fixture's scope sit it out (the discipline phase).
      suspended: [fixture.homeId, fixture.awayId].flatMap((id) =>
        suspendedFor(world, world.clubs[id]!, fixture),
      ),
    },
  );
}
/**
 * For a match that, level on aggregate at full time, goes to extra time and penalties: the
 * home side's aggregate lead from earlier legs (0 for a single match). A league game, a group
 * game or a tie settled by ranking has none.
 */
export function shootoutLeadOf(
  world: World,
  fixture: Fixture,
): { shootoutLead?: number; extraTimeLead?: number } {
  const tie = fixture.tieId ? world.pyramid?.ties[fixture.tieId] : undefined;
  if (tie) {
    if (fixture.id !== tie.fixtureIds.at(-1)) return {};
    if (tie.drawRule === 'higher-rank') return {};
    let lead = 0;
    for (const id of tie.fixtureIds) {
      if (id === fixture.id) continue;
      const leg = world.fixtures[id]!;
      const score = world.results[id]?.score;
      if (!score) return {};
      lead += leg.homeId === fixture.homeId ? score[0] - score[1] : score[1] - score[0];
    }
    // As the background resolves it (finalize.ts): extra time unless the rule is penalties
    // alone, then penalties unless ranking decides after extra time.
    if (tie.drawRule === 'higher-rank-after-extra-time') return { extraTimeLead: lead };
    if (tie.drawRule === 'penalties') return { shootoutLead: lead };
    return { shootoutLead: lead, extraTimeLead: lead };
  }
  return isKnockoutFixture(world, fixture) ? { shootoutLead: 0 } : {};
}
/** The opening tactics: the first role for the job the setup gives the player (match-17). */
export function defaultTactics(world: World, setup?: MatchSetup): Tactics {
  const position = setup
    ? rolePosition(setup)
    : world.players[world.career!.playerId]!.primaryPosition;
  return { role: rolesForPosition(position)[0]!, risk: 'balanced', mentality: 'balanced' };
}
