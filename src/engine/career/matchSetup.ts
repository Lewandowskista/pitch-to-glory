import type { Fixture, Tactics, World } from '../../model/domain';
import { createMatchSetup, rolePosition, type MatchSetup } from '../match';
import { rolesForPosition } from '../match/roles';
import { isKnockoutFixture } from '../world/continental';
import { suspendedFor } from '../world/discipline';
import { chemistry } from './social/dressing';
import { assetEffects } from './lifestyle/catalogue';
import { fixtureImportance } from './fixtures';
import { careerMatchSeed } from './objectives';
import { careerSelection, currentRole, managerTrust } from './market/rules';
import { CONFIG } from '../config';

/*
 * The setup of a career match, kept apart from the commit path (matches.ts), so the match
 * screen builds a fixture's setup without bundling the world simulation it never runs.
 */

/**
 * Match setup for a scheduled fixture, seeded by the fixture so a replay is identical. The
 * player starts when the manager picks them, else on the bench (match-22); `start` puts them in
 * the eleven whatever the selection (tests, and matches outside the club's selection).
 */
export function careerMatchSetup(
  world: World,
  fixture: Fixture,
  options: { start?: boolean } = {},
): MatchSetup {
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
      // Left out of the eleven, the player starts on the bench (match-22, step 5.4).
      ...(options.start || careerSelection(world, fixture).selected
        ? {}
        : { bench: currentRole(world) }),
      injury: careerInjury(world),
      trust: managerTrust(world),
      // The director (match-22, X1a): a debut's early chain, and better situations after a
      // drought of positive chains.
      ...(world.career!.matches.length === 0 ? { debut: true } : {}),
      ...(chainDrought(world) ? { drought: true } : {}),
    },
  );
}
/** Whether the career is in a drought of positive chains (X1a): the next match's director. */
export const chainDrought = (world: World): boolean =>
  (world.career?.chainDrought ?? 0) >= CONFIG.match.chains.droughtMatches;
/**
 * The career player's in-match injury factor (match-22): as the career's injury system has it
 * (`injuryFactor` in training.ts: fatigue, injury proneness, Iron Man and a physio), and a
 * rushed return's re-injury risk.
 */
export function careerInjury(world: World): NonNullable<MatchSetup['injury']> {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const I = CONFIG.career.injuries;
  const factor =
    (1 + player.fatigue / I.fatigueWeight) *
    (0.5 + player.hidden.injuryProneness / 100) *
    (career.skills.includes('iron-man') ? I.ironManSkill : 1) *
    assetEffects(career.style?.assets ?? []).injury;
  return {
    factor: Math.round(factor * 1e6) / 1e6,
    ...(career.reinjury
      ? { reinjury: { risk: career.reinjury.risk, kind: career.reinjury.kind } }
      : {}),
  };
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
